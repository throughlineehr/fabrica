// Panel manifest schema + validator. Pure JS — no React, no DOM.
//
// Source of truth: PROCESSOR-PANEL-SPEC.md.
//
// A manifest is `{ widthHP, bg, accent, fixtures: [...] }`. Validation
// returns { ok: true } or { ok: false, issues: [{type, message, ...}] }.
// Bindings are resolved against the processor's declared `ports` and
// (informally) `defaultConfig`/`stateSchema` — anything missing is an
// issue.

export const PANEL_TITLE_STRIP = 28
export const PANEL_FOOT_STRIP = 16
export const PANEL_BROADCAST_STRIP = 24
export const HP = 24
export const BODY_ROWS = 13
export const PANEL_BODY_HEIGHT = BODY_ROWS * HP // 312
export const PANEL_HEIGHT = PANEL_TITLE_STRIP + PANEL_BROADCAST_STRIP + PANEL_BODY_HEIGHT + PANEL_FOOT_STRIP // 380
export const MIN_WIDTH_HP = 4
export const MAX_WIDTH_HP = 24

const VALID_BG = new Set(['light', 'mid', 'dark'])
const VALID_ACCENT = new Set(['s1', 's2', 's3', 's4', 's5', 'audit', 'algedonic'])
const VALID_FIXTURE_TYPES = new Set([
  'knob', 'jack', 'toggle', 'slider', 'button', 'led',
  'display', 'label', 'divider', 'dropdown', 'textInput',
])
const VALID_JACK_KIND = new Set(['input', 'output'])

// Default size in cells per fixture type. Plugins may override w/h.
export const FIXTURE_DEFAULT_SIZE = {
  knob:      { w: 2, h: 2 }, // 'md' default
  jack:      { w: 2, h: 2 },
  toggle:    { w: 1, h: 1 },
  slider:    { w: 4, h: 1 }, // horizontal default
  button:    { w: 2, h: 1 },
  led:       { w: 1, h: 1 },
  display:   { w: 4, h: 1 },
  label:     { w: 2, h: 1 },
  divider:   { w: 1, h: 1 },
  dropdown:  { w: 4, h: 1 },
  textInput: { w: 6, h: 1 },
}

// Knob size shorthand
export const KNOB_SIZE = {
  sm: { w: 1, h: 1 },
  md: { w: 2, h: 2 },
  lg: { w: 3, h: 3 },
}

function getFixtureSize(f) {
  if (f.type === 'knob' && f.size && KNOB_SIZE[f.size]) return KNOB_SIZE[f.size]
  const defaults = FIXTURE_DEFAULT_SIZE[f.type] || { w: 1, h: 1 }
  // Slider orientation flips default
  if (f.type === 'slider' && f.orient === 'v') return { w: 1, h: 4 }
  const w = Number.isFinite(f.w) ? f.w : defaults.w
  const h = Number.isFinite(f.h) ? f.h : defaults.h
  return { w, h }
}

export function fixtureSize(f) {
  return getFixtureSize(f)
}

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

/**
 * Validate a panel manifest against its processor definition.
 *
 * @param {object} manifest    — the `panel` block from the processor def
 * @param {object} processorDef — the full processor def with `ports`
 * @returns {{ ok: boolean, issues: Array<{type, message, fixtureId?}> }}
 */
export function validatePanel(manifest, processorDef = {}) {
  const issues = []
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, issues: [{ type: 'no-manifest', message: 'Panel manifest missing or not an object' }] }
  }

  // widthHP
  const widthHP = manifest.widthHP
  if (!Number.isInteger(widthHP)) {
    issues.push({ type: 'bad-width', message: `widthHP must be an integer; got ${widthHP}` })
  } else if (widthHP < MIN_WIDTH_HP || widthHP > MAX_WIDTH_HP) {
    issues.push({ type: 'bad-width', message: `widthHP ${widthHP} outside allowed range ${MIN_WIDTH_HP}–${MAX_WIDTH_HP}` })
  }

  // bg / accent (optional but if present must be valid)
  if (manifest.bg !== undefined && !VALID_BG.has(manifest.bg)) {
    issues.push({ type: 'bad-bg', message: `bg must be one of light|mid|dark; got "${manifest.bg}"` })
  }
  if (manifest.accent !== undefined && !VALID_ACCENT.has(manifest.accent)) {
    issues.push({ type: 'bad-accent', message: `accent must be one of s1..s5|audit|algedonic; got "${manifest.accent}"` })
  }

  // Component escape hatch — if Component is a function, fixtures are skipped.
  if (typeof manifest.Component === 'function') {
    return { ok: issues.length === 0, issues }
  }

  // Fixtures
  const fixtures = Array.isArray(manifest.fixtures) ? manifest.fixtures : []
  if (!Array.isArray(manifest.fixtures)) {
    issues.push({ type: 'no-fixtures', message: 'fixtures must be an array' })
  }

  // Build sets of declared ports for binding checks
  const inputPorts = new Set((processorDef.ports?.inputs || []).map(p => p.id))
  const outputPorts = new Set((processorDef.ports?.outputs || []).map(p => p.id))

  // Track ids for uniqueness
  const seenIds = new Set()
  // Bounding rects for overlap check
  const rects = []

  for (const f of fixtures) {
    const fid = f.id || `<${f.type}@${f.x},${f.y}>`

    // Type valid
    if (!VALID_FIXTURE_TYPES.has(f.type)) {
      issues.push({ type: 'bad-fixture-type', message: `Unknown fixture type "${f.type}"`, fixtureId: fid })
      continue
    }

    // Position is integer
    if (!Number.isInteger(f.x) || !Number.isInteger(f.y) || f.x < 0 || f.y < 0) {
      issues.push({ type: 'bad-position', message: `Fixture ${fid} has invalid position (x:${f.x}, y:${f.y})`, fixtureId: fid })
      continue
    }

    const { w, h } = getFixtureSize(f)
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) {
      issues.push({ type: 'bad-size', message: `Fixture ${fid} has invalid size (w:${w}, h:${h})`, fixtureId: fid })
      continue
    }

    // Bounds check (body grid is widthHP × BODY_ROWS)
    if (Number.isInteger(widthHP)) {
      if (f.x + w > widthHP) {
        issues.push({ type: 'out-of-bounds', message: `Fixture ${fid} extends past right edge (x+w=${f.x + w} > widthHP=${widthHP})`, fixtureId: fid })
      }
    }
    if (f.y + h > BODY_ROWS) {
      issues.push({ type: 'out-of-bounds', message: `Fixture ${fid} extends past bottom of body (y+h=${f.y + h} > ${BODY_ROWS} rows)`, fixtureId: fid })
    }

    // Id uniqueness
    if (f.id) {
      if (seenIds.has(f.id)) {
        issues.push({ type: 'duplicate-id', message: `Duplicate fixture id "${f.id}"`, fixtureId: fid })
      }
      seenIds.add(f.id)
    }

    // Type-specific binding checks
    if (f.type === 'jack') {
      if (!VALID_JACK_KIND.has(f.kind)) {
        issues.push({ type: 'bad-jack-kind', message: `Jack ${fid} kind must be input|output; got "${f.kind}"`, fixtureId: fid })
      }
      if (!f.port) {
        issues.push({ type: 'jack-missing-port', message: `Jack ${fid} missing port reference`, fixtureId: fid })
      } else {
        const portSet = f.kind === 'input' ? inputPorts : outputPorts
        if (!portSet.has(f.port)) {
          issues.push({ type: 'jack-unknown-port', message: `Jack ${fid} references undeclared ${f.kind} port "${f.port}"`, fixtureId: fid })
        }
      }
    }

    if (f.bind && typeof f.bind === 'string') {
      const m = f.bind.match(/^(config|state)\.(.+)$/)
      if (!m) {
        issues.push({ type: 'bad-binding', message: `Fixture ${fid} bind "${f.bind}" must start with config. or state.`, fixtureId: fid })
      } else if (m[1] === 'config' && processorDef.defaultConfig) {
        const key = m[2]
        if (!Object.prototype.hasOwnProperty.call(processorDef.defaultConfig, key)) {
          issues.push({ type: 'bind-unknown-config', message: `Fixture ${fid} binds config.${key} but processor has no such config field`, fixtureId: fid })
        }
      }
    }

    rects.push({ id: fid, x: f.x, y: f.y, w, h })
  }

  // Overlap check (O(n²) — fine for a panel's worth of fixtures)
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (rectOverlap(rects[i], rects[j])) {
        issues.push({
          type: 'overlap',
          message: `Fixtures ${rects[i].id} and ${rects[j].id} overlap`,
          fixtureId: rects[i].id,
        })
      }
    }
  }

  return { ok: issues.length === 0, issues }
}
