import { useState, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { color } from '../styles'
import { useA11yType } from '../hooks/useA11yType'

export function DownloadPage() {
  const t = useA11yType()
  const [platform, setPlatform] = useState('macos')
  const [copied, setCopied] = useState(null)

  // Detect platform on mount
  useEffect(() => {
    const ua = navigator.userAgent.toLowerCase()
    if (ua.includes('linux')) {
      setPlatform('linux')
    } else if (ua.includes('mac')) {
      setPlatform('macos')
    }
  }, [])

  const serverUrl = window.location.origin

  const commands = {
    brew: 'brew install fabrica',
    start: `fabrica start ${serverUrl}`,
  }

  const copyToClipboard = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={{ ...t.h1, margin: 0 }}>FABRICA</h1>

        <div style={{ marginTop: 24 }}>
          <p style={{ ...t.h3, margin: 0 }}>You're in.</p>
          <p style={{ ...t.body, color: color.muted, margin: '4px 0 0' }}>
            Set up the CLI to connect.
          </p>
        </div>

        <div style={{ marginTop: 24 }}>
          <StepLabel t={t}>1. Install CLI</StepLabel>
          <CodeBlock
            t={t}
            code={commands.brew}
            copied={copied === 'brew'}
            onCopy={() => copyToClipboard('brew', commands.brew)}
          />
          {platform === 'linux' && (
            <p style={{ ...t.mono, fontSize: 11, color: color.muted, marginTop: 8 }}>
              Or download directly from GitHub releases
            </p>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <StepLabel t={t}>2. Connect to server</StepLabel>
          <CodeBlock
            t={t}
            code={commands.start}
            copied={copied === 'start'}
            onCopy={() => copyToClipboard('start', commands.start)}
          />
        </div>

        <div style={{ marginTop: 20 }}>
          <StepLabel t={t}>3. Restart Claude Code</StepLabel>
          <p style={{ ...t.body, color: color.muted, marginTop: 4 }}>
            The MCP server will be available after restart.
          </p>
        </div>

        <button
          onClick={() => window.location.href = '/'}
          style={{
            ...t.mono,
            fontSize: 11,
            padding: '10px 16px',
            marginTop: 24,
            background: 'none',
            border: `1px solid ${color.border}`,
            borderRadius: 100,
            color: color.primary,
            cursor: 'pointer',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            width: '100%',
          }}
        >
          Open Web App
        </button>
      </div>
    </div>
  )
}

function StepLabel({ t, children }) {
  return (
    <span style={{
      ...t.mono,
      fontSize: 9,
      color: color.muted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>
      {children}
    </span>
  )
}

function CodeBlock({ t, code, copied, onCopy }) {
  return (
    <div style={{
      ...t.mono,
      fontSize: 12,
      padding: '10px 12px',
      marginTop: 4,
      background: color.surface,
      border: `1px solid ${color.border}`,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    }}>
      <code style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {code}
      </code>
      <button
        onClick={onCopy}
        title="Copy to clipboard"
        aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        style={{
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: copied ? color.s1.fill : color.muted,
          flexShrink: 0,
        }}
      >
        {copied ? (
          <Check size={16} strokeWidth={1.5} />
        ) : (
          <Copy size={16} strokeWidth={1.5} />
        )}
      </button>
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
  maxWidth: 400,
  width: '100%',
  border: `1px solid ${color.border}`,
}
