import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useSessionList } from '../hooks/useSession'
import { SessionStatus, AccuracyBadge } from '../components/Badge'
import { changeUserRole } from '../services/dataService'
import { useAppContext } from '../context/AppContext'
import {
  ROLE,
  ROLE_LABELS,
  ACTIVE_STATUSES,
  SESSION_STATUS,
  COUNT_MODE,
  ACCURACY,
} from '../constants'

export default function Profile() {
  const navigate = useNavigate()
  const { user, logout, updateRole } = useAuth()
  const { sessions, loading } = useSessionList()
  const { showToast } = useAppContext()
  const [tab, setTab] = useState('my-counts')

  const myCounts = useMemo(() =>
    sessions.filter(s => {
      const sections = Object.values(s.sections || {})
      return sections.some(sec => sec.claimedBy?.email === user?.email)
    }),
    [sessions, user?.email]
  )

  const createdByMe = useMemo(() =>
    sessions.filter(s => s.createdBy?.email === user?.email),
    [sessions, user?.email]
  )

  const stats = useMemo(() => {
    const activeSessions = myCounts.filter(s => ACTIVE_STATUSES.includes(s.status))
    const approvedSessions = myCounts.filter(s => s.status === SESSION_STATUS.APPROVED)
    const accuracies = approvedSessions.map(s => s.accuracy).filter(Boolean)
    const avgAccuracy = accuracies.length
      ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length * 10) / 10
      : null
    const totalDuration = approvedSessions.reduce((sum, s) => sum + (s.duration || 0), 0)
    return { activeSessions, approvedSessions, avgAccuracy, totalDuration }
  }, [myCounts])

  const displaySessions = tab === 'my-counts' ? myCounts : createdByMe

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : 'CW'

  const handleRoleChange = async (newRole) => {
    try {
      await changeUserRole(user.email, newRole, user)
      if (updateRole) updateRole(newRole)
      showToast(`Role changed to ${ROLE_LABELS[newRole]}`, 'success')
    } catch (err) {
      showToast(`Role change failed: ${err.message}`, 'error')
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      {/* Profile header */}
      <div className="card mb-6">
        <div className="profile-header">
          <div className="profile-avatar">
            {user?.picture
              ? <img src={user.picture} alt={user.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : initials
            }
          </div>
          <div className="profile-info">
            <div className="profile-name">{user?.name || 'User'}</div>
            <div className="profile-email">{user?.email || ''}</div>
            <div className="profile-role">
              <span className="badge badge-blue">{ROLE_LABELS[user?.role] || user?.role || 'ICS'}</span>
            </div>
          </div>
          <button className="btn btn-sm" onClick={logout} style={{ alignSelf: 'flex-start' }}>
            Sign out
          </button>
        </div>
      </div>

      {/* Role switcher (for testing) */}
      <div className="card mb-6">
        <h3 className="card-section-title">
          Role
          <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 10, verticalAlign: 'middle' }}>
            Testing mode
          </span>
        </h3>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Switch roles to test different permission levels. Role changes are logged in the audit trail.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.entries(ROLE).map(([key, value]) => (
            <button
              key={value}
              className={`btn btn-sm ${user?.role === value ? 'btn-cw' : ''}`}
              onClick={() => handleRoleChange(value)}
              disabled={user?.role === value}
            >
              {ROLE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      {/* Personal metrics */}
      <div className="grid-4 mb-6">
        <div className="stat-card">
          <div className="stat-label">Sessions counted</div>
          <div className="stat-value">{myCounts.length}</div>
          <div className="stat-sub">{stats.activeSessions.length} active</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sessions created</div>
          <div className="stat-value">{createdByMe.length}</div>
          <div className="stat-sub">as initiator</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg accuracy</div>
          <div className="stat-value" style={stats.avgAccuracy >= ACCURACY.TARGET ? { color: 'var(--green)' } : stats.avgAccuracy ? { color: 'var(--amber)' } : {}}>
            {stats.avgAccuracy ? `${stats.avgAccuracy}%` : 'N/A'}
          </div>
          <div className="stat-sub">{stats.approvedSessions.length} approved</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total time</div>
          <div className="stat-value">{stats.totalDuration > 0 ? `${stats.totalDuration}m` : 'N/A'}</div>
          <div className="stat-sub">across all counts</div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="profile-tabs mb-4">
        <button
          className={`profile-tab${tab === 'my-counts' ? ' active' : ''}`}
          onClick={() => setTab('my-counts')}
        >
          My counts
          <span className="profile-tab-count">{myCounts.length}</span>
        </button>
        <button
          className={`profile-tab${tab === 'created' ? ' active' : ''}`}
          onClick={() => setTab('created')}
        >
          Created by me
          <span className="profile-tab-count">{createdByMe.length}</span>
        </button>
      </div>

      {/* Sessions table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {displaySessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">
              {tab === 'my-counts' ? 'No counts yet' : 'No sessions created yet'}
            </div>
            <div className="empty-state-desc">
              {tab === 'my-counts'
                ? 'Sessions where you claimed and counted sections will appear here'
                : 'Sessions you initiated will appear here'}
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Session ID</th>
                  <th>Site</th>
                  <th>Type</th>
                  <th>Mode</th>
                  <th>{tab === 'my-counts' ? 'Created by' : 'Counted by'}</th>
                  <th>Date</th>
                  <th>Duration</th>
                  <th>Accuracy</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displaySessions.map(s => {
                  const counters = [...new Set(
                    Object.values(s.sections || {})
                      .map(sec => sec.claimedBy?.name)
                      .filter(Boolean)
                  )]

                  return (
                    <tr
                      key={s.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/session/${s.id}`)}
                    >
                      <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.id}</td>
                      <td style={{ fontWeight: 600 }}>{s.siteId}</td>
                      <td style={{ textTransform: 'capitalize' }}>{s.type}</td>
                      <td>
                        <span className={`badge ${s.mode === COUNT_MODE.BLIND ? 'badge-purple' : 'badge-gray'}`}>
                          {s.mode || COUNT_MODE.VISIBLE}
                        </span>
                      </td>
                      <td className="text-muted">
                        {tab === 'my-counts'
                          ? s.createdBy?.name || 'Unknown'
                          : counters.length > 0 ? counters.join(', ') : 'Unclaimed'}
                      </td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : 'N/A'}
                      </td>
                      <td className="text-muted">
                        {s.duration ? `${s.duration} min` : 'N/A'}
                      </td>
                      <td><AccuracyBadge accuracy={s.accuracy} /></td>
                      <td><SessionStatus status={s.status} /></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                          {ACTIVE_STATUSES.includes(s.status) ? 'Continue' : 'View'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
