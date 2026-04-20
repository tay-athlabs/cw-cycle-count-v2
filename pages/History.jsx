import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionList } from '../hooks/useSession'
import { useSites } from '../hooks/useInventory'
import { SessionStatus, AccuracyBadge } from '../components/Badge'
import { ACTIVE_STATUSES, COUNT_MODE } from '../constants'

export default function History() {
  const navigate = useNavigate()
  const { sessions, loading, refetch } = useSessionList()
  const { sites } = useSites()

  const [siteFilter,   setSiteFilter]   = useState('')
  const [typeFilter,   setTypeFilter]   = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [search,       setSearch]       = useState('')

  const filtered = sessions.filter(s => {
    const matchSite   = !siteFilter   || s.siteId === siteFilter
    const matchType   = !typeFilter   || s.type   === typeFilter
    const matchStatus = !statusFilter || s.status === statusFilter
    const matchSearch = !search       ||
      s.id.toLowerCase().includes(search.toLowerCase()) ||
      s.createdBy?.name?.toLowerCase().includes(search.toLowerCase())
    return matchSite && matchType && matchStatus && matchSearch
  })

  const clearFilters = () => {
    setSiteFilter(''); setTypeFilter(''); setStatusFilter(''); setSearch('')
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading history...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Session history</h1>
          <p className="page-sub">{filtered.length} of {sessions.length} sessions</p>
        </div>
        <div className="flex-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={refetch}>↻ Refresh</button>
          <button className="btn btn-cw" onClick={() => navigate('/session/new')}>
            + New count
          </button>
        </div>
      </div>

      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input
            className="input input-sm"
            style={{ width: 220 }}
            placeholder="Search session ID or technician..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input input-sm" style={{ width:160 }} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input input-sm" style={{ width:150 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="quick">Quick</option>
            <option value="standard">Standard</option>
            <option value="full">Full</option>
            <option value="custom">Custom</option>
          </select>
          <select className="input input-sm" style={{ width:180 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="pending_review">Pending review</option>
            <option value="approved">Approved</option>
          </select>
          {(siteFilter || typeFilter || statusFilter || search) && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No sessions found</div>
            <div className="empty-state-desc">
              {sessions.length > 0 ? 'Try adjusting your filters' : 'Start a count session to see it here'}
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border:'none', borderRadius:0 }}>
            <table>
              <thead>
                <tr>
                  {['Session ID','Site','Type','Mode','Collab','Technician','Date','Accuracy','Matched','Variances','Status',''].map(h => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr
                    key={s.id}
                    style={{ cursor:'pointer' }}
                    onClick={() => navigate(`/session/${s.id}`)}
                  >
                    <td className="mono" style={{ fontSize:12, fontWeight:700 }}>{s.id}</td>
                    <td style={{ fontWeight:600 }}>{s.siteId}</td>
                    <td style={{ textTransform:'capitalize' }}>{s.type}</td>
                    <td>
                      <span className={`badge ${s.mode === COUNT_MODE.BLIND ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize:10 }}>
                        {s.mode || COUNT_MODE.VISIBLE}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {s.collaborative
                        ? <span className="badge badge-blue" style={{ fontSize:10 }}>👥</span>
                        : <span style={{ color:'var(--text-muted)', fontSize:12 }}>/</span>}
                    </td>
                    <td className="text-muted">{s.createdBy?.name || '/'}</td>
                    <td className="text-muted" style={{ whiteSpace:'nowrap' }}>
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString('en-GB', {
                        day:'2-digit', month:'short', year:'numeric',
                      }) : '/'}
                    </td>
                    <td><AccuracyBadge accuracy={s.accuracy} /></td>
                    <td style={{ textAlign:'center' }}>
                      <span className="badge badge-green" style={{ fontSize:10 }}>
                        {s.summary?.matched ?? '/'}
                      </span>
                    </td>
                    <td style={{ textAlign:'center' }}>
                      {(s.summary?.variances ?? 0) > 0
                        ? <span className="badge badge-red" style={{ fontSize:10 }}>{s.summary.variances}</span>
                        : <span className="text-muted">0</span>}
                    </td>
                    <td><SessionStatus status={s.status} /></td>
                    <td>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize:12 }}
                        onClick={e => { e.stopPropagation(); navigate(`/session/${s.id}`) }}>
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
