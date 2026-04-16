export default function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div className="stat-card">
      <div className="flex-between" style={{ marginBottom: 8 }}>
        <div className="stat-label">{label}</div>
        {icon && (
          <span style={{ fontSize: 18, opacity: .5 }}>{icon}</span>
        )}
      </div>
      <div className="stat-value" style={accent ? { color: accent } : {}}>
        {value ?? '—'}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}
