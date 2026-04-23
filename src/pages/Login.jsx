import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import { BYPASS_AUTH } from '../services/authService'

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

export default function Login() {
  const { loginWithGoogle, error } = useAuth()

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
