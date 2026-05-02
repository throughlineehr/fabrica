# Fabrica — Debt Tracker

Living document. Update as debts are created or resolved.

For audit history see `AUDIT-2026-04-23.md` and `AUDIT-2026-04-25.md`.
The 2026-04-23 audit's CQRS, Architecture, and most WCAG items are
resolved per the 2026-04-25 verification audit; remaining items are
listed below.

---

## CQRS / Command-layer debt

- [ ] **Command determinism — instance-id generation.** `addProcessor`
  uses `crypto.randomUUID()` client-side. Fine for local but
  non-replayable over websocket. When flipping to server-authoritative,
  move id generation server-side and return it in the command result.
  (Same pattern needs to apply to `addCable` once internal wiring lands.)
- [ ] **`AGENT_DSL` and `AgentPanel` parity check.** Verify the natural-
  language layer covers every command in `commands.js`. The processor
  commands are present in `AGENT_DSL` (commands.js:361–363); confirm
  `AgentPanel` actually surfaces them.
- [ ] **Cable commands (forward-looking).** When internal wiring lands,
  add `addCable`, `removeCable`, `updateCable` to `commands.js` per
  `INTERNAL-WIRING-DESIGN.md` §7.3.

## Architecture debt

- [ ] **Context providers export both component + hook.** Five files
  flagged by `react-refresh/only-export-components`:
  `accessibility.jsx`, `agent/config.jsx`, `i18n/index.jsx` (×2),
  `signals/BusContext.jsx`. Splitting each into provider + hook would
  fix HMR but touches ~58 call sites. Low-priority — affects dev only,
  not build/runtime.
- [ ] **Optional: extract `useNavigation()` hook from App.jsx.** The
  navigation state machine (focusedId, paneId, systemView, camera
  transitions) could move to a custom hook. App.jsx is 666 lines —
  sized correctly today, but the hook would clarify the transitions.
- [ ] **Optional eslint rule** forbidding raw `"room:"` / `"proc:"`
  channel string literals outside `signals/bus.js`. Today's codebase
  is clean; this is a guardrail to prevent the kind of drift that
  introduced the prior `wiring.js` violation.
- [ ] **Internal wiring (forward-looking).** Per
  `INTERNAL-WIRING-DESIGN.md`: declared ports on every processor,
  cables as data, broadcast removed in the final phase. Phase 1
  (port annotations) is the lowest-risk first step. The styleguide
  `WIRING` section ships a working visual + interaction reference.

## WCAG 2.1 Level AA

### Open

- [ ] **Translation parity gap on processor/signal UI** (criterion
  3.1.2). Full plan + per-language speaker checklist in
  `I18N-TRANSLATION-PLAN.md`. Not urgent; activate when a speaker
  is available for a given language or when plateau 1 procurement
  readiness pressures it.
- [ ] **No axe-core integration in vitest.** Component tests don't
  automatically check WCAG. Adding axe-core for Switchboard,
  ProcessorPage, ProcessorLibraryModal, SignalFeed catches
  regressions.

### Pre-existing (still applies)

- [ ] ExplorerTree has no integration tests for keyboard navigation
- [ ] Room system has no tests for screen reader announcements
- [ ] Switchboard table rows need scroll-into-view on keyboard focus
- [ ] CableTerminal focus indicator may be invisible on some backgrounds
- [ ] PLACEHOLDER_APPS signal types not translated (hardcoded English:
  "metric", "directive", etc.)

### Pending (formal verification)

- [ ] 200% browser zoom verification with documented screenshots
- [ ] 400% at 1280px reflow test
- [ ] NVDA testing (Windows)
- [ ] JAWS testing (Windows)

## Design

- [ ] S5 verb needs a better name than "Identity"
- [ ] Algedonic channel only on S5 — should other systems show an
  algedonic output? (See `INTERNAL-WIRING-DESIGN.md` §17 for the
  "algedonic as the one allowed broadcast" deferred decision.)
- [ ] Switchboard empty rows look dead — consider placeholder text
  or subtle pattern
- [ ] Cable 45° bend direction is arbitrary — should bend direction
  encode meaning (in vs out)?
- [ ] 3D pane view inter-system cables (blue S3→S5, orange S4→S3,
  red S3→S2) — visual concept sound but Three.js implementation
  needs rethinking. Terminal dots transparent/grey, z-fighting with
  system squares. Possibly custom shader or extruded tube geometry.
- [ ] No visual distinction between essential/CORE apps and optional
  ones beyond the text label
- [ ] Terminal detail view minimal — needs richer signal type
  descriptions when data model exists
- [ ] **Breadcrumbs throughout the application.** The detail view
  has breadcrumbs but other surfaces (system page, processor page,
  rack/switchboard tabs, library drawer) don't. Caleb wants the
  pattern applied consistently so the user always knows where they
  are and can hop back to any ancestor in one click.
- [ ] **3D destination preview on terminal hover.** Hovering a wall
  terminal should pop a small 3D thumbnail of the component the
  cable leads to (the peer room's owning node) so the user sees the
  destination before navigating. Reuses the existing iso shape
  rendering primitives (IsoSquare/IsoEllipse/IsoTriangle/MetaUnit).
  Anchor next to the terminal, dismiss on mouse-leave or after a
  short delay; should be quick enough to feel like a tooltip, not
  a modal.

## Technical

- [ ] Tree operations (duplicate, splice, move, delete) can
  create/destroy S2 connections — needs grammar of valid structural
  states for publish validation
- [ ] `isDescendant` in model.js is recursive without depth limit —
  could stack overflow on pathological trees
- [ ] ExplorerTree drag-drop uses HTML5 drag API which has known
  issues on mobile/touch
- [ ] No undo/redo system — model mutations are one-way
- [ ] Signal buffer design undecided: in-model (simple, causes
  re-renders) vs ref-based (performant, complex)
- [ ] DEV_TUNING panel still in RoomShell.jsx behind flag — remove
  before production
- [ ] Camera position helpers (focusTarget, paneTarget) don't account
  for tree bounds — could position off-screen for large trees.
  Investigated 2026-04-25: not reproducible without a concrete large
  tree; "off-screen" requires choosing what to scale (FOCUS_DISTANCE?
  clamp to scene bounds? "fit-to-tree" preset?). Needs a symptom +
  design decision before fixing.
- [ ] No port declarations on processors yet (per
  `INTERNAL-WIRING-DESIGN.md` §13 step 1) — five built-in processors
  + `digest` need explicit `ports: { inputs, outputs }` annotation
  before internal wiring can land.
- [ ] `Digest` processor uses a fixed default prompt; no per-instance
  prompt editing in the UI yet (only via direct config). Acceptable
  for v1.

## Compound processors (subpatches / racks-within-racks)

Big design direction surfaced 2026-04-26 while riffing on real-time
numerical processors (Kalman + Holt-Winters wired internally as a
"Smoothed Forecaster," etc.). Compositions of primitives quickly
exceed what the user wants to keep wiring in every room — they want
to declare a sub-rack once and reuse it as a single processor.

Pattern is established in MaxMSP (`p` objects), VCV Rack subpatches,
Reaktor macros, Pure Data (`pd`), and Bitwig/Ableton device racks. In
this codebase it's an orthogonal axis to VSM tree recursion: a
processor's `create()` is replaced by a sub-rack definition with
declared external ports.

**Two recursions, kept separate:**
1. VSM recursion — every S1 is its own viable system (tree-of-rooms,
   already implemented).
2. Processor recursion — a processor def is either primitive
   (`create(config, runtime) → handle`) OR composed
   (`subRack: { processors, cables, exposedInputs, exposedOutputs,
   exposedParams }`). New territory.

**Status (2026-05-02):** runtime support shipped; some questions
resolved, others remain.

- [x] **Compound processor data shape.** `subRack: { instances, cables,
  inputBindings, outputBindings, paramBindings }` lives on the def.
  Inner cables reference local inner ids; outer port bindings name a
  specific inner jack.
- [x] **Runtime topology.** Each compound's `create()` spawns inner
  instances with namespaced ids (`${outerId}/${innerLocalId}`) and a
  proxy dispatcher that routes inner→inner via an edge index and re-
  emits bound inner outputs through the outer dispatcher with the
  outer port id. Nested compounds stack proxies cleanly (proven by
  `compound.test.js`).
- [x] **Parameter exposure.** `paramBindings: { outerKey:
  { instanceId, configKey } }` on the subRack flows the outer config
  (set via panel knobs / `updateProcessorConfig`) into inner instance
  configs at instantiation. Sentiment Tracker exposes windowMs / topK
  / reportIntervalMs / threshold via this mechanism.
- [x] **Drill-in UX (read-only inspector).** ProcessorPage now
  renders a CompoundInspector section beneath the config sidebar
  when `def.subRack` is present: lists the inner instances, cables,
  input/output bindings, and parameter bindings as a structural
  read-out. Breadcrumb back already lives on the page.
- [ ] **Drill-in UX (live rack-inside view).** The next layer:
  render running inner panels with knob/LED states, cable
  animations, per-inner signal feeds. Substantial — needs the
  compound runtime to expose its inner handles and a Rack-like
  read-only renderer that shares cable + panel primitives.
- [x] **Save-as-library (data + agent command).** Pure
  `compoundFromRoom` snapshot in `src/signals/compoundFromRoom.js`
  takes a room's processors+cables and produces a compound def with
  auto-derived outer ports (every unconnected inner jack becomes an
  external port; caller can override via `expose`). Live registry
  (`registerUserCompound` / `listUserCompounds` / `subscribeLibrary`
  / `getEffectiveLibrary`) plus agent command
  `agentAPI.saveAsCompound(nodeId, systemKey, name, opts?)` make it
  end-to-end usable. The LibraryDrawer reads `getEffectiveLibrary`
  and re-renders on subscribeLibrary fires, so saved compounds
  appear instantly in the chip+card list.
- [x] **Save-as-library UI (basic form).** "Save patch" button in
  the LibraryDrawer header toggles an inline form (name /
  description / category) that calls `agentAPI.saveAsCompound`
  with the current room's nodeId + systemKey. New compound appears
  immediately in the drawer's card list via `subscribeLibrary`.
  Auto-port-derivation does the boundary; per-port pruning UI is
  the next step.
- [x] **Save-as-library UI (per-port pruning).** The save form now
  shows a checkbox list of every auto-derived input + output port
  (each labelled "ProcessorName · port-label → outerId"); users can
  uncheck the ones they don't want exposed before saving. "All /
  none" toggle per side. SystemPage computes the preview via
  previewAutoPorts and passes it down.
- [ ] **Save-as-library UI (rename outer port ids).** outerIds are
  still auto-generated `<localInstanceId>-<portId>`. A future
  iteration could let users rename them inline before saving.
- [ ] **Persistence for user compounds.** In-memory only today —
  saved compounds vanish on refresh. Requires the broader
  persistence story (DEBT.md → "No persistence — everything dies
  on refresh").
- [ ] **Versioning.** When a saved composition is edited, what
  happens to existing instances of it? Snapshot-at-instantiation vs
  live-template-binding decisions.

**Smallest viable first move.** Don't build the editor yet. Teach the
runtime + library to support a compound def shape (read-only). Ship
one or two proof compositions in code (e.g., "Smoothed Forecaster" =
Kalman + Holt-Winters internally). Once that runs the editor + save-
as-library is purely a UX follow-up, not a system change.

## Cable graph / dispatcher (post-B3b)

These are the open items left over from the cable-driven dispatcher
work (commits cf31992 → e9506c8). The dispatcher and pure command/
query layer are in place and tested; these are the next-level
refinements.

- [ ] **Broadcast jack semantics — keep jack→jack patches live in
  broadcast mode.** Today `broadcast=true` visually disables ALL output
  jacks on the panel. The original direction was "broadcast wins for
  terminal cables, internal jack→jack stays untouched." Fix: the
  dispatcher already does the right thing semantically (internal
  cables fire even in broadcast); the disable should only refuse
  jack→terminal *new* drops, not block all interaction. ~15 min in
  `Panel.jsx` + `Rack.jsx` drag-validation.

- [ ] **Live drag validation when starting a patch.** When the user
  grabs a jack to start a cable, eligible targets should highlight and
  incompatible ones dim. Two layers of validation:
    1. *Structural* — terminals refuse jacks from broadcasting
       processors; jacks of source-only processors don't appear as
       cable targets; etc.
    2. *Type compatibility* — port `emits.types`/`accepts.types` must
       match (null on either side = match anything).
  Today wiring an incompatible cable silently creates a cable that
  never carries signal. This is the highest-leverage UX move; also
  pre-validates connections at the moment they're made.

- [ ] **B3c: cycle diagnostic surfaced as a signal.** When a signal
  hits the hop cap (32) it's currently dropped silently. Per direction,
  emit a `type: 'alert'` signal with tags `['dispatcher', 'cycle']` so
  the cycle is visible in the live feed. Eventual goal: route to
  nearest S5 algedonic channel. Tabled today since it's lower priority
  and the algedonic routing is itself a future concern.

- [ ] **Auto-passthrough terminals.** Cross-room flows now require
  pass-through cables (terminal → terminal) in every intermediate room.
  Optional flag on a terminal saying "anything arriving here goes out
  the peer side automatically" would remove the per-room tedium for
  VSM-canonical multi-hop flows (e.g., S1 → S2 → S3 → S4 → S5
  recursion-up). Keeps the explicit/visible principle because the
  passthrough is declared on the terminal, not implicit.

## Feature Completeness

- [ ] System pages are visual shells — no real data flow, signals,
  or processing beyond the digest demo
- [ ] No app view (drill into processor) — only the switchboard
  level exists
- [ ] No real-time signal flow or pulse animation on cables in
  production rooms (the styleguide demo has it)
- [ ] Internal wiring not implemented (designed: see
  `INTERNAL-WIRING-DESIGN.md`)
- [ ] No agent occupancy (who is responsible for what)
- [ ] No S5 parliamentary engine (motions, voting, docket)
- [ ] No S3 policy/constraint evaluation
- [ ] No S2 variety attenuation logic
- [ ] No S4 environment scanning
- [ ] No recursive contexts (drilling into an operation to see its
  internal VSM)
- [ ] No persistence — everything dies on refresh
- [ ] No multi-user / collaboration
- [ ] Connectors: only Slack today. HTTP poll, HTTP webhook, MQTT,
  file-watch are sketched in `PLUGIN-MANIFEST.md` — none implemented.
- [ ] Effectors: zero implemented. Symmetric concept to transducers
  per `PLUGIN-MANIFEST.md`.
- [ ] Context menu doesn't include all tree operations on all node
  types
- [ ] Orphan nodes not visible in Explorer
- [ ] 3D right-click context menu missing rename action
