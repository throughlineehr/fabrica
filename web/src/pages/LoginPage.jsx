import { useEffect, useState } from 'react'
import { color } from '../styles'
import { useA11yType } from '../hooks/useA11yType'

export function LoginPage() {
  const t = useA11yType()
  const [error, setError] = useState(null)
  const [oauthEnabled, setOauthEnabled] = useState(true)
  const [cliCallback, setCliCallback] = useState(null)

  useEffect(() => {
    // Check for OAuth error in URL
    const params = new URLSearchParams(window.location.search)
    const errorParam = params.get('error')
    if (errorParam) {
      const errorMessages = {
        'no_account': 'No account found. You need an invite to join.',
        'token_exchange_failed': 'Authentication failed. Please try again.',
        'user_info_failed': 'Could not get user info from Google.',
        'session_failed': 'Could not create session. Please try again.',
      }
      setError(errorMessages[errorParam] || errorParam.replace(/_/g, ' '))
    }

    // Check for CLI callback (browser-based CLI login)
    const cliParam = params.get('cli_callback')
    if (cliParam) {
      setCliCallback(cliParam)
    }

    // Check if OAuth is available
    fetch('/status')
      .then(res => res.json())
      .then(data => {
        setOauthEnabled(data.oauth === true)
      })
      .catch(() => {})
  }, [])

  const handleGoogleLogin = () => {
    // Pass CLI callback through OAuth flow if present
    const url = cliCallback
      ? `/oauth/google?cli_callback=${encodeURIComponent(cliCallback)}`
      : '/oauth/google'
    window.location.href = url
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ ...t.h1, margin: 0 }}>FABRICA</h1>

        <div style={{ marginTop: 24 }}>
          <p style={{ ...t.h3, margin: 0 }}>
            {cliCallback ? 'Sign in to connect CLI' : 'Sign in to continue'}
          </p>
          <p style={{ ...t.body, color: color.muted, margin: '4px 0 0' }}>
            {cliCallback
              ? 'After signing in, you\'ll be redirected back to your terminal'
              : 'Access your organization\'s viable system model'}
          </p>
        </div>

        {error && (
          <p role="alert" style={{
            ...t.mono,
            fontSize: 11,
            color: color.s2.stroke,
            margin: '16px 0 0',
            padding: '8px 12px',
            background: `${color.s2.fill}10`,
            border: `1px solid ${color.s2.fill}30`,
          }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: 24 }}>
          {oauthEnabled ? (
            <button
              onClick={handleGoogleLogin}
              style={{
                ...t.mono,
                fontSize: 11,
                padding: '12px 16px',
                background: 'none',
                border: `1px solid ${color.border}`,
                borderRadius: 100,
                color: color.primary,
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <GoogleIcon />
              Sign in with Google
            </button>
          ) : (
            <p style={{ ...t.mono, color: color.muted, textAlign: 'center' }}>
              OAuth is not configured.
              <br />
              Contact your administrator.
            </p>
          )}
        </div>

        <div style={{ marginTop: 24, borderTop: `1px solid ${color.borderLight}`, paddingTop: 16 }}>
          <p style={{ ...t.caption, color: color.muted, margin: 0 }}>
            Have an invite link? Use that instead to create your account.
          </p>
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

const containerStyle = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: color.surface,
  padding: 24,
}

const cardStyle = {
  background: color.white,
  padding: 32,
  maxWidth: 360,
  width: '100%',
  border: `1px solid ${color.border}`,
}
