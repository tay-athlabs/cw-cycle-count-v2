import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { BYPASS_AUTH, MOCK_USERS } from '../services/authService'
import { ROLE_LABELS } from '../constants'
 
/**
 * CoreWeave logo — blue chevron + dark wordmark.
 * Used on the login page (white background).
 */
function CWLogoDark() {
  return (
    <svg
      viewBox="0 0 580 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ height: 32, width: 'auto' }}
      aria-label="CoreWeave"
    >
      <path
        d="M33.6 0L0 27.2v25.6L33.6 80h12.8L14.4 52.8V27.2L46.4 0H33.6z"
        fill="#3D5AFE"
      />
      <text
        x="68"
        y="55"
        fontFamily="'DM Sans', system-ui, -apple-system, sans-serif"
        fontSize="52"
        fontWeight="700"
        fill="#0F1117"
        letterSpacing="-1.5"
      >
        coreweave
      </text>
    </svg>
  )
}
 
const ROLE_COLORS = {
  manager:   { bg: 'rgba(46,117,182,0.1)',  color: '#2E75B6', border: '#2E75B6' },
  ics:       { bg: 'rgba(34,139,34,0.1)',    color: '#228B22', border: '#228B22' },
  admin:     { bg: 'rgba(128,0,128,0.1)',    color: '#800080', border: '#800080' },
  superuser: { bg: 'rgba(224,112,0,0.1)',    color: '#E07000', border: '#E07000' },
}
 
const ROLE_BADGE_VARIANT = {
  manager: 'blue',
  ics: 'green',
  admin: 'purple',
  superuser: 'amber',
}
 
export default function Login() {
  const { loginAsMockUser, loginWithGoogle, error } = useAuth()
 
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo-wrap">
          <CWLogoDark />
        </div>
 
        <h1 className="login-title">Cycle Count</h1>
        <p className="login-sub">
          Inventory cycle count platform for<br />CoreWeave DC operations
        </p>
 
        {BYPASS_AUTH ? (
          <div>
            <div className="alert alert-blue" style={{ textAlign:'left', marginBottom: 20 }}>
              <div className="alert-dot" style={{ background:'var(--cw-blue)' }} />
              <div>
                <strong>Demo mode</strong><br />
                Select a user to sign in. Each has a different role
                for testing the full workflow.
              </div>
            </div>
 
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MOCK_USERS.map(mockUser => {
                const roleStyle = ROLE_COLORS[mockUser.role] || ROLE_COLORS.ics
                const badgeVariant = ROLE_BADGE_VARIANT[mockUser.role] || 'gray'
                const initials = mockUser.name
                  .split(' ')
                  .map(p => p[0])
                  .join('')
                  .toUpperCase()
 
                return (
                  <button
                    key={mockUser.email}
                    className="select-tile"
                    onClick={() => loginAsMockUser(mockUser)}
                    style={{
                      textAlign: 'left',
                      width: '100%',
                      padding: '12px 16px',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      background: 'var(--bg)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--cw-blue)'
                      e.currentTarget.style.boxShadow = '0 0 0 2px rgba(61,90,254,0.15)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: roleStyle.bg,
                        border: `1.5px solid ${roleStyle.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        color: roleStyle.color,
                        flexShrink: 0,
                      }}>
                        {initials}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                          {mockUser.name}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {mockUser.email}
                        </div>
                      </div>
                      <span
                        className={`badge badge-${badgeVariant}`}
                        style={{ fontSize: 10 }}
                      >
                        {ROLE_LABELS[mockUser.role] || mockUser.role}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div>
            {error && (
              <div className="alert alert-red" style={{ marginBottom: 16, textAlign:'left' }}>
                <div className="alert-dot" style={{ background:'var(--red)' }} />
                {error}
              </div>
            )}
 
            <GoogleLogin
              onSuccess={loginWithGoogle}
              onError={() => {}}
              useOneTap
              theme="outline"
              size="large"
              width="100%"
              text="signin_with"
              shape="rectangular"
            />
 
            <div className="login-divider">or</div>
 
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Sign in with your <strong>@coreweave.com</strong> Google account.<br />
              2FA enforced via Google Workspace.
            </p>
          </div>
        )}
 
        <p className="login-footer">
          CoreWeave Internal Tool<br />
          <span style={{ opacity: .6 }}>Access restricted to @coreweave.com accounts</span>
        </p>
      </div>
    </div>
  )
}
 
