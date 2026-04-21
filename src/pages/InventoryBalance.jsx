/**
 * InventoryBalance.jsx
 * ─────────────────────────────────────────────────────────────────
 * Browsable snapshot of current inventory across all sites.
 * Filterable by site, bin, category. Searchable by CWPN or description.
 * Shows totals per bin and allows drill-down from site level.
 * Also hosts the Import Balance button for CSV uploads.
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react'
import { useSites, useSKUs } from '../hooks/useInventory'
import StatCard from '../components/StatCard'
import ImportModal from '../components/ImportModal'
import { useAppContext } from '../context/AppContext'
import {
  BIN_COLORS,
  formatBinLabel,
} from '../constants'

export default function InventoryBalance() {
  const { sites } = useSites()
  const { skus } = useSKUs()
  const { showToast } = useAppContext()

  const [siteFilter, setSiteFilter] = useState('')
  const [binFilter, setBinFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)

  // Derive all unique categories and bins from SKU data
  const categories = useMemo(() =>
    [...new Set(skus.map(s => s.category).filter(Boolean))].sort(),
    [skus]
  )

  const allBins = useMemo(() => {
    const bins = new Set()
    skus.forEach(sku => {
      Object.values(sku.inventory || {}).forEach(siteBins => {
        Object.keys(siteBins).forEach(b => bins.add(b))
      })
    })
    return [...bins].sort()
  }, [skus])

  // Build flat inventory rows: one row per SKU per site per bin
  const inventoryRows = useMemo(() => {
    const rows = []
    skus.forEach(sku => {
      Object.entries(sku.inventory || {}).forEach(([siteId, bins]) => {
        Object.entries(bins).forEach(([bin, qty]) => {
          if (qty <= 0) return
          rows.push({
            cwpn: sku.cwpn,
            desc: sku.desc,
            category: sku.category,
            typeName: sku.typeName,
            serialTracked: sku.serialTracked,
            siteId,
            bin,
            qty,
          })
        })
      })
    })
    return rows
  }, [skus])

  // Apply filters
  const filtered = useMemo(() => {
    return inventoryRows.filter(r => {
      if (siteFilter && r.siteId !== siteFilter) return false
      if (binFilter && r.bin !== binFilter) return false
      if (categoryFilter && r.category !== categoryFilter) return false
      if (search) {
        const q = search.toLowerCase()
        if (!r.cwpn.toLowerCase().includes(q) && !r.desc.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [inventoryRows, siteFilter, binFilter, categoryFilter, search])

  // Summary stats
  const stats = useMemo(() => {
    const uniqueSites = new Set(filtered.map(r => r.siteId)).size
    const uniqueItems = new Set(filtered.map(r => r.cwpn)).size
    const totalQty = filtered.reduce((s, r) => s + r.qty, 0)
    const binBreakdown = {}
    filtered.forEach(r => {
      binBreakdown[r.bin] = (binBreakdown[r.bin] || 0) + r.qty
    })
    return { uniqueSites, uniqueItems, totalQty, binBreakdown }
  }, [filtered])

  // Aggregate view: group by CWPN for the table
  const aggregated = useMemo(() => {
    const map = {}
    filtered.forEach(r => {
      const key = siteFilter ? `${r.cwpn}` : `${r.cwpn}-${r.siteId}`
      if (!map[key]) {
        map[key] = {
          cwpn: r.cwpn, desc: r.desc, category: r.category,
          typeName: r.typeName, serialTracked: r.serialTracked,
          siteId: r.siteId, bins: {}, total: 0,
        }
      }
      map[key].bins[r.bin] = (map[key].bins[r.bin] || 0) + r.qty
      map[key].total += r.qty
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filtered, siteFilter])

  const clearFilters = () => {
    setSiteFilter(''); setBinFilter(''); setCategoryFilter(''); setSearch('')
  }

  const regions = [...new Set(sites.map(s => s.region))].sort()

  return (
    <div className="page">
      {/* Header */}
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Inventory Balance</h1>
          <p className="page-sub">
            Current stock snapshot across {stats.uniqueSites} site{stats.uniqueSites !== 1 ? 's' : ''}
          </p>
        </div>
        <button className="btn btn-cw" onClick={() => setImportOpen(true)}>
          Import balance
        </button>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-6">
        <StatCard label="Sites" value={stats.uniqueSites} sub="with matching inventory" />
        <StatCard label="Unique items" value={stats.uniqueItems.toLocaleString()} sub="matching filters" />
        <StatCard label="Total quantity" value={stats.totalQty.toLocaleString()} sub="units on hand" />
        <StatCard
          label="Top bin"
          value={Object.keys(stats.binBreakdown).length > 0
            ? formatBinLabel(Object.entries(stats.binBreakdown).sort((a,b) => b[1]-a[1])[0][0])
            : '/'}
          sub={Object.keys(stats.binBreakdown).length > 0
            ? `${Object.entries(stats.binBreakdown).sort((a,b) => b[1]-a[1])[0][1].toLocaleString()} units`
            : 'no data'}
        />
      </div>

      {/* Bin breakdown bar */}
      {Object.keys(stats.binBreakdown).length > 0 && (
        <div className="card mb-6">
          <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Distribution by bin</h3>
          <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
            {Object.entries(stats.binBreakdown)
              .sort((a,b) => b[1]-a[1])
              .map(([bin, qty]) => (
                <div
                  key={bin}
                  style={{
                    width: `${(qty / stats.totalQty) * 100}%`,
                    background: BIN_COLORS[bin] || 'var(--border-2)',
                    minWidth: 2,
                  }}
                  title={`${formatBinLabel(bin)}: ${qty.toLocaleString()}`}
                />
              ))}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {Object.entries(stats.binBreakdown)
              .sort((a,b) => b[1]-a[1])
              .map(([bin, qty]) => (
                <div key={bin} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: BIN_COLORS[bin] || 'var(--border-2)' }} />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatBinLabel(bin)}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{qty.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input input-sm"
            style={{ width: 220 }}
            placeholder="Search CWPN or description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input input-sm" style={{ width: 180 }}
            value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
          >
            <option value="">All sites</option>
            {regions.map(region => (
              <optgroup key={region} label={region}>
                {sites.filter(s => s.region === region).map(s => (
                  <option key={s.id} value={s.id}>{s.name}{s.city ? ` - ${s.city}` : ''}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className="input input-sm" style={{ width: 150 }}
            value={binFilter} onChange={e => setBinFilter(e.target.value)}
          >
            <option value="">All bins</option>
            {allBins.map(b => (
              <option key={b} value={b}>{formatBinLabel(b)}</option>
            ))}
          </select>
          <select
            className="input input-sm" style={{ width: 180 }}
            value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          >
            <option value="">All categories</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(siteFilter || binFilter || categoryFilter || search) && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {aggregated.length.toLocaleString()} rows
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {aggregated.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No inventory data</div>
            <div className="empty-state-desc">
              {skus.length === 0
                ? 'Import a NetSuite inventory balance CSV to populate this view'
                : 'No items match the current filters'}
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>CWPN</th>
                  <th>Description</th>
                  <th>Category</th>
                  {!siteFilter && <th>Site</th>}
                  {allBins.filter(b => !binFilter || b === binFilter).map(b => (
                    <th key={b} style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                        <div style={{ width: 6, height: 6, borderRadius: 2, background: BIN_COLORS[b] || 'var(--border-2)' }} />
                        {formatBinLabel(b)}
                      </div>
                    </th>
                  ))}
                  <th style={{ textAlign: 'center' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {aggregated.slice(0, 100).map((row, i) => (
                  <tr key={`${row.cwpn}-${row.siteId}-${i}`}>
                    <td className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{row.cwpn}</td>
                    <td style={{ maxWidth: 200 }} className="truncate">
                      {row.desc}
                      {row.serialTracked && (
                        <span className="badge badge-blue" style={{ fontSize: 9, marginLeft: 4 }}>Serial</span>
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{row.category}</td>
                    {!siteFilter && (
                      <td style={{ fontWeight: 600, fontSize: 12 }}>{row.siteId}</td>
                    )}
                    {allBins.filter(b => !binFilter || b === binFilter).map(b => (
                      <td key={b} style={{ textAlign: 'center', fontWeight: 600 }}>
                        {row.bins[b]
                          ? <span style={{ color: row.bins[b] > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                              {row.bins[b].toLocaleString()}
                            </span>
                          : <span style={{ color: 'var(--border-2)' }}>-</span>
                        }
                      </td>
                    ))}
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {aggregated.length > 100 && (
          <div style={{
            padding: '10px 16px', borderTop: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-muted)', textAlign: 'center',
            background: 'var(--surface-2)',
          }}>
            Showing 100 of {aggregated.length.toLocaleString()} rows. Use filters to narrow results.
          </div>
        )}
      </div>

      {/* Import modal */}
      <ImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        existingSites={sites}
        onImportComplete={(appData) => {
          showToast(`Imported ${appData.sites.length} sites and ${appData.skus.length} items`, 'success')
          setImportOpen(false)
          setTimeout(() => window.location.href = '/cw-cycle-count-v2/inventory', 1500)
        }}
      />
    </div>
  )
}
