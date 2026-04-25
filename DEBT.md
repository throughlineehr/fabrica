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

- [ ] **Translation parity for processor/signal UI keys.** Nine non-
  English locales fall back to English for ~50 keys per locale
  (mostly `systemPage.*` — addProcessor, processors, processorLibrary,
  noProcessors, inputs, outputs, filterTypes, etc.). Real translations
  needed for ar, es, fr, hi, id, it, ja, ru, zh. Mechanical work; needs
  speakers, not heuristics. (Criterion: 3.1.2.)
- [ ] **`settings.colorBlindMode` translated only in Russian.** All
  other locales contain the English string under the key. Same
  observation as above — translation work. (Criterion: 3.1.2.)
- [ ] **Russian agent.* truncated.** `ru.js` shows `agent.intro`
  partially in English and several `agent.*` keys (cannotAddOperation,
  cannotRemoveRoot, wentBack) appear cut off. Verify and complete.
- [ ] **No axe-core integration in vitest.** Component tests don't
  automatically check WCAG. Adding axe-core for Switchboard,
  ProcessorPage, ProcessorLibraryModal, SignalFeed catches regressions.

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
  for tree bounds — could position off-screen for large trees
- [ ] No port declarations on processors yet (per
  `INTERNAL-WIRING-DESIGN.md` §13 step 1) — five built-in processors
  + `digest` need explicit `ports: { inputs, outputs }` annotation
  before internal wiring can land.
- [ ] `Digest` processor uses a fixed default prompt; no per-instance
  prompt editing in the UI yet (only via direct config). Acceptable
  for v1.

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
