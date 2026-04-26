# Processor Panel Specification

The contract for what a processor panel looks like in Fabrica's
**Rack view** — the tab inside every system room where processor
modules are laid out left-to-right at fixed height with variable
width, and patch cables run between their jacks.

Companion docs:
- `INTERNAL-WIRING-DESIGN.md` — internal wiring, ports, cables
- `PLUGIN-MANIFEST.md` — plugin distribution + manifest schema
- `ARCHITECTURE-NEXT.md` — plugin contract direction

This doc covers **panel anatomy and the declarative authoring API**
only. Cable rendering/interaction is in `INTERNAL-WIRING-DESIGN.md`.

The metaphor: Eurorack modular synth panels (and DAWs that emulate
them — Reason, VCV Rack, Bitwig). Fixed rack height, variable HP
width per module, jacks placed wherever they make sense for the
module, controls and jacks share the same surface (no flip-to-back).

---

## 1. Vocabulary

- **Rack** — a tab inside one system room. Holds the processor modules
  for that room. One rack per room.
- **Panel** — the visual surface of one processor instance. Plugin
  authors design their own panels.
- **HP** (horizontal pitch) — the width unit. **1 HP = 24 px.**
  Borrowed from Eurorack hardware. All panel widths are integer HP.
- **Cell** — square layout unit. Cells are 1 HP × 1 HP (24 × 24 px).
  Fixture positions are in cells.
- **Fixture** — a built-in panel element: knob, jack, toggle, etc.
  Plugins compose fixtures into a panel via the declarative API.
- **Binding** — a fixture's connection to processor data:
  `config.X` (editable), `state.X` (read-only), `port: 'X'` (jacks).
- **Title strip** — top 28 px of every panel, Fabrica-rendered, holds
  the plugin name. Uniform across all plugins.
- **Foot strip** — bottom 16 px of every panel, Fabrica-rendered,
  holds the plugin author/version. Uniform across all plugins.
- **Body** — the middle area. Plugin-author-controlled. Fixtures
  placed here.

---

## 2. Dimensions

Fixed and non-negotiable. The dimensions exist so racks of arbitrary
mixed plugins line up and look like one consistent rack.

| Property         | Value         | Notes |
|---               |---            |---    |
| Panel height     | **360 px**    | "3U" rack equivalent. 15 rows of 24 px. |
| 1 HP             | **24 px**     | Width unit. |
| 1 cell           | 24 × 24 px    | Square. Used for both X and Y fixture positions. |
| Min panel width  | **4 HP** (96 px) | Smallest useful — narrow utility / multi. |
| Max panel width  | **24 HP** (576 px) | Anything larger gets unwieldy. |
| Title strip      | top 28 px     | Reserved. Plugins do not place fixtures here. |
| Foot strip       | bottom 16 px  | Reserved. |
| Body area        | 316 px tall   | Title + foot reserved → 360 − 28 − 16 = 316. |
| Body cell rows   | 13 rows       | 316 / 24 ≈ 13.16. Round to 13 visible rows. |
| Body cell cols   | widthHP cells | E.g., 14HP panel → 14 columns. |

Panels do **not** shrink on small screens. The rack scrolls
horizontally if the viewport is narrower than the rack. Mobile = pan.

---

## 3. Three zones

Every panel is rendered as three vertical bands, top to bottom:

```
┌─────────────────────────────────────────────┐  ↑
│ TITLE STRIP                                 │  28 px  ← Fabrica draws
├─────────────────────────────────────────────┤
│                                             │
│                                             │
│                                             │  316 px ← plugin draws
│   BODY (fixture grid: widthHP cols × 13 rows)│
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│ FOOT STRIP                                  │  16 px  ← Fabrica draws
└─────────────────────────────────────────────┘  ↓
```

### Title strip (Fabrica-rendered)

Always present. Always uniform. Plugins never override the title
strip styling.

- Background: `color.surfaceMuted` (or panel-bg-derived if `bg: 'dark'`)
- Text: plugin display name, mono-uppercase, centered
- Right edge: small color square in the panel's `accent` color
- Left edge: a small dot in the system color the panel is placed in

The uniform top strip is what makes mixed-plugin racks read as one
rack and not a flea market.

### Body (plugin-rendered, declarative)

Fixtures placed via x,y cell coordinates within the body grid.
Cell origin (0, 0) is the top-left of the body, immediately below
the title strip.

- Background: panel `bg` choice (light / mid / dark)
- Optional accent stripe along the left edge (1 cell wide, panel `accent` color)
- Fixtures: see §6 below

### Foot strip (Fabrica-rendered)

- Background: matches title strip
- Text: plugin author + version, mono small, centered
- A subtle 1-cell-tall band in the panel's accent color along the
  bottom edge identifies the panel's family at a glance

---

## 4. Background, accent, and style enforcement

Plugin authors choose:
- `bg: 'light' | 'mid' | 'dark'` — body background (three locked
  shades from `styles.js` so racks don't become flea markets)
- `accent: 's1' | 's2' | 's3' | 's4' | 's5' | 'audit' | 'algedonic'` —
  one accent hue from the system palette. Used for the title-strip
  marker, the foot-strip band, and as the default fixture color when
  a fixture doesn't specify its own.

Style is **flat, representational**: panels do not get faux-metal,
gradients, drop shadows, or screws. The shape vocabulary carries the
metaphor:
- A jack is a circle with a hollow center (donut). Period.
- A knob is a solid circle with a single straight pointer line.
- A slider is a thin track with a small thumb rectangle.
- A toggle is a small chunky rectangle, off / on.
- An LED is a small filled circle.
- A button is a slightly recessed rectangle with a label.
- A display is a flat dark rectangle with mono text.

Plugin authors who need expressive freedom beyond the catalog use
the **React-component escape hatch** (§9). Wacky third-party plugins
are a feature; canonical Fabrica plugins use the declarative API.

---

## 5. Visual language by system color

When a plugin is placed in an S1 room vs. an S5 room, the title-strip
left dot inherits the system color. Plugins don't pick this — it's
contextual to where the plugin lives. Helps users see at a glance
"these are S1 modules, those are S3 modules."

---

## 6. Fixture catalog (v1)

Every fixture has:
- **type** — one of the catalog entries below
- **id** — unique within the panel (used for binding lookups + a11y)
- **x, y** — cell position (top-left corner of the fixture)
- **(optional) w, h** — size in cells. Defaults per type below.
- **(optional) label** — short i18n key or static string
- **(optional) bind** — `config.X` / `state.X` / static
- **(optional) color** — system color override; defaults to panel accent

### `knob`
Continuous control bound to a numeric config or state value.
- Default size: 2×2. Min 1×1 (small), max 3×3 (large).
- Sizes: `'sm' | 'md' | 'lg'` shorthand → 1×1 / 2×2 / 3×3.
- `bind: 'config.X'` — editable; agent API `updateProcessorConfig`.
- `bind: 'state.X'` — read-only display.
- `range: [min, max]` — value range.
- `step` — granularity.
- `unit` — display unit (e.g., 'ms', '%').
- Visual: filled circle + single pointer line. No tick marks.
- Label: short, below the knob, mono-uppercase.

### `jack`
Input or output port. Always 2×2.
- `id` must match a port declared on the processor (`ports.inputs[]`
  or `ports.outputs[]` per `INTERNAL-WIRING-DESIGN.md` §3).
- `kind: 'input' | 'output'`.
- `port` — port id from the processor's declared ports.
- Color: derived from the port's `accepts`/`emits` types, or
  panel accent if not specified.
- Visual: circle with hollow center (donut), 24px outer / 10px hole.
- Label: 1-cell-tall mono-uppercase, above OR below the jack
  (plugin chooses, must be inside body bounds).

### `toggle`
Binary or 3-position switch.
- Default size: 1×1 (binary) or 2×1 (3-position).
- `bind: 'config.X'` — config bool or 0/1/2.
- `options` — array of option labels for non-binary.
- Visual: small rectangle with a thumb that slides between positions.

### `slider`
Linear control.
- `orient: 'h' | 'v'` — horizontal or vertical.
- Default size: 4×1 (horizontal) or 1×4 (vertical).
- `bind`, `range`, `step` — same as knob.
- Visual: thin track + small thumb rectangle.

### `button`
Momentary action trigger.
- Default size: 2×1.
- `action: 'X'` — invokes a runtime-side action (defined by the
  processor). Distinct from `bind`.
- Visual: rectangle with a label, slight inset on press.

### `led`
Read-only color indicator.
- Default size: 1×1.
- `bind: 'state.X'` — bool or string. Determines whether LED is "lit."
- `color` — the LED's lit color (defaults to panel accent).
- Visual: small filled circle. Off = greyed; on = full color.

### `display`
Numeric or short-text readout.
- Default size: 4×1. Min 2×1, max 8×2.
- `bind: 'state.X'` — value to render.
- `format` — optional formatter (`'number'`, `'time'`, `'truncate(20)'`).
- Visual: flat dark rectangle, mono text, right-aligned for numbers.

### `label`
Static text element. Pure decoration / grouping aid.
- Default size: auto-fit (label-width × 1).
- `text` — static text or i18n key.
- `size: 'xs' | 'sm' | 'md'`.
- Visual: mono uppercase, color from panel `accent` muted.

### `divider`
Visual group separator.
- `orient: 'h' | 'v'`.
- Default size: 1×N or N×1.
- Visual: 1px hairline in muted color.

### `dropdown`
Picker with a small set of options. Used for things like
WebSocket parse mode, signal type, color override.
- Default size: 4×1.
- `bind: 'config.X'` — editable string.
- `options` — array of `{ value, label }`.
- Visual: rectangle + chevron, mono text.

### `textInput`
Free-text or URL field.
- Default size: 6×1.
- `bind: 'config.X'` — editable string.
- `placeholder` — i18n key.
- `type: 'text' | 'url' | 'secret'` — `secret` masks input.
- Visual: rectangle with text inside, mono.

---

## 7. Binding language

Three binding kinds:

### `config.X` (editable)
Reads from `instance.config` and writes back through the agent API
(`updateProcessorConfig`). All edits flow through the single
mutation surface so audit log + undo + websocket sync work.

```js
{ type: 'knob', bind: 'config.intervalMs', range: [100, 10000], unit: 'ms' }
```

### `state.X` (read-only)
Reads from runtime state. The processor's `create()` runtime
exposes a `setState({ key: value })` method; the panel re-renders
when state changes.

```js
{ type: 'display', bind: 'state.bufferCount' }
{ type: 'led',     bind: 'state.connected', color: 's1' }
```

### `port: 'X'` (jacks only)
References a port id from the processor's `ports.inputs` or
`ports.outputs` declaration.

```js
{ type: 'jack', kind: 'input',  port: 'in', x: 0, y: 5 }
{ type: 'jack', kind: 'output', port: 'themes', x: 12, y: 5 }
```

### `action: 'X'` (buttons only)
Triggers a processor-side action declared in the processor's
`actions` map (a sibling of `ports`).

```js
{ type: 'button', action: 'reset', label: 'CLEAR' }
```

Bindings always reference what the processor declares. Validation
fails if a binding references something that doesn't exist.

---

## 8. Layout rules

- Cell grid: `widthHP × 13` cells in the body.
- Origin (0, 0) is top-left of body.
- Fixtures cannot overlap.
- Fixtures cannot extend outside the body grid.
- Fixtures cannot be placed in title strip or foot strip.
- Cell positions are integer.
- Fixture sizes are integer (in cells).

Validation runs at panel-load time. A panel with overlapping
fixtures or out-of-bounds positions refuses to load and renders an
error chip in place. Plugin author sees a clear validation message;
end users see a "panel failed to validate" state.

---

## 9. The escape hatch — React component

For plugins that need expressive freedom beyond the declarative
catalog (3D scopes, custom animations, signature manufacturer looks,
weird wacky stuff):

```js
{
  panel: {
    widthHP: 14,
    bg: 'dark',
    accent: 's3',
    Component: MyCustomPanel,  // React component
  }
}
```

When `Component` is set, Fabrica renders the title strip + foot
strip and hands the plugin author a 14HP × 316px canvas with two
props: `instance` (config + state) and `runtime` (the standard
processor runtime, including `setState`, port refs for cable
attachment, the agent API for config edits).

Plugins shipping a custom Component **must** still:
- Honor the dimensions (widthHP × 316px body)
- Render jacks via the shared `<Jack>` primitive (so cable layer
  finds them and styling is uniform)
- Use `useA11yType()` and `color` from `styles.js`
- Respect epilepsy mode (no flashing animation)
- Provide complete keyboard alternatives for any mouse-only control

Custom panels are wackier. They're a feature for 3rd-party expression.
Canonical core processors (heartbeat, tracer, logger,
websocket-transducer, digest) all use the declarative API.

---

## 10. Validation & errors

Panel manifest is validated at:
1. **Plugin install time** (P1+). Manifest schema-checked, fixture
   catalog membership verified, layout-rule check.
2. **Runtime** (every load). Bindings resolved against the
   processor's actual `ports`, `config` schema, and `state` schema.
   If anything's missing, panel fails to load.

Error states:
- **Invalid manifest** — panel renders a red "INVALID PANEL" chip
  inside the body.
- **Missing port binding** — jack renders empty + greyed; cables
  cannot attach.
- **Missing config/state binding** — fixture renders disabled with
  a small ⚠ marker.

---

## 11. The five core processors as panels (concrete examples)

These are the panels we'll ship with Fabrica core. They serve as
references for plugin authors.

### `heartbeat` — 4HP

```
title:      HEARTBEAT
body:
  row 1-2:  knob(rate, lg, 'config.intervalMs', range:[100,10000], unit:'ms') at (0,0)
  row 6:    label 'OUT' at (1,5)
  row 7-8:  jack(out, output, port:'pulse') at (1,6)
foot:       Fabrica core 1.0
```

### `tracer` — 4HP

```
title:      TRACER
body:
  row 1-2:  jack(in, input, port:'in') at (1,0)
  row 4:    label 'IN' at (1,3)
  row 6:    divider(horizontal, w:4) at (0,5)
  row 8-9:  jack(out, output, port:'out') at (1,7)
  row 11:   label 'OUT' at (1,10)
foot:       Fabrica core 1.0
```

### `logger` — 4HP

```
title:      LOGGER
body:
  row 1-2:  jack(in, input, port:'in') at (1,0)
  row 4-7:  display(state.eventCount, w:4, h:2) at (0,3)
  row 9:    led(state.idle, color:'s1') at (1,8)
foot:       Fabrica core 1.0
```

### `websocket-transducer` — 8HP

```
title:      WEBSOCKET TRANSDUCER
body:
  row 0-1:  textInput(config.url, w:8) at (0,0)
  row 3-4:  dropdown(config.parse, options:['text','json'], w:4) at (0,3)
  row 3-4:  dropdown(config.signalType, w:4) at (4,3)
  row 6-7:  led(state.connected, color:'s1') at (1,5)
  row 6-7:  display(state.msgCount, w:5) at (3,5)
  row 10-11: jack(out, output, port:'out') at (5,9)
  row 12:   label 'OUT' at (5,11)
foot:       Fabrica core 1.0
```

### `digest` — 12HP

```
title:      DIGEST
body:
  row 1-3:  jack(in, input, port:'in') at (1,0)
  row 5:    label 'IN' at (1,4)
  row 1-3:  knob(debounceMs, md, 'config.debounceMs') at (4,0)
  row 5:    label 'DEBOUNCE' at (4,4)
  row 1-3:  knob(maxBuffer, md, 'config.maxBuffer') at (8,0)
  row 5:    label 'BUFFER' at (8,4)
  row 7-8:  display(state.bufferCount, w:6) at (3,6)
  row 10-11: jack(themes, output, port:'themes') at (3,9)
  row 10-11: jack(alerts, output, port:'alerts') at (8,9)
  row 12:   label 'THEMES' at (3,11)
  row 12:   label 'ALERTS' at (8,11)
foot:       Fabrica core 1.0
```

---

## 12. Implementation phases

1. **Spec validation** — write a `validatePanel(manifest, processorDef)`
   pure function. Tests for each rule.
2. **Fixture primitive components** — render-only React components
   for each catalog entry. No bindings yet, just visuals.
3. **Panel renderer** — given a manifest + instance, lay fixtures
   into a CSS grid, hook bindings to instance.config / state.
4. **Tab system in RoomShell** — add Switchboard / Rack tabs at the
   top of every system room. Both views over the same instance list.
5. **Rack component** — left-to-right horizontal layout of panels at
   fixed 360px height, scrolls horizontally if needed.
6. **Cable layer** — port the WiringDemo verlet primitives (already
   extracted to `wiring/verlet.js`). Cables connect panel jacks
   instead of demo jacks.
7. **Annotate the 5 core processors** with panel manifests per §11.
8. **Replace WiringDemo's hand-rolled panels** with the real Rack
   so the styleguide reference and production share one codepath.
9. **React-component escape hatch** — `Component` field handling.
10. **Validation tests** + axe-smoke against the rendered Rack.

---

## 13. Open questions

- **Where do panel manifests live?** I'd put them next to the
  processor in `src/signals/library.js` for now — same place as
  `ports` and `defaultConfig`. When plugins externalize (per
  `PLUGIN-MANIFEST.md`), the manifest lives in the plugin package.
- **Does the Rack support undo for cabling?** Not yet — single-
  shot mutations through the agent API. Undo is a broader debt item.
- **Multi-row racks?** Real Eurorack often has multiple horizontal
  rows. v1 is a single row. Multi-row is a future extension if rooms
  grow large enough to need it.
- **Does the Rack support drag-to-reorder modules?** Not v1. Modules
  appear in instance-add order. Reordering can come later.
- **Custom fixtures?** Plugin authors who need a knob variant or a
  specific display format use the React escape hatch in §9. The
  catalog stays small to keep racks visually unified.
