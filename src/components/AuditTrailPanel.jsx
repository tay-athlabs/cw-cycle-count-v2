/**
 * AuditTrailPanel.jsx
 * ─────────────────────────────────────────────────────────────────
 * Collapsible panel showing the full audit trail for a session.
 * Displays timestamped entries for every action: count entries,
 * recounts, flags, claims, approvals, escalations.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react'
import { getAuditLog } from '../services/dataService'

const ACTION_LABELS = {
  session_created: { label: 'Session created', icon: '+', color: 'var(--cw-blue)' },
  session_started: { label: 'Session started', icon: '▶', color: 'var(--cw-blue)' },
  session_submitted: { label: 'Submitted for review', icon: '↑', color: 'var(--amber)' },
  session_approved: { label: 'Session approved', icon: '✓', color: 'var(--green)' },
  session_rejected: { label: 'Session rejected', icon: '✕', color: 'var(--red)' },
  section_claimed: { label: 'Section claimed', icon: '⚑', color: 'var(--purple)' },
  section_completed: { label: 'Section completed', icon: '✓', color: 'var(--green)' },
  item_counted: { label: 'Item counted', icon: '#', color: 'var(--text-secondary)' },
  item_recount_requested: { label: 'Recount requested', icon: '↻', color: 'var(--amber)' },
  item_recounted: { label: 'Item recounted', icon: '↻', color: 'var(--blue)' },
  item_flagged: { label: 'Item flagged', icon: '⚑', color: 'var(--purple)' },
  item_escalated: { label: 'Item escalated', icon: '!', color: 'var(--red)' },
  serial_scanned: { label: 'Serial scanned', icon: '⊡', color: 'var(--blue)' },
  serial_unexpected: { label: 'Unexpected serial', icon: '?', color: 'var(--amber)' },
  serial_missing: { label: 'Serial missing', icon: '✕', color: 'var(--red)' },
  import_completed: { label: 'Import completed', icon: '↓', color: 'var(--green)' },
}

export default function AuditTrailPanel({ sessionId }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!sessionId) return
    getAuditLog({ sessionId })
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) {
    return (
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading audit trail...</div>
      </div>
    )
  }

  return (
    <div className="card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--surface-2)',
      }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Audit trail</span>
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{logs.length} entries</span>
      </div>

      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {logs.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No audit entries recorded yet. Actions will appear here as the session progresses.
          </div>
        ) : (
          <div style={{ padding: '8px 0' }}>
            {logs.map((log, i) => {
              const config = ACTION_LABELS[log.action] || { label: log.action, icon: '·', color: 'var(--text-muted)' }
              return (
                <div key={log.id || i} style={{
                  display: 'flex', gap: 10, padding: '6px 16px',
                  alignItems: 'flex-start',
                  borderBottom: i < logs.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  {/* Icon */}
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: `${config.color}18`,
                    color: config.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>
                      {config.label}
                      {log.sectionKey && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                          {' '}/{' '}{log.sectionKey}
                        </span>
                      )}
                      {log.cwpn && (
                        <span className="mono" style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11, marginLeft: 4 }}>
                          {log.cwpn}
                        </span>
                      )}
                    </div>

                    {/* Extra detail */}
                    {log.round && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Round {log.round}
                        {log.previousCount != null && ` / previous: ${log.previousCount}`}
                        {log.newCount != null && ` / new: ${log.newCount}`}
                        {log.newVariance != null && log.newVariance !== 0 && (
                          <span style={{ color: 'var(--red-text)' }}> (var: {log.newVariance > 0 ? '+' : ''}{log.newVariance})</span>
                        )}
                      </div>
                    )}
                    {log.originalCounter && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Original counter: {log.originalCounter}
                      </div>
                    )}
                    {log.duration && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Duration: {log.duration} min
                      </div>
                    )}
                    {log.reason && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Reason: {log.reason}
                      </div>
                    )}
                  </div>

                  {/* Timestamp + user */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(log.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {log.user?.name || 'System'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
