/**
 * ReportModal.jsx
 * ─────────────────────────────────────────────────────────────────
 * Popup modal for generating Excel reports.
 * Used from both Analytics page and CountSession page.
 *
 * Props:
 *   isOpen       — boolean
 *   onClose      — callback
 *   context      — 'analytics' | 'session'
 *   session      — session object (context='session')
 *   sessions     — all sessions array (context='analytics')
 *   sites        — all sites array
 *   skus         — all SKUs array
 *   siteFilter   — pre-selected site ID
 *   analyticsData — analytics data object
 * ─────────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { SESSION_STATUS } from '../constants'
import {
  generateSessionReport,
  generateVarianceReport,
  generateSitePerformanceReport,
} from '../services/reportService'

const REPORT_TYPES = {
  session: {
    key: 'session',
    label: 'Session report',
    desc: 'Full export of this count session: summary, all count lines, variances, and section breakdown.',
    icon: '📋',
    color: 'var(--cw-blue)',
    sheets: ['Summary', 'Count lines', 'Variances', 'Section summary'],
    contexts: ['session'],
  },
  variance: {
    key: 'variance',
    label: 'Variance report',
    desc: 'All flagged variances across approved sessions. Includes frequency analysis and site breakdown.',
    icon: '⚠',
    color: 'var(--red)',
    sheets: ['Report info', 'All variances', 'Variance frequency', 'By site'],
    contexts: ['analytics'],
  },
  performance: {
    key: 'performance',
    label: 'Site performance report',
    desc: 'Accuracy trends, session history, count type breakdown, and site comparison over time.',
    icon: '📊',
    color: 'var(--green)',
    sheets: ['Report info', 'Session history', 'Accuracy trend', 'Site comparison', 'Count type breakdown'],
    contexts: ['analytics'],
  },
}

export default function ReportModal({
  isOpen,
  onClose,
  context = 'analytics',
  session = null,
  sessions = [],
  sites = [],
  skus = [],
  siteFilter = '',
  analyticsData = null,
}) {
  const [selected, setSelected] = useState(context === 'session' ? 'session' : 'performance')
  const [generating, setGenerating] = useState(false)
  const [generated, setGenerated] = useState(null)

  if (!isOpen) return null

  const availableTypes = Object.values(REPORT_TYPES).filter(t =>
    t.contexts.includes(context)
  )

  const approvedCount = sessions.filter(s => s.status === SESSION_STATUS.APPROVED).length

  const handleGenerate = async () => {
    setGenerating(true)
    setGenerated(null)

    try {
      let filename
      switch (selected) {
        case 'session':
          filename = generateSessionReport(session, skus)
          break
        case 'variance':
          filename = generateVarianceReport(sessions, skus, siteFilter || null)
          break
        case 'performance':
          filename = generateSitePerformanceReport(sessions, sites, analyticsData, siteFilter || null)
          break
        default:
          break
      }
      setGenerated(filename)
    } catch (err) {
      console.error('Report generation failed:', err)
      setGenerated('error')
    } finally {
      setGenerating(false)
    }
  }

  const handleClose = () => {
    setGenerated(null)
    setGenerating(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-title">Generate report</div>
        <div className="modal-sub">
          {context === 'session'
            ? `Export data from session ${session?.id}`
            : `Export analytics data${siteFilter ? ` for ${siteFilter}` : ' across all sites'}`
          }
        </div>

        {/* Report type selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {availableTypes.map(type => (
            <div
              key={type.key}
              className={`type-option${selected === type.key ? ' selected' : ''}`}
              onClick={() => { setSelected(type.key); setGenerated(null) }}
            >
              <div className="type-radio">
                {selected === type.key && <div className="type-radio-dot" />}
              </div>
              <div style={{ flex: 1 }}>
                <div className="type-label">
                  <span style={{ marginRight: 6 }}>{type.icon}</span>
                  {type.label}
                </div>
                <div className="type-desc">{type.desc}</div>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {type.sheets.map(s => (
                    <span key={s} className="badge badge-gray" style={{ fontSize: 9 }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{
                width: 6, height: 44, borderRadius: 3,
                background: type.color, flexShrink: 0,
              }} />
            </div>
          ))}
        </div>

        {/* Filter info */}
        {context === 'analytics' && (
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <span style={{ fontSize: 14 }}>ℹ</span>
            <div>
              <strong>Scope:</strong>{' '}
              {siteFilter ? `Filtered to site ${siteFilter}` : 'All sites included'}
              {' / '}{approvedCount} approved sessions
            </div>
          </div>
        )}

        {/* Success */}
        {generated && generated !== 'error' && (
          <div className="alert alert-green" style={{ marginBottom: 16 }}>
            <div className="alert-dot" style={{ background: 'var(--green)' }} />
            <div>
              <strong>Report downloaded</strong>
              <div style={{ fontSize: 11, marginTop: 2, opacity: 0.7 }}>{generated}</div>
            </div>
          </div>
        )}

        {generated === 'error' && (
          <div className="alert alert-red" style={{ marginBottom: 16 }}>
            <div className="alert-dot" style={{ background: 'var(--red)' }} />
            <strong>Report generation failed. Please try again.</strong>
          </div>
        )}

        {/* Actions */}
        <div className="flex-center gap-2" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={handleClose}>
            {generated ? 'Close' : 'Cancel'}
          </button>
          <button
            className="btn btn-cw"
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? 'Generating...' : generated ? 'Download again' : 'Generate .xlsx'}
          </button>
        </div>
      </div>
    </div>
  )
}
