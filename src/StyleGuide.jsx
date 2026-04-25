import { useState } from 'react'
import { type, color, ui } from './styles'
import { Checkbox } from './components/Checkbox'
import { WiringDemo } from './components/wiring/WiringDemo'

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
  const [demoChecked, setDemoChecked] = useState({ a: true, b: false, c: true, m: true, e: false, n: false, alertKey: true })
  const set = (k) => (v) => setDemoChecked(prev => ({ ...prev, [k]: v }))
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
          <p style={type.label}>HERO — 64px / 700 / -0.04em — #1a1a1a on white — 17.4:1 ✓ AAA</p>
          <p style={{ ...type.hero, margin: 0 }}>Fabrica</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>TITLE — 34px / 600 / -0.03em — #1a1a1a on white — 17.4:1 ✓ AAA</p>
          <p style={{ ...type.title, margin: 0 }}>Fabrica</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H1 — 24px / 500 / -0.02em — #1a1a1a on white — 17.4:1 ✓ AAA (large text)</p>
          <p style={{ ...type.h1, margin: 0 }}>System Architecture Overview</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H2 — 18px / 500 / -0.01em — #1a1a1a on white — 17.4:1 ✓ AAA (large text)</p>
          <p style={{ ...type.h2, margin: 0 }}>Meta Unit Configuration</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>H3 — 14px / 500 / 0em — #1a1a1a on white — 17.4:1 ✓ AAA (14px bold = large)</p>
          <p style={{ ...type.h3, margin: 0 }}>Processing Node Alpha</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>BODY — 14px / 400 — #666 on white — 5.7:1 ✓ AA</p>
          <p style={{ ...type.body, margin: 0 }}>Each meta unit contains three subsystems arranged vertically.</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>BODY STRONG — 14px / 400 — #1a1a1a on white — 17.4:1 ✓ AAA</p>
          <p style={{ ...type.bodyStrong, margin: 0 }}>System indicators with primary color text.</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>CAPTION — 12px / 400 — #767676 on white — 4.5:1 ✓ AA</p>
          <p style={{ ...type.caption, margin: 0 }}>Last modified 2 hours ago · 3 children · Layer -2</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO — 12px / 400 — #666 on white — 5.7:1 ✓ AA</p>
          <p style={{ ...type.mono, margin: 0 }}>coords: (2, 0, -3) · id: node_0f2a · depth: 4/20</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO ACTIVE — 12px / 500 — #1a1a1a on white — 17.4:1 ✓ AAA</p>
          <p style={{ ...type.monoActive, margin: 0 }}>Selected item · Active state</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO MUTED — 12px / 400 — #767676 on white — 4.5:1 ✓ AA</p>
          <p style={{ ...type.monoMuted, margin: 0 }}>Inactive items · Secondary info</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>MONO BOLD — 12px / 500 — #1a1a1a on white — 17.4:1 ✓ AAA</p>
          <p style={{ ...type.monoBold, margin: 0 }}>Back · Confirm · Cancel</p>
        </div>
        <div style={layout.row}>
          <p style={type.label}>KEYCAP — 12px / 600 — keyboard shortcut indicator — 17.4:1 ✓ AAA</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
            <kbd style={ui.keycap}>M</kbd>
            <kbd style={ui.keycap}>O</kbd>
            <kbd style={ui.keycap}>ESC</kbd>
            <kbd style={ui.keycap}>SHIFT</kbd>
            <kbd style={ui.keycap}>F</kbd>
            <kbd style={ui.keycap}>S</kbd>
            <kbd style={ui.keycap}>E</kbd>
            <kbd style={ui.keycap}>T</kbd>
          </div>
        </div>
        <div style={layout.row}>
          <p style={type.label}>LABEL — 12px / 400 / UPPERCASE — #767676 on white — 4.5:1 ✓ AA</p>
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
        <div style={{ display: 'flex', gap: '48px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <p style={{ ...type.label, marginBottom: '8px' }}>CHECKBOX</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>DEFAULT — primary fill</p>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Checkbox label="Option A" checked={demoChecked.a} onChange={set('a')} />
                  <Checkbox label="Option B" checked={demoChecked.b} onChange={set('b')} />
                  <Checkbox label="Disabled" checked={true} onChange={() => {}} disabled />
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>COMPACT LABELS — for dense rows (M/E/N/A)</p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <Checkbox label="M" srLabel="metric" checked={demoChecked.m} onChange={set('m')} />
                  <Checkbox label="E" srLabel="event" checked={demoChecked.e} onChange={set('e')} />
                  <Checkbox label="N" srLabel="narrative" checked={demoChecked.n} onChange={set('n')} />
                  <Checkbox label="A" srLabel="alert" checked={demoChecked.alertKey} onChange={set('alertKey')} />
                </div>
              </div>

              <div>
                <p style={{ ...type.label, marginBottom: '6px' }}>COLORED FILL — system variants</p>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <Checkbox label="S5" checked={true} onChange={() => {}} fillColor={color.s5.fill} />
                  <Checkbox label="S4" checked={true} onChange={() => {}} fillColor={color.s4.fill} />
                  <Checkbox label="S3" checked={true} onChange={() => {}} fillColor={color.s3.fill} />
                  <Checkbox label="S2" checked={true} onChange={() => {}} fillColor={color.s2.fill} />
                  <Checkbox label="S1" checked={true} onChange={() => {}} fillColor={color.s1.fill} />
                </div>
              </div>

              <p style={{ ...type.mono, color: color.muted, margin: 0, maxWidth: 380 }}>
                Tokens in <code>styles.js → ui.checkbox</code>. Component in{' '}
                <code>components/Checkbox.jsx</code>. Hidden native input handles
                keyboard/AT; visible square carries the state via fill + opacity shift.
              </p>
            </div>
          </div>
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

      <div style={layout.section}>
        <p style={type.label}>WIRING</p>
        <h2 style={{ ...type.h2, margin: '0 0 8px' }}>Patch cables</h2>
        <p style={{ ...type.body, marginBottom: 24, maxWidth: 720 }}>
          The visual + interaction primitive for internal wiring inside a
          system room. Panels are plugin-defined and heterogeneous; jacks
          are placed at meaningful positions by the plugin author. Cables
          are the <em>idea</em> of a cable: a single solid stroke in one
          palette color, with verlet-spring physics for sag and sway.
          See <code>INTERNAL-WIRING-DESIGN.md</code> for the full spec.
        </p>
        <WiringDemo />
      </div>

      <div>
        <p style={type.label}>SPACING</p>
        <p style={type.body}>Base unit: 4px. Common values: 4, 8, 12, 16, 24, 32, 48.</p>
      </div>
    </div>
  )
}
