import { useAppContext } from '../context/AppContext'

export default function Toast() {
  const { toast } = useAppContext()
  if (!toast) return null

  return (
    <div className="toast-container">
      <div className={`toast toast-${toast.type || 'info'}`}>
        <span style={{ fontSize: 16 }}>
          {toast.type === 'success' ? '✓'
            : toast.type === 'error' ? '✕'
            : toast.type === 'warning' ? '⚠'
            : 'ℹ'}
        </span>
        {toast.message}
      </div>
    </div>
  )
}
