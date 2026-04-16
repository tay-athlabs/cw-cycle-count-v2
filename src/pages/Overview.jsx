import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSites } from '../hooks/useInventory'
import { useSessionList } from '../hooks/useSession'
import { SiteStatus, SessionStatus } from '../components/Badge'

const BIN_COLORS = {
  'Stored':         'var(--cw-blue)',
  'In Process':     'var(--purple)',
  'Spares':         'var(--green)',
  'RMA_Pending':    'var(--amber)',
  'RMA_Vendor':     'var(--red)',
  'Scrap_Pending':  'var(--text-muted)',
  'Receiving_Hold': 'var(--blue)',
}

function SiteCard({ site, sessions }) {
  const navigate = useNavigate()
  const siteSessions = sessions.filter(s => s.siteId === site.id)
  const lastSession  = siteSessions.find(s => s.status === 'approved')
  const openCount    = siteSessions.filter(s => ['open','in_progress'].includes(s.status)).length
  const scheduledSessions = siteSessions.filter(s => s.status === 'scheduled')
  const siteStatus   = openCount > 0 ? 'in-progress' : lastSession ? 'up-to-date' : 'due'

  return (
    <div className="site-card" onClick={() => navigate(`/site/${site.id}`)}>
      <div className="site-card-header">
        <div>
          <div className="site-name">{site.name}</div>
          <div className="site-city">{site.city}, {site.country}</div>
        </div>
        <SiteStatus status={siteStatus === 'up-to-date' ? 'up-to-date' : 'count-due'} />
      </div>

      {/* Bins bar */}
      <div className="site-bars">
        {(site.bins || []).slice(0, 5).map(bin => (
          <div key={bin} className="site-bar-row">
            <div className="site-bar-label">{bin.replace(/_/g, ' ')}</div>
            <div className="site-bar-track">
              <div
                className="site-bar-fill"
                style={{
                  width: '40%',
                  background: BIN_COLORS[bin] || 'var(--border-2)',
                  minWidth: 4,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="site-card-footer">
        <span>
          {lastSession
            ? `Last count: ${new Date(lastSession.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}`
            : 'No counts yet'}
        </span>
        <div className="site-card-badges">
          {openCount > 0 && (
            <span className="badge badge-blue" style={{ fontSize: 11 }}>
              {openCount} active
            </span>
          )}
          {scheduledSessions.length > 0 && (
            <span className="badge badge-purple" style={{ fontSize: 11 }}>
              {scheduledSessions.length} scheduled
              {scheduledSessions[0]?.scheduledDate && (
                <> · {new Date(scheduledSessions[0].scheduledDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}</>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Overview() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const regionParam = params.get('region')

  const { sites, loading: sitesLoading } = useSites()
  const { sessions, loading: sessionsLoading } = useSessionList()
  const [activeRegion, setActiveRegion] = useState(regionParam || 'EMEA')
  const [search, setSearch] = useState('')

  const loading = sitesLoading || sessionsLoading

  const regions = ['EMEA', 'US']
  const regionSites = sites.filter(s => s.region === activeRegion)

  // Group by sub-region
  const subRegionGroups = {}
  regionSites.forEach(site => {
    const sr = site.subRegion || 'Other'
    if (!subRegionGroups[sr]) subRegionGroups[sr] = []
    subRegionGroups[sr].push(site)
  })

  // Filter by search
  const filteredGroups = {}
  Object.entries(subRegionGroups).forEach(([sr, siteList]) => {
    const filtered = siteList.filter(s =>
      !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.city.toLowerCase().includes(search.toLowerCase()) ||
      s.country.toLowerCase().includes(search.toLowerCase())
    )
    if (filtered.length) filteredGroups[sr] = filtered
  })

  const totalFiltered = Object.values(filteredGroups).reduce((a, b) => a + b.length, 0)

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading overview…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Site Overview</h1>
          <p className="page-sub">{totalFiltered} sites · {activeRegion} region</p>
        </div>
        <button className="btn btn-cw" onClick={() => navigate('/session/new')}>
          + New count session
        </button>
      </div>

      {/* Region tabs + search */}
      <div className="overview-toolbar mb-6">
        <div className="region-tabs">
          {regions.map(r => (
            <button
              key={r}
              className={`region-tab${activeRegion === r ? ' active' : ''}`}
              onClick={() => { setActiveRegion(r); navigate(`/overview?region=${r}`, { replace: true }) }}
            >
              <span className="region-tab-flag">{r === 'EMEA' ? '🇪🇺' : '🇺🇸'}</span>
              {r}
              <span className="region-tab-count">
                {sites.filter(s => s.region === r).length}
              </span>
            </button>
          ))}
        </div>
        <input
          className="input input-sm"
          style={{ maxWidth: 240 }}
          placeholder="Search sites..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Sub-region groups */}
      {Object.keys(filteredGroups).length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏢</div>
          <div className="empty-state-title">No sites found</div>
          <div className="empty-state-desc">
            {search ? 'Try adjusting your search' : `No sites configured for ${activeRegion}`}
          </div>
        </div>
      ) : (
        Object.entries(filteredGroups)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([subRegion, siteList]) => (
            <div key={subRegion} className="mb-6">
              <div className="subregion-header">
                <h3 className="subregion-title">{subRegion}</h3>
                <span className="subregion-count">{siteList.length} site{siteList.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid-3">
                {siteList.map(site => (
                  <SiteCard key={site.id} site={site} sessions={sessions} />
                ))}
              </div>
            </div>
          ))
      )}
    </div>
  )
}
