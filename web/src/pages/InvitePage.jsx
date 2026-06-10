import { useState, useEffect } from 'react'
import { color } from '../styles'
import { useA11yType } from '../hooks/useA11yType'

export function InvitePage({ token }) {
  const t = useA11yType()

  const [loading, setLoading] = useState(true)
  const [inviteInfo, setInviteInfo] = useState(null)
  const [error, setError] = useState(null)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)

  // Fetch invite info on mount
  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.valid) {
          setInviteInfo(data)
        } else {
          setError(data.error || 'Invalid invite')
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load invite')
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError(null)

    if (!email || !password) {
      setFormError('Email and password are required')
      return
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setFormError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch(`/api/redeem/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (data.success) {
        window.location.href = '/download'
      } else {
        setFormError(data.error || 'Registration failed')
        setSubmitting(false)
      }
    } catch {
      setFormError('Network error')
      setSubmitting(false)
    }
  }

  const isValid = email && password && confirmPassword && password === confirmPassword && password.length >= 8

  // Shared styles
  const inputStyle = {
    ...t.mono,
    fontSize: 12,
    padding: '8px 10px',
    border: `1px solid ${color.border}`,
    background: color.white,
    color: color.primary,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const labelStyle = {
    ...t.mono,
    fontSize: 9,
    color: color.muted,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }

  // Loading state
  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ ...t.mono, color: color.muted }}>Loading...</p>
        </div>
      </div>
    )
  }

  // Error state (invalid/expired invite)
  if (error) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ ...t.h1, margin: 0 }}>FABRICA</h1>
          <p style={{ ...t.body, color: color.muted, margin: '16px 0 0' }}>
            {error === 'invite not found' ? 'This invite link is invalid.' :
             error === 'invite already used' ? 'This invite has already been used.' :
             error}
          </p>
        </div>
      </div>
    )
  }

  // Registration form
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ ...t.h1, margin: 0 }}>FABRICA</h1>

        <div style={{ marginTop: 24 }}>
          <p style={{ ...t.h3, margin: 0 }}>You're invited</p>
          <p style={{ ...t.body, color: color.muted, margin: '4px 0 0' }}>
            to join {inviteInfo.orgName}
          </p>
        </div>

        {inviteInfo.rooms?.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <span style={labelStyle}>Rooms</span>
            <ul style={{ margin: '4px 0 0', padding: '0 0 0 16px', ...t.mono, fontSize: 12 }}>
              {inviteInfo.rooms.map(room => (
                <li key={room}>{room}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={labelStyle}>Confirm Password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              autoComplete="new-password"
              style={inputStyle}
            />
          </label>

          {formError && (
            <p role="alert" style={{ ...t.mono, fontSize: 11, color: color.s2.stroke, margin: 0 }}>
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={!isValid || submitting}
            style={{
              ...t.mono,
              fontSize: 11,
              padding: '10px 16px',
              marginTop: 8,
              background: isValid ? color.primary : color.borderLight,
              border: 'none',
              borderRadius: 100,
              color: isValid ? color.white : color.muted,
              cursor: !isValid || submitting ? 'not-allowed' : 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {submitting ? 'Creating account...' : 'Register'}
          </button>
        </form>
      </div>
    </div>
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
