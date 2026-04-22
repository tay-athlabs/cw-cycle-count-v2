/**
 * InventoryBalance.jsx
 * ─────────────────────────────────────────────────────────────────
 * Browse current inventory data across all sites.
 * Features:
 *   - Filter by site, bin, category, serial-tracked
 *   - Expandable rows for serial-tracked items showing individual serials
 *   - Shows last import date and data source
 *   - Links to start a count session for any site
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSites, useSKUs } from '../hooks/useInventory'
import { getSerialRegistry } from '../services/dataService'
import { formatBinLabel } from '../constants'

export default function InventoryBalance() {
  const navigate = useNavigate()
  const { sites } = useSites()
  const { skus, loading } = useSKUs()

  const [siteFilter, setSiteFilter]   = useState('')
  const [binFilter, setBinFilter]     = useState('')
  const [typeFilter, setTypeFilter]   = useState('')
  const [search, setSearch]           = useState('')
  const [expandedItem, setExpandedItem] = useState(null)
  const [serialData, setSerialData]   = useState({})
  const [loadingSerials, setLoadingSerials] = useState(false)

  // Build flat inventory rows from SKU data
  const rows = useMemo(() => {
    if (!skus) return []
    const result = []
    skus.forEach(sku => {
      Object.entries(sku.inventory || {}).forEach(([siteId, bins]) => {
        // Site filter
        if (siteFilter && siteId !== siteFilter) return

        Object.entries(bins).forEach(([bin, qty]) => {
          if (qty <= 0) return
          // Bin filter
          if (binFilter && bin !== binFilter) return
          // Type filter
          if (typeFilter === 'serial' && !sku.serialTracked) return
          if (typeFilter === 'qty' && sku.serialTracked) return
          // Search
          if (search) {
            const q = search.toLowerCase()
            if (!sku.cwpn.toLowerCase().includes(q) &&
                !sku.desc?.toLowerCase().includes(q) &&
                !sku.typeName?.toLowerCase().includes(q)) return
          }

          result.push({
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
    return result.sort((a, b) => a.siteId.localeCompare(b.siteId) || a.bin.localeCompare(b.bin) || a.cwpn.localeCompare(b.cwpn))
  }, [skus, siteFilter, binFilter, typeFilter, search])

  // Get all bins across all sites for the filter dropdown
  const allBins = useMemo(() => {
    const bins = new Set()
    skus?.forEach(sku => {
      Object.values(sku.inventory || {}).forEach(siteBins => {
        Object.keys(siteBins).forEach(b => bins.add(b))
      })
    })
    return [...bins].sort()
  }, [skus])

  // Summary stats
  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const uniqueItems = new Set(rows.map(r => r.cwpn)).size
  const uniqueSites = new Set(rows.map(r => r.siteId)).size
  const serialItems = rows.filter(r => r.serialTracked)

  // Load serials for an expanded item
  const handleExpand = async (cwpn, siteId) => {
    const key = `${cwpn}:${siteId}`
    if (expandedItem === key) {
      setExpandedItem(null)
      return
    }
    setExpandedItem(key)
    if (!serialData[key]) {
      setLoadingSerials(true)
      try {
        const serials = await getSerialRegistry(cwpn, siteId)
        setSerialData(prev => ({ ...prev, [key]: serials }))
      } catch {
        setSerialData(prev => ({ ...prev, [key]: [] }))
      } finally {
        setLoadingSerials(false)
      }
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="loading-screen" style={{ minHeight: 300 }}>
          <div className="loading-spinner" /><p>Loading inventory...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="flex-between mb-6">
        <div>
          <h1 className="page-title">Inventory Balance</h1>
          <p className="page-sub">
            {uniqueItems} items across {uniqueSites} sites / {totalQty.toLocaleString()} total units
          </p>
        </div>
        <button className="btn btn-cw" onClick={() => navigate('/session/new')}>
          + New count session
        </button>
      </div>

      {/* Filters */}
      <div className="card mb-4" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="input input-sm"
            style={{ width: 220 }}
            placeholder="Search CWPN, description..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select className="input input-sm" style={{ width: 160 }} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="">All sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 160 }} value={binFilter} onChange={e => setBinFilter(e.target.value)}>
            <option value="">All bins</option>
            {allBins.map(b => <option key={b} value={b}>{formatBinLabel(b)}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 140 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="serial">Serialized only</option>
            <option value="qty">Quantity only</option>
          </select>
          {(siteFilter || binFilter || typeFilter || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setSiteFilter(''); setBinFilter(''); setTypeFilter(''); setSearch('') }}>
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 mb-4">
        <div className="stat-card">
          <div className="stat-label">Total items</div>
          <div className="stat-value">{uniqueItems}</div>
          <div className="stat-sub">{rows.length} line items</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Total quantity</div>
          <div className="stat-value">{totalQty.toLocaleString()}</div>
          <div className="stat-sub">across all bins</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sites</div>
          <div className="stat-value">{uniqueSites}</div>
          <div className="stat-sub">with inventory</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Serialized</div>
          <div className="stat-value" style={{ color: 'var(--cw-blue)' }}>{serialItems.length}</div>
          <div className="stat-sub">line items with SN tracking</div>
        </div>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📦</div>
            <div className="empty-state-title">No inventory data</div>
            <div className="empty-state-desc">
              {skus?.length > 0 ? 'Try adjusting your filters' : 'Import inventory data to see balances here'}
            </div>
          </div>
        ) : (
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>CWPN</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Site</th>
                  <th>Bin</th>
                  <th style={{ textAlign: 'center' }}>Qty</th>
                  <th style={{ textAlign: 'center' }}>Tracking</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const key = `${row.cwpn}:${row.siteId}`
                  const isExpanded = expandedItem === key
                  const serials = serialData[key] || []

                  return (
                    <InventoryRow
                      key={`${row.cwpn}-${row.siteId}-${row.bin}-${idx}`}
                      row={row}
                      isExpanded={isExpanded}
                      serials={serials}
                      loadingSerials={loadingSerials && isExpanded}
                      onExpand={() => handleExpand(row.cwpn, row.siteId)}
                      onNavigateToSite={() => navigate(`/site/${row.siteId}`)}
                    />
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

function InventoryRow({ row, isExpanded, serials, loadingSerials, onExpand, onNavigateToSite }) {
  return (
    <>
      <tr style={{ cursor: row.serialTracked ? 'pointer' : 'default' }}
        onClick={row.serialTracked ? onExpand : undefined}>
        <td style={{ textAlign: 'center', width: 30 }}>
          {row.serialTracked && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'none' }}>
              ▶
            </span>
          )}
        </td>
        <td className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{row.cwpn}</td>
        <td className="truncate" style={{ maxWidth: 200 }}>{row.desc}</td>
        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.typeName || row.category}</td>
        <td>
          <span style={{ fontWeight: 600, cursor: 'pointer', color: 'var(--cw-blue)' }}
            onClick={e => { e.stopPropagation(); onNavigateToSite() }}>
            {row.siteId}
          </span>
        </td>
        <td>
          <span className="badge badge-gray" style={{ fontSize: 10 }}>{formatBinLabel(row.bin)}</span>
        </td>
        <td style={{ textAlign: 'center', fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
          {row.qty}
        </td>
        <td style={{ textAlign: 'center' }}>
          {row.serialTracked ? (
            <span className="badge badge-blue" style={{ fontSize: 9 }}>SN</span>
          ) : (
            <span className="badge badge-gray" style={{ fontSize: 9 }}>QTY</span>
          )}
        </td>
      </tr>

      {/* Expanded serial rows */}
      {isExpanded && row.serialTracked && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: 'var(--surface-2)' }}>
            <div style={{ padding: '8px 16px 8px 46px' }}>
              {loadingSerials ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>Loading serial numbers...</div>
              ) : serials.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>
                  No serial numbers imported for this item at this site.
                  Import a serial number CSV to populate this data.
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    {serials.length} serial number{serials.length !== 1 ? 's' : ''} registered
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 4,
                    maxHeight: 200,
                    overflowY: 'auto',
                  }}>
                    {serials.map((s, i) => (
                      <div key={s.serial || i} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 8px',
                        borderRadius: 'var(--r-sm)',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        fontSize: 11,
                      }}>
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          flex: 1,
                        }}>
                          {s.serial}
                        </span>
                        {s.bin && (
                          <span className="badge badge-gray" style={{ fontSize: 8 }}>
                            {formatBinLabel(s.bin)}
                          </span>
                        )}
                        {s.lastSeenAt && (
                          <span style={{ fontSize: 9, color: 'var(--green-text)' }}>
                            Seen {new Date(s.lastSeenAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                        {s.discoveredDuringCount && (
                          <span className="badge badge-amber" style={{ fontSize: 8 }}>New</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
