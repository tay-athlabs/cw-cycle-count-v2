import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSites } from '../hooks/useInventory'
import { useCreateSession, getSectionKeysForType } from '../hooks/useSession'

const COUNT_TYPES = [
  {
    key: 'quick',
    label: 'Quick count',
    desc: 'Stored bins only — fast, focused on primary stock',
    color: 'var(--cw-blue)',
  },
  {
    key: 'standard',
    label: 'Standard count',
    desc: 'Stored + In Process + Spares — recommended for weekly cadence',
    color: 'var(--purple)',
  },
  {
    key: 'full',
    label: 'Full count',
    desc: 'All bins including RMA & Scrap — for audits, wall-to-wall, and monthly counts',
    color: 'var(--red)',
  },
  {
    key: 'custom',
    label: 'Custom count',
    desc: 'Choose specific bins, categories, or SKUs to count',
    color: 'var(--amber)',
  },
]

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
  const { create, creating } = useCreateSession()

  const [siteId,        setSiteId]        = useState(params.get('site') || '')
  const [countType,     setCountType]     = useState('quick')
  const [mode,          setMode]          = useState('visible')
  const [collaborative, setCollaborative] = useState(false)
  const [notes,         setNotes]         = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [customBins,    setCustomBins]    = useState([])

  // Pre-select first site if only one available
  useEffect(() => {
    if (!siteId && sites.length === 1) setSiteId(sites[0].id)
  }, [sites, siteId])

  const selectedSite = sites.find(s => s.id === siteId)
  const siteBins = selectedSite?.bins || ['Stored', 'In Process', 'Spares', 'RMA_Pending', 'RMA_Vendor', 'Scrap_Pending', 'Receiving_Hold']

  const sectionKeys = countType === 'custom'
    ? customBins
    : getSectionKeysForType(countType, siteBins)

  const canSubmit = !!siteId && !creating && (countType !== 'custom' || customBins.length > 0)

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
      mode,
      collaborative,
      notes,
      scheduledDate: scheduledDate || null,
      customBins: countType === 'custom' ? customBins : null,
      siteBins,
    })
    if (session) navigate(`/session/${session.id}`)
  }

  return (
    <div className="page" style={{ maxWidth: 700 }}>
      {/* Header */}
      <div className="flex-center gap-3 mb-6">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>←</button>
        <div>
          <h1 className="page-title">New count session</h1>
          <p className="page-sub">Configure and start a cycle count</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Site selection */}
        <div className="card">
          <h3 className="card-section-title">Site</h3>
          <div className="grid-2">
            {sites.map(site => (
              <div
                key={site.id}
                onClick={() => { setSiteId(site.id); setCustomBins([]) }}
                className={`select-tile${siteId === site.id ? ' selected' : ''}`}
              >
                <div style={{ fontWeight: 700, fontSize: 14 }}>{site.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {site.city}, {site.country} · {site.region}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Count type */}
        <div className="card">
          <h3 className="card-section-title">Count type</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {COUNT_TYPES.map(type => (
              <div
                key={type.key}
                className={`type-option${countType === type.key ? ' selected' : ''}`}
                onClick={() => setCountType(type.key)}
              >
                <div className="type-radio">
                  {countType === type.key && <div className="type-radio-dot" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="type-label">{type.label}</div>
                  <div className="type-desc">{type.desc}</div>
                  {type.key !== 'custom' && siteId && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      {getSectionKeysForType(type.key, siteBins).map(s => (
                        <span key={s} className="badge badge-gray" style={{ fontSize: 10 }}>
                          {s.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{
                  width: 6, height: 40, borderRadius: 3,
                  background: type.color, flexShrink: 0,
                }} />
              </div>
            ))}
          </div>
        </div>

        {/* Custom bin selector */}
        {countType === 'custom' && siteId && (
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
                  {bin.replace(/_/g, ' ')}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              {
                key: 'visible',
                label: 'Visible count',
                desc: 'Expected quantities shown during count. Faster, good for regular checks.',
              },
              {
                key: 'blind',
                label: 'Blind count',
                desc: 'Expected quantities hidden. Technician counts independently — unbiased results. Recommended for audits.',
              },
            ].map(m => (
              <div
                key={m.key}
                className={`type-option${mode === m.key ? ' selected' : ''}`}
                onClick={() => setMode(m.key)}
              >
                <div className="type-radio">
                  {mode === m.key && <div className="type-radio-dot" />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="type-label">
                    {m.label}
                    {m.key === 'blind' && (
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
              <input
                className="input"
                type="date"
                value={scheduledDate}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setScheduledDate(e.target.value)}
              />
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
            className="input"
            rows={3}
            placeholder="e.g. Weekly surplus + daily ops check. Focus on SFP-LR variance from last session."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Summary + CREATE button */}
        <div className="session-summary-card">
          <div className="session-summary-content">
            <div style={{ fontSize: 13, opacity: .6, marginBottom: 4 }}>Session summary</div>
            <div className="session-summary-details">
              <span><strong>{selectedSite?.name || 'Select a site'}</strong></span>
              <span style={{ opacity:.6 }}>·</span>
              <span style={{ textTransform:'capitalize' }}>{countType} count</span>
              <span style={{ opacity:.6 }}>·</span>
              <span style={{ textTransform:'capitalize' }}>{mode}</span>
              <span style={{ opacity:.6 }}>·</span>
              <span>{collaborative ? '👥 Collaborative' : '👤 Solo'}</span>
              {scheduledDate && (
                <>
                  <span style={{ opacity:.6 }}>·</span>
                  <span>📅 {new Date(scheduledDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 12, opacity: .5, marginTop: 6 }}>
              Sections: {sectionKeys.length > 0 ? sectionKeys.map(k => k.replace(/_/g, ' ')).join(', ') : 'None selected'}
            </div>
          </div>
          <button
            className="btn btn-create-session"
            onClick={handleCreate}
            disabled={!canSubmit}
          >
            {creating
              ? 'Creating session…'
              : scheduledDate
                ? '📅 Schedule count session'
                : '→ Create count session'}
          </button>
        </div>
      </div>
    </div>
  )
}
