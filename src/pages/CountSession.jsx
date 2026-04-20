/**
 * CountSession.jsx
 * ─────────────────────────────────────────────────────────────────
 * Orchestrator page for an active count session.
 * All local state logic lives in useCountItems.
 * All UI pieces are imported components.
 * This file only handles layout, routing, and wiring props.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSKUs } from '../hooks/useInventory'
import { useCountItems } from '../hooks/useCountItems'
import { useAuth } from '../context/AuthContext'
import { SessionStatus } from '../components/Badge'
import StatCard from '../components/StatCard'
import ScanBar from '../components/ScanBar'
import SectionNav from '../components/SectionNav'
import CountTable from '../components/CountTable'
import FlagModal from '../components/FlagModal'
import ReportModal from '../components/ReportModal'
import {
  SESSION_STATUS,
  COUNT_MODE,
  BIN_COLORS,
  EDITABLE_STATUSES,
  EXPORTABLE_STATUSES,
  formatBinLabel,
} from '../constants'

export default function CountSession() {
  const { sessionId } = useParams()
  const navigate      = useNavigate()
  const { user }      = useAuth()

  // ── Session data & operations ────────────────────────────────
  const {
    session, loading, saving, error,
    claim, saveItems, completeSection, submit, approve,
    startPolling, stopPolling,
  } = useSession(sessionId)

  const { skus } = useSKUs(session?.siteId)

  // ── Section navigation ───────────────────────────────────────
  const [activeSection, setActiveSection] = useState(null)

  useEffect(() => {
    if (session && !activeSection) {
      const keys = Object.keys(session.sections || {})
      if (keys.length) setActiveSection(keys[0])
    }
  }, [session, activeSection])

  // ── Collaborative polling ────────────────────────────────────
  useEffect(() => {
    if (session?.collaborative) startPolling()
    return () => stopPolling()
  }, [session?.collaborative, startPolling, stopPolling])

  // ── Derived state ────────────────────────────────────────────
  const isBlind    = session?.mode === COUNT_MODE.BLIND
  const isReadOnly = !EDITABLE_STATUSES.includes(session?.status)
  const canExport  = EXPORTABLE_STATUSES.includes(session?.status)
  const currentSection = session?.sections?.[activeSection]
  const mySection  = currentSection?.claimedBy?.email === user?.email
  const unclaimed  = session?.collaborative && !currentSection?.claimedBy
  const canEdit    = !isReadOnly && (mySection || !session?.collaborative)
  const secColor   = BIN_COLORS[activeSection] || 'var(--border-2)'

  // ── Count items hook ─────────────────────────────────────────
  const {
    items, stats, dirty, localCounts, itemFlags,
    handleCountChange, handleRecount, setFlag, flushSave,
  } = useCountItems({
    session,
    activeSection,
    skus,
    saveItems,
    isReadOnly,
  })

  // ── Flag modal state ─────────────────────────────────────────
  const [flagTarget, setFlagTarget] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)

  const openFlagModal = (item) => setFlagTarget(item)
  const closeFlagModal = () => setFlagTarget(null)

  const handleFlagSubmit = (cwpn, flagData) => {
    setFlag(cwpn, flagData)
  }

  // ── Section operations ───────────────────────────────────────
  const handleCompleteSection = async () => {
    await flushSave()
    await completeSection(activeSection)
  }

  const handleSave = async () => {
    await flushSave()
  }

  // ── Duration display ─────────────────────────────────────────
  const getDuration = () => {
    if (session?.duration) return `${session.duration} min`
    if (session?.startedAt) {
      const mins = Math.round((Date.now() - new Date(session.startedAt)) / 60000)
      return `${mins} min (ongoing)`
    }
    return 'N/A'
  }

  // ── Loading / error states ───────────────────────────────────
  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" />
          <p>Loading session...</p>
        </div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">Warning</div>
          <div className="empty-state-title">{error || 'Session not found'}</div>
          <button className="btn mt-4" onClick={() => navigate('/')}>Back</button>
        </div>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────
  return (
    <div className="page" style={{ maxWidth: 1280 }}>
      {/* Header */}
      <div className="flex-between mb-4">
        <div className="flex-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>←</button>
          <div>
            <div className="flex-center gap-2">
              <span style={{ fontSize: 16, fontWeight: 700 }}>{session.id}</span>
              <SessionStatus status={session.status} />
              {session.collaborative && (
                <span className="collab-badge">
                  <span className="collab-dot" />Collaborative
                </span>
              )}
              {isBlind && <span className="badge badge-purple">Blind count</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {session.siteId} / {session.type} / Created by {session.createdBy?.name || 'Unknown'}
              {session.notes && ` / ${session.notes}`}
            </div>
          </div>
        </div>
        <div className="flex-center gap-2">
          {saving && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Saving...</span>}
          {dirty && <span style={{ fontSize: 12, color: 'var(--amber)' }}>Unsaved</span>}
          {canExport && (
            <button className="btn btn-sm" onClick={() => setReportOpen(true)}>
              Download report
            </button>
          )}
          {!isReadOnly && (
            <>
              <button className="btn btn-sm" onClick={handleSave} disabled={saving || !dirty}>
                Save
              </button>
              <button className="btn btn-success btn-sm" onClick={submit} disabled={saving}>
                Submit for review
              </button>
            </>
          )}
          {session.status === SESSION_STATUS.PENDING_REVIEW && (
            <button className="btn btn-cw btn-sm" onClick={approve} disabled={saving}>
              Approve
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 mb-4">
        <StatCard label="Section items" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} accent="var(--green)" />
        <StatCard
          label="Variances" value={stats.variances}
          accent={stats.variances > 0 ? 'var(--red)' : undefined}
          sub={stats.flagged > 0 ? `${stats.flagged} flagged` : undefined}
        />
        <StatCard
          label="Duration" value={getDuration()}
          sub={session.startedAt
            ? `started ${new Date(session.startedAt).toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`
            : 'not started'
          }
        />
      </div>

      {/* Progress bar */}
      {activeSection && (
        <div className="progress-wrap">
          <div className="progress-header">
            <span>{formatBinLabel(activeSection)} progress</span>
            <span>{stats.confirmed + stats.variances} / {stats.total} counted ({stats.pct}%)</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${stats.pct}%`, background: secColor }} />
          </div>
        </div>
      )}

      {/* Main layout */}
      <div className="section-layout">
        {/* Left: section nav */}
        <SectionNav
          session={session}
          skus={skus}
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          accuracy={session.accuracy}
        />

        {/* Right: count area */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Collaborative alerts */}
          {session.collaborative && unclaimed && !isReadOnly && (
            <div className="alert alert-blue">
              <div className="alert-dot" style={{ background: 'var(--cw-blue)' }} />
              <div className="flex-between" style={{ flex: 1 }}>
                <div><strong>Section unclaimed</strong> - claim it to start counting</div>
                <button className="btn btn-cw btn-sm" onClick={() => claim(activeSection)}>
                  Claim section
                </button>
              </div>
            </div>
          )}
          {session.collaborative && currentSection?.claimedBy && !mySection && (
            <div className="alert alert-amber">
              <div className="alert-dot" style={{ background: 'var(--amber)' }} />
              <strong>Claimed by {currentSection.claimedBy.name}</strong> - view only
            </div>
          )}

          {/* Scan bar */}
          {canEdit && (
            <ScanBar skus={skus} sectionColor={secColor} />
          )}

          {/* Count table */}
          <CountTable
            items={items}
            stats={stats}
            activeSection={activeSection}
            isBlind={isBlind}
            isReadOnly={isReadOnly}
            canEdit={canEdit}
            saving={saving}
            localCounts={localCounts}
            onCountChange={handleCountChange}
            onRecount={handleRecount}
            onFlag={openFlagModal}
            onCompleteSection={handleCompleteSection}
          />
        </div>
      </div>

      {/* Flag modal */}
      <FlagModal
        isOpen={!!flagTarget}
        item={flagTarget}
        existingFlag={flagTarget ? itemFlags[flagTarget.cwpn] : null}
        user={user}
        onSubmit={handleFlagSubmit}
        onClose={closeFlagModal}
      />

      {/* Report modal */}
      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        context="session"
        session={session}
        skus={skus}
      />
    </div>
  )
}
