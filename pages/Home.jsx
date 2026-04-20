import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSessionList } from '../hooks/useSession'
import { useSites } from '../hooks/useInventory'
import StatCard from '../components/StatCard'
import { SessionStatus, AccuracyBadge } from '../components/Badge'
import ImportModal from '../components/ImportModal'
import { useAppContext } from '../context/AppContext'
import {
  SESSION_STATUS,
  ACTIVE_STATUSES,
  COUNT_MODE,
  ACCURACY,
} from '../constants'

export default function Home() {
  const navigate = useNavigate()
  const { user }  = useAuth()
  const { sites } = useSites()
  const { sessions, loading } = useSessionList()
  const { showToast } = useAppContext()
  const [importOpen, setImportOpen] = useState(false)

  const emeaSites = sites.filter(s => s.region === 'EMEA')
  const usSites   = sites.filter(s => s.region === 'US')

  const openSessions      = sessions.filter(s => ACTIVE_STATUSES.includes(s.status))
  const scheduledSessions = sessions.filter(s => s.status === SESSION_STATUS.SCHEDULED)
  const pendingSessions   = sessions.filter(s => s.status === SESSION_STATUS.PENDING_REVIEW)
  const recentApproved    = sessions.filter(s => s.status === SESSION_STATUS.APPROVED).slice(0, 5)
  const avgAccuracy       = recentApproved.length
    ? Math.round(recentApproved.reduce((s, x) => s + (x.accuracy || 0), 0) / recentApproved.length * 10) / 10
    : null

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Hero header */}
      <div className="home-hero">
        <div>
          <h1 className="home-greeting">
            Good {getGreeting()}, {user?.given_name || user?.name?.split(' ')[0] || 'there'}
          </h1>
          <p className="home-date">
            {new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
          </p>
        </div>
        <div className="flex-center gap-2">
          <button className="btn" onClick={() => setImportOpen(true)}>
            Import balance
          </button>
          <button className="btn btn-cw btn-lg" onClick={() => navigate('/session/new')}>
            + New count session
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 mb-6">
        <StatCard label="Active sessions"  value={openSessions.length}      sub="in progress"        accent={openSessions.length > 0 ? 'var(--cw-blue)' : undefined} />
        <StatCard label="Scheduled"        value={scheduledSessions.length} sub="upcoming counts"    accent={scheduledSessions.length > 0 ? 'var(--purple)' : undefined} />
        <StatCard label="Pending review"   value={pendingSessions.length}   sub="awaiting approval"  accent={pendingSessions.length > 0 ? 'var(--amber)' : undefined} />
        <StatCard label="Avg accuracy"     value={avgAccuracy ? `${avgAccuracy}%` : '/'} sub="last 5 approved" accent={avgAccuracy >= ACCURACY.TARGET ? 'var(--green)' : avgAccuracy ? 'var(--amber)' : undefined} />
      </div>

      {/* Alert banners */}
      {pendingSessions.length > 0 && (
        <div className="alert alert-amber">
          <div className="alert-dot" style={{ background:'var(--amber)' }} />
          <div>
            <strong>{pendingSessions.length} session{pendingSessions.length > 1 ? 's' : ''} pending review</strong>
            {' / '}
            <span style={{ textDecoration:'underline', cursor:'pointer' }} onClick={() => navigate('/history')}>
              View in History
            </span>
          </div>
        </div>
      )}

      {scheduledSessions.length > 0 && (
        <div className="alert alert-blue" style={{ marginBottom: 'var(--sp-6)' }}>
          <div className="alert-dot" style={{ background:'var(--cw-blue)' }} />
          <div>
            <strong>{scheduledSessions.length} scheduled count{scheduledSessions.length > 1 ? 's' : ''}</strong>
            {' / '}
            {scheduledSessions.slice(0, 2).map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <span style={{ cursor:'pointer', textDecoration:'underline' }} onClick={() => navigate(`/session/${s.id}`)}>
                  {s.siteId} ({new Date(s.scheduledDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })})
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick access - regions */}
      <div className="home-regions mb-6">
        <h2 className="home-section-title">Regions</h2>
        <div className="grid-2">
          <div className="region-card" onClick={() => navigate('/overview?region=EMEA')}>
            <div className="region-icon">🇪🇺</div>
            <div>
              <div className="region-name">EMEA</div>
              <div className="region-meta">{emeaSites.length} sites / Europe, Middle East & Africa</div>
            </div>
            <div className="region-arrow">→</div>
          </div>
          <div className="region-card" onClick={() => navigate('/overview?region=US')}>
            <div className="region-icon">🇺🇸</div>
            <div>
              <div className="region-name">US</div>
              <div className="region-meta">{usSites.length} sites / United States</div>
            </div>
            <div className="region-arrow">→</div>
          </div>
        </div>
      </div>

      {/* Recent sessions */}
      <div className="flex-between mb-4">
        <h2 className="home-section-title">Recent sessions</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
          View all →
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No sessions yet</div>
            <div className="empty-state-desc">Start a count session to see it here</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  {['Session ID','Site','Type','Mode','Technician','Started','Duration','Accuracy','Status',''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 8).map(s => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/session/${s.id}`)}>
                    <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.id}</td>
                    <td style={{ fontWeight: 600 }}>{s.siteId}</td>
                    <td style={{ textTransform: 'capitalize' }}>{s.type}</td>
                    <td>
                      <span className={`badge ${s.mode === COUNT_MODE.BLIND ? 'badge-purple' : 'badge-gray'}`}>
                        {s.mode || COUNT_MODE.VISIBLE}
                      </span>
                    </td>
                    <td className="text-muted">{s.createdBy?.name || '/'}</td>
                    <td className="text-muted" style={{ whiteSpace:'nowrap' }}>
                      {formatDate(s.createdAt)}
                    </td>
                    <td className="text-muted" style={{ whiteSpace:'nowrap' }}>
                      {s.duration ? `${s.duration} min` : '/'}
                    </td>
                    <td><AccuracyBadge accuracy={s.accuracy} /></td>
                    <td><SessionStatus status={s.status} /></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                        {ACTIVE_STATUSES.includes(s.status) ? 'Continue →' : s.status === SESSION_STATUS.SCHEDULED ? 'Start →' : 'View →'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existingSites={sites}
        onImportComplete={(appData) => {
          showToast(`Imported ${appData.sites.length} sites and ${appData.skus.length} items`, 'success')
          setImportOpen(false)
        }}
      />
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

function formatDate(iso) {
  if (!iso) return '/'
  const d = new Date(iso)
  const today = new Date()
  const diff  = Math.floor((today - d) / 86400000)
  if (diff === 0) return `Today ${d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' })}`
  if (diff === 1) return 'Yesterday'
  if (diff < 7)  return `${diff} days ago`
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' })
}
