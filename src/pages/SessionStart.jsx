import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSites } from '../hooks/useInventory'
import { useSessionList, useCreateSession } from '../hooks/useSession'
import {
  COUNT_TYPE,
  COUNT_TYPE_CONFIG,
  COUNT_MODE,
  SESSION_STATUS,
  DEFAULT_BINS,
  ACCURACY,
  getBinsForCountType,
  formatBinLabel,
} from '../constants'

function Toggle({ on, onToggle }) {
  return (
    <button className={`toggle${on ? ' on' : ''}`} onClick={onToggle} type="button">
      <div className="toggle-knob" />
    </button>
  )
}

export default function SessionStart() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()
  const { sites }      = useSites()
  const { sessions }   = useSessionList()
  const { create, creating } = useCreateSession()

  const [siteId,        setSiteId]        = useState(params.get('site') || '')
  const [countType,     setCountType]     = useState(COUNT_TYPE.QUICK)
  const [mode,          setMode]          = useState(COUNT_MODE.VISIBLE)
  const [collaborative, setCollaborative] = useState(false)
  const [notes,         setNotes]         = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [customBins,    setCustomBins]    = useState([])

  useEffect(() => {
    if (!siteId && sites.length === 1) setSiteId(sites[0].id)
  }, [sites, siteId])

  // W2W enforces blind mode
  useEffect(() => {
    if (countType === COUNT_TYPE.WALL_TO_WALL) {
      setMode(COUNT_MODE.BLIND)
    }
  }, [countType])

  const selectedSite = sites.find(s => s.id === siteId)
  const siteBins = selectedSite?.bins || DEFAULT_BINS

  const siteSessions = sessions.filter(s => s.siteId === siteId && s.status === SESSION_STATUS.APPROVED)
  const lastSession = siteSessions[0]
  const lastAccuracy = lastSession?.accuracy

  const sectionKeys = countType === COUNT_TYPE.CUSTOM
    ? customBins
    : getBinsForCountType(countType, siteBins)

  const isW2W = countType === COUNT_TYPE.WALL_TO_WALL

  const canSubmit = !!siteId && !creating && (countType !== COUNT_TYPE.CUSTOM || customBins.length > 0)

  const toggleCustomBin = (bin) => {
    setCustomBins(prev =>
      prev.includes(bin) ? prev.filter(b => b !== bin) : [...prev, bin]
    )
  }

  const handleCreate = async () => {
    if (!canSubmit) return
    const session = await create({
      siteId,
      type: countType,
      mode: isW2W ? COUNT_MODE.BLIND : mode,
      collaborative,
      notes,
      scheduledDate: scheduledDate || null,
      customBins: countType === COUNT_TYPE.CUSTOM ? customBins : null,
      siteBins,
    })
    if (session) navigate(`/session/${session.id}`)
  }

  const regions = [...new Set(sites.map(s => s.region))].sort()

  return (
    <div className="page" style={{ maxWidth: 700 }}>
      <div className="flex-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>←</button>
        <div>
          <h1 className="page-title">New count session</h1>
          <p className="page-sub">Configure and start a cycle count</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Site dropdown */}
        <div className="card">
          <h3 className="card-section-title">Site</h3>
          <select
            className="site-select"
            value={siteId}
            onChange={e => { setSiteId(e.target.value); setCustomBins([]) }}
          >
            <option value="">Select a site...</option>
            {regions.map(region => (
              <optgroup key={region} label={region}>
                {sites.filter(s => s.region === region).map(site => (
                  <option key={site.id} value={site.id}>
                    {site.name} - {site.city}, {site.country}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>

          {siteId && (
            <div className="site-select-info">
              <div className="site-select-info-item">
                <span style={{ color: 'var(--text-muted)' }}>Last count:</span>
                <span style={{ fontWeight: 600 }}>
                  {lastSession
                    ? new Date(lastSession.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : 'Never'}
                </span>
              </div>
              <div className="site-select-info-item">
                <span style={{ color: 'var(--text-muted)' }}>Accuracy:</span>
                <span style={{
                  fontWeight: 600,
                  color: lastAccuracy >= ACCURACY.TARGET ? 'var(--green)' : lastAccuracy >= ACCURACY.GOOD ? 'var(--amber)' : lastAccuracy ? 'var(--red)' : 'var(--text-muted)',
                }}>
                  {lastAccuracy ? `${lastAccuracy}%` : 'N/A'}
                </span>
              </div>
              <div className="site-select-info-item">
                <span style={{ color: 'var(--text-muted)' }}>Bins:</span>
                <span style={{ fontWeight: 600 }}>{siteBins.length}</span>
              </div>
            </div>
          )}
        </div>

        {/* Count type */}
        <div className="card">
          <h3 className="card-section-title">Count type</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COUNT_TYPE_CONFIG.map(type => (
              <div
                key={type.key}
                className={`type-option${countType === type.key ? ' selected' : ''}`}
                onClick={() => setCountType(type.key)}
              >
                <div className="type-radio">
                  {countType === type.key && <div className="type-radio-dot" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="type-label">
                    {type.label}
                    {type.key === COUNT_TYPE.WALL_TO_WALL && (
                      <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 10 }}>
                        Blind mode enforced
                      </span>
                    )}
                  </div>
                  <div className="type-desc">{type.desc}</div>
                  {type.key !== COUNT_TYPE.CUSTOM && siteId && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {getBinsForCountType(type.key, siteBins).map(s => (
                        <span key={s} className="badge badge-gray" style={{ fontSize: 10 }}>
                          {formatBinLabel(s)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ width: 6, height: 40, borderRadius: 3, background: type.color, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Custom bin selector */}
        {countType === COUNT_TYPE.CUSTOM && siteId && (
          <div className="card">
            <h3 className="card-section-title">Select bins to count</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {siteBins.map(bin => (
                <button
                  key={bin}
                  type="button"
                  className={`bin-chip${customBins.includes(bin) ? ' active' : ''}`}
                  onClick={() => toggleCustomBin(bin)}
                >
                  <span className="bin-chip-check">
                    {customBins.includes(bin) ? '✓' : ''}
                  </span>
                  {formatBinLabel(bin)}
                </button>
              ))}
            </div>
            {customBins.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--amber-text)', marginTop: 8 }}>
                Select at least one bin to continue
              </div>
            )}
          </div>
        )}

        {/* Count mode */}
        <div className="card">
          <h3 className="card-section-title">Count mode</h3>
          {isW2W && (
            <div className="alert alert-amber" style={{ marginBottom: 12 }}>
              <div className="alert-dot" style={{ background: 'var(--amber)' }} />
              <div style={{ fontSize: 12 }}>
                <strong>Blind mode is enforced</strong> for wall-to-wall counts. Expected quantities are hidden from counters to ensure unbiased results.
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { key: COUNT_MODE.VISIBLE, label: 'Visible count', desc: 'Expected quantities shown during count. Faster, good for regular checks.' },
              { key: COUNT_MODE.BLIND, label: 'Blind count', desc: 'Expected quantities hidden. Technician counts independently for unbiased results. Recommended for audits.' },
            ].map(m => (
              <div
                key={m.key}
                className={`type-option${mode === m.key ? ' selected' : ''}${isW2W && m.key === COUNT_MODE.VISIBLE ? ' disabled' : ''}`}
                onClick={() => { if (!isW2W || m.key === COUNT_MODE.BLIND) setMode(m.key) }}
                style={isW2W && m.key === COUNT_MODE.VISIBLE ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
              >
                <div className="type-radio">
                  {mode === m.key && <div className="type-radio-dot" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="type-label">
                    {m.label}
                    {m.key === COUNT_MODE.BLIND && (
                      <span className="badge badge-purple" style={{ marginLeft: 8, fontSize: 10 }}>
                        Recommended for audits
                      </span>
                    )}
                  </div>
                  <div className="type-desc">{m.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule */}
        <div className="card">
          <h3 className="card-section-title">Schedule</h3>
          <div className="toggle-row" style={{ marginBottom: scheduledDate ? 12 : 0 }}>
            <div>
              <div className="toggle-info-label">Schedule for later</div>
              <div className="toggle-info-desc">
                Set a start date. The count will appear as "Scheduled" on the site overview until started.
              </div>
            </div>
            <Toggle
              on={!!scheduledDate}
              onToggle={() => setScheduledDate(prev => prev ? '' : new Date(Date.now() + 86400000).toISOString().split('T')[0])}
            />
          </div>
          {scheduledDate && (
            <div style={{ marginTop: 12 }}>
              <label>Start date</label>
              <input className="input" type="date" value={scheduledDate} min={new Date().toISOString().split('T')[0]} onChange={e => setScheduledDate(e.target.value)} />
            </div>
          )}
        </div>

        {/* Collaborative toggle */}
        <div className="card">
          <h3 className="card-section-title">Collaboration</h3>
          <div className="toggle-row">
            <div>
              <div className="toggle-info-label">Collaborative session</div>
              <div className="toggle-info-desc">
                Multiple technicians can join and claim sections independently.
                Each tech counts their assigned area simultaneously.
              </div>
            </div>
            <Toggle on={collaborative} onToggle={() => setCollaborative(v => !v)} />
          </div>
          {collaborative && (
            <div className="alert alert-blue mt-4" style={{ marginBottom: 0 }}>
              <div className="alert-dot" style={{ background: 'var(--cw-blue)' }} />
              <div>
                A <strong>session join code</strong> will be generated after creation.
                Share it with other technicians so they can join and claim sections.
                Sections auto-lock once claimed.
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="card">
          <h3 className="card-section-title">Notes (optional)</h3>
          <textarea
            className="input" rows={3}
            placeholder="e.g. Weekly surplus check. Focus on SFP-LR variance from last session."
            value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }}
          />
        </div>

        {/* Summary + CREATE */}
        <div className="session-summary-card">
          <div className="session-summary-content">
            <div style={{ fontSize: 13, opacity: .6, marginBottom: 4 }}>Session summary</div>
            <div className="session-summary-details">
              <span><strong>{selectedSite?.name || 'Select a site'}</strong></span>
              <span style={{ opacity:.6 }}>/</span>
              <span style={{ textTransform:'capitalize' }}>{countType.replace(/_/g, ' ')} count</span>
              <span style={{ opacity:.6 }}>/</span>
              <span style={{ textTransform:'capitalize' }}>{isW2W ? 'Blind (enforced)' : mode}</span>
              <span style={{ opacity:.6 }}>/</span>
              <span>{collaborative ? 'Collaborative' : 'Solo'}</span>
              {scheduledDate && (
                <>
                  <span style={{ opacity:.6 }}>/</span>
                  <span>{new Date(scheduledDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 12, opacity: .5, marginTop: 6 }}>
              Sections: {sectionKeys.length > 0 ? sectionKeys.map(k => formatBinLabel(k)).join(', ') : 'None selected'}
            </div>
            {isW2W && (
              <div style={{ fontSize: 11, opacity: .7, marginTop: 4, color: '#FEC84B' }}>
                All variances will require recount by a different technician
              </div>
            )}
          </div>
          <button className="btn btn-create-session" onClick={handleCreate} disabled={!canSubmit}>
            {creating ? 'Creating session...' : scheduledDate ? 'Schedule count session' : 'Create count session'}
          </button>
        </div>
      </div>
    </div>
  )
}
