import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const NAV_LINKS = [
  { path: '/',            label: 'Home'      },
  { path: '/overview',    label: 'Overview'  },
  { path: '/analytics',   label: 'Analytics' },
  { path: '/history',     label: 'History'   },
]

function CWLogo() {
  return (
    <svg className="navbar-cw-logo" viewBox="0 0 436 80" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ height: 20, width: 'auto' }}>
      <path d="M28 0L0 24v32l28 24h20L20 56V24L48 0H28z" fill="#3D5AFE"/>
      <path d="M92 58c-10.5 0-19-8.5-19-19s8.5-19 19-19c7 0 13.1 3.8 16.4 9.4l-8.2 4.7A10.3 10.3 0 0092 28.8c-5.5 0-10 4.5-10 10.2s4.5 10.2 10 10.2c3.4 0 6.6-2.1 8.2-5.3l8.2 4.7C105.1 54.2 99 58 92 58z" fill="white"/>
      <path d="M133 58c-10.5 0-19-8.5-19-19s8.5-19 19-19 19 8.5 19 19-8.5 19-19 19zm0-8.8c5.5 0 10-4.5 10-10.2s-4.5-10.2-10-10.2-10 4.5-10 10.2 4.5 10.2 10 10.2z" fill="white"/>
      <path d="M170 21h8.8v4.6c2.4-3.6 6-5.6 10.4-5.6v9.2c-5.8 0-10.4 3-10.4 10.4V57H170V21z" fill="white"/>
      <path d="M210 58c-10.5 0-19-8.5-19-19s8.5-19 19-19c9.8 0 17.8 7.4 18.8 17H220c-1-5-5.2-8.4-10-8.4-5.5 0-10 4.5-10 10.2s4.5 10.2 10 10.2c4.8 0 9-3.3 10-8.4h8.8c-1 9.6-9 17.4-18.8 17.4z" fill="white"/>
      <path d="M249 9h9.6l-10 48h-9L249 9z" fill="white" opacity=".85"/>
      <path d="M278 21h8.8l7 25.5L301 21h8.4l7.2 25.5L323.6 21h8.8L321 57h-8.4l-7.4-25-7.4 25H289.4L278 21z" fill="white"/>
      <path d="M352 58c-10.5 0-19-8.5-19-19s8.5-19 19-19c10 0 18.2 7.8 18.2 19v3h-28.4c1 5 5 8.6 10.2 8.6 4 0 7.2-2 9-5.2l7.4 4.2C366 54.8 359.6 58 352 58zm-9.6-22.4H362c-1-4.8-4.8-8-9.6-8s-8.6 3.2-9.6 8z" fill="white"/>
      <path d="M390 21h8.8v4.4c2.6-3.4 6.4-5.4 11.2-5.4 8 0 13.6 5.6 13.6 14.8V57h-8.8V37c0-5.4-3.4-9-8.4-9-5.2 0-8.6 3.8-8.6 9.4V57H390V21z" fill="white" opacity=".85"/>
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
