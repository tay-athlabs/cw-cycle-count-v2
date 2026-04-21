/**
 * ImportModal.jsx
 * ─────────────────────────────────────────────────────────────────
 * Multi-step wizard for importing NetSuite inventory balance CSV.
 * Step 1: Upload CSV file
 * Step 2: Review parsed summary + choose conflict mode
 * Step 3: Confirm and apply to app data
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useRef } from 'react'
import { processInventoryImport, convertToAppFormat } from '../services/importService'
import { applyImport } from '../services/dataService'
import { formatBinLabel } from '../constants'

const STEPS = ['Upload', 'Review', 'Import']

const IMPORT_MODES = [
  {
    key: 'update',
    label: 'Update existing',
    desc: 'Merge new data into existing sites. Updates quantities, adds new bins and items. Preserves rooms and session history.',
    icon: '🔄',
    color: 'var(--cw-blue)',
    recommended: true,
  },
  {
    key: 'replace',
    label: 'Replace all',
    desc: 'Wipe all site and inventory data, load fresh from this import. Sessions are preserved but site configuration is reset.',
    icon: '⚠',
    color: 'var(--red)',
    recommended: false,
  },
  {
    key: 'add_new',
    label: 'Add new only',
    desc: 'Only import sites and items that don\'t already exist. Never modifies existing data. Safest option.',
    icon: '➕',
    color: 'var(--green)',
    recommended: false,
  },
]

export default function ImportModal({ isOpen, onClose, existingSites, onImportComplete }) {
  const [step, setStep]           = useState(0)
  const [fileName, setFileName]   = useState('')
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)
  const [importing, setImporting] = useState(false)
  const [importMode, setImportMode] = useState('update')
  const [importResult, setImportResult] = useState(null)
  const fileRef                   = useRef()

  if (!isOpen) return null

  // Detect conflicts
  const existingIds = new Set((existingSites || []).map(s => s.id))
  const overlappingSites = result?.dcSites?.filter(s => existingIds.has(s.siteId)) || []
  const newSites = result?.dcSites?.filter(s => !existingIds.has(s.siteId)) || []
  const hasConflicts = overlappingSites.length > 0

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setError(null)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
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

  const handleConfirm = async () => {
    if (!result) return
    setImporting(true)
    setError(null)
    try {
      const appData = convertToAppFormat(result, existingSites)
      const applyResult = await applyImport(appData, importMode)
      setImportResult(applyResult)
      onImportComplete(appData)
      setStep(2)
    } catch (err) {
      setError(`Import failed: ${err.message}`)
    } finally {
      setImporting(false)
    }
  }

  const handleClose = () => {
    setStep(0); setFileName(''); setResult(null); setError(null)
    setImporting(false); setImportMode('update'); setImportResult(null)
    onClose()
  }

  const summary = result?.summary

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, maxHeight: '90vh', overflow: 'auto' }}>
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

        {/* Error */}
        {error && (
          <div className="alert alert-red" style={{ marginBottom: 16 }}>
            <div className="alert-dot" style={{ background: 'var(--red)' }} />
            <div>{error}</div>
          </div>
        )}

        {/* ── Step 0: Upload ── */}
        {step === 0 && (
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--border-2)', borderRadius: 'var(--r-lg)',
                padding: 40, textAlign: 'center', cursor: 'pointer',
                transition: 'border-color 0.15s', background: 'var(--surface-2)',
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
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFileSelect} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              Expected columns: Item, Location, Bin Number, Sum of On Hand, Category, NetAsset Asset Type, Is Serialized Item
            </div>
          </div>
        )}

        {/* ── Step 1: Review + Conflict Mode ── */}
        {step === 1 && summary && (
          <div>
            {/* Parse summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
              {[
                ['Rows parsed', summary.totalRows],
                ['DC sites', summary.dcSiteCount],
                ['Unique items', summary.totalUniqueItems],
              ].map(([label, value]) => (
                <div key={label} style={{
                  padding: '10px 12px', background: 'var(--surface-2)',
                  borderRadius: 'var(--r-md)', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Conflict detection */}
            {hasConflicts && (
              <div className="alert alert-amber" style={{ marginBottom: 16 }}>
                <div className="alert-dot" style={{ background: 'var(--amber)' }} />
                <div>
                  <strong>{overlappingSites.length} existing site{overlappingSites.length > 1 ? 's' : ''} detected</strong>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {overlappingSites.slice(0, 5).map(s => s.siteId).join(', ')}
                    {overlappingSites.length > 5 && ` and ${overlappingSites.length - 5} more`}
                  </div>
                </div>
              </div>
            )}

            {newSites.length > 0 && (
              <div className="alert alert-green" style={{ marginBottom: 16 }}>
                <div className="alert-dot" style={{ background: 'var(--green)' }} />
                <div>
                  <strong>{newSites.length} new site{newSites.length > 1 ? 's' : ''} found</strong>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {newSites.slice(0, 5).map(s => s.siteId).join(', ')}
                    {newSites.length > 5 && ` and ${newSites.length - 5} more`}
                  </div>
                </div>
              </div>
            )}

            {/* Import mode selector */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Import mode</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {IMPORT_MODES.map(m => (
                  <div
                    key={m.key}
                    className={`type-option${importMode === m.key ? ' selected' : ''}`}
                    onClick={() => setImportMode(m.key)}
                  >
                    <div className="type-radio">
                      {importMode === m.key && <div className="type-radio-dot" />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="type-label">
                        <span style={{ marginRight: 6 }}>{m.icon}</span>
                        {m.label}
                        {m.recommended && (
                          <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 9 }}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <div className="type-desc">{m.desc}</div>
                    </div>
                    <div style={{ width: 6, height: 40, borderRadius: 3, background: m.color, flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Replace warning */}
            {importMode === 'replace' && (
              <div className="alert alert-red" style={{ marginBottom: 16 }}>
                <div className="alert-dot" style={{ background: 'var(--red)' }} />
                <div>
                  <strong>This will delete all existing site and inventory data.</strong>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    Sessions ({(existingSites || []).length ? 'preserved' : 'none'}) will not be affected,
                    but all site configurations (rooms, sublocations) will be reset.
                  </div>
                </div>
              </div>
            )}

            {/* Site preview table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Sites in this import</div>
              <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                <table style={{ width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-2)' }}>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10 }}>Site</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>Items</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>Qty</th>
                      <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 10 }}>Bins</th>
                      <th style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.dcSites.slice(0, 30).map(site => {
                      const isExisting = existingIds.has(site.siteId)
                      return (
                        <tr key={site.siteId} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 10px', fontWeight: 600 }}>{site.siteId}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{site.totalItems}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>{site.totalQty.toLocaleString()}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                              {[...new Set(Object.values(site.items).flatMap(i => Object.keys(i.bins)))].slice(0, 4).map(b => (
                                <span key={b} className="badge badge-gray" style={{ fontSize: 9 }}>{formatBinLabel(b)}</span>
                              ))}
                            </div>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <span className={`badge ${isExisting ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: 9 }}>
                              {isExisting ? 'Existing' : 'New'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {result.dcSites.length > 30 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Showing 30 of {result.dcSites.length} sites
                </div>
              )}
            </div>

            {/* Unmapped rows */}
            {result.unmapped.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: 'var(--amber-text)' }}>
                  Unmapped rows ({result.unmapped.length})
                </div>
                <div style={{ maxHeight: 100, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', fontSize: 11 }}>
                  {result.unmapped.slice(0, 10).map((u, i) => (
                    <div key={i} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                      <span className="mono" style={{ color: 'var(--text-muted)' }}>Row {u.row}</span>
                      <span style={{ fontWeight: 600 }}>{u.item}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{u.location}</span>
                      <span style={{ color: 'var(--amber-text)' }}>{u.reason}</span>
                    </div>
                  ))}
                  {result.unmapped.length > 10 && (
                    <div style={{ padding: '4px 10px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                      ...and {result.unmapped.length - 10} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Complete ── */}
        {step === 2 && (
          <div>
            <div className="alert alert-green" style={{ marginBottom: 16 }}>
              <div className="alert-dot" style={{ background: 'var(--green)' }} />
              <div>
                <strong>Import complete</strong>
                <div style={{ fontSize: 12, marginTop: 4 }}>
                  {importResult
                    ? `${importResult.sitesCount} sites and ${importResult.skusCount} items now in the system. ${importResult.sessionsPreserved} sessions preserved.`
                    : `${summary.dcSiteCount} sites and ${summary.totalUniqueItems} items imported.`
                  }
                </div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Mode used: <strong>{IMPORT_MODES.find(m => m.key === importMode)?.label}</strong>.
              Navigate to Inventory Balance to browse the imported data.
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
                {importing
                  ? 'Importing...'
                  : importMode === 'replace'
                    ? `Replace with ${summary.dcSiteCount} sites`
                    : `Import ${summary.dcSiteCount} sites`
                }
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
