import { useState } from 'react'
import { useAnalytics } from '../hooks/useAnalytics'
import { useSites } from '../hooks/useInventory'
import StatCard from '../components/StatCard'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

const COLORS = ['var(--cw-blue)','var(--purple)','var(--green)','var(--amber)','var(--text-muted)']

export default function Analytics() {
  const { sites } = useSites()
  const [siteFilter, setSiteFilter] = useState('')
  const { data, summary, loading, error } = useAnalytics(siteFilter || null)

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading analytics…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="alert alert-red">{error}</div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Count accuracy, variance trends, and site performance</p>
        </div>
        <div className="flex-center gap-2">
          <select
            className="input"
            style={{ width: 180 }}
            value={siteFilter}
            onChange={e => setSiteFilter(e.target.value)}
          >
            <option value="">All sites</option>
            {sites.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.city}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid-4 mb-6">
          <StatCard
            label="Avg accuracy"
            value={summary.avgAccuracy ? `${summary.avgAccuracy}%` : '—'}
            sub={`${summary.totalSessions} approved sessions`}
            accent={summary.avgAccuracy >= 95 ? 'var(--green)' : summary.avgAccuracy ? 'var(--amber)' : undefined}
          />
          <StatCard
            label="Total variances"
            value={summary.totalVariances}
            sub="across all sessions"
            accent={summary.totalVariances > 0 ? 'var(--red)' : undefined}
          />
          <StatCard
            label="Best site"
            value={summary.bestSite || '—'}
            sub="highest avg accuracy"
            accent="var(--green)"
          />
          <StatCard
            label="Accuracy trend"
            value={summary.trend === 'up' ? '↑ Improving' : summary.trend === 'down' ? '↓ Declining' : '→ Stable'}
            sub="based on last 4 sessions"
            accent={summary.trend === 'up' ? 'var(--green)' : summary.trend === 'down' ? 'var(--red)' : undefined}
          />
        </div>
      )}

      {(!data?.sessions?.length) ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📊</div>
            <div className="empty-state-title">No approved sessions yet</div>
            <div className="empty-state-desc">
              Complete and approve count sessions to see analytics here
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Accuracy trend chart */}
          <div className="grid-2 mb-6">
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                Accuracy over time
              </h3>
              {data.trends.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.trends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="var(--border)" />
                    <YAxis domain={[75, 100]} tick={{ fontSize: 10 }} stroke="var(--border)" unit="%" />
                    <Tooltip
                      formatter={(v, n, p) => [`${v}%`, 'Accuracy']}
                      labelFormatter={l => `Date: ${l}`}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <Line
                      type="monotone" dataKey="accuracy"
                      stroke="var(--navy)" strokeWidth={2.5}
                      dot={{ r: 4, fill: 'var(--navy)', stroke: '#fff', strokeWidth: 2 }}
                      activeDot={{ r: 6 }}
                    />
                    {/* 95% target line */}
                    <Line
                      type="monotone" dataKey={() => 95}
                      stroke="var(--green)" strokeWidth={1.5}
                      strokeDasharray="5 5" dot={false}
                      name="Target (95%)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-desc">Not enough data</div>
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, textAlign: 'right' }}>
                — — Target: 95%
              </div>
            </div>

            {/* Site comparison */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                Site comparison
              </h3>
              {data.siteBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.siteBreakdown} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="site" tick={{ fontSize: 12, fontWeight: 600 }} stroke="var(--border)" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--border)" unit="%" />
                    <Tooltip
                      formatter={(v) => [`${v}%`, 'Avg accuracy']}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                    />
                    <Bar dataKey="avgAccuracy" radius={[4,4,0,0]}>
                      {data.siteBreakdown.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.avgAccuracy >= 95 ? 'var(--green)' : entry.avgAccuracy >= 85 ? 'var(--amber)' : 'var(--red)'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-desc">Not enough data</div>
                </div>
              )}
            </div>
          </div>

          {/* Count type distribution + top variance SKUs */}
          <div className="grid-2 mb-6">
            {/* Pie chart */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                Count type distribution
              </h3>
              {summary?.typeDistribution?.length > 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie
                        data={summary.typeDistribution}
                        dataKey="count" nameKey="type"
                        cx="50%" cy="50%" outerRadius={60}
                        strokeWidth={2} stroke="var(--surface)"
                      >
                        {summary.typeDistribution.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, n, p) => [`${p.payload.pct}% (${v} sessions)`, p.payload.type]}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {summary.typeDistribution.map((d, i) => (
                      <div key={d.type} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <div style={{ width:10, height:10, borderRadius:2, background:COLORS[i%COLORS.length], flexShrink:0 }} />
                        <span style={{ fontSize:13, flex:1 }}>{d.type}</span>
                        <span style={{ fontSize:13, fontWeight:700 }}>{d.pct}%</span>
                      </div>
                    ))}
                    <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid var(--border)', fontSize:12, color:'var(--text-muted)' }}>
                      Blind: {summary.blindCount} · Visible: {summary.visibleCount}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-desc">Not enough data</div>
                </div>
              )}
            </div>

            {/* Top variance SKUs */}
            <div className="card">
              <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
                Most frequent variances
              </h3>
              {data.topVariances.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {data.topVariances.map((v, i) => (
                    <div key={v.cwpn} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{
                        width:22, height:22, borderRadius:6, background:'var(--surface-2)',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:11, fontWeight:700, color:'var(--text-muted)', flexShrink:0,
                      }}>
                        {i + 1}
                      </div>
                      <span className="mono" style={{ fontSize:12, fontWeight:600, flex:1 }}>{v.cwpn}</span>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{
                          height:6, borderRadius:3, background:'var(--red)',
                          width: `${Math.max(20, (v.count / (data.topVariances[0]?.count || 1)) * 80)}px`,
                        }} />
                        <span style={{ fontSize:12, fontWeight:700, color:'var(--red-text)' }}>
                          {v.count}×
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state" style={{ padding: 40 }}>
                  <div className="empty-state-desc">No variances recorded</div>
                </div>
              )}
            </div>
          </div>

          {/* Site detail table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:14 }}>
              Site performance summary
            </div>
            <div className="table-wrap" style={{ border:'none', borderRadius:0 }}>
              <table>
                <thead>
                  <tr>
                    {['Site','Sessions','Avg accuracy','Total variances','Rating'].map(h => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.siteBreakdown.map(site => (
                    <tr key={site.site}>
                      <td style={{ fontWeight:700 }}>{site.site}</td>
                      <td>{site.sessions}</td>
                      <td>
                        <span className={`badge ${site.avgAccuracy >= 95 ? 'badge-green' : site.avgAccuracy >= 85 ? 'badge-amber' : 'badge-red'}`}>
                          {site.avgAccuracy}%
                        </span>
                      </td>
                      <td>
                        <span className={site.variances > 0 ? 'badge badge-red' : 'badge badge-green'}>
                          {site.variances}
                        </span>
                      </td>
                      <td>
                        {site.avgAccuracy >= 95 ? '⭐ Excellent' : site.avgAccuracy >= 85 ? '👍 Good' : '⚠️ Needs attention'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
