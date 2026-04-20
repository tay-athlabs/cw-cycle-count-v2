/**
 * useCountItems.js
 * ─────────────────────────────────────────────────────────────────
 * Manages the local counting state for an active section:
 *   - Local count values (optimistic, ahead of server)
 *   - Item derivation (merge SKU data + session data + local edits)
 *   - Variance flag state
 *   - Auto-save with debounce
 *   - Recount and flag operations
 *
 * Extracted from CountSession.jsx to keep the page component
 * as a pure orchestrator.
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
}) {
  const [localCounts, setLocalCounts] = useState({})
  const [itemFlags, setItemFlags]     = useState({})
  const [dirty, setDirty]             = useState(false)
  const saveTimer                     = useRef(null)

  const currentSection = session?.sections?.[activeSection]

  // Sync local state when session data or active section changes
  useEffect(() => {
    if (!session || !activeSection) return
    const saved = currentSection?.items || []
    const counts = {}
    const flags = {}
    saved.forEach(item => {
      counts[item.cwpn] = item.counted ?? ''
      if (item.flag) flags[item.cwpn] = item.flag
    })
    setLocalCounts(counts)
    setItemFlags(flags)
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
      const counted = localCounts[sku.cwpn] !== undefined
        ? localCounts[sku.cwpn]
        : saved?.counted ?? ''
      const variance = counted !== '' ? parseInt(counted) - expected : null
      const status = counted === ''
        ? ITEM_STATUS.PENDING
        : variance === 0
          ? ITEM_STATUS.MATCHED
          : ITEM_STATUS.VARIANCE
      const flag = itemFlags[sku.cwpn] || saved?.flag || null
      return { ...sku, expected, counted, variance, status, flag }
    })
  }, [sectionSKUs, session?.siteId, activeSection, currentSection, localCounts, itemFlags])

  // Stats
  const stats = useMemo(() => {
    const confirmed = items.filter(i => i.status === ITEM_STATUS.MATCHED).length
    const variances = items.filter(i => i.status === ITEM_STATUS.VARIANCE).length
    const flagged   = items.filter(i => i.flag).length
    const pending   = items.filter(i => i.status === ITEM_STATUS.PENDING).length
    const total     = items.length
    const pct       = total > 0 ? Math.round(((confirmed + variances) / total) * 100) : 0
    return { confirmed, variances, flagged, pending, total, pct }
  }, [items])

  // Build the save payload from current items
  const buildSavePayload = useCallback(() => {
    return items.map(item => ({
      cwpn: item.cwpn,
      expected: item.expected,
      counted: item.counted !== '' ? parseInt(item.counted) : null,
      variance: item.variance,
      status: item.status,
      flag: itemFlags[item.cwpn] || item.flag || null,
    }))
  }, [items, itemFlags])

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

  // Count change handler
  const handleCountChange = useCallback((cwpn, val) => {
    setLocalCounts(prev => ({ ...prev, [cwpn]: val }))
    setDirty(true)
    scheduleAutoSave()
  }, [scheduleAutoSave])

  // Recount: clear count and flag for an item
  const handleRecount = useCallback((cwpn) => {
    setLocalCounts(prev => ({ ...prev, [cwpn]: '' }))
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
  }, [])

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
    itemFlags,
    handleCountChange,
    handleRecount,
    setFlag,
    flushSave,
  }
}
