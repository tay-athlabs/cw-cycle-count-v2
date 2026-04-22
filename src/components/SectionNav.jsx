/**
 * SectionNav.jsx
 * Sidebar navigation for count session bins/sections.
 * Shows progress, claim status, recount pending count, and optional accuracy ring.
 */

import { BIN_COLORS, SECTION_STATUS, formatBinLabel } from '../constants'

export default function SectionNav({
  session,
  skus,
  activeSection,
  onSelectSection,
  accuracy,
}) {
  const sectionKeys = Object.keys(session.sections || {})

  return (
    <div>
      <div className="section-nav">
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4,
        }}>
          Bins
        </div>

        {sectionKeys.map(key => {
          const sec = session.sections?.[key]
          const secSKUs = skus.filter(s =>
            (s.inventory?.[session.siteId]?.[key] || 0) > 0
          )
          const done = sec?.items?.filter(i =>
            i.status && i.status !== 'pending'
          ).length || 0
          const recountsPending = sec?.items?.filter(i =>
            i.recountStatus === 'recount_pending'
          ).length || 0
          const isCompleted = sec?.status === SECTION_STATUS.COMPLETED
            || sec?.status === SECTION_STATUS.APPROVED
          const isClaimed = !!sec?.claimedBy
          const isActive = activeSection === key
          const color = BIN_COLORS[key] || 'var(--border-2)'

          return (
            <div
              key={key}
              className={`section-nav-item${isActive ? ' active' : ''}`}
              onClick={() => onSelectSection(key)}
              style={{ borderColor: isActive ? color : undefined }}
            >
              <div className="section-nav-label">
                <div
                  className="section-dot"
                  style={{
                    background: isCompleted
                      ? 'var(--green)'
                      : isClaimed ? color : 'var(--border-2)',
                  }}
                />
                {formatBinLabel(key)}
                {recountsPending > 0 && (
                  <span className="badge badge-amber" style={{ fontSize: 9, marginLeft: 4 }}>
                    {recountsPending} RC
                  </span>
                )}
              </div>
              <div className="section-nav-meta">
                {isCompleted ? 'Complete' : `${done}/${secSKUs.length} counted`}
                {isClaimed && !isCompleted && (
                  <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                    {sec.claimedBy.name}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {accuracy != null && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <AccuracyRing accuracy={accuracy} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Session accuracy
          </div>
        </div>
      )}
    </div>
  )
}

function AccuracyRing({ accuracy }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const offset = circ - (accuracy / 100) * circ
  const color = accuracy >= 95 ? 'var(--green)'
    : accuracy >= 85 ? 'var(--amber)'
    : 'var(--red)'

  return (
    <div className="accuracy-ring" style={{ width: 90, height: 90, margin: '0 auto' }}>
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="45" cy="45" r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 45 45)"
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <div className="accuracy-label">
        <span>{accuracy}</span>
        <span className="accuracy-sub">%</span>
      </div>
    </div>
  )
}
