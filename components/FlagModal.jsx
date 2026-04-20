/**
 * FlagModal.jsx
 * Modal dialog for flagging variance discrepancies.
 * Captures reason code, JIRA ticket reference, and notes.
 */

import { useState, useEffect } from 'react'
import { VARIANCE_REASONS } from '../constants'

export default function FlagModal({
  isOpen,
  item,
  existingFlag,
  user,
  onSubmit,
  onClose,
}) {
  const [reason, setReason] = useState('')
  const [note, setNote]     = useState('')
  const [ticket, setTicket] = useState('')

  // Reset form when modal opens with a new item
  useEffect(() => {
    if (isOpen && item) {
      setReason(existingFlag?.reason || '')
      setNote(existingFlag?.note || '')
      setTicket(existingFlag?.ticket || '')
    }
  }, [isOpen, item?.cwpn, existingFlag])

  if (!isOpen || !item) return null

  const handleSubmit = () => {
    if (!reason) return
    onSubmit(item.cwpn, {
      reason,
      note,
      ticket,
      flaggedAt: new Date().toISOString(),
      flaggedBy: { email: user.email, name: user.name },
    })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Flag discrepancy</div>
        <div className="modal-sub">
          <span className="mono" style={{ fontWeight: 600 }}>{item.cwpn}</span>
          {' / '}{item.desc}{' / Variance: '}
          <span style={{ color: 'var(--red-text)', fontWeight: 700 }}>
            {item.variance > 0 ? '+' : ''}{item.variance}
          </span>
        </div>

        {/* Reason selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ marginBottom: 8 }}>Reason</label>
          {VARIANCE_REASONS.map(r => (
            <div
              key={r.key}
              className={`reason-option${reason === r.key ? ' selected' : ''}`}
              onClick={() => setReason(r.key)}
            >
              <div className="reason-radio">
                {reason === r.key && <div className="reason-radio-dot" />}
              </div>
              <div>
                <div className="reason-label">{r.label}</div>
                <div className="reason-desc">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Ticket reference */}
        <div style={{ marginBottom: 12 }}>
          <label>JIRA / Ticket reference (optional)</label>
          <input
            className="input"
            placeholder="e.g. ICS-1234 or LOGISTICS-567"
            value={ticket}
            onChange={e => setTicket(e.target.value)}
          />
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 20 }}>
          <label>Notes (optional)</label>
          <textarea
            className="input"
            rows={3}
            placeholder="Additional context for the variance..."
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Actions */}
        <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-cw" onClick={handleSubmit} disabled={!reason}>
            {existingFlag ? 'Update flag' : 'Flag discrepancy'}
          </button>
        </div>
      </div>
    </div>
  )
}
