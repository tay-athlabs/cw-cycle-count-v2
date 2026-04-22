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
    auditLog: [],
    serialRegistry: {},
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial))
  return initial
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

// ── AUDIT LOG ─────────────────────────────────────────────────────

export async function logAudit(action, details, userInfo) {
  const store = getStore()
  if (!store.auditLog) store.auditLog = []
  const entry = {
    id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action,
    timestamp: new Date().toISOString(),
    user: userInfo ? { email: userInfo.email, name: userInfo.name } : null,
    ...details,
  }
  store.auditLog.push(entry)
  saveStore(store)
  return entry
}

export async function getAuditLog(filters = {}) {
  const store = getStore()
  let logs = store.auditLog || []
  if (filters.sessionId) logs = logs.filter(l => l.sessionId === filters.sessionId)
  if (filters.action) logs = logs.filter(l => l.action === filters.action)
  if (filters.itemCwpn) logs = logs.filter(l => l.cwpn === filters.itemCwpn)
  return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
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

// ── IMPORT ────────────────────────────────────────────────────────

export async function applyImport(appData) {
  const store = getStore()

  // Merge sites: update existing, add new
  if (appData.sites) {
    appData.sites.forEach(importedSite => {
      const idx = store.sites.findIndex(s => s.id === importedSite.id)
      if (idx !== -1) {
        // Update existing site, preserve rooms and other local data
        store.sites[idx] = { ...store.sites[idx], ...importedSite, rooms: store.sites[idx].rooms || importedSite.rooms || [] }
      } else {
        store.sites.push(importedSite)
      }
    })
  }

  // Merge SKUs: update existing, add new
  if (appData.skus) {
    appData.skus.forEach(importedSku => {
      const idx = store.skus.findIndex(s => s.cwpn === importedSku.cwpn)
      if (idx !== -1) {
        // Merge inventory data per site
        const mergedInventory = { ...store.skus[idx].inventory }
        Object.entries(importedSku.inventory || {}).forEach(([siteId, bins]) => {
          mergedInventory[siteId] = { ...(mergedInventory[siteId] || {}), ...bins }
        })
        store.skus[idx] = { ...store.skus[idx], ...importedSku, inventory: mergedInventory }
      } else {
        store.skus.push(importedSku)
      }
    })
  }

  saveStore(store)
  return { sites: store.sites.length, skus: store.skus.length }
}

// ── SERIAL REGISTRY ───────────────────────────────────────────────

export async function getSerialRegistry(cwpn, siteId) {
  const store = getStore()
  const registry = store.serialRegistry || {}
  const key = siteId ? `${cwpn}:${siteId}` : cwpn
  if (siteId) {
    return registry[key] || []
  }
  // Return all serials for this CWPN across all sites
  return Object.entries(registry)
    .filter(([k]) => k.startsWith(`${cwpn}:`))
    .flatMap(([k, serials]) => {
      const site = k.split(':')[1]
      return serials.map(s => ({ ...s, siteId: site }))
    })
}

export async function importSerialRegistry(data, userInfo) {
  const store = getStore()
  if (!store.serialRegistry) store.serialRegistry = {}

  let imported = 0
  data.forEach(({ cwpn, serial, siteId, bin }) => {
    const key = `${cwpn}:${siteId}`
    if (!store.serialRegistry[key]) store.serialRegistry[key] = []
    const exists = store.serialRegistry[key].find(s => s.serial === serial)
    if (!exists) {
      store.serialRegistry[key].push({
        serial,
        bin: bin || null,
        importedAt: new Date().toISOString(),
        importedBy: userInfo ? { email: userInfo.email, name: userInfo.name } : null,
        lastSeenAt: null,
        lastSeenBy: null,
      })
      imported++
    }
  })

  saveStore(store)
  await logAudit('import_completed', {
    type: 'serial_registry',
    totalRecords: data.length,
    newRecords: imported,
    duplicatesSkipped: data.length - imported,
  }, userInfo)

  return { imported, skipped: data.length - imported }
}

export async function updateSerialSighting(cwpn, siteId, serial, userInfo) {
  const store = getStore()
  if (!store.serialRegistry) store.serialRegistry = {}
  const key = `${cwpn}:${siteId}`
  if (!store.serialRegistry[key]) store.serialRegistry[key] = []

  const existing = store.serialRegistry[key].find(s => s.serial === serial)
  if (existing) {
    existing.lastSeenAt = new Date().toISOString()
    existing.lastSeenBy = userInfo ? { email: userInfo.email, name: userInfo.name } : null
  } else {
    // New serial discovered during count
    store.serialRegistry[key].push({
      serial,
      bin: null,
      importedAt: null,
      importedBy: null,
      discoveredDuringCount: true,
      lastSeenAt: new Date().toISOString(),
      lastSeenBy: userInfo ? { email: userInfo.email, name: userInfo.name } : null,
    })
  }
  saveStore(store)
  return store.serialRegistry[key]
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
    recountRequests: [],
    summary: {
      totalItems: 0,
      matched: 0,
      variances: 0,
      quarantined: 0,
      notCounted: 0,
      recountsPending: 0,
      escalated: 0,
    },
  }
  store.sessions.push(session)
  saveStore(store)

  await logAudit('session_created', {
    sessionId: id,
    siteId: sessionData.siteId,
    type: sessionData.type,
    mode: sessionData.mode,
    collaborative: sessionData.collaborative,
  }, sessionData.createdBy)

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
  const updated = await updateSession(id, {
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  })
  await logAudit('session_started', { sessionId: id }, userInfo)
  return updated
}

export async function completeSession(id, userInfo) {
  const store = getStore()
  const session = store.sessions.find(s => s.id === id)
  const completedAt = new Date().toISOString()
  const startedAt = session?.startedAt || session?.createdAt
  const durationMs = startedAt ? new Date(completedAt) - new Date(startedAt) : null
  const durationMin = durationMs ? Math.round(durationMs / 60000) : null

  const updated = await updateSession(id, {
    status: 'pending_review',
    completedAt,
    completedBy: userInfo,
    duration: durationMin,
  })
  await logAudit('session_submitted', { sessionId: id, duration: durationMin }, userInfo)
  return updated
}

export async function approveSession(id, userInfo) {
  const store = getStore()
  const session = store.sessions.find(s => s.id === id)
  if (!session) throw new Error(`Session ${id} not found`)

  // Reconcile inventory: update SKU balances to match counted values
  const adjustments = []
  Object.entries(session.sections || {}).forEach(([sectionKey, section]) => {
    (section.items || []).forEach(item => {
      if (item.counted != null && item.counted !== '' && item.status !== 'pending') {
        const skuIdx = store.skus.findIndex(s => s.cwpn === item.cwpn)
        if (skuIdx !== -1) {
          const oldQty = store.skus[skuIdx].inventory?.[session.siteId]?.[sectionKey] || 0
          const newQty = typeof item.counted === 'number' ? item.counted : parseInt(item.counted)
          if (oldQty !== newQty) {
            if (!store.skus[skuIdx].inventory[session.siteId]) {
              store.skus[skuIdx].inventory[session.siteId] = {}
            }
            store.skus[skuIdx].inventory[session.siteId][sectionKey] = newQty
            adjustments.push({
              cwpn: item.cwpn,
              siteId: session.siteId,
              bin: sectionKey,
              oldQty,
              newQty,
              variance: newQty - oldQty,
            })
          }
        }
      }
    })
  })

  const updated = await updateSession(id, {
    status: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy: userInfo,
    adjustments,
  })

  saveStore(store)

  await logAudit('session_approved', {
    sessionId: id,
    adjustmentsCount: adjustments.length,
    adjustments: adjustments.map(a => `${a.cwpn} ${a.bin}: ${a.oldQty} → ${a.newQty}`),
  }, userInfo)

  return updated
}

export async function rejectSession(id, userInfo, reason) {
  const updated = await updateSession(id, {
    status: 'in_progress',
    completedAt: null,
    completedBy: null,
    rejectedAt: new Date().toISOString(),
    rejectedBy: userInfo,
    rejectionReason: reason,
  })
  await logAudit('session_rejected', {
    sessionId: id,
    reason,
  }, userInfo)
  return updated
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

  await logAudit('section_claimed', {
    sessionId,
    sectionKey,
  }, userInfo)

  return updated
}

export async function updateSectionItems(sessionId, sectionKey, items) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const previousItems = session.sections?.[sectionKey]?.items || []

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

  // Log audit entries for newly detected variances (not every save)
  for (const item of items) {
    if (item.status === 'variance' && item.counted != null) {
      const prev = previousItems.find(p => p.cwpn === item.cwpn)
      // Only log if this is a NEW variance (wasn't variance before, or count changed)
      if (!prev || prev.status !== 'variance' || prev.counted !== item.counted) {
        await logAudit('item_counted', {
          sessionId,
          sectionKey,
          cwpn: item.cwpn,
          expected: item.expected,
          counted: item.counted,
          variance: item.variance,
          round: item.countRound || 1,
          type: 'variance_detected',
        }, item.countedBy)
      }
    }
  }

  return updated
}

// ── RECOUNT OPERATIONS ────────────────────────────────────────────

export async function requestRecount(sessionId, sectionKey, cwpn, requestedBy) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const section = session.sections?.[sectionKey]
  if (!section) throw new Error(`Section ${sectionKey} not found`)

  const item = section.items?.find(i => i.cwpn === cwpn)
  const currentRound = item?.countRound || 1

  if (currentRound >= 3) {
    throw new Error(`Item ${cwpn} has reached the maximum recount rounds. Escalate instead.`)
  }
  if (item?.recountStatus === 'recount_pending') {
    throw new Error(`Item ${cwpn} already has a pending recount request.`)
  }

  const nextRound = currentRound + 1

  // Get the original counter for this item — use countedBy if set, fall back to section claimedBy
  const originalCounter = item?.countedBy || section.claimedBy

  // Create recount request
  const recountRequest = {
    id: `RC-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    sessionId,
    sectionKey,
    cwpn,
    round: nextRound,
    previousCount: item?.counted ?? null,
    previousVariance: item?.variance ?? null,
    previousCountedBy: originalCounter,
    requestedBy,
    requestedAt: new Date().toISOString(),
    completedBy: null,
    completedAt: null,
    newCount: null,
    status: 'pending',
  }

  // Update the item's recount status
  const updatedItems = (section.items || []).map(i => {
    if (i.cwpn === cwpn) {
      return {
        ...i,
        recountStatus: 'recount_pending',
        recountRound: nextRound,
        recountRequestId: recountRequest.id,
        recountExcludedUser: originalCounter?.email || null,
        // Store previous round data in history
        countHistory: [
          ...(i.countHistory || []),
          {
            round: currentRound,
            counted: i.counted,
            variance: i.variance,
            countedBy: i.countedBy || originalCounter,
            countedAt: i.countedAt || new Date().toISOString(),
            status: i.status,
          },
        ],
      }
    }
    return i
  })

  // Save recount request to session
  if (!session.recountRequests) session.recountRequests = []
  session.recountRequests.push(recountRequest)

  const updated = {
    ...session,
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...section,
        items: updatedItems,
      },
    },
  }

  const { summary, accuracy } = calculateSessionStats(updated)
  updated.summary = summary
  updated.accuracy = accuracy
  store.sessions[idx] = updated
  saveStore(store)

  await logAudit('item_recount_requested', {
    sessionId,
    sectionKey,
    cwpn,
    round: nextRound,
    previousCount: item?.counted,
    previousVariance: item?.variance,
    originalCounter: originalCounter?.email,
  }, requestedBy)

  return updated
}

export async function submitRecount(sessionId, sectionKey, cwpn, newCount, countedBy, serials) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const section = session.sections?.[sectionKey]
  if (!section) throw new Error(`Section ${sectionKey} not found`)

  const item = section.items?.find(i => i.cwpn === cwpn)
  if (!item) throw new Error(`Item ${cwpn} not found in section`)

  // Verify the person doing the recount is NOT the original counter
  if (item.recountExcludedUser && countedBy?.email === item.recountExcludedUser) {
    throw new Error('Recount must be performed by a different technician')
  }

  const expected = item.expected
  const counted = parseInt(newCount)
  const variance = counted - expected
  const status = variance === 0 ? 'matched' : 'variance'

  // Update the item
  const updatedItems = (section.items || []).map(i => {
    if (i.cwpn === cwpn) {
      return {
        ...i,
        counted,
        variance,
        status,
        countedBy,
        countedAt: new Date().toISOString(),
        countRound: item.recountRound || 2,
        recountStatus: null,
        recountRequestId: null,
        recountExcludedUser: null,
        // Keep serials if provided
        ...(serials ? { scannedSerials: serials } : {}),
      }
    }
    return i
  })

  // Update the recount request
  const recountRequest = session.recountRequests?.find(
    r => r.cwpn === cwpn && r.status === 'pending'
  )
  if (recountRequest) {
    recountRequest.status = 'completed'
    recountRequest.completedBy = countedBy
    recountRequest.completedAt = new Date().toISOString()
    recountRequest.newCount = counted
  }

  const updated = {
    ...session,
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...section,
        items: updatedItems,
      },
    },
  }

  const { summary, accuracy } = calculateSessionStats(updated)
  updated.summary = summary
  updated.accuracy = accuracy
  store.sessions[idx] = updated
  saveStore(store)

  await logAudit('item_recounted', {
    sessionId,
    sectionKey,
    cwpn,
    round: item.recountRound || 2,
    newCount: counted,
    newVariance: variance,
    previousCount: item.counted,
  }, countedBy)

  return updated
}

export async function escalateItem(sessionId, sectionKey, cwpn, escalatedBy, reason) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const section = session.sections?.[sectionKey]

  const updatedItems = (section.items || []).map(i => {
    if (i.cwpn === cwpn) {
      return {
        ...i,
        status: 'escalated',
        recountStatus: null,
        escalation: {
          escalatedBy,
          escalatedAt: new Date().toISOString(),
          reason: reason || 'Variance persists after maximum recounts',
          resolvedBy: null,
          resolvedAt: null,
          resolution: null,
        },
      }
    }
    return i
  })

  const updated = {
    ...session,
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...section,
        items: updatedItems,
      },
    },
  }

  const { summary, accuracy } = calculateSessionStats(updated)
  updated.summary = summary
  updated.accuracy = accuracy
  store.sessions[idx] = updated
  saveStore(store)

  await logAudit('item_escalated', {
    sessionId,
    sectionKey,
    cwpn,
    reason,
  }, escalatedBy)

  return updated
}

// ── ANALYTICS ─────────────────────────────────────────────────────

export async function getAnalytics(siteId) {
  const sessions = await getSessions()
  const filtered = siteId
    ? sessions.filter(s => s.siteId === siteId && s.status === 'approved')
    : sessions.filter(s => s.status === 'approved')
  return buildAnalytics(filtered)
}

// ── ROLE MANAGEMENT ───────────────────────────────────────────────

export async function changeUserRole(targetEmail, newRole, changedBy) {
  await logAudit('role_changed', {
    targetEmail,
    newRole,
    changedByEmail: changedBy?.email,
  }, changedBy)
  // In localStorage prototype, roles are stored on the user object in sessionStorage
  // In production, this would update the users table
  return { email: targetEmail, role: newRole }
}

// ── ESCALATION RESOLUTION ─────────────────────────────────────────

export async function resolveEscalation(sessionId, sectionKey, cwpn, resolution, resolvedBy) {
  const store = getStore()
  const idx = store.sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) throw new Error(`Session ${sessionId} not found`)

  const session = store.sessions[idx]
  const section = session.sections?.[sectionKey]

  const updatedItems = (section.items || []).map(i => {
    if (i.cwpn === cwpn) {
      return {
        ...i,
        status: resolution.action === 'accept_variance' ? 'variance' : 'matched',
        escalation: {
          ...i.escalation,
          resolvedBy,
          resolvedAt: new Date().toISOString(),
          resolution: resolution.note,
          action: resolution.action,
        },
        // If manager overrides the count
        ...(resolution.action === 'adjust_quantity' && resolution.adjustedQty != null ? {
          counted: resolution.adjustedQty,
          variance: resolution.adjustedQty - i.expected,
          status: resolution.adjustedQty === i.expected ? 'matched' : 'variance',
        } : {}),
      }
    }
    return i
  })

  const updated = {
    ...session,
    sections: {
      ...session.sections,
      [sectionKey]: {
        ...section,
        items: updatedItems,
      },
    },
  }

  const { summary, accuracy } = calculateSessionStats(updated)
  updated.summary = summary
  updated.accuracy = accuracy
  store.sessions[idx] = updated
  saveStore(store)

  await logAudit('escalation_resolved', {
    sessionId,
    sectionKey,
    cwpn,
    action: resolution.action,
    note: resolution.note,
  }, resolvedBy)

  return updated
}

// ── HELPERS ───────────────────────────────────────────────────────

function calculateSessionStats(session) {
  const allItems = Object.values(session.sections || {}).flatMap(s => s.items || [])
  const totalItems   = allItems.length
  const matched      = allItems.filter(i => i.status === 'matched').length
  const variances    = allItems.filter(i => i.status === 'variance').length
  const quarantined  = allItems.filter(i => i.status === 'quarantine').length
  const escalated    = allItems.filter(i => i.status === 'escalated').length
  const recountsPending = allItems.filter(i => i.recountStatus === 'recount_pending' || i.recountStatus === 'recount_in_progress').length
  const notCounted   = allItems.filter(i => !i.status || i.status === 'pending').length
  const counted      = totalItems - notCounted - recountsPending
  const accuracy     = counted > 0 ? Math.round((matched / counted) * 1000) / 10 : null

  return {
    summary: { totalItems, matched, variances, quarantined, notCounted, recountsPending, escalated },
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
