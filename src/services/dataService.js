/**
 * dataService.js
 * ─────────────────────────────────────────────────────────────────
 * Local in-memory data layer for the prototype.
 * All data is stored in memory and persisted to localStorage.
 * To migrate to CWDB/Supabase: replace the functions below,
 * keeping the same exported interface. Components never change.
 * ─────────────────────────────────────────────────────────────────
 */

import sitesData from '../data/sites.json'
import skusData from '../data/skus.json'
import exampleSession from '../data/sessions/example.json'

const STORAGE_KEY = 'cw_cycle_count_data'

// ── LOCAL STORE ──────────────────────────────────────────────────

function getStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  // Initialise with defaults
  const initial = {
    sites: sitesData,
    skus: skusData,
    sessions: [exampleSession],
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  return initial
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

// ── SITES ─────────────────────────────────────────────────────────

export async function getSites() {
  const store = getStore()
  return store.sites
}

export async function getSiteById(id) {
  const sites = await getSites()
  return sites.find(s => s.id === id) || null
}

// ── SKUS ──────────────────────────────────────────────────────────

export async function getSKUs() {
  const store = getStore()
  return store.skus
}

export async function getSKUsBySite(siteId) {
  const skus = await getSKUs()
  return skus.filter(sku => sku.inventory?.[siteId])
}

export async function updateSKU(cwpn, updates) {
  const store = getStore()
  const idx = store.skus.findIndex(s => s.cwpn === cwpn)
  if (idx === -1) throw new Error(`SKU ${cwpn} not found`)
  store.skus[idx] = { ...store.skus[idx], ...updates }
  saveStore(store)
  return store.skus[idx]
}

// ── SESSIONS ──────────────────────────────────────────────────────

export function generateSessionId(siteId) {
  const d = new Date()
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`
  const seq  = String(Math.floor(Math.random() * 900) + 100)
  return `CC-${siteId}-${date}-${seq}`
}

export async function getSessions() {
  const store = getStore()
  return (store.sessions || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export async function getSessionById(id) {
  const store = getStore()
  const session = store.sessions.find(s => s.id === id)
  if (!session) throw new Error(`Session ${id} not found`)
  return session
}

export async function createSession(sessionData) {
  const store = getStore()
  const id = generateSessionId(sessionData.siteId)
  const now = new Date().toISOString()
  const session = {
    id,
    ...sessionData,
    status: sessionData.scheduledDate && new Date(sessionData.scheduledDate) > new Date()
      ? 'scheduled'
      : 'open',
    createdAt: now,
    startedAt: null,
    completedAt: null,
    approvedAt: null,
    approvedBy: null,
    accuracy: null,
    duration: null,
    summary: {
      totalItems: 0,
      matched: 0,
      variances: 0,
      quarantined: 0,
      notCounted: 0,
    },
  }
  store.sessions.push(session)
  saveStore(store)
  return session
}

export async function updateSession(id, updates) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === id)
  if (idx === -1) throw new Error(`Session ${id} not found`)

  const updated = { ...store.sessions[idx], ...updates }

  // Recalculate accuracy and summary whenever sections are updated
  if (updates.sections) {
    const { summary, accuracy } = calculateSessionStats(updated)
    updated.summary = summary
    updated.accuracy = accuracy
  }

  store.sessions[idx] = updated
  saveStore(store)
  return updated
}

export async function startSession(id, userInfo) {
  return updateSession(id, {
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  })
}

export async function completeSession(id, userInfo) {
  const store = getStore()
  const session = store.sessions.find(s => s.id === id)
  const completedAt = new Date().toISOString()
  const startedAt = session?.startedAt || session?.createdAt
  const durationMs = startedAt ? new Date(completedAt) - new Date(startedAt) : null
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null

  return updateSession(id, {
    status: 'pending_review',
    completedAt,
    completedBy: userInfo,
    duration: durationMin,
  })
}

export async function approveSession(id, userInfo) {
  return updateSession(id, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy: userInfo,
  })
}

export async function claimSection(sessionId, sectionKey, userInfo) {
  const store = getStore()
  const session = store.sessions.find(s => s.id === sessionId)
  if (!session) throw new Error(`Session ${sessionId} not found`)
  if (session.sections?.[sectionKey]?.claimedBy) {
    throw new Error(`Section ${sectionKey} is already claimed`)
  }
  const updated = {
    ...session,
    status: session.status === 'open' || session.status === 'scheduled' ? 'in_progress' : session.status,
    startedAt: session.startedAt || new Date().toISOString(),
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...(session.sections?.[sectionKey] || {}),
        status: 'in_progress',
        claimedBy: userInfo,
        claimedAt: new Date().toISOString(),
        items: session.sections?.[sectionKey]?.items || [],
      },
    },
  }
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  store.sessions[idx] = updated
  saveStore(store)
  return updated
}

export async function updateSectionItems(sessionId, sectionKey, items) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const updated = {
    ...session,
    status: session.status === 'open' || session.status === 'scheduled' ? 'in_progress' : session.status,
    startedAt: session.startedAt || new Date().toISOString(),
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...session.sections[sectionKey],
        items,
      },
    },
  }
  const { summary, accuracy } = calculateSessionStats(updated)
  updated.summary = summary
  updated.accuracy = accuracy
  store.sessions[idx] = updated
  saveStore(store)
  return updated
}

// ── IMPORT ────────────────────────────────────────────────────────

/**
 * Apply imported data to the store.
 * mode: 'update' | 'replace' | 'add_new'
 *   - update:  merge new data into existing sites, update quantities, add new sites/items
 *   - replace: wipe all site and SKU data (preserves sessions), load fresh from import
 *   - add_new: only import sites that don't already exist, skip existing ones
 *
 * NEVER touches sessions — import is purely site + SKU data.
 */
export async function applyImport(appData, mode = 'update') {
  const store = getStore()
  const { sites: importedSites, skus: importedSKUs } = appData
  const existingSiteIds = new Set(store.sites.map(s => s.id))

  if (mode === 'replace') {
    // Wipe sites and SKUs, keep sessions
    store.sites = importedSites
    store.skus = importedSKUs
  } else if (mode === 'add_new') {
    // Only add sites that don't exist
    const newSites = importedSites.filter(s => !existingSiteIds.has(s.id))
    store.sites = [...store.sites, ...newSites]

    // For SKUs: add new ones, but don't update existing inventory
    const existingCWPNs = new Set(store.skus.map(s => s.cwpn))
    const newSKUs = importedSKUs.filter(s => !existingCWPNs.has(s.cwpn))
    store.skus = [...store.skus, ...newSKUs]
  } else {
    // 'update' — merge
    // Sites: update existing, add new
    const siteMap = {}
    store.sites.forEach(s => { siteMap[s.id] = s })
    importedSites.forEach(imported => {
      if (siteMap[imported.id]) {
        // Merge: keep rooms, update bins/entities
        siteMap[imported.id] = {
          ...siteMap[imported.id],
          bins: [...new Set([...(siteMap[imported.id].bins || []), ...(imported.bins || [])])].sort(),
          entities: [...new Set([...(siteMap[imported.id].entities || []), ...(imported.entities || [])])].sort(),
          active: true,
        }
      } else {
        siteMap[imported.id] = imported
      }
    })
    store.sites = Object.values(siteMap).sort((a, b) => a.id.localeCompare(b.id))

    // SKUs: update inventory quantities, add new items
    const skuMap = {}
    store.skus.forEach(s => { skuMap[s.cwpn] = s })
    importedSKUs.forEach(imported => {
      if (skuMap[imported.cwpn]) {
        // Merge inventory: imported quantities overwrite per-site per-bin
        const merged = { ...skuMap[imported.cwpn].inventory }
        Object.entries(imported.inventory || {}).forEach(([siteId, bins]) => {
          merged[siteId] = { ...(merged[siteId] || {}), ...bins }
        })
        skuMap[imported.cwpn] = {
          ...skuMap[imported.cwpn],
          inventory: merged,
          category: imported.category || skuMap[imported.cwpn].category,
          typeName: imported.typeName || skuMap[imported.cwpn].typeName,
        }
      } else {
        skuMap[imported.cwpn] = imported
      }
    })
    store.skus = Object.values(skuMap).sort((a, b) => a.cwpn.localeCompare(b.cwpn))
  }

  saveStore(store)

  return {
    sitesCount: store.sites.length,
    skusCount: store.skus.length,
    sessionsPreserved: store.sessions.length,
  }
}

/**
 * Reset to seed data (for development/testing).
 */
export async function resetStore() {
  const store = {
    sites: sitesData,
    skus: skusData,
    sessions: [exampleSession],
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  return store
}

// ── ANALYTICS ─────────────────────────────────────────────────────

export async function getAnalytics(siteId) {
  const sessions = await getSessions()
  const filtered = siteId
    ? sessions.filter(s => s.siteId === siteId && s.status === 'approved')
    : sessions.filter(s => s.status === 'approved')
  return buildAnalytics(filtered)
}

// ── HELPERS ───────────────────────────────────────────────────────

function calculateSessionStats(session) {
  const allItems = Object.values(session.sections || {}).flatMap(s => s.items || [])
  const totalItems   = allItems.length
  const matched      = allItems.filter(i => i.status === 'matched').length
  const variances    = allItems.filter(i => i.status === 'variance').length
  const quarantined  = allItems.filter(i => i.status === 'quarantine').length
  const notCounted   = allItems.filter(i => !i.status || i.status === 'pending').length
  const counted      = totalItems - notCounted
  const accuracy     = counted > 0 ? Math.round((matched / counted) * 1000) / 10 : null

  return {
    summary: { totalItems, matched, variances, quarantined, notCounted },
    accuracy,
  }
}

function buildAnalytics(sessions) {
  if (!sessions.length) return { sessions: [], trends: [], siteBreakdown: [], topVariances: [] }

  const trends = sessions.slice(0, 12).reverse().map(s => ({
    date: new Date(s.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }),
    accuracy: s.accuracy || 0,
    sessionId: s.id,
    site: s.siteId,
  }))

  const siteMap = {}
  sessions.forEach(s => {
    if (!siteMap[s.siteId]) siteMap[s.siteId] = { sessions: 0, accuracy: [], variances: 0 }
    siteMap[s.siteId].sessions++
    if (s.accuracy) siteMap[s.siteId].accuracy.push(s.accuracy)
    siteMap[s.siteId].variances += s.summary?.variances || 0
  })
  const siteBreakdown = Object.entries(siteMap).map(([site, d]) => ({
    site,
    sessions: d.sessions,
    avgAccuracy: d.accuracy.length
      ? Math.round(d.accuracy.reduce((a,b) => a+b, 0) / d.accuracy.length * 10) / 10
      : 0,
    variances: d.variances,
  }))

  const varianceMap = {}
  sessions.forEach(s => {
    Object.values(s.sections || {}).forEach(sec => {
      (sec.items || []).filter(i => i.status === 'variance').forEach(i => {
        varianceMap[i.cwpn] = (varianceMap[i.cwpn] || 0) + 1
      })
    })
  })
  const topVariances = Object.entries(varianceMap)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 5)
    .map(([cwpn, count]) => ({ cwpn, count }))

  return { sessions, trends, siteBreakdown, topVariances }
}
