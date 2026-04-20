/**
 * reportService.js
 * ─────────────────────────────────────────────────────────────────
 * Generates Excel reports from session and analytics data.
 * Uses SheetJS (xlsx) for workbook creation with multiple sheets,
 * formatting, and chart-ready data tables.
 *
 * Report types:
 *   1. Session Report    — single completed/approved session export
 *   2. Variance Report   — all flagged variances across sessions
 *   3. Site Performance  — site-level analytics over time
 * ─────────────────────────────────────────────────────────────────
 */

import * as XLSX from 'xlsx'
import {
  SESSION_STATUS,
  ACCURACY,
  getVarianceReasonLabel,
  getAccuracyRating,
  formatBinLabel,
} from '../constants'

// ── UTILITIES ─────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtDateTime(iso) {
  if (!iso) return 'N/A'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function autoWidth(ws, data) {
  if (!data || !data.length) return
  const colWidths = {}
  data.forEach(row => {
    Object.keys(row).forEach(key => {
      const val = String(row[key] ?? '')
      const len = Math.max(val.length, key.length)
      colWidths[key] = Math.min(Math.max(colWidths[key] || 0, len + 2), 40)
    })
  })
  ws['!cols'] = Object.values(colWidths).map(w => ({ wch: w }))
}

function addSheet(wb, name, data) {
  if (!data.length) {
    const ws = XLSX.utils.aoa_to_sheet([['No data']])
    XLSX.utils.book_append_sheet(wb, ws, name)
    return
  }
  const ws = XLSX.utils.json_to_sheet(data)
  autoWidth(ws, data)
  XLSX.utils.book_append_sheet(wb, ws, name)
}

function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename)
}

function dateStamp() {
  return new Date().toISOString().split('T')[0]
}


// ── 1. SESSION REPORT ─────────────────────────────────────────────

export function generateSessionReport(session, skus) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Summary
  const summaryData = [
    { Field: 'Session ID', Value: session.id },
    { Field: 'Site', Value: session.siteId },
    { Field: 'Count type', Value: session.type },
    { Field: 'Count mode', Value: session.mode || 'visible' },
    { Field: 'Collaborative', Value: session.collaborative ? 'Yes' : 'No' },
    { Field: 'Status', Value: session.status },
    { Field: 'Created by', Value: session.createdBy?.name || 'Unknown' },
    { Field: 'Created at', Value: fmtDateTime(session.createdAt) },
    { Field: 'Started at', Value: fmtDateTime(session.startedAt) },
    { Field: 'Completed at', Value: fmtDateTime(session.completedAt) },
    { Field: 'Approved at', Value: fmtDateTime(session.approvedAt) },
    { Field: 'Approved by', Value: session.approvedBy?.name || 'N/A' },
    { Field: 'Duration (min)', Value: session.duration || 'N/A' },
    { Field: 'Accuracy (%)', Value: session.accuracy || 'N/A' },
    { Field: '', Value: '' },
    { Field: 'Total items', Value: session.summary?.totalItems || 0 },
    { Field: 'Matched', Value: session.summary?.matched || 0 },
    { Field: 'Variances', Value: session.summary?.variances || 0 },
    { Field: 'Quarantined', Value: session.summary?.quarantined || 0 },
    { Field: 'Not counted', Value: session.summary?.notCounted || 0 },
    { Field: '', Value: '' },
    { Field: 'Notes', Value: session.notes || 'None' },
  ]
  addSheet(wb, 'Summary', summaryData)

  // Sheet 2: All count lines
  const allItems = []
  const sectionKeys = Object.keys(session.sections || {})
  sectionKeys.forEach(sectionKey => {
    const section = session.sections[sectionKey]
    ;(section.items || []).forEach(item => {
      const skuInfo = skus?.find(s => s.cwpn === item.cwpn)
      allItems.push({
        'Section (Bin)': formatBinLabel(sectionKey),
        'CWPN': item.cwpn,
        'Description': skuInfo?.desc || item.desc || '',
        'Category': skuInfo?.category || '',
        'Type': skuInfo?.typeName || '',
        'Expected': item.expected ?? '',
        'Counted': item.counted ?? '',
        'Variance': item.variance ?? '',
        'Status': item.status || 'pending',
        'Flag reason': item.flag ? getVarianceReasonLabel(item.flag.reason) : '',
        'Flag ticket': item.flag?.ticket || '',
        'Flag notes': item.flag?.note || '',
        'Flagged by': item.flag?.flaggedBy?.name || '',
        'Flagged at': item.flag?.flaggedAt ? fmtDateTime(item.flag.flaggedAt) : '',
      })
    })
  })
  addSheet(wb, 'Count lines', allItems)

  // Sheet 3: Variances only
  const varianceItems = allItems.filter(i => i.Status === 'variance')
  addSheet(wb, 'Variances', varianceItems)

  // Sheet 4: Section summary
  const sectionSummary = sectionKeys.map(key => {
    const sec = session.sections[key]
    const items = sec.items || []
    const matched = items.filter(i => i.status === 'matched').length
    const variances = items.filter(i => i.status === 'variance').length
    const flagged = items.filter(i => i.flag).length
    const pending = items.filter(i => !i.status || i.status === 'pending').length
    const counted = matched + variances
    const accuracy = counted > 0 ? Math.round((matched / counted) * 1000) / 10 : null
    return {
      'Section (Bin)': formatBinLabel(key),
      'Status': sec.status || 'open',
      'Claimed by': sec.claimedBy?.name || 'Unclaimed',
      'Total items': items.length,
      'Matched': matched,
      'Variances': variances,
      'Flagged': flagged,
      'Pending': pending,
      'Accuracy (%)': accuracy ?? 'N/A',
    }
  })
  addSheet(wb, 'Section summary', sectionSummary)

  const filename = `${session.id}_Report_${dateStamp()}.xlsx`
  downloadWorkbook(wb, filename)
  return filename
}


// ── 2. VARIANCE REPORT ────────────────────────────────────────────

export function generateVarianceReport(sessions, skus, siteId) {
  const wb = XLSX.utils.book_new()
  const siteName = siteId || 'All sites'

  const relevantSessions = sessions.filter(s => {
    const matchSite = !siteId || s.siteId === siteId
    return matchSite && s.status === SESSION_STATUS.APPROVED
  })

  // Sheet 1: Report info
  addSheet(wb, 'Report info', [
    { Field: 'Report type', Value: 'Variance Report' },
    { Field: 'Site filter', Value: siteName },
    { Field: 'Generated at', Value: fmtDateTime(new Date().toISOString()) },
    { Field: 'Sessions included', Value: relevantSessions.length },
    { Field: 'Date range', Value: relevantSessions.length > 0
      ? `${fmtDate(relevantSessions[relevantSessions.length - 1]?.createdAt)} to ${fmtDate(relevantSessions[0]?.createdAt)}`
      : 'N/A'
    },
  ])

  // Sheet 2: All variances
  const allVariances = []
  relevantSessions.forEach(session => {
    Object.entries(session.sections || {}).forEach(([sectionKey, section]) => {
      (section.items || [])
        .filter(item => item.status === 'variance')
        .forEach(item => {
          const skuInfo = skus?.find(s => s.cwpn === item.cwpn)
          allVariances.push({
            'Session ID': session.id,
            'Site': session.siteId,
            'Date': fmtDate(session.createdAt),
            'Count type': session.type,
            'Mode': session.mode || 'visible',
            'Section (Bin)': formatBinLabel(sectionKey),
            'CWPN': item.cwpn,
            'Description': skuInfo?.desc || item.desc || '',
            'Category': skuInfo?.category || '',
            'Expected': item.expected ?? '',
            'Counted': item.counted ?? '',
            'Variance': item.variance ?? '',
            'Flag reason': item.flag ? getVarianceReasonLabel(item.flag.reason) : 'Unflagged',
            'Flag ticket': item.flag?.ticket || '',
            'Flag notes': item.flag?.note || '',
            'Flagged by': item.flag?.flaggedBy?.name || '',
            'Counted by': section.claimedBy?.name || '',
            'Approved by': session.approvedBy?.name || '',
          })
        })
    })
  })
  addSheet(wb, 'All variances', allVariances)

  // Sheet 3: Variance frequency by CWPN
  const cwpnMap = {}
  allVariances.forEach(v => {
    if (!cwpnMap[v.CWPN]) {
      cwpnMap[v.CWPN] = {
        CWPN: v.CWPN, Description: v.Description, Category: v.Category,
        'Total occurrences': 0, 'Total abs variance': 0,
        sessions: new Set(), sites: new Set(),
      }
    }
    cwpnMap[v.CWPN]['Total occurrences']++
    cwpnMap[v.CWPN]['Total abs variance'] += Math.abs(v.Variance || 0)
    cwpnMap[v.CWPN].sessions.add(v['Session ID'])
    cwpnMap[v.CWPN].sites.add(v.Site)
  })
  const frequencyData = Object.values(cwpnMap)
    .map(v => ({
      CWPN: v.CWPN, Description: v.Description, Category: v.Category,
      'Total occurrences': v['Total occurrences'],
      'Sessions affected': v.sessions.size,
      'Sites affected': v.sites.size,
      'Total abs variance': v['Total abs variance'],
      'Avg abs variance': v['Total occurrences'] > 0
        ? Math.round((v['Total abs variance'] / v['Total occurrences']) * 10) / 10
        : 0,
    }))
    .sort((a, b) => b['Total occurrences'] - a['Total occurrences'])
  addSheet(wb, 'Variance frequency', frequencyData)

  // Sheet 4: Variance by site
  const siteMap = {}
  allVariances.forEach(v => {
    if (!siteMap[v.Site]) {
      siteMap[v.Site] = { Site: v.Site, total: 0, items: new Set(), sessions: new Set() }
    }
    siteMap[v.Site].total++
    siteMap[v.Site].items.add(v.CWPN)
    siteMap[v.Site].sessions.add(v['Session ID'])
  })
  const siteData = Object.values(siteMap)
    .map(v => ({
      Site: v.Site,
      'Total variances': v.total,
      'Unique items affected': v.items.size,
      'Sessions with variances': v.sessions.size,
    }))
    .sort((a, b) => b['Total variances'] - a['Total variances'])
  addSheet(wb, 'By site', siteData)

  const filename = `Variance_Report_${siteName}_${dateStamp()}.xlsx`
  downloadWorkbook(wb, filename)
  return filename
}


// ── 3. SITE PERFORMANCE REPORT ────────────────────────────────────

export function generateSitePerformanceReport(sessions, sites, analyticsData, siteId) {
  const wb = XLSX.utils.book_new()
  const siteName = siteId || 'All sites'

  const filteredSessions = sessions.filter(s => !siteId || s.siteId === siteId)
  const approvedSessions = filteredSessions.filter(s => s.status === SESSION_STATUS.APPROVED)
  const accuracies = approvedSessions.map(s => s.accuracy).filter(Boolean)
  const avgAccuracy = accuracies.length
    ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length * 10) / 10
    : null

  // Sheet 1: Report info
  addSheet(wb, 'Report info', [
    { Field: 'Report type', Value: 'Site Performance Report' },
    { Field: 'Site filter', Value: siteName },
    { Field: 'Generated at', Value: fmtDateTime(new Date().toISOString()) },
    { Field: 'Total sessions', Value: filteredSessions.length },
    { Field: 'Approved sessions', Value: approvedSessions.length },
    { Field: 'Average accuracy (%)', Value: avgAccuracy ?? 'N/A' },
    { Field: 'Date range', Value: filteredSessions.length > 0
      ? `${fmtDate(filteredSessions[filteredSessions.length - 1]?.createdAt)} to ${fmtDate(filteredSessions[0]?.createdAt)}`
      : 'N/A'
    },
  ])

  // Sheet 2: Session history
  addSheet(wb, 'Session history', filteredSessions.map(s => ({
    'Session ID': s.id,
    'Site': s.siteId,
    'Type': s.type,
    'Mode': s.mode || 'visible',
    'Collaborative': s.collaborative ? 'Yes' : 'No',
    'Status': s.status,
    'Created by': s.createdBy?.name || '',
    'Created': fmtDate(s.createdAt),
    'Completed': fmtDate(s.completedAt),
    'Duration (min)': s.duration || '',
    'Accuracy (%)': s.accuracy ?? '',
    'Total items': s.summary?.totalItems || 0,
    'Matched': s.summary?.matched || 0,
    'Variances': s.summary?.variances || 0,
    'Approved by': s.approvedBy?.name || '',
    'Approved at': fmtDate(s.approvedAt),
  })))

  // Sheet 3: Accuracy trend (chart-ready)
  addSheet(wb, 'Accuracy trend', approvedSessions
    .slice(0, 20).reverse()
    .map(s => ({
      'Date': fmtDate(s.createdAt),
      'Session ID': s.id,
      'Site': s.siteId,
      'Accuracy (%)': s.accuracy || 0,
      'Target (%)': ACCURACY.TARGET,
      'Items counted': (s.summary?.matched || 0) + (s.summary?.variances || 0),
      'Variances': s.summary?.variances || 0,
      'Duration (min)': s.duration || '',
    }))
  )

  // Sheet 4: Site comparison (all-sites view only)
  if (!siteId) {
    const sitePerf = {}
    approvedSessions.forEach(s => {
      if (!sitePerf[s.siteId]) {
        sitePerf[s.siteId] = { sessions: 0, accuracies: [], variances: 0, totalDuration: 0 }
      }
      sitePerf[s.siteId].sessions++
      if (s.accuracy) sitePerf[s.siteId].accuracies.push(s.accuracy)
      sitePerf[s.siteId].variances += s.summary?.variances || 0
      sitePerf[s.siteId].totalDuration += s.duration || 0
    })
    const siteCompare = Object.entries(sitePerf).map(([id, d]) => {
      const siteInfo = sites?.find(s => s.id === id)
      const avg = d.accuracies.length
        ? Math.round(d.accuracies.reduce((a, b) => a + b, 0) / d.accuracies.length * 10) / 10
        : null
      return {
        'Site': id,
        'City': siteInfo?.city || '',
        'Country': siteInfo?.country || '',
        'Region': siteInfo?.region || '',
        'Sessions': d.sessions,
        'Avg accuracy (%)': avg ?? 'N/A',
        'Total variances': d.variances,
        'Total duration (min)': d.totalDuration,
        'Avg duration (min)': d.sessions > 0 ? Math.round(d.totalDuration / d.sessions) : 'N/A',
        'Rating': getAccuracyRating(avg),
      }
    }).sort((a, b) => (b['Avg accuracy (%)'] || 0) - (a['Avg accuracy (%)'] || 0))
    addSheet(wb, 'Site comparison', siteCompare)
  }

  // Sheet 5: Count type breakdown
  const typeMap = {}
  filteredSessions.forEach(s => {
    const key = `${s.type} / ${s.mode || 'visible'}`
    if (!typeMap[key]) typeMap[key] = { count: 0, accuracies: [] }
    typeMap[key].count++
    if (s.accuracy) typeMap[key].accuracies.push(s.accuracy)
  })
  addSheet(wb, 'Count type breakdown', Object.entries(typeMap).map(([key, d]) => ({
    'Count type / Mode': key,
    'Sessions': d.count,
    'Avg accuracy (%)': d.accuracies.length
      ? Math.round(d.accuracies.reduce((a, b) => a + b, 0) / d.accuracies.length * 10) / 10
      : 'N/A',
  })))

  const filename = `Site_Performance_${siteName}_${dateStamp()}.xlsx`
  downloadWorkbook(wb, filename)
  return filename
}
