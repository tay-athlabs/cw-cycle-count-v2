/**
 * useAnalytics.js
 * Derives analytics data from completed sessions.
 * All calculations happen here — Analytics.jsx stays presentational.
 */

import { useState, useEffect, useCallback } from 'react'
import { getAnalytics } from '../services/dataService'
import { ACCURACY } from '../constants'

export function useAnalytics(siteId = null) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await getAnalytics(siteId)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => { fetch() }, [fetch])

  const summary = data ? deriveSummary(data) : null

  return { data, summary, loading, error, refetch: fetch }
}

function deriveSummary(data) {
  const { sessions, siteBreakdown } = data

  const totalSessions  = sessions.length
  const approvedSessions = sessions.filter(s => s.status === 'approved').length
  const accuracies     = sessions.map(s => s.accuracy).filter(Boolean)
  const avgAccuracy    = accuracies.length
    ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length * 10) / 10
    : 0
  const totalVariances = sessions.reduce((sum, s) => sum + (s.summary?.variances || 0), 0)

  // FIX: spread before sort to avoid mutating the original data
  const sortedSites = [...siteBreakdown].sort((a, b) => b.avgAccuracy - a.avgAccuracy)
  const bestSite = sortedSites[0]

  const typeMap = {}
  sessions.forEach(s => { typeMap[s.type] = (typeMap[s.type] || 0) + 1 })
  const typeDistribution = Object.entries(typeMap).map(([type, count]) => ({
    type: type.charAt(0).toUpperCase() + type.slice(1),
    count,
    pct: Math.round((count / totalSessions) * 100),
  }))

  const blindCount   = sessions.filter(s => s.mode === 'blind').length
  const visibleCount = sessions.filter(s => s.mode === 'visible').length

  const recent = data.trends.slice(-4).map(t => t.accuracy)
  const trend  = recent.length >= 2
    ? recent[recent.length - 1] - recent[0] > 0 ? 'up' : 'down'
    : 'stable'

  return {
    totalSessions,
    approvedSessions,
    avgAccuracy,
    totalVariances,
    bestSite: bestSite?.site || '/',
    typeDistribution,
    blindCount,
    visibleCount,
    trend,
  }
}
