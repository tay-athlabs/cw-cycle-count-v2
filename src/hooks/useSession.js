/**
 * useSession.js
 * All session lifecycle operations — create, load, update, claim,
 * complete, approve, recount, escalate. With scheduling + duration metrics.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  completeSession,
  approveSession,
  rejectSession,
  claimSection,
  updateSectionItems,
  requestRecount as requestRecountService,
  submitRecount as submitRecountService,
  escalateItem as escalateItemService,
  resolveEscalation as resolveEscalationService,
} from '../services/dataService'
import { useAppContext } from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import {
  COUNT_TYPE,
  getBinsForCountType,
  POLL_INTERVAL_MS,
} from '../constants'

// ── All sessions (for History + Overview) ────────────────────────
export function useSessionList(siteId) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const all = await getSessions()
      setSessions(siteId ? all.filter(s => s.siteId === siteId) : all)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [siteId])

  useEffect(() => { fetch() }, [fetch])

  return { sessions, loading, error, refetch: fetch }
}

// ── Single session (for active count + detail view) ───────────────
export function useSession(sessionId) {
  const { sessionCache, cacheSession, invalidateSession } = useAppContext()
  const { showToast } = useAppContext()
  const { user } = useAuth()

  const [session, setSession]   = useState(sessionCache[sessionId] || null)
  const [loading, setLoading]   = useState(!sessionCache[sessionId])
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState(null)
  const pollRef                 = useRef(null)

  const fetch = useCallback(async () => {
    if (!sessionId) return
    try {
      setError(null)
      const data = await getSessionById(sessionId)
      setSession(data)
      cacheSession(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [sessionId, cacheSession])

  useEffect(() => {
    if (!sessionCache[sessionId]) fetch()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [sessionId, sessionCache, fetch])

  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(fetch, POLL_INTERVAL_MS)
  }, [fetch])

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const claim = useCallback(async (sectionKey) => {
    try {
      setSaving(true)
      const updated = await claimSection(sessionId, sectionKey, {
        email: user.email,
        name: user.name,
      })
      setSession(updated)
      cacheSession(updated)
      showToast(`Section claimed: ${sectionKey}`, 'success')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  const saveItems = useCallback(async (sectionKey, items) => {
    try {
      setSaving(true)
      const updated = await updateSectionItems(sessionId, sectionKey, items)
      setSession(updated)
      cacheSession(updated)
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, cacheSession, showToast])

  const completeSection = useCallback(async (sectionKey) => {
    if (!session) return
    const updated = {
      ...session,
      sections: {
        ...session.sections,
        [sectionKey]: {
          ...session.sections[sectionKey],
          status: 'completed',
          completedAt: new Date().toISOString(),
        },
      },
    }
    try {
      setSaving(true)
      const saved = await updateSession(sessionId, { sections: updated.sections })
      setSession(saved)
      cacheSession(saved)
      showToast('Section marked complete', 'success')
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [session, sessionId, cacheSession, showToast])

  const submit = useCallback(async () => {
    try {
      setSaving(true)
      const updated = await completeSession(sessionId, { email: user.email, name: user.name })
      setSession(updated)
      cacheSession(updated)
      invalidateSession(sessionId)
      showToast('Session submitted for review', 'success')
    } catch (err) {
      showToast(`Submit failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, invalidateSession, showToast])

  const approve = useCallback(async () => {
    try {
      setSaving(true)
      const updated = await approveSession(sessionId, { email: user.email, name: user.name })
      setSession(updated)
      cacheSession(updated)
      showToast('Session approved', 'success')
    } catch (err) {
      showToast(`Approve failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  // ── Recount operations ─────────────────────────────────────────

  const requestRecount = useCallback(async (sectionKey, cwpn) => {
    try {
      setSaving(true)
      const updated = await requestRecountService(sessionId, sectionKey, cwpn, {
        email: user.email,
        name: user.name,
      })
      setSession(updated)
      cacheSession(updated)
      showToast('Recount requested. A different technician must perform the recount.', 'warning')
    } catch (err) {
      showToast(`Recount request failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  const submitRecount = useCallback(async (sectionKey, cwpn, newCount) => {
    try {
      setSaving(true)
      const updated = await submitRecountService(sessionId, sectionKey, cwpn, newCount, {
        email: user.email,
        name: user.name,
      })
      setSession(updated)
      cacheSession(updated)
      const item = Object.values(updated.sections || {})
        .flatMap(s => s.items || [])
        .find(i => i.cwpn === cwpn)
      if (item?.variance === 0) {
        showToast('Recount matched. Variance resolved.', 'success')
      } else {
        showToast(`Recount complete. Variance: ${item?.variance > 0 ? '+' : ''}${item?.variance}`, 'warning')
      }
    } catch (err) {
      showToast(`Recount failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  const escalateItem = useCallback(async (sectionKey, cwpn) => {
    try {
      setSaving(true)
      const updated = await escalateItemService(sessionId, sectionKey, cwpn, {
        email: user.email,
        name: user.name,
      }, 'Variance persists after maximum recounts')
      setSession(updated)
      cacheSession(updated)
      showToast('Item escalated to manager for investigation', 'warning')
    } catch (err) {
      showToast(`Escalation failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  const reject = useCallback(async (reason) => {
    try {
      setSaving(true)
      const updated = await rejectSession(sessionId, { email: user.email, name: user.name }, reason)
      setSession(updated)
      cacheSession(updated)
      invalidateSession(sessionId)
      showToast('Session returned for re-count', 'warning')
    } catch (err) {
      showToast(`Reject failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, invalidateSession, showToast])

  const resolveEscalation = useCallback(async (sectionKey, cwpn, resolution) => {
    try {
      setSaving(true)
      const updated = await resolveEscalationService(sessionId, sectionKey, cwpn, resolution, {
        email: user.email,
        name: user.name,
      })
      setSession(updated)
      cacheSession(updated)
      showToast('Escalation resolved', 'success')
    } catch (err) {
      showToast(`Resolution failed: ${err.message}`, 'error')
    } finally {
      setSaving(false)
    }
  }, [sessionId, user, cacheSession, showToast])

  return {
    session, loading, saving, error,
    refetch: fetch, claim, saveItems,
    completeSection, submit, approve, reject,
    requestRecount, submitRecount, escalateItem, resolveEscalation,
    startPolling, stopPolling,
  }
}

// ── Create new session ────────────────────────────────────────────
export function useCreateSession() {
  const { showToast } = useAppContext()
  const { user } = useAuth()
  const [creating, setCreating] = useState(false)

  const create = useCallback(async (config) => {
    try {
      setCreating(true)
      const session = await createSession({
        ...config,
        createdBy: { email: user.email, name: user.name },
        sections: buildInitialSections(config),
      })
      showToast(`Session ${session.id} created`, 'success')
      return session
    } catch (err) {
      showToast(`Failed to create session: ${err.message}`, 'error')
      return null
    } finally {
      setCreating(false)
    }
  }, [user, showToast])

  return { create, creating }
}

// ── Build empty section structure from config ─────────────────────
function buildInitialSections(config) {
  const sections = {}
  const sectionKeys = getSectionKeysForConfig(config)
  sectionKeys.forEach(key => {
    sections[key] = {
      status: 'open',
      claimedBy: config.collaborative
        ? null
        : { email: config.createdBy?.email, name: config.createdBy?.name },
      claimedAt: config.collaborative ? null : new Date().toISOString(),
      items: [],
    }
  })
  return sections
}

export function getSectionKeysForConfig(config) {
  if (config.type === COUNT_TYPE.CUSTOM && config.customBins?.length) {
    return config.customBins
  }
  return getBinsForCountType(config.type, config.siteBins)
}
