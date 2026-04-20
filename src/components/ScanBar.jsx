/**
 * ScanBar.jsx
 * Barcode / CWPN scan input with status feedback.
 * Searches SKUs by cwpn or nsItemId and focuses the matching quantity input.
 */

import { useState, useRef, useCallback } from 'react'
import { SCAN_MESSAGE_DURATION_MS } from '../constants'

export default function ScanBar({ skus, sectionColor }) {
  const [scanVal, setScanVal] = useState('')
  const [scanMsg, setScanMsg] = useState(null)
  const scanRef = useRef()
  const timerRef = useRef()

  const handleScan = useCallback((e) => {
    if (e.key !== 'Enter') return
    const val = e.target.value.trim()
    if (!val) return

    const match = skus.find(s => s.cwpn === val || s.nsItemId === val)
    if (match) {
      setScanMsg({ type: 'sku', text: `SKU found: ${match.desc}` })
      const input = document.getElementById(`qty-${match.cwpn}`)
      if (input) { input.focus(); input.select() }
    } else {
      setScanMsg({ type: 'warn', text: `Not in system: ${val}` })
    }

    setScanVal('')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setScanMsg(null), SCAN_MESSAGE_DURATION_MS)
  }, [skus])

  return (
    <div className="scan-bar" style={{ borderLeftColor: sectionColor }}>
      <span className="scan-label">Scan / enter</span>
      <input
        ref={scanRef}
        className="input"
        style={{ flex: 1 }}
        placeholder="Scan CWPN barcode or NetSuite ID, then press Enter"
        value={scanVal}
        onChange={e => setScanVal(e.target.value)}
        onKeyDown={handleScan}
        autoFocus
      />
      {scanMsg && (
        <span className={`scan-status scan-${scanMsg.type}`}>
          {scanMsg.text}
        </span>
      )}
    </div>
  )
}
