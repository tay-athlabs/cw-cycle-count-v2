/**
 * CountTable.jsx
 * The core counting table for a session section.
 * Displays items with editable quantity inputs, variance badges,
 * and action buttons (recount, flag).
 */

import { VarianceBadge } from './Badge'
import {
  ITEM_STATUS,
  BIN_COLORS,
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
  onCountChange,
  onRecount,
  onFlag,
  onCompleteSection,
}) {
  const secColor = BIN_COLORS[activeSection] || 'var(--border-2)'
  const secLabel = formatBinLabel(activeSection)

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
        <div style={{ flex: 1 }} />
        {canEdit && (
          <button
            className="btn btn-success btn-sm"
            onClick={onCompleteSection}
            disabled={saving || stats.pending > 0}
            title={stats.pending > 0
              ? `${stats.pending} items still pending`
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
              {!isBlind && <th style={{ textAlign: 'center' }}>Expected</th>}
              <th style={{ textAlign: 'center' }}>On hand</th>
              <th style={{ textAlign: 'center' }}>Variance</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td
                  colSpan={isBlind ? 5 : 6}
                  style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}
                >
                  No items in this section
                </td>
              </tr>
            )}
            {items.map(item => (
              <CountRow
                key={item.cwpn}
                item={item}
                isBlind={isBlind}
                isReadOnly={isReadOnly}
                canEdit={canEdit}
                localCount={localCounts[item.cwpn]}
                onCountChange={onCountChange}
                onRecount={onRecount}
                onFlag={onFlag}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer legend */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 16, alignItems: 'center',
        background: 'var(--surface-2)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {isBlind ? 'Blind count: expected quantities hidden' : 'All section quantities visible'}
        </span>
        <div style={{ flex: 1 }} />
        {[
          ['var(--green-light)', 'var(--green-text)', 'Matched'],
          ['var(--red-light)', 'var(--red-text)', 'Variance'],
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


function CountRow({ item, isBlind, isReadOnly, canEdit, localCount, onCountChange, onRecount, onFlag }) {
  const rowClass = getItemRowClass(item)
  const reasonLabel = item.flag ? getVarianceReasonLabel(item.flag.reason) : null

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
      </td>

      {!isBlind && (
        <td style={{ textAlign: 'center', fontWeight: 700 }}>{item.expected}</td>
      )}

      <td style={{ textAlign: 'center' }}>
        {canEdit ? (
          <input
            id={`qty-${item.cwpn}`}
            className={`input input-sm input-qty ${
              item.status === ITEM_STATUS.VARIANCE ? 'input-variance'
              : item.status === ITEM_STATUS.MATCHED ? 'input-matched'
              : ''
            }`}
            type="number"
            min="0"
            value={localCount ?? item.counted}
            placeholder="..."
            onChange={e => onCountChange(item.cwpn, e.target.value)}
          />
        ) : (
          <span style={{ fontWeight: 600 }}>
            {item.counted !== '' ? item.counted : '...'}
          </span>
        )}
      </td>

      <td style={{ textAlign: 'center' }}>
        <VarianceBadge variance={item.variance} />
      </td>

      <td style={{ textAlign: 'center' }}>
        {canEdit && item.status === ITEM_STATUS.VARIANCE && (
          <div className="variance-actions">
            <button
              className="variance-btn variance-btn-recount"
              onClick={() => onRecount(item.cwpn)}
            >
              Recount
            </button>
            <button
              className={`variance-btn ${item.flag ? 'variance-btn-flagged' : 'variance-btn-flag'}`}
              onClick={() => onFlag(item)}
            >
              {item.flag ? 'Edit flag' : 'Flag'}
            </button>
          </div>
        )}
        {item.status === ITEM_STATUS.MATCHED && (
          <span style={{ fontSize: 10, color: 'var(--green-text)' }}>OK</span>
        )}
        {item.status === ITEM_STATUS.PENDING && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>...</span>
        )}
        {isReadOnly && item.status === ITEM_STATUS.VARIANCE && (
          item.flag
            ? <span className="badge badge-purple" style={{ fontSize: 9 }}>{reasonLabel}</span>
            : <span style={{ fontSize: 10, color: 'var(--red-text)' }}>Unflagged</span>
        )}
      </td>
    </tr>
  )
}
