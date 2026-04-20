/**
 * ImportModal.jsx
 * ─────────────────────────────────────────────────────────────────
 * Multi-step wizard for importing NetSuite inventory balance CSV.
 * Step 1: Upload CSV file
 * Step 2: Review parsed summary (sites, items, bins, unmapped rows)
 * Step 3: Confirm and apply to app data
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useRef } from 'react'
import { processInventoryImport, convertToAppFormat } from '../services/importService'
import { formatBinLabel } from '../constants'

const STEPS = ['Upload', 'Review', 'Confirm']

export default function ImportModal({ isOpen, onClose, existingSites, onImportComplete }) {
  const [step, setStep]           = useState(0)
  const [fileName, setFileName]   = useState('')
  const [rawCSV, setRawCSV]       = useState(null)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef                   = useRef()

  if (!isOpen) return null

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      setRawCSV(text)
      const parsed = processInventoryImport(text)
      if (!parsed.success) {
        setError(parsed.error)
        return
      }
      setResult(parsed.data)
      setStep(1)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }

  const handleConfirm = () => {
    if (!result) return
    setImporting(true)
    try {
      const appData = convertToAppFormat(result, existingSites)
      onImportComplete(appData)
      setStep(2)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setStep(0)
    setFileName('')
    setRawCSV(null)
    setResult(null)
    setError(null)
    setImporting(false)
    onClose()
  }

  const summary = result?.summary

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, maxHeight: '90vh', overflow: 'auto' }}>
        <div className="modal-title">Import inventory balance</div>
        <div className="modal-sub">
          Upload a NetSuite inventory balance search export (CSV)
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
          {STEPS.map((s, i) => (
            <div key={s} style={{
              flex: 1, padding: '6px 0', textAlign: 'center',
              fontSize: 11, fontWeight: 600,
              color: i <= step ? 'var(--cw-blue)' : 'var(--text-muted)',
              borderBottom: `2px solid ${i <= step ? 'var(--cw-blue)' : 'var(--border)'}`,
            }}>
              {i + 1}. {s}
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className="alert alert-red" style={{ marginBottom: 16 }}>
            <div className="alert-dot" style={{ background: 'var(--red)' }} />
            <div>{error}</div>
          </div>
        )}

        {/* Step 0: Upload */}
        {step === 0 && (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--border-2)',
                borderRadius: 'var(--r-lg)',
                padding: 40,
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
                background: 'var(--surface-2)',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--cw-blue)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-2)'}
            >
              <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }}>📄</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                {fileName || 'Click to select CSV file'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                NetSuite Inventory Balance Search export (.csv)
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              Expected columns: Item, Location, Bin Number, Sum of On Hand, Category, NetAsset Asset Type, Is Serialized Item
            </div>
          </div>
        )}

        {/* Step 1: Review */}
        {step === 1 && summary && (
          <div>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                ['Rows parsed', summary.totalRows, null],
                ['Mapped', summary.mappedRows, `${summary.mappedPct}%`],
                ['Unmapped', summary.unmappedRows, summary.unmappedRows > 0 ? 'review below' : null],
              ].map(([label, value, sub]) => (
                <div key={label} style={{
                  padding: '10px 12px', background: 'var(--surface-2)',
                  borderRadius: 'var(--r-md)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                  {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
              {[
                ['DC sites', summary.dcSiteCount, 'var(--cw-blue)'],
                ['Warehouse sites', summary.whSiteCount, 'var(--amber)'],
                ['Unique items', summary.totalUniqueItems, 'var(--green)'],
              ].map(([label, value, color]) => (
                <div key={label} style={{
                  padding: '10px 12px', background: 'var(--surface-2)',
                  borderRadius: 'var(--r-md)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* DC sites preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Data center sites</div>
              <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10 }}>Site</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>Items</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>Qty</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10 }}>Bins</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10 }}>Entities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.dcSites.map(site => (
                      <tr key={site.siteId} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600 }}>{site.siteId}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{site.totalItems}</td>
                        <td style={{ padding: '6px 10px', textAlign: 'center' }}>{site.totalQty.toLocaleString()}</td>
                        <td style={{ padding: '6px 10px' }}>
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                            {[...new Set(Object.values(site.items).flatMap(i => Object.keys(i.bins)))].map(b => (
                              <span key={b} className="badge badge-gray" style={{ fontSize: 9 }}>{formatBinLabel(b)}</span>
                            ))}
                          </div>
                        </td>
                        <td style={{ padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)' }}>
                          {site.entities.length > 0 ? site.entities.join(', ') : 'default'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Unmapped rows */}
            {result.unmapped.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--amber-text)' }}>
                  Unmapped rows ({result.unmapped.length})
                </div>
                <div style={{ maxHeight: 120, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 11 }}>
                  {result.unmapped.slice(0, 20).map((u, i) => (
                    <div key={i} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>Row {u.row}</span>
                      <span style={{ fontWeight: 600 }}>{u.item}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{u.location}</span>
                      <span style={{ color: 'var(--amber-text)' }}>{u.reason}</span>
                    </div>
                  ))}
                  {result.unmapped.length > 20 && (
                    <div style={{ padding: '4px 10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      ...and {result.unmapped.length - 20} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Complete */}
        {step === 2 && (
          <div className="alert alert-green" style={{ marginBottom: 0 }}>
            <div className="alert-dot" style={{ background: 'var(--green)' }} />
            <div>
              <strong>Import complete</strong>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                {summary.dcSiteCount} sites and {summary.totalUniqueItems} items imported into the app.
                The data is now available for cycle count sessions.
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex-center gap-2 mt-4" style={{ justifyContent: 'flex-end' }}>
          {step === 0 && (
            <button className="btn" onClick={handleClose}>Cancel</button>
          )}
          {step === 1 && (
            <>
              <button className="btn" onClick={() => { setStep(0); setResult(null); setFileName('') }}>
                Back
              </button>
              <button className="btn btn-cw" onClick={handleConfirm} disabled={importing}>
                {importing ? 'Importing...' : `Import ${summary.dcSiteCount} sites`}
              </button>
            </>
          )}
          {step === 2 && (
            <button className="btn btn-cw" onClick={handleClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  )
}
