/**
 * Badge — semantic coloured pill.
 * variant: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'gray' | 'navy'
 */

import { SESSION_STATUS_CONFIG, ACCURACY, getAccuracyVariant } from '../constants'

export default function Badge({ children, variant = 'gray', dot = false }) {
  return (
    <span className={`badge badge-${variant}`}>
      {dot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'currentColor', display: 'inline-block',
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  )
}

export function SessionStatus({ status }) {
  const config = SESSION_STATUS_CONFIG[status] || { label: status, variant: 'gray' }
  return <Badge variant={config.variant} dot>{config.label}</Badge>
}

export function SiteStatus({ status }) {
  return (
    <Badge variant={status === 'up-to-date' ? 'green' : 'amber'} dot>
      {status === 'up-to-date' ? 'Up to date' : 'Count due'}
    </Badge>
  )
}

export function VarianceBadge({ variance }) {
  if (variance === null || variance === undefined) {
    return <span className="text-muted text-xs">/</span>
  }
  if (variance === 0) return <Badge variant="green">✓ 0</Badge>
  return <Badge variant="red">{variance > 0 ? '+' : ''}{variance}</Badge>
}

export function AccuracyBadge({ accuracy }) {
  if (accuracy === null || accuracy === undefined) return <Badge variant="gray">/</Badge>
  const variant = getAccuracyVariant(accuracy)
  return <Badge variant={variant}>{accuracy}%</Badge>
}
