/**
 * CountSession.jsx
 * ─────────────────────────────────────────────────────────────────
 * Orchestrator page for an active count session.
 * Supports:
 *   - Blind / visible count modes
 *   - Quantity and serial-tracked items
 *   - Multi-round recount flow (different tech per round)
 *   - Variance flagging with reason codes
 *   - Escalation after max recounts
 *   - Collaborative section claiming
 *   - Report export
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSession } from '../hooks/useSession'
import { useSKUs } from '../hooks/useInventory'
import { useCountItems } from '../hooks/useCountItems'
import { useAuth } from '../context/AuthContext'
import { isManager } from '../services/authService'
import { SessionStatus } from '../components/Badge'
import StatCard from '../components/StatCard'
import ScanBar from '../components/ScanBar'
import SectionNav from '../components/SectionNav'
import CountTable from '../components/CountTable'
import FlagModal from '../components/FlagModal'
import ReportModal from '../components/ReportModal'
import AuditTrailPanel from '../components/AuditTrailPanel'
import {
  SESSION_STATUS,
  COUNT_MODE,
  COUNT_TYPE,
  BIN_COLORS,
  EDITABLE_STATUSES,
  EXPORTABLE_STATUSES,
  formatBinLabel,
} from '../constants'

export default function CountSession() {
  const { sessionId } = useParams()
  const navigate      = useNavigate()
  const { user }      = useAuth()
  const userIsManager = isManager(user)

  // ── Session data & operations ────────────────────────────────
  const {
    session, loading, saving, error,
    claim, saveItems, completeSection, submit, approve, reject,
    requestRecount, submitRecount, escalateItem, resolveEscalation,
    startPolling, stopPolling,
  } = useSession(sessionId)

  const { skus } = useSKUs(session?.siteId)

  // ── Section navigation ───────────────────────────────────────
  const [activeSection, setActiveSection] = useState(null)
  const [showAuditTrail, setShowAuditTrail] = useState(false)

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
  const isW2W      = session?.type === COUNT_TYPE.WALL_TO_WALL
  const isReadOnly = !EDITABLE_STATUSES.includes(session?.status)
  const canExport  = EXPORTABLE_STATUSES.includes(session?.status)
  const currentSection = session?.sections?.[activeSection]
  const mySection  = currentSection?.claimedBy?.email === user?.email
  const unclaimed  = session?.collaborative && !currentSection?.claimedBy
  const canEdit    = !isReadOnly && (mySection || !session?.collaborative)
  const secColor   = BIN_COLORS[activeSection] || 'var(--border-2)'

  // ── Count items hook ─────────────────────────────────────────
  const {
    items, stats, dirty, localCounts, confirmedItems, localSerials, itemFlags,
    handleCountChange, handleCountConfirm, handleSerialScanned, handleSerialRemoved,
    handleRecount, setFlag, flushSave,
  } = useCountItems({
    session,
    activeSection,
    skus,
    saveItems,
    isReadOnly,
    currentUser: user,
  })

  // ── Flag modal state ─────────────────────────────────────────
  const [flagTarget, setFlagTarget] = useState(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [escalationTarget, setEscalationTarget] = useState(null)

  const openFlagModal = (item) => setFlagTarget(item)
  const closeFlagModal = () => setFlagTarget(null)

  const handleFlagSubmit = (cwpn, flagData) => {
    setFlag(cwpn, flagData)
  }

  const handleReject = async () => {
    if (!rejectReason.trim()) return
    await reject(rejectReason.trim())
    setRejectOpen(false)
    setRejectReason('')
  }

  const handleResolveEscalation = async (resolution) => {
    if (!escalationTarget) return
    await resolveEscalation(activeSection, escalationTarget.cwpn, resolution)
    setEscalationTarget(null)
  }

  // ── Recount operations ───────────────────────────────────────
  const handleRequestRecount = async (cwpn) => {
    await flushSave()
    await requestRecount(activeSection, cwpn)
  }

  const handleSubmitRecount = async (cwpn, value) => {
    await submitRecount(activeSection, cwpn, value)
  }

  const handleEscalate = async (cwpn) => {
    await flushSave()
    await escalateItem(activeSection, cwpn)
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

  // ── Pending recounts count ───────────────────────────────────
  const totalRecountsPending = session
    ? Object.values(session.sections || {}).reduce((sum, sec) => {
        return sum + (sec.items || []).filter(i => i.recountStatus === 'recount_pending').length
      }, 0)
    : 0

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
              {isW2W && <span className="badge badge-amber">Wall-to-wall</span>}
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
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAuditTrail(!showAuditTrail)}
            style={{ fontSize: 12 }}
          >
            {showAuditTrail ? 'Hide' : 'Show'} audit trail
          </button>
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
          {session.status === SESSION_STATUS.PENDING_REVIEW && userIsManager && (
            <>
              <button className="btn btn-sm" style={{ borderColor: 'var(--red)', color: 'var(--red-text)' }}
                onClick={() => setRejectOpen(true)} disabled={saving}>
                Reject
              </button>
              <button className="btn btn-cw btn-sm" onClick={approve} disabled={saving}>
                Approve and reconcile
              </button>
            </>
          )}
          {session.status === SESSION_STATUS.PENDING_REVIEW && !userIsManager && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Awaiting manager approval
            </span>
          )}
        </div>
      </div>

      {/* Rejection reason banner */}
      {session.rejectionReason && session.status === SESSION_STATUS.IN_PROGRESS && (
        <div className="alert alert-red" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="alert-dot" style={{ background: 'var(--red)' }} />
          <div>
            <strong>Session returned by {session.rejectedBy?.name || 'manager'}</strong>
            {' / '}{session.rejectionReason}
          </div>
        </div>
      )}

      {/* Recount alert banner */}
      {totalRecountsPending > 0 && (
        <div className="alert alert-amber" style={{ marginBottom: 'var(--sp-4)' }}>
          <div className="alert-dot" style={{ background: 'var(--amber)' }} />
          <div>
            <strong>{totalRecountsPending} item{totalRecountsPending !== 1 ? 's' : ''} awaiting independent recount (Round 3)</strong>
            {' / '}
            <span style={{ fontSize: 12 }}>
              A different technician must perform the recount for separation of duties
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid-4 mb-4">
        <StatCard label="Section items" value={stats.total} />
        <StatCard label="Confirmed" value={stats.confirmed} accent="var(--green)" />
        <StatCard
          label="Variances" value={stats.variances}
          accent={stats.variances > 0 ? 'var(--red)' : undefined}
          sub={stats.flagged > 0 ? `${stats.flagged} flagged` : stats.recountsPending > 0 ? `${stats.recountsPending} recount pending` : undefined}
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

      {/* Audit trail panel */}
      {showAuditTrail && (
        <AuditTrailPanel sessionId={sessionId} />
      )}

      {/* Main layout */}
      <div className="section-layout">
        {/* Left: section nav */}
        <SectionNav
          session={session}
          skus={skus}
          activeSection={activeSection}
          onSelectSection={async (key) => {
            if (dirty && activeSection) {
              await flushSave()
            }
            setActiveSection(key)
          }}
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

          {/* W2W info */}
          {isW2W && (
            <div className="alert alert-amber" style={{ marginBottom: 0 }}>
              <div className="alert-dot" style={{ background: 'var(--amber)' }} />
              <div>
                <strong>Wall-to-wall count</strong> - blind mode enforced, all variances require recount by a different technician before submission
              </div>
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
            confirmedItems={confirmedItems}
            currentUser={user}
            onCountChange={handleCountChange}
            onCountConfirm={handleCountConfirm}
            onRecount={handleRecount}
            onFlag={openFlagModal}
            onRequestRecount={handleRequestRecount}
            onSubmitRecount={handleSubmitRecount}
            onEscalate={handleEscalate}
            onResolveEscalation={userIsManager ? (item) => setEscalationTarget(item) : null}
            onSerialScanned={handleSerialScanned}
            onSerialRemoved={handleSerialRemoved}
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

      {/* Rejection modal */}
      {rejectOpen && (
        <div className="modal-overlay" onClick={() => setRejectOpen(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-title">Return session for re-count</div>
            <div className="modal-sub">
              This will set the session back to "In progress" so the technician can address the issues.
            </div>
            <div style={{ marginBottom: 16 }}>
              <label>Reason for rejection</label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Recount Stored section — SFP-LR variance needs verification. Check RMA log for missing units."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                style={{ resize: 'vertical' }}
                autoFocus
              />
            </div>
            <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => { setRejectOpen(false); setRejectReason('') }}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleReject} disabled={!rejectReason.trim() || saving}>
                {saving ? 'Returning...' : 'Return for re-count'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation resolution modal */}
      {escalationTarget && (
        <EscalationModal
          item={escalationTarget}
          onResolve={handleResolveEscalation}
          onClose={() => setEscalationTarget(null)}
          saving={saving}
        />
      )}
    </div>
  )
}

function EscalationModal({ item, onResolve, onClose, saving }) {
  const [action, setAction] = useState('accept_variance')
  const [note, setNote] = useState('')
  const [adjustedQty, setAdjustedQty] = useState('')

  const handleSubmit = () => {
    onResolve({
      action,
      note,
      adjustedQty: action === 'adjust_quantity' ? parseInt(adjustedQty) : null,
    })
  }

  const actions = [
    { key: 'accept_variance', label: 'Accept variance as-is', desc: 'The variance is real and will be reflected in inventory after approval.' },
    { key: 'adjust_quantity', label: 'Override with corrected quantity', desc: 'Set the correct quantity manually based on investigation.' },
    { key: 'pending_netsuite', label: 'Pending NetSuite transaction', desc: 'Variance caused by unprocessed transaction. Will resolve on next import.' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-title">Resolve escalation</div>
        <div className="modal-sub">
          <span className="mono" style={{ fontWeight: 600 }}>{item.cwpn}</span>
          {' / '}{item.desc}
          {' / Counted: '}<strong>{item.counted}</strong>
          {' / Expected: '}<strong>{item.expected}</strong>
          {' / Variance: '}
          <span style={{ color: 'var(--red-text)', fontWeight: 700 }}>
            {item.variance > 0 ? '+' : ''}{item.variance}
          </span>
        </div>

        {/* Count history */}
        {item.countHistory?.length > 0 && (
          <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', fontSize: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Count history</div>
            {item.countHistory.map((h, i) => (
              <div key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Round {h.round}: counted {h.counted ?? '/'} by {h.countedBy?.name || 'Unknown'}
                {h.variance != null && h.variance !== 0 && (
                  <span style={{ color: 'var(--red-text)' }}> (var: {h.variance > 0 ? '+' : ''}{h.variance})</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Resolution options */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 8 }}>Resolution</label>
          {actions.map(a => (
            <div
              key={a.key}
              className={`reason-option${action === a.key ? ' selected' : ''}`}
              onClick={() => setAction(a.key)}
            >
              <div className="reason-radio">
                {action === a.key && <div className="reason-radio-dot" />}
              </div>
              <div>
                <div className="reason-label">{a.label}</div>
                <div className="reason-desc">{a.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Adjusted qty input */}
        {action === 'adjust_quantity' && (
          <div style={{ marginBottom: 12 }}>
            <label>Corrected quantity</label>
            <input
              className="input"
              type="number"
              min="0"
              placeholder="Enter correct quantity..."
              value={adjustedQty}
              onChange={e => setAdjustedQty(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label>Investigation notes</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Document the investigation findings and resolution rationale..."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-cw"
            onClick={handleSubmit}
            disabled={saving || (action === 'adjust_quantity' && !adjustedQty)}
          >
            {saving ? 'Resolving...' : 'Resolve escalation'}
          </button>
        </div>
      </div>
    </div>
  )
}
