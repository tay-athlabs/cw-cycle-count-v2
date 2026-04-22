/**
 * CountTable.jsx
 * ─────────────────────────────────────────────────────────────────
 * Core counting table. Key behaviors:
 *   - Tech types quantity, presses Enter to confirm and lock
 *   - Once confirmed, field is read-only until Recount is clicked
 *   - Variance only appears after confirmation
 *   - Blind mode: shows Match/Mismatch only, no numeric variance
 *   - Serial-tracked items use scan panel instead of qty input
 *   - Recount rounds: self-recount → independent → escalate
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { VarianceBadge } from './Badge'
import SerialScanPanel from './SerialScanPanel'
import {
  ITEM_STATUS,
  BIN_COLORS,
  MAX_RECOUNT_ROUNDS,
  getVarianceReasonLabel,
  getItemRowClass,
  formatBinLabel,
} from '../constants'

export default function CountTable({
  items,
  stats,
  activeSection,
  isBlind,
  isReadOnly,
  canEdit,
  saving,
  localCounts,
  confirmedItems,
  currentUser,
  onCountChange,
  onCountConfirm,
  onRecount,
  onFlag,
  onRequestRecount,
  onSubmitRecount,
  onEscalate,
  onResolveEscalation,
  onSerialScanned,
  onSerialRemoved,
  onCompleteSection,
}) {
  const secColor = BIN_COLORS[activeSection] || 'var(--border-2)'
  const secLabel = formatBinLabel(activeSection)

  // Check if there are pending recounts for this user
  const pendingRecounts = items.filter(
    i => i.recountStatus === 'recount_pending' && i.recountExcludedUser !== currentUser?.email
  )

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Section header */}
      <div style={{
        padding: '10px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: secColor ? `${secColor}14` : 'var(--surface-2)',
        borderBottom: `2px solid ${secColor || 'var(--border)'}`,
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: secColor }} />
        <span style={{ fontWeight: 700, fontSize: 13 }}>{secLabel}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{items.length} items</span>
        {pendingRecounts.length > 0 && (
          <span className="badge badge-amber" style={{ fontSize: 10 }}>
            {pendingRecounts.length} recount{pendingRecounts.length !== 1 ? 's' : ''} available
          </span>
        )}
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button
            className="btn btn-success btn-sm"
            onClick={onCompleteSection}
            disabled={saving || stats.pending > 0 || stats.recountsPending > 0}
            title={stats.pending > 0
              ? `${stats.pending} items still pending`
              : stats.recountsPending > 0
              ? `${stats.recountsPending} recounts pending`
              : 'Mark section complete'
            }
          >
            Mark complete
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table>
          <thead>
            <tr>
              <th>CWPN</th>
              <th>Description</th>
              <th style={{ textAlign: 'center', width: 44 }}>Type</th>
              {!isBlind && <th style={{ textAlign: 'center' }}>Expected</th>}
              <th style={{ textAlign: 'center' }}>On hand</th>
              <th style={{ textAlign: 'center' }}>Variance</th>
              <th style={{ textAlign: 'center' }}>Round</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={isBlind ? 7 : 8}
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}
                >
                  No items in this section
                </td>
              </tr>
            )}
            {items.map((item, idx) => {
              // Find next uncounted/unconfirmed non-serial item for auto-advance
              let nextCwpn = null
              for (let i = idx + 1; i < items.length; i++) {
                if (!items[i].serialTracked && !confirmedItems?.[items[i].cwpn] && items[i].status !== ITEM_STATUS.ESCALATED && items[i].recountStatus !== 'recount_pending') {
                  nextCwpn = items[i].cwpn
                  break
                }
              }
              return (
                <CountRow
                  key={item.cwpn}
                  item={item}
                  isBlind={isBlind}
                  isReadOnly={isReadOnly}
                  canEdit={canEdit}
                  currentUser={currentUser}
                  localCount={localCounts[item.cwpn]}
                  isConfirmed={!!confirmedItems?.[item.cwpn]}
                  nextItemCwpn={nextCwpn}
                  onCountChange={onCountChange}
                  onCountConfirm={onCountConfirm}
                  onRecount={onRecount}
                  onFlag={onFlag}
                  onRequestRecount={onRequestRecount}
                  onSubmitRecount={onSubmitRecount}
                  onEscalate={onEscalate}
                  onResolveEscalation={onResolveEscalation}
                  onSerialScanned={onSerialScanned}
                  onSerialRemoved={onSerialRemoved}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 16, alignItems: 'center',
        background: 'var(--surface-2)',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {isBlind ? 'Blind count: expected quantities hidden / variance shown as match or mismatch only' : 'Press Enter to confirm each count'}
        </span>
        <div style={{ flex: 1 }} />
        {[
          ['var(--green-light)', 'var(--green-text)', 'Matched'],
          ['var(--red-light)', 'var(--red-text)', 'Variance'],
          ['var(--amber-light)', 'var(--amber-text)', 'Recount'],
          ['var(--purple-light)', 'var(--purple-text)', 'Flagged'],
          ['var(--surface-2)', 'var(--text-muted)', 'Pending'],
        ].map(([bg, c, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2,
              background: bg, border: `1px solid ${c}40`,
            }} />
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


function CountRow({
  item, isBlind, isReadOnly, canEdit, currentUser,
  localCount, isConfirmed, nextItemCwpn, onCountChange, onCountConfirm, onRecount, onFlag,
  onRequestRecount, onSubmitRecount, onEscalate, onResolveEscalation,
  onSerialScanned, onSerialRemoved,
}) {
  // Local input state for unconfirmed typing
  const [inputVal, setInputVal] = useState('')

  const rowClass = getItemRowClass(item)
  const reasonLabel = item.flag ? getVarianceReasonLabel(item.flag.reason) : null
  const isSerialTracked = item.serialTracked
  const isRecountPending = item.recountStatus === 'recount_pending'
  const isEscalated = item.status === ITEM_STATUS.ESCALATED
  const round = item.countRound || 1

  // Round logic
  const needsSelfRecount = round === 1
  const needsIndependentRecount = round === 2
  const canEscalate = round >= MAX_RECOUNT_ROUNDS

  // For independent recount (round 3): can this user do it?
  const canDoRecount = isRecountPending && currentUser?.email !== item.recountExcludedUser
  const isExcludedFromRecount = isRecountPending && currentUser?.email === item.recountExcludedUser

  // Is field editable?
  const fieldEditable = canEdit && !isConfirmed && !isRecountPending && !isEscalated

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const val = e.target.value.trim()
      if (val !== '') {
        onCountConfirm?.(item.cwpn, val)
        // Auto-advance to next uncounted item
        if (nextItemCwpn) {
          setTimeout(() => {
            const nextInput = document.getElementById(`qty-${nextItemCwpn}`)
            if (nextInput) { nextInput.focus(); nextInput.select() }
          }, 50)
        }
      }
    }
  }

  return (
    <tr className={rowClass}>
      <td className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{item.cwpn}</td>
      <td style={{ fontWeight: 500, maxWidth: 200 }} className="truncate">
        {item.desc}
        {item.flag && (
          <div style={{ marginTop: 3 }}>
            <span className="badge badge-purple" style={{ fontSize: 9 }}>
              {reasonLabel || item.flag.reason}
            </span>
            {item.flag.ticket && (
              <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 4 }}>
                {item.flag.ticket}
              </span>
            )}
          </div>
        )}
        {isEscalated && item.escalation && (
          <div style={{ marginTop: 3 }}>
            <span className="badge badge-red" style={{ fontSize: 9 }}>
              Escalated: {item.escalation.reason}
            </span>
          </div>
        )}
        {/* Show count history if recounted */}
        {item.countHistory && item.countHistory.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {item.countHistory.map((h, i) => (
              <div key={i} style={{ fontSize: 9, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Round {h.round}: counted {h.counted ?? '/'} by {h.countedBy?.name || 'Unknown'}
                {!isBlind && h.variance != null && h.variance !== 0 && (
                  <span style={{ color: 'var(--red-text)' }}> (var: {h.variance > 0 ? '+' : ''}{h.variance})</span>
                )}
              </div>
            ))}
          </div>
        )}
      </td>

      {/* Type indicator */}
      <td style={{ textAlign: 'center' }}>
        {isSerialTracked ? (
          <span className="badge badge-blue" style={{ fontSize: 9 }}>SN</span>
        ) : (
          <span className="badge badge-gray" style={{ fontSize: 9 }}>QTY</span>
        )}
      </td>

      {!isBlind && (
        <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.expected}</td>
      )}

      {/* On hand / count input */}
      <td style={{ textAlign: 'center' }}>
        {isSerialTracked ? (
          <SerialScanPanel
            item={item}
            expectedSerials={item.expectedSerials || []}
            scannedSerials={item.scannedSerials || []}
            canEdit={canEdit && !isRecountPending && !isEscalated}
            onSerialScanned={(serial, isExpected) => onSerialScanned?.(item.cwpn, serial, isExpected)}
            onSerialRemoved={(serial) => onSerialRemoved?.(item.cwpn, serial)}
          />
        ) : isRecountPending && canDoRecount ? (
          /* Independent recount input (Round 3) */
          <input
            id={`qty-${item.cwpn}`}
            className="input input-sm input-qty"
            style={{ borderColor: 'var(--amber)', background: 'var(--amber-light)' }}
            type="number"
            min="0"
            placeholder="..."
            onKeyDown={e => {
              if (e.key === 'Enter' && e.target.value !== '') {
                onSubmitRecount?.(item.cwpn, e.target.value)
                e.target.blur()
              }
            }}
            onBlur={e => {
              if (e.target.value !== '') {
                onSubmitRecount?.(item.cwpn, e.target.value)
              }
            }}
          />
        ) : fieldEditable ? (
          /* Normal count input — type freely, Enter to confirm */
          <input
            id={`qty-${item.cwpn}`}
            className="input input-sm input-qty"
            type="number"
            min="0"
            value={localCount ?? ''}
            placeholder="..."
            onChange={e => onCountChange(item.cwpn, e.target.value)}
            onKeyDown={handleKeyDown}
          />
        ) : (
          /* Confirmed / read-only — show locked value */
          <span style={{
            fontWeight: 700,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13,
            color: isConfirmed ? 'var(--text-primary)' : 'var(--text-muted)',
            background: isConfirmed
              ? item.status === ITEM_STATUS.MATCHED ? 'var(--green-light)'
              : item.status === ITEM_STATUS.VARIANCE ? 'var(--red-light)'
              : 'var(--surface-2)'
              : 'transparent',
            padding: '4px 10px',
            borderRadius: 'var(--r-sm)',
            display: 'inline-block',
            minWidth: 40,
          }}>
            {item.counted !== '' && item.counted != null ? item.counted : '...'}
          </span>
        )}
      </td>

      {/* Variance column */}
      <td style={{ textAlign: 'center' }}>
        {isRecountPending ? (
          <span className="badge badge-amber" style={{ fontSize: 10 }}>Recount</span>
        ) : !isConfirmed || item.status === 'unconfirmed' || item.status === ITEM_STATUS.PENDING ? (
          /* Not yet confirmed — show nothing */
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>...</span>
        ) : isBlind ? (
          /* Blind mode — show Match/Mismatch only, no numbers */
          item.variance === 0 ? (
            <span className="badge badge-green" style={{ fontSize: 10 }}>Match</span>
          ) : (
            <span className="badge badge-red" style={{ fontSize: 10 }}>Mismatch</span>
          )
        ) : (
          /* Normal mode — show numeric variance */
          <VarianceBadge variance={item.variance} />
        )}
      </td>

      {/* Round indicator */}
      <td style={{ textAlign: 'center' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, borderRadius: '50%',
          background: round > 1 ? 'var(--amber-light)' : 'var(--surface-2)',
          color: round > 1 ? 'var(--amber-text)' : 'var(--text-muted)',
          fontSize: 10, fontWeight: 700,
        }}>
          {round}
        </span>
      </td>

      <td style={{ textAlign: 'center' }}>
        {/* Round 3 recount pending — different tech enters count */}
        {isRecountPending && canDoRecount && (
          <div className="variance-actions">
            <span style={{ fontSize: 10, color: 'var(--amber-text)', fontWeight: 600 }}>
              Enter independent recount
            </span>
          </div>
        )}
        {isRecountPending && isExcludedFromRecount && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Awaiting recount by another tech
          </div>
        )}

        {/* Escalated state */}
        {isEscalated && !item.escalation?.resolvedAt && onResolveEscalation && (
          <button
            className="variance-btn"
            style={{ borderColor: 'var(--red)', color: 'var(--red-text)', background: 'var(--red-light)' }}
            onClick={() => onResolveEscalation(item)}
          >
            Resolve
          </button>
        )}
        {isEscalated && !item.escalation?.resolvedAt && !onResolveEscalation && (
          <span style={{ fontSize: 10, color: 'var(--red-text)', fontWeight: 600 }}>
            Awaiting resolution
          </span>
        )}
        {isEscalated && item.escalation?.resolvedAt && (
          <span className="badge badge-green" style={{ fontSize: 9 }}>
            Resolved: {item.escalation.action?.replace(/_/g, ' ')}
          </span>
        )}

        {/* Variance actions — depends on which round we're in */}
        {canEdit && item.status === ITEM_STATUS.VARIANCE && !isRecountPending && !isEscalated && (
          <div className="variance-actions">
            {needsSelfRecount && (
              <button
                className="variance-btn variance-btn-recount"
                onClick={() => onRecount(item.cwpn)}
                title="Recount this item yourself (Round 2)"
              >
                Recount
              </button>
            )}
            {needsIndependentRecount && (
              <button
                className="variance-btn variance-btn-recount"
                onClick={() => onRequestRecount?.(item.cwpn)}
                title="Request independent recount by a different technician (Round 3)"
              >
                Request independent recount
              </button>
            )}
            {canEscalate && (
              <button
                className="variance-btn"
                style={{ borderColor: 'var(--red)', color: 'var(--red-text)', background: 'var(--red-light)' }}
                onClick={() => onEscalate?.(item.cwpn)}
                title="Escalate to manager for investigation"
              >
                Escalate
              </button>
            )}
            <button
              className={`variance-btn ${item.flag ? 'variance-btn-flagged' : 'variance-btn-flag'}`}
              onClick={() => onFlag(item)}
            >
              {item.flag ? 'Edit flag' : 'Flag'}
            </button>
          </div>
        )}

        {/* Unconfirmed — prompt to press Enter */}
        {canEdit && item.status === 'unconfirmed' && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Press Enter to confirm
          </span>
        )}

        {/* Read-only variance display */}
        {isReadOnly && item.status === ITEM_STATUS.VARIANCE && !isEscalated && (
          item.flag
            ? <span className="badge badge-purple" style={{ fontSize: 9 }}>{reasonLabel}</span>
            : <span style={{ fontSize: 10, color: 'var(--red-text)' }}>Unflagged</span>
        )}

        {item.status === ITEM_STATUS.MATCHED && (
          <span style={{ fontSize: 10, color: 'var(--green-text)' }}>OK</span>
        )}
        {item.status === ITEM_STATUS.PENDING && !isRecountPending && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>...</span>
        )}
      </td>
    </tr>
  )
}
