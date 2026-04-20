import { type, color, ui } from './styles'

const layout = {
  page: {
    padding: '48px',
    background: color.white,
    minHeight: '100vh',
    fontFamily: type.title.fontFamily,
  },
  section: {
    marginBottom: '48px',
    borderBottom: `1px solid ${color.border}`,
    paddingBottom: '48px',
  },
  swatch: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '12px',
    marginRight: '32px',
    marginBottom: '16px',
  },
  swatchBox: {
    width: 40, height: 40,
    borderRadius: 4,
    border: `1px solid ${color.border}`,
  },
  row: { marginBottom: '24px' },
}

const textColors = [
  { name: 'Primary', value: color.primary },
  { name: 'Secondary', value: color.secondary },
  { name: 'Muted', value: color.muted },
]

const systemColors = [
  { name: 'S5 Fill', value: color.s5.fill },
  { name: 'S5 Stroke', value: color.s5.stroke },
  { name: 'S4 Fill', value: color.s4.fill },
  { name: 'S4 Stroke', value: color.s4.stroke },
  { name: 'S3 Fill', value: color.s3.fill },
  { name: 'S3 Stroke', value: color.s3.stroke },
  { name: 'S2 Fill', value: color.s2.fill },
  { name: 'S2 Stroke', value: color.s2.stroke },
  { name: 'S1 Fill', value: color.s1.fill },
  { name: 'S1 Stroke', value: color.s1.stroke },
]

export default function StyleGuide() {
  return (
    <div style={layout.page}>
      <div style={layout.section}>
        <p style={type.label}>STYLE GUIDE</p>
        <h1 style={{ ...type.title, margin: '0 0 8px' }}>Fabrica Design System</h1>
        <p style={type.body}>Typography, color, and component reference.</p>
      </div>

      <div style={layout.section}>
        <p style={type.label}>TYPOGRAPHY</p>

        <div style={layout.row}>
          <p style={type.label}>HERO — 64px / 700 / -0.04em</p>
          <p style={{ ...type.hero, margin: 0 }}>Fabrica</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>TITLE — 34px / 600 / -0.03em</p>
          <p style={{ ...type.title, margin: 0 }}>Fabrica</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H1 — 24px / 500 / -0.02em</p>
          <p style={{ ...type.h1, margin: 0 }}>System Architecture Overview</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H2 — 18px / 500 / -0.01em</p>
          <p style={{ ...type.h2, margin: 0 }}>Meta Unit Configuration</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H3 — 14px / 500 / 0em</p>
          <p style={{ ...type.h3, margin: 0 }}>Processing Node Alpha</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>BODY — 13px / 400 / 0em</p>
          <p style={{ ...type.body, margin: 0 }}>Each meta unit contains three subsystems arranged vertically. The layout algorithm positions siblings to prevent overlap at any depth.</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>CAPTION — 11px / 400 / 0.02em</p>
          <p style={{ ...type.caption, margin: 0 }}>Last modified 2 hours ago · 3 children · Layer -2</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO — 11px / 400 / 0.04em</p>
          <p style={{ ...type.mono, margin: 0 }}>coords: (2, 0, -3) · id: node_0f2a · depth: 4/20</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO BOLD — 11px / 500 / 0.04em</p>
          <p style={{ ...type.monoBold, margin: 0 }}>Back · Confirm · Cancel</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>LABEL — 9px / 400 / 0.08em / UPPERCASE</p>
          <p style={{ ...type.label, margin: 0 }}>ACTIONS · STATUS · COORDINATES</p>
        </div>
      </div>

      <div style={layout.section}>
        <p style={type.label}>TEXT COLORS</p>
        <div>
          {textColors.map((c) => (
            <div key={c.name} style={layout.swatch}>
              <div style={layout.swatchBox}>
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 500, color: c.value }}>Aa</div>
              </div>
              <div>
                <div style={type.h3}>{c.name}</div>
                <div style={type.mono}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={layout.section}>
        <p style={type.label}>SYSTEM COLORS</p>
        <div>
          {systemColors.map((c) => (
            <div key={c.name} style={layout.swatch}>
              <div style={{ ...layout.swatchBox, background: c.value, border: 'none' }} />
              <div>
                <div style={type.h3}>{c.name}</div>
                <div style={type.mono}>{c.value}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={layout.section}>
        <p style={type.label}>UI COMPONENTS</p>
        <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start' }}>
          <div>
            <p style={{ ...type.label, marginBottom: '8px' }}>CONTEXT MENU</p>
            <div style={ui.contextMenu.container}>
              <div style={ui.contextMenu.header}>Actions</div>
              <div style={ui.contextMenu.item}>Add child</div>
              <div style={{ ...ui.contextMenu.item, ...ui.contextMenu.itemHover }}>Rename</div>
              <div style={{ ...ui.contextMenu.item, borderBottom: 'none' }}>Delete</div>
            </div>
          </div>
          <div>
            <p style={{ ...type.label, marginBottom: '16px' }}>BUTTON OPTIONS</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>A — UNDERLINE</p>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <span style={{ ...type.monoBold, borderBottom: '1px solid #1a1a1a', paddingBottom: '2px', cursor: 'pointer' }}>Back</span>
                  <span style={{ ...type.monoBold, color: color.secondary, borderBottom: '1px solid #ccc', paddingBottom: '2px', cursor: 'pointer' }}>Hovered</span>
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>B — LEFT-BAR TAB</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ borderLeft: `2px solid ${color.primary}`, paddingLeft: '8px', ...type.monoBold, cursor: 'pointer' }}>Back</div>
                  <div style={{ borderLeft: `2px solid ${color.muted}`, paddingLeft: '8px', ...type.monoBold, color: color.secondary, cursor: 'pointer' }}>Hovered</div>
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>C — BRACKETED</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ ...type.mono, color: color.primary, cursor: 'pointer' }}>[ Back ]</span>
                  <span style={{ ...type.mono, color: color.primary, cursor: 'pointer', background: color.hoverBg, padding: '2px 4px' }}>[ Hovered ]</span>
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>D — PILL OUTLINE</p>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <span style={{ ...type.monoBold, border: `1px solid ${color.border}`, borderRadius: '100px', padding: '6px 16px', cursor: 'pointer' }}>Back</span>
                  <span style={{ ...type.monoBold, border: `1px solid ${color.border}`, borderRadius: '100px', padding: '6px 16px', cursor: 'pointer', background: color.hoverBg }}>Hovered</span>
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>E — ARROW PREFIX</p>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <span style={{ ...type.monoBold, cursor: 'pointer' }}>← Back</span>
                  <span style={{ ...type.monoBold, color: color.secondary, cursor: 'pointer' }}>← Hovered</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      <div>
        <p style={type.label}>SPACING</p>
        <p style={type.body}>Base unit: 4px. Common values: 4, 8, 12, 16, 24, 32, 48.</p>
      </div>
    </div>
  )
}
