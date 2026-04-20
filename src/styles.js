// --- Fonts ---
export const FONT_PRIMARY = "'Inter', 'Helvetica Neue', Helvetica, Arial, sans-serif"
export const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace"
export const FONT_DYSLEXIA = "'Lexend', 'Verdana', sans-serif"

// --- Colors ---
export const color = {
  primary: '#1a1a1a',
  secondary: '#666',
  muted: '#999',
  border: '#e0e0e0',
  borderLight: '#f0f0f0',
  hoverBg: '#fafafa',
  white: '#fff',
  s5: { fill: '#9060c0', stroke: '#4a1a8a' },
  s4: { fill: '#f0a030', stroke: '#b06000' },
  s3: { fill: '#5b9bd5', stroke: '#1a3a6b' },
  s2: { fill: '#f28b82', stroke: '#c0392b' },
  s1: { fill: '#a8d5a2', stroke: '#2e7d32' },
  metaUnit: '#000',
}

// --- Typography ---
export const type = {
  hero: {
    fontFamily: FONT_PRIMARY,
    fontSize: '64px', fontWeight: 700,
    letterSpacing: '-0.04em', lineHeight: 1.05,
    color: color.primary,
  },
  title: {
    fontFamily: FONT_PRIMARY,
    fontSize: '34px', fontWeight: 600,
    letterSpacing: '-0.03em', lineHeight: 1.2,
    color: color.primary,
  },
  h1: {
    fontFamily: FONT_PRIMARY,
    fontSize: '24px', fontWeight: 500,
    letterSpacing: '-0.02em', lineHeight: 1.3,
    color: color.primary,
  },
  h2: {
    fontFamily: FONT_PRIMARY,
    fontSize: '18px', fontWeight: 500,
    letterSpacing: '-0.01em', lineHeight: 1.4,
    color: color.primary,
  },
  h3: {
    fontFamily: FONT_PRIMARY,
    fontSize: '14px', fontWeight: 500,
    letterSpacing: '0', lineHeight: 1.5,
    color: color.primary,
  },
  body: {
    fontFamily: FONT_PRIMARY,
    fontSize: '13px', fontWeight: 400,
    letterSpacing: '0', lineHeight: 1.6,
    color: color.secondary,
  },
  caption: {
    fontFamily: FONT_PRIMARY,
    fontSize: '11px', fontWeight: 400,
    letterSpacing: '0.02em', lineHeight: 1.5,
    color: color.muted,
  },
  mono: {
    fontFamily: FONT_MONO,
    fontSize: '11px', fontWeight: 400,
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.secondary,
  },
  monoBold: {
    fontFamily: FONT_MONO,
    fontSize: '11px', fontWeight: 500,
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.primary,
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: '9px', fontWeight: 400,
    letterSpacing: '0.08em', lineHeight: 1.5,
    color: color.muted,
    textTransform: 'uppercase',
  },
}

// --- UI Components ---
export const ui = {
  contextMenu: {
    container: {
      minWidth: 140,
      background: color.white,
      borderLeft: `3px solid ${color.metaUnit}`,
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    },
    header: {
      ...type.label,
      padding: '4px 12px',
      borderBottom: `1px solid ${color.border}`,
    },
    item: {
      ...type.mono,
      color: color.primary,
      padding: '8px 12px',
      borderBottom: `1px solid ${color.borderLight}`,
      background: 'none',
      border: 'none',
      width: '100%',
      textAlign: 'left',
      cursor: 'pointer',
      display: 'block',
    },
    itemHover: {
      background: color.hoverBg,
    },
  },
  button: {
    ...type.monoBold,
    background: 'none',
    border: 'none',
    borderLeft: `2px solid ${color.primary}`,
    paddingLeft: '8px',
    cursor: 'pointer',
  },
  buttonHover: {
    color: color.secondary,
    borderLeftColor: color.muted,
  },
}
