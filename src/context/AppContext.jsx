/**
 * AppContext.jsx
 * Global app state — selected site, cached data, UI preferences.
 * Keeps components decoupled from each other.
 */

import { createContext, useContext, useState, useCallback } from 'react'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [selectedSiteId, setSelectedSiteId] = useState(null)
  const [siteCache, setSiteCache]           = useState({})
  const [skuCache, setSkuCache]             = useState(null)
  const [sessionCache, setSessionCache]     = useState({})
  const [toast, setToast]                   = useState(null)

  // Cache helpers — avoid redundant API calls within a session
  const cacheSites = useCallback((sites) => {
    const map = {}
    sites.forEach(s => { map[s.id] = s })
    setSiteCache(map)
  }, [])

  const cacheSKUs = useCallback((skus) => setSkuCache(skus), [])

  const cacheSession = useCallback((session) => {
    setSessionCache(prev => ({ ...prev, [session.id]: session }))
  }, [])

  const invalidateSession = useCallback((id) => {
    setSessionCache(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  // Toast notifications
  const showToast = useCallback((message, type = 'info', duration = 3500) => {
    setToast({ message, type, id: Date.now() })
    setTimeout(() => setToast(null), duration)
  }, [])

  const value = {
    selectedSiteId,
    setSelectedSiteId,
    siteCache,
    cacheSites,
    skuCache,
    cacheSKUs,
    sessionCache,
    cacheSession,
    invalidateSession,
    toast,
    showToast,
  }

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAppContext() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}
