/**
 * useCountItems.js
 * ─────────────────────────────────────────────────────────────────
 * Manages the local counting state for an active section:
 *   - Enter-to-confirm: tech types freely, presses Enter to lock
 *   - Once confirmed, field is locked until Recount is clicked
 *   - Variance only computed after confirmation
 *   - Serial-tracked items lock after scan completes
 *   - Self-recount (Round 2) records history and bumps round
 *   - Auto-save fires only after confirmation, not on keystroke
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { AUTO_SAVE_DELAY_MS, ITEM_STATUS } from '../constants'

export function useCountItems({
  session,
  activeSection,
  skus,
  saveItems,
  isReadOnly,
  currentUser,
}) {
  const [localCounts, setLocalCounts]       = useState({})
  const [confirmedItems, setConfirmedItems] = useState({})
  const [localSerials, setLocalSerials]     = useState({})
  const [itemFlags, setItemFlags]           = useState({})
  const [selfRecounted, setSelfRecounted]   = useState({})
  const [dirty, setDirty]                   = useState(false)
  const saveTimer                           = useRef(null)

  const currentSection = session?.sections?.[activeSection]

  // Sync local state when session data or active section changes
  useEffect(() => {
    if (!session || !activeSection) return
    const saved = currentSection?.items || []
    const counts = {}
    const flags = {}
    const serials = {}
    const confirmed = {}
    saved.forEach(item => {
      counts[item.cwpn] = item.counted ?? ''
      if (item.flag) flags[item.cwpn] = item.flag
      if (item.scannedSerials) serials[item.cwpn] = item.scannedSerials
      // Items that already have a counted value from a previous save are confirmed
      if (item.counted != null && item.counted !== '' && item.status !== 'pending') {
        confirmed[item.cwpn] = true
      }
    })
    setLocalCounts(counts)
    setItemFlags(flags)
    setLocalSerials(serials)
    setConfirmedItems(confirmed)
    setSelfRecounted({})
    setDirty(false)
  }, [session?.id, activeSection, currentSection?.items?.length])

  // Filter SKUs relevant to this section
  const sectionSKUs = useMemo(() => {
    if (!skus || !session?.siteId || !activeSection) return []
    return skus.filter(sku => {
      const inv = sku.inventory?.[session.siteId]
      return inv && (inv[activeSection] || 0) > 0
    })
  }, [skus, session?.siteId, activeSection])

  // Derive items: merge SKU data + session data + local edits
  const items = useMemo(() => {
    return sectionSKUs.map(sku => {
      const expected = sku.inventory?.[session?.siteId]?.[activeSection] || 0
      const saved = currentSection?.items?.find(i => i.cwpn === sku.cwpn)
      const isSerialTracked = sku.serialTracked
      const isConfirmed = !!confirmedItems[sku.cwpn]

      let counted, variance, status

      if (isSerialTracked) {
        const scannedSerials = localSerials[sku.cwpn] || saved?.scannedSerials || []
        counted = scannedSerials.length
        // Serial items: variance computes as scans happen (each scan is a confirmation)
        variance = counted > 0 ? counted - expected : null
        status = counted === 0
          ? ITEM_STATUS.PENDING
          : variance === 0
            ? ITEM_STATUS.MATCHED
            : ITEM_STATUS.VARIANCE
      } else {
        counted = localCounts[sku.cwpn] !== undefined
          ? localCounts[sku.cwpn]
          : saved?.counted ?? ''
        // Only compute variance if the count has been confirmed (Enter pressed)
        if (isConfirmed && counted !== '') {
          variance = parseInt(counted) - expected
          status = variance === 0 ? ITEM_STATUS.MATCHED : ITEM_STATUS.VARIANCE
        } else {
          variance = null
          status = counted !== '' ? 'unconfirmed' : ITEM_STATUS.PENDING
        }
      }

      // Preserve recount status from saved data
      const recountStatus = saved?.recountStatus || null
      const recountRound = saved?.recountRound || null
      const recountExcludedUser = saved?.recountExcludedUser || null
      const countHistory = saved?.countHistory || []
      const countRound = saved?.countRound || 1
      const escalation = saved?.escalation || null

      // Override status if recount pending or escalated
      if (recountStatus === 'recount_pending') {
        status = ITEM_STATUS.RECOUNT_PENDING
      }
      if (saved?.status === 'escalated') {
        status = ITEM_STATUS.ESCALATED
      }

      const flag = itemFlags[sku.cwpn] || saved?.flag || null

      return {
        ...sku,
        expected,
        counted,
        variance,
        status,
        flag,
        isConfirmed,
        recountStatus,
        recountRound,
        recountExcludedUser,
        countHistory,
        countRound,
        escalation,
        scannedSerials: isSerialTracked ? (localSerials[sku.cwpn] || saved?.scannedSerials || []) : undefined,
        expectedSerials: isSerialTracked ? (saved?.expectedSerials || []) : undefined,
      }
    })
  }, [sectionSKUs, session?.siteId, activeSection, currentSection, localCounts, confirmedItems, localSerials, itemFlags])

  // Stats — only count confirmed items
  const stats = useMemo(() => {
    const confirmed = items.filter(i => i.status === ITEM_STATUS.MATCHED).length
    const variances = items.filter(i => i.status === ITEM_STATUS.VARIANCE).length
    const flagged   = items.filter(i => i.flag).length
    const pending   = items.filter(i => i.status === ITEM_STATUS.PENDING || i.status === 'unconfirmed').length
    const recountsPending = items.filter(i => i.recountStatus === 'recount_pending').length
    const escalated = items.filter(i => i.status === ITEM_STATUS.ESCALATED).length
    const total     = items.length
    const countable = total - recountsPending - escalated
    const pct       = countable > 0 ? Math.round(((confirmed + variances) / countable) * 100) : 0
    return { confirmed, variances, flagged, pending, recountsPending, escalated, total, pct }
  }, [items])

  // Build the save payload from current items
  const buildSavePayload = useCallback(() => {
    return items.map(item => {
      const wasSelfRecounted = selfRecounted[item.cwpn]
      const currentRound = wasSelfRecounted
        ? wasSelfRecounted.previousRound + 1
        : (item.countRound || 1)

      // Build count history including self-recount
      let countHistory = [...(item.countHistory || [])]
      if (wasSelfRecounted && !countHistory.find(h => h.round === wasSelfRecounted.previousRound && h.counted === wasSelfRecounted.previousCounted)) {
        countHistory.push({
          round: wasSelfRecounted.previousRound,
          counted: wasSelfRecounted.previousCounted,
          variance: wasSelfRecounted.previousVariance,
          countedBy: item.countedBy || (currentUser ? { email: currentUser.email, name: currentUser.name } : null),
          countedAt: new Date().toISOString(),
          status: 'variance',
          type: 'self_recount',
        })
      }

      const hasCounted = item.isConfirmed && (
        item.serialTracked
          ? (item.scannedSerials?.length || 0) > 0
          : item.counted !== '' && item.counted != null
      )

      return {
        cwpn: item.cwpn,
        expected: item.expected,
        counted: item.serialTracked
          ? (item.scannedSerials?.length || 0)
          : (item.isConfirmed && item.counted !== '' ? parseInt(item.counted) : null),
        variance: item.isConfirmed ? item.variance : null,
        status: item.status === 'unconfirmed' ? ITEM_STATUS.PENDING
          : item.status === ITEM_STATUS.RECOUNT_PENDING ? 'variance'
          : item.status,
        flag: itemFlags[item.cwpn] || item.flag || null,
        serialTracked: item.serialTracked || false,
        scannedSerials: item.scannedSerials || undefined,
        expectedSerials: item.expectedSerials || undefined,
        recountStatus: item.recountStatus || null,
        recountRound: item.recountRound || null,
        recountExcludedUser: item.recountExcludedUser || null,
        recountRequestId: item.recountRequestId || null,
        countHistory,
        countRound: currentRound,
        countedBy: hasCounted
          ? (item.countedBy || (currentUser ? { email: currentUser.email, name: currentUser.name } : null))
          : null,
        countedAt: hasCounted
          ? (item.countedAt || new Date().toISOString())
          : null,
        escalation: item.escalation || null,
      }
    })
  }, [items, itemFlags, selfRecounted, currentUser])

  // Auto-save with debounce
  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      if (isReadOnly || !activeSection) return
      const payload = buildSavePayload()
      await saveItems(activeSection, payload)
      setDirty(false)
    }, AUTO_SAVE_DELAY_MS)
  }, [isReadOnly, activeSection, buildSavePayload, saveItems])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // Count change handler — just updates local state, no auto-save
  const handleCountChange = useCallback((cwpn, val) => {
    setLocalCounts(prev => ({ ...prev, [cwpn]: val }))
  }, [])

  // Count confirm handler — locks the field and triggers save
  const handleCountConfirm = useCallback((cwpn, val) => {
    if (val === '' || val == null) return
    setLocalCounts(prev => ({ ...prev, [cwpn]: val }))
    setConfirmedItems(prev => ({ ...prev, [cwpn]: true }))
    setDirty(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Serial scan handlers — each scan is implicitly a confirmation
  const handleSerialScanned = useCallback((cwpn, serial, isExpected) => {
    setLocalSerials(prev => {
      const existing = prev[cwpn] || []
      if (existing.includes(serial)) return prev
      return { ...prev, [cwpn]: [...existing, serial] }
    })
    setConfirmedItems(prev => ({ ...prev, [cwpn]: true }))
    setDirty(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  const handleSerialRemoved = useCallback((cwpn, serial) => {
    setLocalSerials(prev => {
      const existing = prev[cwpn] || []
      return { ...prev, [cwpn]: existing.filter(s => s !== serial) }
    })
    setDirty(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Self-recount (Round 2): same tech clears their count to try again.
  const handleRecount = useCallback((cwpn) => {
    const item = items.find(i => i.cwpn === cwpn)
    if (item && item.counted !== '' && item.counted != null) {
      setSelfRecounted(prev => ({
        ...prev,
        [cwpn]: {
          previousCounted: item.counted,
          previousVariance: item.variance,
          previousRound: item.countRound || 1,
        },
      }))
    }

    // Unlock the field
    setConfirmedItems(prev => {
      const next = { ...prev }
      delete next[cwpn]
      return next
    })
    setLocalCounts(prev => ({ ...prev, [cwpn]: '' }))
    setLocalSerials(prev => {
      const next = { ...prev }
      delete next[cwpn]
      return next
    })
    setItemFlags(prev => {
      const next = { ...prev }
      delete next[cwpn]
      return next
    })
    setDirty(true)
    setTimeout(() => {
      const input = document.getElementById(`qty-${cwpn}`)
      if (input) { input.focus(); input.value = '' }
    }, 50)
  }, [items])

  // Flag an item with a reason
  const setFlag = useCallback((cwpn, flagData) => {
    setItemFlags(prev => ({ ...prev, [cwpn]: flagData }))
    setDirty(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Manual save (flush)
  const flushSave = useCallback(async () => {
    if (!activeSection) return
    const payload = buildSavePayload()
    await saveItems(activeSection, payload)
    setDirty(false)
  }, [activeSection, buildSavePayload, saveItems])

  return {
    items,
    stats,
    dirty,
    localCounts,
    confirmedItems,
    localSerials,
    itemFlags,
    handleCountChange,
    handleCountConfirm,
    handleSerialScanned,
    handleSerialRemoved,
    handleRecount,
    setFlag,
    flushSave,
  }
}
