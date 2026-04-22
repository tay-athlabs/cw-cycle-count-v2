/**
 * SerialScanPanel.jsx
 * ─────────────────────────────────────────────────────────────────
 * Replaces the quantity input for serial-tracked items.
 * Instead of entering a number, the tech scans serial numbers
 * one by one. The count increments automatically.
 *
 * Features:
 *   - Scan input with auto-focus after each scan
 *   - Validates against known serial registry
 *   - Tracks: matched, unexpected (not in registry), missing
 *   - Displays scanned serials list with status
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useCallback, useEffect } from 'react'

export default function SerialScanPanel({
  item,
  expectedSerials = [],
  scannedSerials = [],
  canEdit,
  onSerialScanned,
  onSerialRemoved,
}) {
  const [scanVal, setScanVal] = useState('')
  const [scanMsg, setScanMsg] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const scanRef = useRef()
  const msgTimer = useRef()

  // Auto-focus scan input when panel mounts or expands
  useEffect(() => {
    if (expanded && canEdit && scanRef.current) {
      scanRef.current.focus()
    }
  }, [expanded, canEdit])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (msgTimer.current) clearTimeout(msgTimer.current)
    }
  }, [])

  const showMessage = (type, text) => {
    setScanMsg({ type, text })
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setScanMsg(null), 3000)
  }

  const handleScan = useCallback((e) => {
    if (e.key !== 'Enter') return
    const serial = e.target.value.trim().toUpperCase()
    if (!serial) return

    // Check for duplicate scan
    if (scannedSerials.includes(serial)) {
      showMessage('warn', `Already scanned: ${serial}`)
      setScanVal('')
      return
    }

    // Check if serial is in expected registry
    const isExpected = expectedSerials.includes(serial)

    onSerialScanned(serial, isExpected)

    if (isExpected) {
      showMessage('ok', `Confirmed: ${serial}`)
    } else {
      showMessage('new', `New serial (not in registry): ${serial}`)
    }

    setScanVal('')
    if (scanRef.current) scanRef.current.focus()
  }, [scannedSerials, expectedSerials, onSerialScanned])

  const matchedSerials = scannedSerials.filter(s => expectedSerials.includes(s))
  const unexpectedSerials = scannedSerials.filter(s => !expectedSerials.includes(s))
  const missingSerials = expectedSerials.filter(s => !scannedSerials.includes(s))

  const totalExpected = item.expected || expectedSerials.length
  const totalScanned = scannedSerials.length

  return (
    <div style={{ width: '100%' }}>
      {/* Compact summary row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{
          fontSize: 12, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
          color: totalScanned === totalExpected && totalExpected > 0
            ? 'var(--green-text)' : totalScanned > 0 ? 'var(--blue-text)' : 'var(--text-muted)',
        }}>
          {totalScanned} / {totalExpected}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          scanned
        </span>
        {unexpectedSerials.length > 0 && (
          <span className="badge badge-amber" style={{ fontSize: 9 }}>
            +{unexpectedSerials.length} new
          </span>
        )}
        {missingSerials.length > 0 && totalScanned > 0 && (
          <span className="badge badge-red" style={{ fontSize: 9 }}>
            {missingSerials.length} missing
          </span>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Expanded scan panel */}
      {expanded && (
        <div style={{
          marginTop: 8,
          padding: 10,
          background: 'var(--surface-2)',
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--border)',
        }}>
          {/* Scan input */}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
              <input
                ref={scanRef}
                className="input input-sm"
                style={{ flex: 1, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}
                placeholder="Scan serial number..."
                value={scanVal}
                onChange={e => setScanVal(e.target.value)}
                onKeyDown={handleScan}
              />
              {scanMsg && (
                <span style={{
                  fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap',
                  padding: '3px 8px', borderRadius: 'var(--r-full)',
                  background: scanMsg.type === 'ok' ? 'var(--green-light)'
                    : scanMsg.type === 'warn' ? 'var(--red-light)'
                    : 'var(--amber-light)',
                  color: scanMsg.type === 'ok' ? 'var(--green-text)'
                    : scanMsg.type === 'warn' ? 'var(--red-text)'
                    : 'var(--amber-text)',
                }}>
                  {scanMsg.text}
                </span>
              )}
            </div>
          )}

          {/* Scanned serials list */}
          {scannedSerials.length > 0 && (
            <div style={{ marginBottom: missingSerials.length > 0 ? 8 : 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Scanned ({scannedSerials.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {scannedSerials.map(serial => {
                  const isExpected = expectedSerials.includes(serial)
                  return (
                    <div key={serial} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 8px',
                      borderRadius: 'var(--r-sm)',
                      background: isExpected ? 'var(--green-light)' : 'var(--amber-light)',
                      fontSize: 11,
                    }}>
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontWeight: 600,
                        color: isExpected ? 'var(--green-text)' : 'var(--amber-text)',
                        flex: 1,
                      }}>
                        {serial}
                      </span>
                      <span style={{ fontSize: 9, color: isExpected ? 'var(--green-text)' : 'var(--amber-text)' }}>
                        {isExpected ? 'Matched' : 'New'}
                      </span>
                      {canEdit && (
                        <button
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12, color: 'var(--text-muted)', padding: 0,
                            lineHeight: 1,
                          }}
                          onClick={() => onSerialRemoved(serial)}
                          title="Remove scan"
                        >
                          x
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Missing serials */}
          {missingSerials.length > 0 && totalScanned > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red-text)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                Not found ({missingSerials.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {missingSerials.map(serial => (
                  <div key={serial} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '3px 8px',
                    borderRadius: 'var(--r-sm)',
                    background: 'var(--red-light)',
                    fontSize: 11,
                  }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 600,
                      color: 'var(--red-text)',
                      flex: 1,
                    }}>
                      {serial}
                    </span>
                    <span style={{ fontSize: 9, color: 'var(--red-text)' }}>
                      Missing
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {scannedSerials.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', padding: 8 }}>
              {canEdit ? 'Scan serial numbers to begin counting' : 'No serials scanned'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
