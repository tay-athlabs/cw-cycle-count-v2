/**
 * AppContext.jsx
 * Global app state — selected site, cached data, UI preferences.
 * Keeps components decoupled from each other.
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react'
import { TOAST_DURATION_MS } from '../constants'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [selectedSiteId, setSelectedSiteId] = useState(null)
  const [siteCache, setSiteCache]           = useState({})
  const [skuCache, setSkuCache]             = useState(null)
  const [sessionCache, setSessionCache]     = useState({})
  const [toast, setToast]                   = useState(null)
  const toastTimer                          = useRef(null)

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

  // FIX: clean up previous timeout before setting a new one
  const showToast = useCallback((message, type = 'info', duration = TOAST_DURATION_MS) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, type, id: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), duration)
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
