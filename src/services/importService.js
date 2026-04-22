/**
 * importService.js
 * ─────────────────────────────────────────────────────────────────
 * Parses NetSuite inventory balance CSV exports.
 * Handles two import types:
 *   1. Inventory balance (quantities per site/bin)
 *   2. Serial number registry (individual serial numbers per item/site)
 *
 * The NetSuite export has three structures mashed together:
 *   1. Site-level inventory (clean: NO-OVO01 → Stored, RMA_Pending)
 *   2. Spares locations with site codes as bins (US-Spares-CW → bin US-LAS03)
 *   3. 3PL/1PL warehouse locations (Schertz, Arvato, etc.)
 *
 * This service untangles all three into a unified model.
 * ─────────────────────────────────────────────────────────────────
 */

import { BIN } from '../constants'

// ── KNOWN BIN NORMALIZATION ───────────────────────────────────────

const CANONICAL_BINS = {
  'stored':             BIN.STORED,
  'in process':         BIN.IN_PROCESS,
  'in-process':         BIN.IN_PROCESS,
  'spares':             BIN.SPARES,
  'rma_pending':        BIN.RMA_PENDING,
  'rma pending':        BIN.RMA_PENDING,
  'rma_vendor':         BIN.RMA_VENDOR,
  'rma vendor':         BIN.RMA_VENDOR,
  'rma':                BIN.RMA_PENDING,
  'scrap_pending':      BIN.SCRAP_PENDING,
  'scrap pending':      BIN.SCRAP_PENDING,
  'receiving_hold':     BIN.RECEIVING_HOLD,
  'receiving hold':     BIN.RECEIVING_HOLD,
  'holding':            BIN.RECEIVING_HOLD,
  'stored - pick room': BIN.STORED,
}

const SITE_CODE_PATTERN = /^(US|ES|GB|NO|SE|DK|NL|DE|CA|IT)-[A-Z]{2,4}\d{2}/i
const IN_PROCESS_PATTERN = /in[- ]?process/i
const SITE_SCRAP_PATTERN = /^[A-Z]{3}\d{2}_scrap[_ ]pending$/i

const SUB_BIN_SUFFIXES = {
  '_rma_pending':   BIN.RMA_PENDING,
  '_rma_vendor':    BIN.RMA_VENDOR,
  '_scrap_pending': BIN.SCRAP_PENDING,
  '_scrap pending': BIN.SCRAP_PENDING,
  '_tecex':         BIN.RMA_VENDOR,
}


// ── CSV PARSER ────────────────────────────────────────────────────

export function parseCSV(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }

  const headers = parseCSVLine(lines[0])
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    if (values.length === headers.length) {
      const row = {}
      headers.forEach((h, idx) => { row[h.trim()] = values[idx]?.trim() || '' })
      rows.push(row)
    }
  }
  return { headers, rows }
}

function parseCSVLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}


// ── LOCATION CLASSIFIER ──────────────────────────────────────────

function classifyLocation(location) {
  if (!location || location === '- None -') return { type: 'unknown', siteId: null }

  if (/spares/i.test(location)) {
    const countryMatch = location.match(/^(US|ES|GB|NO|SE|DK|NL|DE|CA|IT)-/i)
    return { type: 'spares', region: countryMatch?.[1]?.toUpperCase() || 'UNKNOWN' }
  }

  if (/3pl|1pl|arvato|grapevine|schertz|dalton|murphy|springfield|sunnyvale|newcastle|wolfforth|austin|denton|expeditors|myriad/i.test(location)) {
    return { type: 'warehouse', name: location }
  }

  const siteMatch = location.match(/^([A-Z]{2})-([A-Z]{2,4}\d{2})/i)
  if (siteMatch) {
    const country = siteMatch[1].toUpperCase()
    const siteCode = siteMatch[2].toUpperCase()
    const baseSiteId = `${country}-${siteCode}`
    const entityMatch = location.match(/ - (.+)$/)
    const entity = entityMatch ? entityMatch[1].trim() : null
    return { type: 'site', siteId: baseSiteId, entity }
  }

  return { type: 'unknown', siteId: null }
}


// ── BIN NORMALIZER ────────────────────────────────────────────────

function normalizeBin(rawBin) {
  if (!rawBin || rawBin === '- None -') return { bin: BIN.STORED, sublocation: null, targetSite: null }

  const lower = rawBin.toLowerCase().trim()

  if (CANONICAL_BINS[lower]) {
    return { bin: CANONICAL_BINS[lower], sublocation: null, targetSite: null }
  }

  if (SITE_SCRAP_PATTERN.test(rawBin)) {
    return { bin: BIN.SCRAP_PENDING, sublocation: null, targetSite: null }
  }

  if (IN_PROCESS_PATTERN.test(rawBin)) {
    const bldgMatch = rawBin.match(/BLG\s*([A-Z])/i) || rawBin.match(/Process\s+([A-Z])/i)
    return { bin: BIN.IN_PROCESS, sublocation: bldgMatch ? `Building ${bldgMatch[1]}` : null, targetSite: null }
  }

  if (SITE_CODE_PATTERN.test(rawBin)) {
    for (const [suffix, binType] of Object.entries(SUB_BIN_SUFFIXES)) {
      if (lower.endsWith(suffix)) {
        const siteCode = rawBin.slice(0, rawBin.length - suffix.length).trim()
        const siteMatch = siteCode.match(/^([A-Z]{2})-([A-Z]{2,4}\d{2})/i)
        return { bin: binType, sublocation: null, targetSite: siteMatch ? `${siteMatch[1].toUpperCase()}-${siteMatch[2].toUpperCase()}` : null }
      }
    }
    const siteMatch = rawBin.match(/^([A-Z]{2})-([A-Z]{2,4}\d{2})/i)
    return { bin: BIN.SPARES, sublocation: null, targetSite: siteMatch ? `${siteMatch[1].toUpperCase()}-${siteMatch[2].toUpperCase()}` : null }
  }

  if (/unrestrict/i.test(rawBin)) return { bin: BIN.STORED, sublocation: rawBin, targetSite: null }
  if (/restrict/i.test(rawBin)) return { bin: BIN.RECEIVING_HOLD, sublocation: rawBin, targetSite: null }
  if (/in transit/i.test(rawBin)) return { bin: BIN.IN_PROCESS, sublocation: rawBin, targetSite: null }
  if (/special/i.test(rawBin)) return { bin: BIN.STORED, sublocation: rawBin, targetSite: null }
  if (/3pl|virginia|denton|arvato/i.test(rawBin)) return { bin: BIN.STORED, sublocation: rawBin, targetSite: null }

  return { bin: BIN.STORED, sublocation: rawBin, targetSite: null }
}


// ── DETECT IMPORT TYPE ────────────────────────────────────────────

export function detectImportType(headers) {
  const hasInventoryNumber = headers.includes('Inventory Number')
  const hasIsSerialized = headers.includes('Is Serialized Item')
  const hasSumOnHand = headers.includes('Sum of On Hand')

  if (hasInventoryNumber && hasIsSerialized) return 'serial'
  if (hasSumOnHand) return 'balance'
  return 'unknown'
}


// ── SERIAL NUMBER IMPORT ──────────────────────────────────────────

export function processSerialImport(csvText) {
  const { headers, rows } = parseCSV(csvText)

  if (!rows.length) {
    return { success: false, error: 'No data rows found in CSV', data: null }
  }

  const required = ['Item', 'Location', 'Inventory Number']
  const missing = required.filter(r => !headers.includes(r))
  if (missing.length) {
    return { success: false, error: `Missing columns: ${missing.join(', ')}`, data: null }
  }

  const serialsBySite = {}
  const unmapped = []
  let totalProcessed = 0

  rows.forEach((row, idx) => {
    const item = row['Item']
    const location = row['Location']
    const rawBin = row['Bin Number'] || ''
    const serial = row['Inventory Number']?.trim()
    const description = row['Description'] || ''
    const category = row['Category'] || ''
    const assetType = row['NetAsset Asset Type'] || ''
    const onHand = parseInt(row['On Hand']) || 0

    if (!serial || onHand <= 0) return
    totalProcessed++

    const locInfo = classifyLocation(location)
    const binInfo = normalizeBin(rawBin)

    let targetSiteId = null

    if (locInfo.type === 'site') {
      targetSiteId = locInfo.siteId
    } else if (locInfo.type === 'spares' && binInfo.targetSite) {
      targetSiteId = binInfo.targetSite
    } else if (locInfo.type === 'warehouse') {
      targetSiteId = `WH-${location.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`
    } else {
      unmapped.push({ row: idx + 2, item, location, serial, reason: 'Unrecognized location' })
      return
    }

    if (!serialsBySite[targetSiteId]) {
      serialsBySite[targetSiteId] = { siteId: targetSiteId, items: {} }
    }

    const site = serialsBySite[targetSiteId]
    if (!site.items[item]) {
      site.items[item] = {
        cwpn: item,
        description,
        category,
        assetType,
        serials: [],
      }
    }

    site.items[item].serials.push({
      serial,
      bin: binInfo.bin,
      location: location,
    })
  })

  const sites = Object.values(serialsBySite).sort((a, b) =>
    Object.values(b.items).reduce((s, i) => s + i.serials.length, 0) -
    Object.values(a.items).reduce((s, i) => s + i.serials.length, 0)
  )

  const dcSites = sites.filter(s => !s.siteId.startsWith('WH-'))
  const whSites = sites.filter(s => s.siteId.startsWith('WH-'))
  const totalSerials = sites.reduce((s, site) =>
    s + Object.values(site.items).reduce((s2, i) => s2 + i.serials.length, 0), 0
  )
  const totalUniqueItems = new Set(rows.map(r => r['Item'])).size

  return {
    success: true,
    error: null,
    data: {
      serialsBySite,
      sites,
      dcSites,
      whSites,
      unmapped,
      summary: {
        totalRows: rows.length,
        totalProcessed,
        totalSerials,
        unmappedRows: unmapped.length,
        mappedPct: Math.round(((totalProcessed - unmapped.length) / Math.max(totalProcessed, 1)) * 100),
        dcSiteCount: dcSites.length,
        whSiteCount: whSites.length,
        totalUniqueItems,
      },
    },
  }
}

export function convertSerialsToRegistryFormat(importData) {
  const records = []
  Object.values(importData.serialsBySite).forEach(site => {
    if (site.siteId.startsWith('WH-')) return
    Object.values(site.items).forEach(item => {
      item.serials.forEach(s => {
        records.push({
          cwpn: item.cwpn,
          serial: s.serial,
          siteId: site.siteId,
          bin: s.bin,
          description: item.description,
          category: item.category,
          assetType: item.assetType,
        })
      })
    })
  })
  return records
}


// ── MAIN INVENTORY BALANCE IMPORT ─────────────────────────────────

export function processInventoryImport(csvText) {
  const { headers, rows } = parseCSV(csvText)

  if (!rows.length) {
    return { success: false, error: 'No data rows found in CSV', data: null }
  }

  // Auto-detect: if this is a serial export, redirect
  const importType = detectImportType(headers)
  if (importType === 'serial') {
    return processSerialImport(csvText)
  }

  const required = ['Item', 'Location', 'Bin Number', 'Sum of On Hand']
  const missing = required.filter(r => !headers.includes(r))
  if (missing.length) {
    return { success: false, error: `Missing columns: ${missing.join(', ')}`, data: null }
  }

  const siteInventory = {}
  const unmapped = []

  rows.forEach((row, idx) => {
    const item = row['Item']
    const location = row['Location']
    const rawBin = row['Bin Number']
    const qty = parseInt(row['Sum of On Hand']) || 0
    const category = row['Category'] || ''
    const assetType = row['NetAsset Asset Type'] || ''
    const isSerialized = row['Is Serialized Item'] === 'Yes'

    if (qty <= 0) return

    const locInfo = classifyLocation(location)
    const binInfo = normalizeBin(rawBin)

    let targetSiteId = null

    if (locInfo.type === 'site') {
      targetSiteId = locInfo.siteId
    } else if (locInfo.type === 'spares' && binInfo.targetSite) {
      targetSiteId = binInfo.targetSite
    } else if (locInfo.type === 'warehouse') {
      targetSiteId = `WH-${location.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`
    } else {
      unmapped.push({ row: idx + 2, item, location, bin: rawBin, qty, reason: 'Unrecognized location' })
      return
    }

    if (!siteInventory[targetSiteId]) {
      siteInventory[targetSiteId] = { siteId: targetSiteId, entities: new Set(), items: {}, totalQty: 0 }
    }

    const site = siteInventory[targetSiteId]
    if (locInfo.entity) site.entities.add(locInfo.entity)

    if (!site.items[item]) {
      site.items[item] = { cwpn: item, category, assetType, isSerialized, bins: {} }
    }

    site.items[item].bins[binInfo.bin] = (site.items[item].bins[binInfo.bin] || 0) + qty
    site.totalQty += qty
  })

  Object.values(siteInventory).forEach(site => {
    site.totalItems = Object.keys(site.items).length
    site.entities = [...site.entities]
  })

  const sites = Object.values(siteInventory).sort((a, b) => b.totalItems - a.totalItems)
  const totalRows = rows.length
  const mappedRows = totalRows - unmapped.length
  const dcSites = sites.filter(s => !s.siteId.startsWith('WH-'))
  const whSites = sites.filter(s => s.siteId.startsWith('WH-'))

  return {
    success: true,
    error: null,
    data: {
      sites: siteInventory,
      siteList: sites,
      dcSites,
      whSites,
      unmapped,
      summary: {
        totalRows,
        mappedRows,
        unmappedRows: unmapped.length,
        mappedPct: Math.round((mappedRows / totalRows) * 100),
        totalSites: sites.length,
        dcSiteCount: dcSites.length,
        whSiteCount: whSites.length,
        totalUniqueItems: new Set(rows.map(r => r['Item'])).size,
        totalQty: sites.reduce((s, site) => s + site.totalQty, 0),
      },
    },
  }
}


// ── EXPORT TO APP FORMAT ──────────────────────────────────────────

export function convertToAppFormat(importData, existingSites) {
  const { sites } = importData

  const skuMap = {}
  Object.entries(sites).forEach(([siteId, siteData]) => {
    if (siteId.startsWith('WH-')) return
    Object.entries(siteData.items).forEach(([cwpn, itemData]) => {
      if (!skuMap[cwpn]) {
        skuMap[cwpn] = {
          cwpn, nsItemId: cwpn, desc: cwpn,
          category: itemData.category || '', typeName: itemData.assetType || '',
          serialTracked: itemData.isSerialized, status: 'active', flagged: false, inventory: {},
        }
      }
      if (!skuMap[cwpn].inventory[siteId]) skuMap[cwpn].inventory[siteId] = {}
      Object.entries(itemData.bins).forEach(([bin, qty]) => {
        skuMap[cwpn].inventory[siteId][bin] = (skuMap[cwpn].inventory[siteId][bin] || 0) + qty
      })
    })
  })

  const emea = ['ES', 'GB', 'NO', 'SE', 'DK', 'NL', 'DE', 'IT', 'FR', 'IE']
  const siteList = Object.values(sites)
    .filter(s => !s.siteId.startsWith('WH-'))
    .map(siteData => {
      const existing = existingSites?.find(s => s.id === siteData.siteId)
      const bins = [...new Set(Object.values(siteData.items).flatMap(item => Object.keys(item.bins)))].sort()
      const cc = siteData.siteId.split('-')[0]
      return {
        id: siteData.siteId, name: siteData.siteId,
        city: existing?.city || '', country: cc,
        region: emea.includes(cc) ? 'EMEA' : cc === 'CA' ? 'CA' : 'US',
        subRegion: existing?.subRegion || '', timezone: existing?.timezone || '',
        active: true, bins, rooms: existing?.rooms || [], entities: siteData.entities,
      }
    })

  return { sites: siteList, skus: Object.values(skuMap) }
}
