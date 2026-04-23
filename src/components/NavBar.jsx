import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { path: '/',            label: 'Home'      },
  { path: '/overview',    label: 'Overview'  },
  { path: '/inventory',   label: 'Inventory' },
  { path: '/analytics',   label: 'Analytics' },
  { path: '/history',     label: 'History'   },
]

/**
 * CoreWeave logo — blue chevron mark + white wordmark.
 * Recreated as clean SVG matching the official brand asset.
 */
function CWLogo() {
  return (
    <svg
      className="navbar-cw-logo"
      viewBox="0 0 580 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: 22, width: 'auto' }}
      aria-label="CoreWeave"
    >
      {/* Chevron mark */}
      <path
        d="M33.6 0L0 27.2v25.6L33.6 80h12.8L14.4 52.8V27.2L46.4 0H33.6z"
        fill="#3D5AFE"
      />
      {/* Wordmark — 'coreweave' */}
      <text
        x="68"
        y="55"
        fontFamily="'DM Sans', system-ui, -apple-system, sans-serif"
        fontSize="52"
        fontWeight="700"
        fill="#FFFFFF"
        letterSpacing="-1.5"
      >
        coreweave
      </text>
    </svg>
  )
}

export default function NavBar() {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()

  const initials = user?.name
    ? user.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : 'CW'

  const isActive = (path) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <nav className="navbar">
      <div className="navbar-brand" onClick={() => navigate('/')} style={{ cursor:'pointer' }}>
        <CWLogo />
        <div className="navbar-divider" />
        <div>
          <div className="navbar-title">Cycle Count</div>
          <div className="navbar-sub">Inventory Operations</div>
        </div>
      </div>

      <div className="navbar-spacer" />

      <div className="navbar-nav">
        {NAV_LINKS.map(({ path, label }) => (
          <button
            key={path}
            className={`nav-link${isActive(path) ? ' active' : ''}`}
            onClick={() => navigate(path)}
          >
            {label}
          </button>
        ))}
        <button
          className="btn btn-cw btn-sm"
          onClick={() => navigate('/session/new')}
          style={{ marginLeft: 8 }}
        >
          + New count
        </button>
      </div>

      <div className="navbar-spacer" style={{ maxWidth: 16 }} />

      <div className="navbar-user" onClick={() => navigate('/profile')} title="View profile">
        <div className="user-avatar">
          {user?.picture
            ? <img src={user.picture} alt={user.name} />
            : initials
          }
        </div>
        <div>
          <div className="user-name">{user?.name || 'User'}</div>
          <div className="user-email">{user?.email || ''}</div>
        </div>
      </div>
    </nav>
  )
}
