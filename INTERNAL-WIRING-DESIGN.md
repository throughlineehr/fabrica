# Fabrica — Internal Wiring Design

The plan for **internal wiring**: explicit point-to-point patch cables
between processors *inside a single system room*. Not implemented yet.
This document is the design reference; nothing here is committed code.

Companion docs:
- `SIGNALS.md` §11 — names the gap ("No intra-room wiring") and
  predicts the needed pieces: internal bus layer, terminal-to-processor
  graph state, row-level UI to draw the connections.
- `ARCHITECTURE-NEXT.md` §2 — the plugin contract reserves
  `inputs[]` / `outputs[]` for processor port declarations.
- `DESIGN-OPERATIONS.md` — "Internal chaining: app outputs can feed
  other app inputs (DAG inside the room)."
- `PLUGIN-MANIFEST.md` — generic primitives + manifest extension shape.

The current model is "broadcast to room": every processor publishes to
and subscribes from `roomChannel(nodeId, systemKey)`, and per-instance
filters narrow what each one consumes. This document describes how to
replace that with declared cables, modeled after Propellerhead Reason's
back-of-rack patch view and Eurorack's modular signal panels.

---

## 1. Vocabulary (load-bearing)

These terms are project-specific. Keep them crisp.

- **Rack** — a single system room (one of the five S-rooms in a node).
  The rack contains *rack units* (processors) and the cables that join
  them.
- **Rack unit** — a single processor instance, presented as a
  front-of-rack panel.
- **Front view** — the existing Switchboard view, augmented: each rack
  unit shows a **front panel** with its name, its input port labels,
  its output port labels, a status indicator, and (when expanded)
  parameter editors.
- **Back view** — the flipped view. Same rack units, but the panels are
  reversed: jacks become visible and patch cables run between them.
- **Port** — a named input or output on a processor instance. Declared
  by the processor definition.
- **Jack** — the visual rendering of a port on the back panel. The
  click target. Has a system color and a small label.
- **Patch cable** (or just **cable**) — an internal wiring connection
  between one output jack and one input jack, both inside the same
  rack. Distinct from external cables (which traverse rooms).
- **External terminal** — the existing wall-edge terminals from
  `RoomShell.jsx`. From a processor's perspective, an external
  terminal is "the room itself" — patching to a terminal means
  routing the output through that wall to whatever's wired upstream.
- **Ghost cable** — the live preview of a patch in progress. Renders
  while the user is dragging or while a keyboard patch is in flight.

### Internal vs External vs Broadcast — three things, one place

| Concept            | Where               | Implemented today                         |
|---                 |---                  |---                                        |
| External wiring    | Between rooms       | Yes — `topology.js` + `wiring.js`         |
| Internal wiring    | Within one room     | **No** — proposed by this document        |
| Broadcast-to-room  | Within one room     | Yes — current default; will become legacy |

Caleb's correction (saved as project memory): "internal wiring" means
within-room point-to-point cables. The current room-channel broadcast
is *not* internal wiring; it is filtering in lieu of cabling.

---

## 2. Goals (and explicit non-goals)

### Goals

1. Every signal a processor produces is delivered through a *declared*
   cable to a *named* destination. No more "everyone in the room sees
   everything; sort it out with filters."
2. **Broadcast is scaffolding, not a feature.** The room channel
   continues to exist during migration, but the end state is: a
   processor with no cables is *quiet*, not *broadcasting*. Anything
   not wired is not heard. Variety is contained by structure, not by
   filtering ambient noise. (Caleb, 2026-04-25.)
3. Cables are visible: see-it-is-be-it. The wiring you draw on the back
   of the rack is the wiring the runtime executes. No drift.
4. Three input modalities, all equal: **mouse drag**, **keyboard
   patch**, **agent API**. The visual surface is the canonical UI;
   the keyboard surface is fully equivalent (a11y requirement); the
   agent API is the programmatic equivalent (matches the existing
   `agentAPI.addProcessor` pattern).
5. Cables can terminate at external wall terminals. A processor in S1
   can be patched directly out the S1→S2 cable without needing a
   "router processor" in between.
6. Per-cable settings — at minimum: tag filter, type filter, mute,
   visual color override. Click a cable to inspect / configure.
7. Style guide compliance: Swiss modernism, no rounded corners on
   panels, all colors from `styles.js`, all type via `useA11yType()`.
8. **Panels are plugin-defined.** Each plugin renders whatever
   front-panel layout it wants — buttons, sliders, displays, decorative
   marks. The plugin places its own jacks at meaningful positions on
   that panel. Fabrica core provides the rack scaffolding, the jack
   primitive, the cable primitive, and the patching interactions; it
   does *not* impose a uniform panel layout. Eurorack ethos: every
   module looks different, but jacks and cables are universal.
9. **Cables are physical but symbolic.** They sag, they sway, they
   have light physics. They are the *idea* of a cable — a single
   solid stroke in one palette color, no metallic shading, no
   highlights, no faux-rubber. The physics make them feel alive; the
   monochrome rendering keeps them as glyphs of a cable, not
   illustrations of one.
9. WCAG 2.1 AA throughout. Keyboard-only operation must reach feature
   parity with mouse. Screen-reader announcements for every state
   change. No animation in epilepsy mode.

### Non-goals (this version)

- Multi-room cables. A cable lives inside one rack. Cross-room signal
  flow stays the job of external wiring (`topology.js` + `wiring.js`).
  An internal cable can *terminate* at an external terminal — that's
  the bridge.
- True modular-synth signal types (CV, gate, audio). Fabrica's signals
  are typed (`metric|event|narrative|alert`) with tags; the cable just
  needs to filter by those.
- Drag-and-drop reordering of rack units. Useful, but a separate
  concern from cabling. Rack-unit order remains the order they were
  added (matches today's Switchboard).
- A custom DSL for cable settings. Filters reuse the existing
  `signals/filter.js` schema (`types`, `tags`).
- Persistence of internal wiring state across reloads. State lives
  in App-level React state alongside `processors` until the wider
  persistence story lands (Phase 2 of `ARCHITECTURE-NEXT.md` §9).

---

## 3. The reframe: ports, not broadcast

### Today

A processor definition declares `hasInputs: bool` and
`hasOutputs: bool` (capability flags). At runtime the room channel is
a single bus; every processor publishes/subscribes the same bus and
sorts it out with filters.

Reference: `signals/library.js` — heartbeat, tracer, logger, websocket-
transducer, digest.

### Proposed

A processor definition declares **named ports**:

```js
{
  id: 'digest',
  // ...
  ports: {
    inputs: [
      { id: 'in', label: 'in', accepts: { types: null, tags: null } },
    ],
    outputs: [
      { id: 'themes', label: 'themes', emits: { types: ['narrative'], tags: ['digest', 'theme'] } },
      { id: 'alerts', label: 'alerts', emits: { types: ['alert'],     tags: ['digest', 'alert'] } },
    ],
  },
}
```

`accepts` and `emits` are *advisory* contracts (used for cable
validation and for the rack-front label render); they don't replace
filters. Filters still narrow what comes through a connected cable.

For backward compatibility a processor without a `ports` declaration
falls back to a single anonymous `in` and `out` (matching today's
`hasInputs`/`hasOutputs`). The first migration step is annotating the
five existing processors with explicit ports — almost mechanical.

### Cable shape

```js
{
  id: 'cable-uuid',
  source: { kind: 'processor', instanceId, portId } | { kind: 'terminal', terminalId },
  target: { kind: 'processor', instanceId, portId } | { kind: 'terminal', terminalId },
  settings: {
    types:    null | ['metric'|'event'|'narrative'|'alert'],
    tags:     null | string[],
    mute:     false,
    colorKey: null | 's1'|'s2'|'s3'|'s4'|'s5'|'audit'|'algedonic',
  },
}
```

A cable's source is always an output (processor output port OR an
external terminal acting as an *incoming* signal source — a wall
terminal can be either, depending on which direction the user patches
it). A cable's target is always an input.

Multiple cables may originate from the same output jack ("multi-out");
multiple cables may terminate at the same input jack ("merge"). Both
match Reason. Merge semantics: input port receives every signal from
every connected cable, in arrival order.

### Room state shape

```js
processors: {
  'nodeId:systemKey': [
    { id: instanceId, defId, config, filters, /* legacy */ },
    ...
  ],
}

cables: {
  'nodeId:systemKey': [
    { id, source, target, settings },
    ...
  ],
}
```

Cables are stored alongside processors, keyed identically by room.
React-state today; persistence later.

---

## 4. Wiring runtime semantics

### Within-room delivery

Today: every processor in a room subscribes to `roomChannel(nodeId,
systemKey)`. Tomorrow: processors subscribe to **per-port channels**.

A processor's runtime gets a `ports` object that the runtime layer
synthesizes from the cable graph:

```js
runtime = {
  bus,
  instanceId,
  roomNodeId, roomSystemKey,
  filters,                     // legacy per-instance filters (kept for now)
  llm,
  ports: {
    out: (portId, signal) => /* publish on the right cable(s) */,
    on: (portId, callback) => /* subscribe to incoming cables on this input */,
  },
}
```

Under the hood, `ports.out('themes', signal)` looks up every cable
whose source is `(this.instanceId, 'themes')`, applies each cable's
settings (type filter, tag filter, mute), and publishes.

`ports.on('in', cb)` subscribes the callback to every cable whose
target is `(this.instanceId, 'in')`. Each delivery applies the cable's
own settings *plus* any per-instance filters.

### External-terminal-as-cable-endpoint

A cable whose target is `{ kind: 'terminal', terminalId }` publishes
the signal to that terminal's external-wiring path. Implementation
reuse: stamp `outgoingTerminals: [terminalId]` on the signal and call
`publishToRoom(bus, nodeId, systemKey, signal)`. Existing forwarders
(`wiring.js`) honor `outgoingTerminals` to route only out the
specified wall.

A cable whose *source* is a terminal subscribes to incoming signals on
that terminal — i.e., signals arriving via external wiring with
`signal.arrivalTerminal === terminalId`. The cable carries those into
the chosen processor input port.

This is the "internal cables can span out to external terminals"
requirement. One cable, one continuous metaphor — the cable just
happens to go from a processor jack to the wall.

### Migration through broadcast — but broadcast is not the destination

**Final state**: every signal flows through a declared cable. A
processor with no cables on a port is *quiet* on that port — its
output is not heard, its input receives nothing. No "ambient room
broadcast" semantics survive.

The room channel exists only as **migration scaffolding** during the
phased rollout (§13). It is removed in the final phase.

Phased rule (during migration only):

- A processor whose output port has **at least one cable** routes via
  cables. Its outputs do not hit the room channel.
- A processor whose output port has **no cables** publishes to the
  room channel during the migration window so that not-yet-cabled
  consumers continue to see signals.
- A processor with no input cables falls back to subscribing to the
  room channel during the migration window.

The migration window has a planned end. As soon as all five built-in
processors are port-annotated and the test suite uses cables, the
fallback is removed: outputs without cables are dropped, inputs
without cables receive nothing. Tests assert this end-state — a room
with no cables is a silent room.

There is **no permanent "broadcast" or "mixed" room mode**. There is
no `mode` flag — the data is the rule: cabled or quiet. Silence on a
disconnected port is a feature, not a bug. If a port should be heard,
cable it.

### Algedonic and emergency channels

Algedonic / emergency signals do **not** get a broadcast carve-out.
Beer's algedonic fast-path is structural, not ambient: a dedicated
direct-to-S5 cable that any system can patch into. Same wiring
discipline, faster route. Same audit trail, different path. Detail
left to a follow-on doc once we wire S2/S3/S4/S5.

### Loop prevention

Identical to today. Cables can form cycles (output A → input B →
output B → input A). The signal's `delivered[]` and `hasTraced(self)`
checks already prevent re-entry. No new mechanism required.

---

## 5. Front of rack — UI

The Switchboard view (`components/room/Switchboard.jsx:169–417`) is
the front of the rack. We extend it; we don't replace it.

### Per-row anatomy (front panel)

Each rack-unit row, top to bottom inside one row:

```
┌────────────────────────────────────────────────────────────────┐
│  PROCESSOR-NAME                                  [status LED]  │
│  short description (truncated, full on focus/hover)            │
│  ────────────────────────────────────────────────────────────  │
│  IN  · in                          OUT · themes  · alerts      │
│       (port labels, color-keyed)        (port labels)          │
└────────────────────────────────────────────────────────────────┘
```

- **Name** — h3 via `useA11yType()`, mono.
- **Description** — body text, single line, truncated with ellipsis,
  full on `:focus-visible`/`:hover` per WCAG 1.4.13.
- **Status LED** — small filled square (NOT circle, per Swiss tokens),
  4px, color from styles.js: green ok, yellow warn, red error, grey
  idle. Reads from the processor's `proc:{instanceId}:events` channel.
- **Port label rows** — each port shows its label, prefixed by a small
  jack-color dot (the same color used for that port's jack on the
  back). Clicking a port label jumps the user to that jack on the
  back of the rack (we'll get there).

### Why keep the existing grid table

Switchboard is already `<table role="grid">` with row-level keyboard
nav (`Switchboard.jsx:269, 291–318`). The rack-unit row replaces the
existing 6-column structure with a single full-width cell containing
the panel layout. Existing keyboard nav (Up/Down/Home/End,
Enter/Space) survives unchanged: the row is still the focusable unit;
inside the row, port labels are a secondary tab-stop level.

### Front-panel parameter expansion

Click the row (or press Enter) opens an inline expansion below the
panel: parameter editors for the processor's config. This replaces
the navigate-to-ProcessorPage flow for simple knob-twists. The
existing ProcessorPage (`components/ProcessorPage.jsx`) stays for
deep-config (live log + JSON) — invoked by a "deep" affordance on the
front panel.

Parameter rendering reuses the schema-driven form generator described
in `PLUGIN-MANIFEST.md` once it lands; until then, fall back to the
current per-defId custom view (`getProcessorView`) or read-only JSON.

### The flip control

A button at the rack header — labeled **"flip"**, with a Tab keyboard
shortcut — toggles between front and back views. Per accessibility,
the shortcut is announced and the button is always reachable.

The flip is animated as a 200ms 3D rotation along the Y axis. In
**epilepsy mode** (`accessibility.jsx`) the animation is replaced with
an instant swap (matches the existing `target.instant = true` rule
for camera).

---

## 6. Back of rack — UI

The flip reveals the back of every rack unit in the same Y order.
**Each back-panel layout is decided by the plugin**, not by Fabrica.
A plugin author places jacks at positions meaningful to that
processor — they may flank a value display, sit at the corners of a
panel, or run as a row beneath a custom control. Fabrica core
provides only the **jack primitive**, the **cable primitive**, the
**rack scaffolding** (the surrounding frame and the flip control),
and the patching interactions. Everything between the jacks is the
plugin's call.

The example below is one plausible layout (and the default for
core processors), not a mandate:

```
┌────────────────────────────────────────────────────────────────┐
│  PROCESSOR-NAME (back)                          [status LED]   │
│  ────────────────────────────────────────────────────────────  │
│  ●in                                       ●themes   ●alerts   │
│  (input jack)                              (output jacks)      │
└────────────────────────────────────────────────────────────────┘
```

- **Jacks** — filled circles, 14px diameter with hollow 6px center
  (echoing the existing CableTerminal style:
  `CableTerminal.jsx:34–179`). Color from the port's signal-type
  palette (`styles.js`: cable channels `audit`, `algedonic`, plus
  per-system colors). When a jack is connected, the hollow center
  fills (same transition as `CableTerminal:171`). When focused, an
  outline ring appears (focus-visible). Diameter scales with
  `FONT_VISIBILITY_SCALE`.
- **Jack labels** — short, mono, beneath the jack, max ~10 chars.
  Truncated with full label in `aria-label`.
- **Output jacks** are right-aligned; **input jacks** are left-aligned.
  Mirrors the spatial convention used in the existing CableTerminal
  layout (incoming/outgoing column halves of the Switchboard).

### Wall edges still show external terminals

The back view does *not* hide the external terminals. They remain at
the room's edges, in the same positions as today (`RoomShell.jsx`,
`edgeOffset` constants). On the back of the rack, an external
terminal's jack is the click target for patching from / to the wall.

This means: a single back-of-rack view shows
- Internal jacks on each rack unit (centered in the room)
- External jacks at the wall edges
- Cables between any of them

### The cables themselves

A cable is rendered as an SVG path between two jacks. A cable is the
**idea** of a cable: one solid stroke, one palette color, no shading,
no gradients, no metallic, no faux-rubber. The physics is what makes
it feel alive; the rendering keeps it as a glyph.

- **Color**: a single solid color taken from the existing palette
  (`styles.js`). Defaults to the source jack's color; per-cable
  override via `settings.colorKey`. **One color, no shading.**
- **Stroke width**: 3px (matches `DESIGN-OPERATIONS.md`'s "Thick
  lines (3-4px)").
- **Routing**: a chain of points (default 14) simulated as a verlet
  spring chain, anchored at each jack. SVG path connects the points
  (smooth via straight segments at this density; visually
  indistinguishable from a curve and cheaper than Catmull-Rom each
  frame).
- **Endpoints**: small filled circles matching the cable's color,
  sit *inside* the jack hollow (visual continuity).
- **Pulse on signal**: 300ms brightness flash on the cable color when
  a signal traverses (echoes `CableTerminal:42–52`). In epilepsy mode,
  pulse is replaced by a single-frame highlight that doesn't blink.

### Cable layering

Cables render in their own SVG layer, between the rack units (`zIndex:
1` matching terminals) and any inspector panel (panel at `zIndex: 950`
per `constants.js:85–90`). Selected cables sit one z above unselected.
The ghost cable sits one z above all real cables.

### Cable physics

Real but cheap: a verlet spring chain with constraint relaxation.

- **Chain**: each cable is N points (default 14). Endpoints are pinned
  to the source/target jacks. Interior points are simulated.
- **Forces**: gravity each frame (constant downward acceleration);
  velocity-damped Verlet integration; no per-spring rest tension —
  the rest length is set so the chain has ~18% slack over the
  straight-line jack-to-jack distance, producing natural sag.
- **Constraints**: distance constraints between adjacent points
  enforced for ~6 iterations per frame. Endpoints re-pinned after
  each iteration.
- **Sway**: when an endpoint moves (panel reorder, drag), the
  position update propagates through the chain naturally — no
  bespoke animation needed. The chain catches up and oscillates with
  the same physics that produced the sag.
- **Drag jiggle**: implicit. While the cursor jack moves during a
  patch, the chain naturally swings; no extra sinusoid required.
- **Performance**: O(N · iterations) per cable per frame. With N=14
  and 6 iterations, ~84 ops per cable per frame. 50 cables ≈ 4200
  ops/frame, trivially 60fps.

In **epilepsy mode**: physics is paused. Cable points snap to a
static catenary (analytical sag computed once) and re-snap whenever
endpoints change. No per-frame motion. Same look at rest, no
animation.

The styleguide `WIRING` section ships a working demonstration of all
of this — see `src/components/wiring/` and the `WiringDemo` block in
`StyleGuide.jsx`. That demo is the canonical visual + interaction
reference.

Total budget: a room with 50 cables should hit 60fps on a 5-year-old
laptop. SVG path rendering is fine at that scale; no canvas/WebGL
needed.

---

## 7. Interactions

Three input modalities, equivalent capabilities. The keyboard mode is
the canonical reference — anything mouse can do, keyboard must do.

### 7.1 Mouse drag

- **Pointerdown on a jack** → start patching. Ghost cable appears
  from the jack to the cursor.
- **Move** → ghost cable tracks cursor. Eligible target jacks
  highlight (input jacks if started from output, output jacks if
  started from input). Ineligible targets dim.
- **Pointerup on eligible jack** → cable created, persisted to room
  state.
- **Pointerup elsewhere** → ghost dismissed, no cable created.
- **Pointerdown on existing cable endpoint** (the small filled circle
  at either end) → detach that end; the cable becomes a ghost rooted
  at the other end. Drop on a new jack to reroute, or anywhere else
  to delete.
- **Pointerdown on existing cable midspan** → select cable.
- **Right-click on a cable** → context menu (delete, mute, color
  override, type filter, tag filter).

### 7.2 Keyboard patch

The first-class equivalent. Pattern modeled on
`useTreeKeyboard.js:21–226` — capture-phase listener, ghost rendered
by the caller component.

- **Tab** through racks unit jacks in DOM order. Wrap-around at last
  jack. Outline ring marks focused jack.
- **Enter** on a focused jack → start patching. The jack becomes the
  cable source. A ghost cable extends from this jack to a *cursor
  jack* (initially the focused jack itself).
- **Arrow keys** → move the cursor jack to the next eligible target
  in the chosen spatial direction. Eligibility = opposite-direction
  ports (input ports if patching from output) plus eligible external
  terminals.
- **Tab / Shift-Tab** during patching → step through eligible targets
  in DOM order (alternative to spatial arrows).
- **Enter** on a candidate target → cable committed.
- **Escape** → cancel patch, ghost dismissed.

The ghost cable renders identically to the mouse-drag ghost (one code
path). The cursor jack pulses subtly (off in epilepsy mode) so the
user can see where the patch will land.

Selection of an existing cable: focus a jack with a cable, press
**Down** to "walk" along the cable to the other end (or a special
"on-cable" pseudo-focus); **Delete** removes the cable; **Enter**
opens the cable inspector.

### 7.3 Agent API

Three new commands on `agentAPI` (`src/agent/commands.js`):

```js
agentAPI.addCable(nodeId, systemKey, source, target, settings?)
agentAPI.removeCable(nodeId, systemKey, cableId)
agentAPI.updateCable(nodeId, systemKey, cableId, patch)
```

Agent shorthand DSL grows a `patch` verb:

```
PATCH digest:themes -> logger:in
PATCH digest:alerts -> terminal:s2-out
```

These are the mechanical equivalents of the UI gestures.

### 7.4 Ghost cable rendering

The ghost is a sibling SVG path in the cable layer with:
- 50% opacity stroke
- Dashed `stroke-dasharray: 6 4`
- Animated dash offset (CSS `@keyframes`, 200ms loop) — off in
  epilepsy mode
- No endpoint dots; the ghost terminates at the cursor

Eligible-target jacks pulse in synchrony (200ms cycle, off in epilepsy
mode). Ineligible jacks render at 30% opacity for the duration of the
patch.

---

## 8. Cable inspector

A cable, once selected (mouse click on midspan, keyboard via the
walk-along-cable focus), opens an inspector panel. Per Caleb's
direction: settings live on the *front* of the rack — selecting a
cable on the back also flips the relevant rack-unit row's front-side
settings open. (Or shows a floating inspector — see §17 open
question.)

Cable inspector contents:

- **Source** and **Target** — read-only labels with click-to-jump.
- **Type filter** — chip row of allowed signal types (toggle on/off).
  Reuses Switchboard's `TypeChipRow` (`Switchboard.jsx:100–124`).
- **Tag filter** — free-text tag input. Reuses Switchboard's
  `TagsInput` (`Switchboard.jsx:126–156`).
- **Mute** — checkbox. Muted cables visually fade to 40% opacity and
  drop signals silently.
- **Color override** — small swatch grid; defaults to source jack's
  color.
- **Delete** — danger-styled button at the bottom (per Swiss style
  rule on destructive actions).

The inspector closes on Escape. Selection persists until clicking
empty rack space or focusing a non-cable element.

---

## 9. External-terminal jacks

Wall edges in the back-view show the same external terminals from
`RoomShell.jsx`, drawn with the same `CableTerminal` SVG. The
existing terminal *is* the jack — no duplication. Patching to/from a
terminal works identically to patching between two processors.

A cable whose source or target is an external terminal renders with:
- Endpoint at the terminal's hollow center (the existing visual)
- Spline routes to the room's interior
- Color derived from the terminal's `colorKey`

When the user starts a patch from inside a rack unit and moves toward
the wall, the wall terminal jacks pulse in eligibility (matching
direction: an output is eligible to patch into an outgoing-terminal,
an input is eligible to patch into an incoming-terminal — both happen
to all be `dir: 'both'` per `SIGNALS.md` §4, so practically all wall
terminals are always eligible).

---

## 10. Visual design — Swiss modernism + Eurorack

The CLAUDE.md style rule says no rounded corners on menus. Applied
here:

- **Front panel**: flat rectangle, 1px border in `color.border`,
  inner 12px padding, no shadow. The "physical rack unit" hint comes
  from a 1px subdued top edge highlight (a single hairline above the
  border using `color.borderSubtle`) — present but not skeuomorphic.
- **Back panel**: same flat rectangle, slightly darker fill
  (`color.surfaceRecessed`) to communicate "this is the inside." A
  1px hairline horizontal divider runs across the panel between
  inputs and outputs to anchor the eye.
- **Jacks**: filled circles (the only round elements; this is the
  "physical jack" affordance and is canon in modular synth UX).
  Stroke is the same as the panel border (1px).
- **Cables**: SVG paths, 3px stroke, no decoration, color from
  styles.js. Endpoint dots match jack colors.
- **Ghost cable**: dashed (6 4 dash array), animated offset,
  semi-transparent.
- **Status LED**: 4px square, not circle. Color from styles.js.
- **Typography**: jack labels and panel headers in `t.mono`. Body in
  `t.body`. Always via `useA11yType()` — never imported from
  `styles.js` directly (per CLAUDE.md rule).
- **Section dividers**: 1px hairlines in `color.border`. No shadows,
  no gradients.

Color sources, all from `styles.js:9–34`:
- s1 green (`#4a8a44`), s2 red (`#d45a52`), s3 blue (`#3a7ab8`),
  s4 orange (`#c58415`), s5 purple (`#9060c0`), audit yellow
  (`#c9a800`), algedonic red (`#e03030`).
- Cable color defaults to the *source* jack's color. The source jack's
  color comes from the port's `emits.types` (if a single type) or the
  room's system color.

The Eurorack metaphor is honored *symbolically*, not literally —
panels look like flat vector cards, not faux 3U metal. The cables and
jacks carry the metaphor; everything else stays Swiss flat.

---

## 11. Accessibility

This must hit WCAG 2.1 AA.

### Keyboard parity
Every cable operation (create, delete, reroute, configure, mute) is
reachable from the keyboard alone. Reference: `useTreeKeyboard.js`'s
clipboard pattern is the model — capture-phase listener, ghost
rendered by caller, escape priority chain.

### Screen reader

Every state change announces via `agentAPI.announce(...)` (existing
pattern in App.jsx). Phrases:

- "Patching from {processorName} {portLabel}. Use arrow keys to choose
  a target, Enter to commit, Escape to cancel."
- "Cable from {source} to {target} created."
- "Cable selected. Press Enter to inspect, Delete to remove."
- "Cable removed."
- "Eligible target: {processorName} {portLabel}." (on focus during
  patch)

Aria-roles:
- Each rack unit row: `role="row"` (existing).
- Each jack: `role="button"` with `aria-label="{port_label} {input|output} on {processor_name}, {connected|unconnected}"`.
- The cable layer: `role="img"` with a generated `aria-label`
  describing all current cables, refreshed when cables change.
  ("Cables: digest themes to logger in. digest alerts to terminal
  s2-out.")
- A sibling visually-hidden `<ul>` enumerates cables for screen-reader
  navigation (canonical landmark — visual users get the SVG, AT users
  get the list).

### Color blind

Cables and jacks must distinguish without color. Plan:
- Each cable has a small **icon glyph** at its midpoint indicating
  signal type (◇ metric, ○ event, △ narrative, ◆ alert) — sized 8px,
  same color as the cable. Glyphs ride the spline.
- Patterns (via existing `usePatternTexture`): if color-blind mode is
  on, jacks gain dashed outlines for narrow types, etc. (To be
  detailed in Phase 8.)

### Epilepsy mode

`accessibility.jsx → epilepsy: true`:
- Flip animation → instant swap.
- Cable-traversal pulse → single-frame highlight, no flash.
- Ghost dash animation → static dashes (no offset cycling).
- Cursor jack pulse → static outline.
- Drag jiggle → off.

### Font visibility & dyslexia

All text via `useA11yType()`. Jack diameter and panel padding scale
with `FONT_VISIBILITY_SCALE` so the visual rhythm preserves at large
font sizes. Dyslexia mode → Lexend everywhere (free, since we use the
hook).

### Focus visible

Every interactive element gets a 2px outline in `color.focusRing`
on `:focus-visible`. Outline does not displace layout (use `outline`,
not `border`). The ring is *on top of* cables when a jack is
focused — never let a cable visually obscure the focus state.

### Touch targets

Jacks are 14px visually but their hit target is 24×24 (per WCAG 2.5.5
Target Size). Hit target is the parent `<button>` with padding, not
the SVG circle.

---

## 12. State, persistence, serialization

### State

App-level React state alongside `processors`:
```js
const [cables, setCables] = useState({})     // 'nodeId:systemKey' -> Cable[]
```

Mutations go through `agentAPI` (single source for both UI and
keyboard and AI agent), which delegates to setters. Same shape and
discipline as `processors`.

### Pruning

When a node is deleted (room ceases to exist), its cables prune the
same way processors do. When a processor is deleted, every cable
referencing it (source or target) is pruned. Both cases: `useEffect`
on the live-rooms / live-instances set, drop cables whose endpoints
no longer resolve. Mirrors the existing pattern in App.jsx.

### Serialization

Extend `tree/serialize.js` to round-trip cables. The YAML grows a
`cables:` section per room:

```yaml
processors:
  node-uuid:
    s1:
      - id: digest-1
        defId: digest
        config: { ... }

cables:
  node-uuid:
    s1:
      - id: cable-1
        source: { kind: processor, instanceId: digest-1, portId: themes }
        target: { kind: terminal, terminalId: s1-to-s2 }
        settings: { types: [narrative], tags: [theme] }
```

Backward compat: rooms with no `cables:` section default to broadcast
mode.

### Validation

`validateModel(model)` (the publish gate) gains rules:
- No cable references a processor instance that doesn't exist.
- No cable references a port that doesn't exist on its endpoint
  processor.
- No cable references a terminal that doesn't exist in the room's
  topology.
- A muted cable doesn't fail validation (operationally intentional).
- A type-filter on a cable that excludes everything its source can
  emit produces a *warning*, not an error (intentional dead path).

Tests added to `tree-validate.test.js`.

---

## 13. Migration plan

The existing five processors and any tests run through broadcast.
Internal wiring lands incrementally without breaking them.

1. **Annotate ports**. Add `ports` declaration to heartbeat, tracer,
   logger, websocket-transducer, digest. Each gets a single `in`
   and/or `out` port (matching `hasInputs`/`hasOutputs`). No
   behavior change.
2. **Add the `cables` state and runtime**. Without UI yet, build the
   dispatcher: when a room has no cables, behave as broadcast. When
   it has cables, route via the cable graph.
3. **Tests around the dispatcher**. Verify a room with one cable
   (transducer.out → digest.in) behaves identically to today's
   broadcast in the simple case, and verify isolation in the
   multi-source case.
4. **Front-panel render**. Each rack-unit row gains a port-label row
   below its name, but no back view yet. Confirm no regressions in
   the existing Switchboard.
5. **Back view scaffolding**. Add the flip control and the back view
   as a sibling component; no jacks yet — just an empty back panel
   per rack unit with the LED + name.
6. **Jacks**. Render input/output jacks on the back panels. Still
   no cables.
7. **Cable rendering, declarative only**. Given a `cables` state,
   draw SVG paths between jacks. No interactions yet. This makes the
   data model visible.
8. **Mouse drag interaction**. Patch / detach / delete via mouse.
9. **Keyboard patch interaction**. Patch / detach / delete via
   keyboard, with ghost cable. Announcements for screen reader.
10. **Cable inspector**. Click a cable, configure type/tag filter +
    mute + color.
11. **External terminal patching**. Cables to/from wall terminals
    using the existing `CableTerminal` SVG as the jack.
12. **Cable physics polish**. Verlet sag, sway, pulse on traversal.
    Static analytical sag in epilepsy mode. Reference implementation
    already in `WiringDemo` from the styleguide pre-work.
13. **Color-blind glyphs and patterns**. Per-type midspan glyphs and
    pattern textures.
14. **Serialization round-trip**. YAML import/export for cables.
15. **Validation**. Publish-gate rules and tests.
16. **Agent shorthand**. `PATCH source -> target` in
    `tree/shorthand.js`.

Each step is shippable. Steps 1–4 cause no visible UI change. Steps
5–11 are visible feature work. Steps 12–16 are polish + completeness.

---

## 14. Test plan (per phase)

- **1**: `tree-model.test.js` doesn't change; `signals.test.js` adds
  port-shape assertion for each library entry.
- **2–3**: new `cables.test.js` exercising the dispatcher with one
  cable, two cables, a cycle, a muted cable, an external-terminal
  cable.
- **4**: snapshot test on the Switchboard front panel.
- **5–7**: render tests confirming back view exists, flip toggles,
  jacks render at correct positions, cables render at correct
  positions.
- **8–9**: simulated pointer events and keyboard events asserting
  state mutations and announcements.
- **10**: cable inspector renders correct settings and persists edits.
- **11**: terminal-as-endpoint cables route through the existing
  forwarder layer (`wiring.test.js` extension).
- **12**: visual regression — opt-in, screenshot-based.
- **13**: axe-core sweep on the back view.
- **14**: `tree-serialize.test.js` extends with cables.
- **15**: `tree-validate.test.js` extends.
- **16**: shorthand parser tests.

---

## 15. File map

New files:
- `src/signals/cables.js` — the dispatcher; pure functions + lifecycle
  helpers.
- `src/components/room/RackBack.jsx` — the back-of-rack view.
- `src/components/room/RackUnit.jsx` — single rack unit (front + back
  facets).
- `src/components/room/Jack.jsx` — single jack render + button.
- `src/components/room/PatchCable.jsx` — single cable SVG path.
- `src/components/room/GhostCable.jsx` — patching preview.
- `src/components/room/CableInspector.jsx` — selected-cable settings.
- `src/hooks/useCablePatch.js` — keyboard + mouse patch state
  machine (modeled on `useTreeKeyboard.js`).

Edited files:
- `src/signals/library.js` — add `ports` declarations to all five
  processors.
- `src/components/room/RoomShell.jsx` — host the flip state and
  swap front/back content.
- `src/components/room/Switchboard.jsx` — restructure rows into rack
  units; render front panels.
- `src/App.jsx` — host `cables` state; add cable wiring effect that
  feeds the dispatcher; pass `ports` runtime to processors.
- `src/agent/commands.js` — `addCable` / `removeCable` /
  `updateCable`.
- `src/tree/serialize.js` — YAML round-trip for cables.
- `src/tree/shorthand.js` — `PATCH` verb.
- `src/tree/model.js` — validation rules.
- `src/styles.js` — any new tokens (focus ring color, recessed
  surface, hairline subtle border) — only if not already present.
- `src/constants.js` — `JACK_DIAMETER`, `JACK_HOLLOW`, cable stroke,
  pulse durations, sag coefficient, hit-target padding.

Plus tests for each (see §14).

---

## 16. Risks

- **Discoverability of the flip**. The Tab keyboard shortcut is
  unconventional (Reason uses Tab; web habits are not). Mitigation:
  visible flip button + onboarding hint on first room visit; never
  hide the button.
- **Performance with many cables**. SVG with hundreds of cables can
  jank during animations. Mitigation: cap pulse animations to
  cables actively carrying signal in the last second; use CSS
  transforms for sway, not layout-affecting attribute animation.
- **Cycle detection correctness**. Cables can form cycles. The
  existing `delivered[]` and `hasTraced(self)` machinery handles
  this, but only if we *use* it consistently in the dispatcher.
  Test must explicitly exercise cycles.
- **Information overload on the back view**. A room with 10
  processors and 30 cables is dense. Mitigation: per-row collapse on
  back view (just like front), highlighting selected cables, dimming
  non-relevant ones on jack focus.
- **External-terminal semantics ambiguity**. A wall terminal is
  bidirectional (`dir: 'both'`). When a user patches a processor's
  output to a wall terminal, that cable is the *outbound* binding.
  Patching a processor's input to the same terminal creates the
  *inbound* binding. Visually this could be confusing — two cables
  to the same wall jack. Mitigation: render them as two distinct
  cables (different paths) and label arrival vs departure in the
  inspector.
- **Style guide tension**. The modular-rack metaphor wants
  individual character per panel; the Swiss style guide wants
  restraint. The resolution: panels are plugin-defined and may be
  expressive, but cables and jacks are universal primitives — single-
  color, no shading. Plugin authors get freedom on the panel surface;
  the wiring layer is uniform across all plugins. The styleguide
  `WIRING` section enforces this via a working reference any plugin
  author copies from.

---

## 17. Open questions (deferred to implementation)

- **Multi-cable on one input port**: confirmed allowed (merge), but
  what's the order? Arrival order makes sense; alternative is cable
  priority. Default to arrival; expose priority later.
- **Multi-cable on one output port**: confirmed allowed (multi-out).
  Each connected cable receives the same signal independently. No
  ambiguity.
- **Cable inspector location**: floating panel near the cable, or
  flip back to the front and expand the source rack unit's settings,
  or a dedicated right-side inspector panel? Caleb's hint: "settings
  on the front." Default: a right-side inspector that flips the rack
  back to the front while showing the inspector. Adjust during
  implementation if it feels wrong.
- **External terminals on the back view**: do they get a label
  enhancement (showing which external rooms they connect to), or
  stay identical to today's CableTerminal? Default: identical, with
  the existing TerminalDetail still reachable.
- **Per-port type contract**: `accepts.types` and `emits.types` are
  advisory in v1. Should the patch interaction *prevent* a
  type-mismatch cable, or warn? Default: warn (visual chevron on the
  cable + inspector note); enforce only in publish validation.
- **Algedonic as the one allowed broadcast.** The current §4 stance
  (no permanent broadcast, even for algedonic) reflects v1 discipline.
  Caleb has flagged that algedonic *might* genuinely be broadcast-
  shaped — emergencies are the one signal whose entire purpose is to
  escape the structural attenuation a VSM otherwise enforces. Deferred
  decision: when we actually wire algedonic (post-v1), revisit
  whether the algedonic channel is a structurally privileged direct
  cable to S5 or a true room-wide broadcast bypass. Either way, this
  is one explicitly named exception, not a general carve-out, and it
  doesn't change v1 — keep §4 as-is for now.

---

## 18. Out of scope (explicitly)

- Drag-to-reorder rack units.
- Cable bundling / channel strips.
- Saved patch presets.
- Cross-room cables (those are external wiring; topology layer).
- Real-time collaborative cabling (multi-user simultaneous edit).
- Undo/redo on cabling (room-scoped undo is in DEBT.md, not yet here).
- Right-click context menu on jacks (selection + Enter is the canon
  path; right-click is a mouse-only convenience to add later).
- Custom DetailView plugins for cables (Phase 2 of plugin manifest).

---

## 19. The reading order, for whoever picks this up next

1. `SIGNALS.md` §11 — the predicted gap, in the project's own words.
2. This doc.
3. `useTreeKeyboard.js` — the keyboard pattern we're copying.
4. `Switchboard.jsx` and `CableTerminal.jsx` — the visual primitives
   we're extending.
5. The phased migration plan in §13. Start at step 1.

The hardest design call is §4 (coexistence with broadcast). Get that
right and the rest is mechanical.
