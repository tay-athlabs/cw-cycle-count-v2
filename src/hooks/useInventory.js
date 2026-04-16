/**
 * useInventory.js
 * Fetches and caches sites + SKUs.
 * Components call this hook — they never touch dataService directly.
 */

import { useState, useEffect, useCallback } from 'react'
import { getSites, getSKUs, getSKUsBySite, updateSKU } from '../services/dataService'
import { useAppContext } from '../context/AppContext'

export function useSites() {
  const { siteCache, cacheSites } = useAppContext()
  const [sites, setSites]   = useState(Object.values(siteCache))
  const [loading, setLoading] = useState(!Object.keys(siteCache).length)
  const [error, setError]   = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await getSites()
      cacheSites(data)
      setSites(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [cacheSites])

  useEffect(() => {
    if (!Object.keys(siteCache).length) fetch()
    else setSites(Object.values(siteCache))
  }, [siteCache, fetch])

  return { sites, loading, error, refetch: fetch }
}

export function useSite(id) {
  const { siteCache } = useAppContext()
  const [site, setSite]     = useState(siteCache[id] || null)
  const [loading, setLoading] = useState(!siteCache[id])
  const [error, setError]   = useState(null)

  useEffect(() => {
    if (siteCache[id]) { setSite(siteCache[id]); setLoading(false); return }
    getSites()
      .then(sites => { const s = sites.find(x => x.id === id); setSite(s || null) })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [id, siteCache])

  return { site, loading, error }
}

export function useSKUs(siteId) {
  const { skuCache, cacheSKUs } = useAppContext()
  const [skus, setSkus]       = useState(skuCache || [])
  const [loading, setLoading] = useState(!skuCache)
  const [error, setError]     = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = siteId ? await getSKUsBySite(siteId) : await getSKUs()
      cacheSKUs(data)
      setSkus(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [siteId, cacheSKUs])

  useEffect(() => {
    if (skuCache) setSkus(siteId ? skuCache.filter(s => s.inventory?.[siteId]) : skuCache)
    else fetch()
  }, [skuCache, siteId, fetch])

  return { skus, loading, error, refetch: fetch }
}

export function useSKUMaster() {
  const { skuCache, cacheSKUs } = useAppContext()
  const { showToast } = useAppContext()
  const [saving, setSaving] = useState(false)

  const save = useCallback(async (cwpn, updates) => {
    try {
      setSaving(true)
      await updateSKU(cwpn, updates)
      const fresh = await getSKUs()
      cacheSKUs(fresh)
      showToast('SKU updated successfully', 'success')
    } catch (err) {
      showToast(`Failed to save: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [cacheSKUs, showToast])

  return {
    skus: skuCache || [],
    saving,
    saveSKU: save,
  }
}
