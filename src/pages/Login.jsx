import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { BYPASS_AUTH, MOCK_USERS } from '../services/authService'
import cwLogo from '../assets/coreweave-logo.png'

export default function Login() {
  const { loginWithGoogle, loginAsMockUser, error } = useAuth()

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo-wrap">
          <img src={cwLogo} alt="CoreWeave" className="login-cw-logo" />
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
                <strong>Auth bypass active</strong><br />
                Select a test user below. Set <code>BYPASS_AUTH = false</code> in
                authService.js when Google client ID is ready.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {MOCK_USERS.map(user => (
                <button
                  key={user.email}
                  className="btn btn-full"
                  style={{
                    padding: '12px 16px',
                    display: 'flex', alignItems: 'center', gap: 12,
                    textAlign: 'left', justifyContent: 'flex-start',
                  }}
                  onClick={() => loginAsMockUser(user)}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: user.role === 'manager' ? 'rgba(61,90,254,.15)' : user.role === 'admin' ? 'rgba(127,86,217,.15)' : 'var(--surface-2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    color: user.role === 'manager' ? 'var(--cw-blue)' : user.role === 'admin' ? 'var(--purple)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}>
                    {user.name.split(' ').map(p => p[0]).join('')}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{user.email}</div>
                  </div>
                  <span className={`badge ${user.role === 'manager' ? 'badge-blue' : user.role === 'admin' ? 'badge-purple' : 'badge-gray'}`} style={{ fontSize: 10 }}>
                    {user.role.toUpperCase()}
                  </span>
                </button>
              ))}
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
