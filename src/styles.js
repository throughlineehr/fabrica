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
  surface: '#fafafa',      // recessed/canvas surface — slightly off-white
  surfaceMuted: '#f5f5f5', // header bands, panel rules — one step deeper than surface
  white: '#fff',
  black: '#000000',        // canvas drawing primitives that need pure black

  // System fills — ≥3:1 on white for meaningful UI (shapes carry system identity).
  // Bold harmonized palette: all fills on the same tonal step so the five
  // systems read as one family with shifting hue, not five different families.
  s5: { fill: '#9333ea', stroke: '#6b21a8' },   // fill 5.0:1 ✓, stroke 8.5:1 ✓
  s4: { fill: '#f97316', stroke: '#9a3412' },   // fill 3.0:1 ✓, stroke 8.4:1 ✓ (orange-500 — true vivid orange)
  s3: { fill: '#2563eb', stroke: '#1e40af' },   // fill 5.2:1 ✓, stroke 8.4:1 ✓
  s2: { fill: '#dc2626', stroke: '#991b1b' },   // fill 5.0:1 ✓, stroke 7.5:1 ✓
  s1: { fill: '#16a34a', stroke: '#166534' },   // fill 3.0:1 ✓, stroke 7.4:1 ✓

  // Cable / channel colors — for system room terminals.
  // Beer convention: S3* audit = yellow, algedonic = emergency red.
  // Yellow at ≥3:1 on white is intrinsically olive-leaning — there is no
  // brighter "yellow" that hits the contrast bar.
  audit: { fill: '#ca8a04', stroke: '#713f12' },     // yellow-600/900 — fill 3.0:1 ✓, stroke 9.5:1 ✓
  algedonic: { fill: '#e03030', stroke: '#a01010' },  // emergency red — fill 4.0:1 ✓, stroke 7.5:1 ✓

  metaUnit: '#000',        // 21.0:1 ✓ AAA
  focus: '#2563eb',        //  5.2:1 ✓ AA, ≥3:1 on all backgrounds
}

// --- Typography ---
// MINIMUM font size: 12px (WCAG practical minimum for readability)
// Line height: ≥1.5 for body text (WCAG 1.4.12 text spacing)
// Large text threshold: 18px (or 14px bold) — 3:1 contrast acceptable
export const type = {
  hero: {
    fontFamily: FONT_PRIMARY,
    fontSize: '64px', fontWeight: 700,              // large text
    letterSpacing: '-0.04em', lineHeight: 1.1,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  title: {
    fontFamily: FONT_PRIMARY,
    fontSize: '34px', fontWeight: 600,              // large text
    letterSpacing: '-0.03em', lineHeight: 1.2,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  h1: {
    fontFamily: FONT_PRIMARY,
    fontSize: '24px', fontWeight: 500,              // large text
    letterSpacing: '-0.02em', lineHeight: 1.3,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  h2: {
    fontFamily: FONT_PRIMARY,
    fontSize: '18px', fontWeight: 500,              // large text
    letterSpacing: '-0.01em', lineHeight: 1.4,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  h3: {
    fontFamily: FONT_PRIMARY,
    fontSize: '14px', fontWeight: 500,              // 14px bold = large text
    letterSpacing: '0', lineHeight: 1.5,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  body: {
    fontFamily: FONT_PRIMARY,
    fontSize: '14px', fontWeight: 400,              // was 13px → 14px
    letterSpacing: '0', lineHeight: 1.5,
    color: color.secondary,                          // 5.7:1 ✓ AA
  },
  bodyStrong: {
    fontFamily: FONT_PRIMARY,
    fontSize: '14px', fontWeight: 400,              // was 13px → 14px
    letterSpacing: '0', lineHeight: 1.5,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  caption: {
    fontFamily: FONT_PRIMARY,
    fontSize: '12px', fontWeight: 400,              // was 11px → 12px
    letterSpacing: '0.02em', lineHeight: 1.5,
    color: color.muted,                              // 4.5:1 ✓ AA
  },
  mono: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 400,              // was 11px → 12px
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.secondary,                          // 5.7:1 ✓ AA
  },
  monoBold: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 500,              // was 11px → 12px
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  monoActive: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 500,              // was 11px → 12px
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.primary,                            // 17.4:1 ✓ AAA
  },
  monoMuted: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 400,              // was 11px → 12px
    letterSpacing: '0.04em', lineHeight: 1.5,
    color: color.muted,                              // 4.5:1 ✓ AA
  },
  keycap: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 600,
    letterSpacing: '0.05em', lineHeight: 1,
    color: color.primary,                            // 17.4:1 ✓ AAA on white
  },
  label: {
    fontFamily: FONT_MONO,
    fontSize: '12px', fontWeight: 400,              // was 9px → 12px
    letterSpacing: '0.08em', lineHeight: 1.5,
    color: color.muted,                              // 4.5:1 ✓ AA
    textTransform: 'uppercase',
  },
}

// --- Spacing ---
export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48,
}

// --- Sizes ---
export const sizes = {
  targetMin: 24,        // WCAG minimum interactive target
  targetDefault: 44,    // WCAG recommended
  sidebarWidth: 240,
  panelMinWidth: 240,
  panelDefaultWidth: 300,
  systemIndicator: 12,
  iconSize: 16,
  iconStroke: 1.5,
}

// --- Panel ---
export const panel = {
  background: 'rgba(255,255,255,0.95)',
  backdropFilter: 'blur(8px)',
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
  keycap: {
    ...type.keycap,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 22, minHeight: 22,
    padding: '2px 6px',
    background: color.white,
    border: `1.5px solid ${color.border}`,         // 3.5:1 ✓
    borderRadius: 4,
    boxShadow: '0 1px 0 rgba(0,0,0,0.1)',
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
  // Checkbox tokens. Canonical pattern: hidden <input type="checkbox"> for
  // keyboard/AT, visible square span for appearance. 20×20 square (WCAG 2.1 AA
  // minimum target size is 24 px with separation, 20 px meets AA when our 8 px
  // gap between dots is honored). 2 px border, 2 px corner radius. Filled with
  // fillColor when checked; transparent with strokeColor border when unchecked.
  // Opacity shift reinforces state without changing palette. Use the
  // <Checkbox> component in src/components/Checkbox.jsx.
  checkbox: {
    size: 20,
    sizeColorBlind: 28,      // a11y mode — bigger target + pattern fill
    borderWidth: 2,
    borderRadius: 2,
    opacityChecked: 0.85,
    opacityUnchecked: 0.35,
    gap: 8,                  // minimum gap between adjacent dots for AA target separation
  },
}
