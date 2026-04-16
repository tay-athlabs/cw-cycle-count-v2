import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { BYPASS_AUTH } from '../services/authService'
import cwLogo from '../assets/coreweave-logo.png'

export default function Login() {
  const { loginWithGoogle, error } = useAuth()

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
                Signed in as mock user. Set <code>BYPASS_AUTH = false</code> in
                authService.js when Google client ID is ready.
              </div>
            </div>
            <button
              className="btn btn-cw btn-full btn-lg"
              onClick={() => loginWithGoogle({})}
            >
              Continue as J. Bakker (mock)
            </button>
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
