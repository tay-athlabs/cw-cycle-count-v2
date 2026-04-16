/**
 * Badge — semantic coloured pill.
 * variant: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'gray' | 'navy'
 */
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
  const map = {
    scheduled:      { label: 'Scheduled',       variant: 'purple' },
    open:           { label: 'Open',            variant: 'blue'   },
    in_progress:    { label: 'In progress',     variant: 'blue'   },
    pending_review: { label: 'Pending review',  variant: 'amber'  },
    approved:       { label: 'Approved',        variant: 'green'  },
    rejected:       { label: 'Rejected',        variant: 'red'    },
  }
  const { label, variant } = map[status] || { label: status, variant: 'gray' }
  return <Badge variant={variant} dot>{label}</Badge>
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
    return <span className="text-muted text-xs">—</span>
  }
  if (variance === 0) return <Badge variant="green">✓ 0</Badge>
  return <Badge variant="red">{variance > 0 ? '+' : ''}{variance}</Badge>
}

export function AccuracyBadge({ accuracy }) {
  if (accuracy === null || accuracy === undefined) return <Badge variant="gray">—</Badge>
  const variant = accuracy >= 95 ? 'green' : accuracy >= 85 ? 'amber' : 'red'
  return <Badge variant={variant}>{accuracy}%</Badge>
}
