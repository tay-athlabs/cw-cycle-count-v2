import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import cwLogo from '../assets/coreweave-logo.png'

const NAV_LINKS = [
  { path: '/',            label: 'Home'      },
  { path: '/overview',    label: 'Overview'  },
  { path: '/analytics',   label: 'Analytics' },
  { path: '/history',     label: 'History'   },
  { path: '/sku-master',  label: 'SKU Master', parked: true },
]

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
        <img
          src={cwLogo}
          alt="CoreWeave"
          className="navbar-cw-logo"
        />
        <div className="navbar-divider" />
        <div>
          <div className="navbar-title">Cycle Count</div>
          <div className="navbar-sub">Inventory Operations</div>
        </div>
      </div>

      <div className="navbar-spacer" />

      <div className="navbar-nav">
        {NAV_LINKS.filter(l => !l.parked).map(({ path, label }) => (
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

      <div className="navbar-user" onClick={logout} title="Sign out">
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
