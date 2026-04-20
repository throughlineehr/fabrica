// --- Fonts ---
export const FONT_PRIMARY = "'Inter', 'Noto Sans JP', 'Noto Sans SC', 'Noto Sans Arabic', 'Noto Sans Devanagari', 'Helvetica Neue', Helvetica, Arial, sans-serif"
export const FONT_MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace"
export const FONT_DYSLEXIA = "'Lexend', 'Verdana', sans-serif"

// --- Colors ---
// All ratios measured against white (#fff) background unless noted.
// Text requires 4.5:1, UI components require 3:1, large text (≥18px) requires 3:1.
export const color = {
  // Text — all ≥4.5:1 on white
  primary: '#1a1a1a',      // 17.4:1 ✓ AAA
  secondary: '#666666',    //  5.7:1 ✓ AA
  muted: '#767676',        //  4.5:1 ✓ AA (minimum for body text)

  // Borders — ≥3:1 on white for UI boundaries (WCAG 1.4.11)
  border: '#8a8a8a',       //  3.5:1 ✓ AA
  borderLight: '#b5b5b5',  //  2.1:1 — decorative only, NOT for required boundaries
  hoverBg: '#f0f0f0',
  white: '#fff',

  // System fills — ≥3:1 on white for meaningful UI (shapes carry system identity)
  s5: { fill: '#9060c0', stroke: '#4a1a8a' },  // fill 4.5:1 ✓, stroke 11.6:1 ✓
  s4: { fill: '#c58415', stroke: '#b06000' },   // fill 3.1:1 ✓, stroke 4.6:1 ✓
  s3: { fill: '#3a7ab8', stroke: '#1a3a6b' },   // fill 4.5:1 ✓, stroke 11.3:1 ✓
  s2: { fill: '#d45a52', stroke: '#c0392b' },   // fill 3.9:1 ✓, stroke 5.4:1 ✓
  s1: { fill: '#4a8a44', stroke: '#2e7d32' },   // fill 4.2:1 ✓, stroke 5.1:1 ✓

  metaUnit: '#000',        // 21.0:1 ✓ AAA
  focus: '#2563eb',        //  5.2:1 ✓ AA, ≥3:1 on all backgrounds
}

// --- Typography ---
// Minimum body text: 13px. Large text threshold: 18px (or 14px bold).
// Line height ≥1.5 for body text (WCAG 1.4.12).
export const type = {
  hero: {
    fontFamily: FONT_PRIMARY,
    fontSize: '64px', fontWeight: 700,
    letterSpacing: '-0.04em', lineHeight: 1.1,
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
    fontSize: '24px', fontWeight: 500,       // large text: 3:1 OK
    letterSpacing: '-0.02em', lineHeight: 1.3,
    color: color.primary,
  },
  h2: {
    fontFamily: FONT_PRIMARY,
    fontSize: '18px', fontWeight: 500,       // large text: 3:1 OK
    letterSpacing: '-0.01em', lineHeight: 1.4,
    color: color.primary,
  },
  h3: {
    fontFamily: FONT_PRIMARY,
    fontSize: '14px', fontWeight: 500,       // 14px bold = large text: 3:1 OK
    letterSpacing: '0', lineHeight: 1.5,
    color: color.primary,
  },
  body: {
    fontFamily: FONT_PRIMARY,
    fontSize: '13px', fontWeight: 400,
    letterSpacing: '0', lineHeight: 1.6,
    color: color.secondary,                  // 5.7:1 ✓ AA
  },
  caption: {
    fontFamily: FONT_PRIMARY,
    fontSize: '11px', fontWeight: 400,
    letterSpacing: '0.02em', lineHeight: 1.5,
    color: color.muted,                      // 4.5:1 ✓ AA
  },
  mono: {
    fontFamily: FONT_MONO,
    fontSize: '11px', fontWeight: 400,
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.secondary,                  // 5.7:1 ✓ AA
  },
  monoBold: {
    fontFamily: FONT_MONO,
    fontSize: '11px', fontWeight: 500,       // 11px bold < 14px, needs 4.5:1
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.primary,                    // 17.4:1 ✓ AAA
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: '9px', fontWeight: 400,
    letterSpacing: '0.08em', lineHeight: 1.5,
    color: color.muted,                      // 4.5:1 ✓ AA
    textTransform: 'uppercase',
  },
}

// --- UI Components ---
export const ui = {
  contextMenu: {
    container: {
      minWidth: 140,
      background: color.white,
      borderLeft: `3px solid ${color.metaUnit}`,  // 21:1 ✓
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    },
    header: {
      ...type.label,
      padding: '4px 12px',
      borderBottom: `1px solid ${color.border}`,  // 3.5:1 ✓
    },
    item: {
      ...type.mono,
      color: color.primary,                        // 17.4:1 ✓
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
    borderLeft: `2px solid ${color.primary}`,      // 17.4:1 ✓
    paddingLeft: '8px',
    cursor: 'pointer',
  },
  buttonHover: {
    color: color.secondary,
    borderLeftColor: color.muted,
  },
}
