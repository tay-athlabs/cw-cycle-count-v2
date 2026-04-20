import { useParams, useNavigate } from 'react-router-dom'
import { useSite, useSKUs } from '../hooks/useInventory'
import { useSessionList } from '../hooks/useSession'
import { useAnalytics } from '../hooks/useAnalytics'
import StatCard from '../components/StatCard'
import { SessionStatus, AccuracyBadge } from '../components/Badge'
import {
  BIN_COLORS,
  ACTIVE_STATUSES,
  SESSION_STATUS,
  COUNT_MODE,
  ACCURACY,
  formatBinLabel,
} from '../constants'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts'

export default function SiteDetail() {
  const { siteId }  = useParams()
  const navigate    = useNavigate()
  const { site, loading: siteLoading }          = useSite(siteId)
  const { skus, loading: skuLoading }           = useSKUs(siteId)
  const { sessions, loading: sessionsLoading }  = useSessionList(siteId)
  const { data: analytics, loading: analLoading } = useAnalytics(siteId)

  const loading = siteLoading || skuLoading || sessionsLoading || analLoading

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading site...</p>
        </div>
      </div>
    )
  }

  if (!site) {
    return (
      <div className="page">
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <div className="empty-state-title">Site not found</div>
          <button className="btn mt-4" onClick={() => navigate('/')}>← Back</button>
        </div>
      </div>
    )
  }

  const siteBins = site.bins || ['Stored', 'In Process', 'Spares', 'RMA_Pending', 'RMA_Vendor']
  const sectionTotals = {}
  siteBins.forEach(k => {
    sectionTotals[k] = skus.reduce((sum, sku) => sum + (sku.inventory?.[siteId]?.[k] || 0), 0)
  })
  const totalItems = Object.values(sectionTotals).reduce((a, b) => a + b, 0)

  const openSessions     = sessions.filter(s => ACTIVE_STATUSES.includes(s.status))
  const approvedSessions = sessions.filter(s => s.status === SESSION_STATUS.APPROVED)
  const avgAccuracy      = approvedSessions.length
    ? Math.round(approvedSessions.reduce((s, x) => s + (x.accuracy || 0), 0) / approvedSessions.length * 10) / 10
    : null

  return (
    <div className="page">
      {/* Header */}
      <div className="flex-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>←</button>
        <div style={{ flex: 1 }}>
          <h1 className="page-title" style={{ marginBottom: 2 }}>
            {site.name} / {site.city}
          </h1>
          <p className="page-sub">{site.country} / {site.region} / {site.timezone}</p>
        </div>
        <button className="btn btn-cw" onClick={() => navigate(`/session/new?site=${siteId}`)}>
          + New count
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-6">
        <StatCard label="Total items"    value={totalItems}        sub="all sections" />
        <StatCard label="Active sessions" value={openSessions.length} sub="in progress"
          accent={openSessions.length > 0 ? 'var(--blue)' : undefined} />
        <StatCard label="Total sessions" value={sessions.length}   sub="all time" />
        <StatCard label="Avg accuracy"
          value={avgAccuracy ? `${avgAccuracy}%` : '/'}
          sub="approved sessions"
          accent={avgAccuracy >= ACCURACY.TARGET ? 'var(--green)' : avgAccuracy ? 'var(--amber)' : undefined}
        />
      </div>

      <div className="grid-2 mb-6">
        {/* Section breakdown */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
            Inventory breakdown
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(sectionTotals).map(([key, val]) => {
              const color = BIN_COLORS[key] || 'var(--border-2)'
              const label = formatBinLabel(key)
              const pct = totalItems > 0 ? (val / totalItems) * 100 : 0
              return (
                <div key={key}>
                  <div className="flex-between" style={{ fontSize: 12, marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontWeight: 700 }}>{val}</span>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Accuracy trend */}
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Accuracy trend</h3>
          {analytics?.trends?.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--border)" />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} stroke="var(--border)" unit="%" />
                <Tooltip
                  formatter={(v) => [`${v}%`, 'Accuracy']}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <Line
                  type="monotone" dataKey="accuracy"
                  stroke="var(--navy)" strokeWidth={2}
                  dot={{ r: 3, fill: 'var(--navy)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <div className="empty-state-desc">No approved sessions yet</div>
            </div>
          )}
        </div>
      </div>

      {/* Rooms */}
      <div className="mb-6">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Rooms</h2>
        <div className="grid-3">
          {site.rooms?.map(room => (
            <div key={room.id} className="card card-sm">
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{room.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {room.sections?.map(sec => (
                  <span key={sec} className="badge badge-gray" style={{ fontSize: 10 }}>
                    {sec}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sessions */}
      <div className="flex-between mb-4">
        <h2 style={{ fontSize: 16, fontWeight: 700 }}>Sessions at {site.name}</h2>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/history')}>
          View all →
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No sessions for this site</div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  {['Session ID','Type','Mode','Technician','Date','Accuracy','Status',''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.slice(0, 10).map(s => (
                  <tr key={s.id} style={{ cursor:'pointer' }}
                    onClick={() => navigate(`/session/${s.id}`)}>
                    <td className="mono" style={{ fontSize: 12, fontWeight: 600 }}>{s.id}</td>
                    <td style={{ textTransform:'capitalize' }}>{s.type}</td>
                    <td>
                      <span className={`badge ${s.mode === COUNT_MODE.BLIND ? 'badge-purple' : 'badge-gray'}`}>
                        {s.mode || COUNT_MODE.VISIBLE}
                      </span>
                    </td>
                    <td className="text-muted">{s.createdBy?.name || '/'}</td>
                    <td className="text-muted" style={{ whiteSpace:'nowrap' }}>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB') : '/'}
                    </td>
                    <td><AccuracyBadge accuracy={s.accuracy} /></td>
                    <td><SessionStatus status={s.status} /></td>
                    <td>
                      <button className="btn btn-ghost btn-sm">
                        {ACTIVE_STATUSES.includes(s.status) ? 'Continue →' : 'View →'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
