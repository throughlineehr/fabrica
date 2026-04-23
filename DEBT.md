# Fabrica — Debt Tracker

Living document. Update as debts are created or resolved. For the
2026-04-23 audit findings, see `AUDIT-2026-04-23.md` — items are
copied here grouped by category.

---

## CQRS / Command-layer debt (AUDIT 2026-04-23)

Intended invariant (see COMPLIANCE-ROADMAP.md §10.4): the agent API in
`src/agent/commands.js` is the single surface for every mutation, so
audit logging, undo, and websocket sync can be bolted on later without
touching callers. This is currently violated broadly by the processor
subsystem.

- [ ] **Processor subsystem has zero agent-API coverage.** Add commands: `addProcessor(nodeId, systemKey, defId, config?)`, `removeProcessor(nodeId, systemKey, instanceId)`, `updateProcessorFilters(nodeId, systemKey, instanceId, patch)`, `openProcessor(nodeId, systemKey, instanceId)`, `listProcessors(nodeId, systemKey)`. Rewire Switchboard + ProcessorPage through them instead of the current prop-callback chain from App.jsx.
- [ ] **Direct `setModel` paths in App.jsx bypass the agent.** Lines 548, 554, 558, 562, 566, 627 import tree commands directly. These already have agent equivalents (`agentAPI.removeNode` etc.); switch to the agent versions.
- [ ] **Settings mutations bypass agent.** Language, epilepsy/dyslexia/colorBlind toggles, fontVisibility scale, AI provider/key/model/endpoint all call context methods directly. Add `setLanguage`, `toggleAccessibility`, `setFontVisibility`, `setAIConfig` commands.
- [ ] **Command determinism — instance-id generation.** `addProcessor` currently uses `crypto.randomUUID()` client-side. Fine for local but non-replayable over websocket. When flipping to server-authoritative, move id generation to the server and return it in the command result.
- [ ] **Update `AGENT_DSL` and AgentPanel** to expose the new commands to the natural-language layer.

## Architecture debt (AUDIT 2026-04-23)

- [ ] **`wiring.js:23` hardcodes `` `room:${sourceRoomKey}` ``** instead of calling the `roomChannel()` helper from `bus.js`. Violates the "bus.js is the only transport seam" invariant. Fix: `import { roomChannel }` and use it. Consider adding an eslint rule that forbids raw `"room:"` / `"proc:"` string literals outside `signals/bus.js`.
- [ ] **`signals/roomLabel.js` is unused in production.** The I/O tab that consumed it was removed; SignalFeed has its own inline formatter. Delete the file.
- [ ] **`invertSubscriptions` in topology.js** is only referenced by one test, no production callers (the "Broadcasts to" display was removed). Either delete + drop the test, or keep as reserved infrastructure with a comment explaining why.
- [ ] **`CLAUDE.md:60` references `components/room/resolveTerminals.js`** which no longer exists (moved to `signals/topology.js`). Update the doc.
- [ ] **Optional: extract `useNavigation()` hook from App.jsx.** App.jsx is 677 lines, sized correctly for what it owns, but the navigation state machine (focusedId, paneId, systemView, camera transitions) could cleanly move to a custom hook. Would drop App.jsx to ~550 lines. Not blocking.

## WCAG 2.1 Level AA — new components (AUDIT 2026-04-23)

The existing VPAT (`VPAT-2.5.md`) dated 2026-04-21 predates the entire
processor/signal UI. None of the components below are covered.

### AA-blocking

- [ ] **Switchboard rows not keyboard-navigable** (2.1.1). `<tr role="row">` at `Switchboard.jsx:277` has no `tabIndex`, no `onKeyDown`. Users cannot reach rows without mouse. Add Tab-reachability, Enter to open processor, arrow keys to move between rows — mirror ExplorerTree's pattern.
- [ ] **ProcessorLibraryModal focus trap incomplete** (2.1.2). First-button focus ✓, Escape handler ✓, but Tab escapes the dialog. Trap Tab/Shift+Tab within the dialog.
- [ ] **No status-message announcements on processor ops** (4.1.3). Adding/removing processors and updating filters produce no `role="status"` announcements. Wrap the Switchboard in a debounced live region.
- [ ] **Terminal dots 14×14px — below AA target size** (2.5.5). Raise to 20×20px and enforce ≥8px separation. Apply the same bump to `ui.checkbox.size` in `styles.js`.
- [ ] **CableTerminal uses `<a href="#" role="link">` as a button** (2.1.1, semantics). Line 101 should be `<button>` — links are for navigation, buttons for actions.

### AA-significant

- [ ] **Tags input in Switchboard has no programmatic label** (2.4.6, 3.3.2). Add `aria-label="Tags filter (comma-separated)"`.
- [ ] **Switchboard empty padding rows pollute screen readers** (1.3.1). 10 `&nbsp;` rows per page announced as "blank, blank…". Add `aria-hidden="true"` + `role="presentation"`.
- [ ] **Switchboard grid lacks row/col counts and explicit gridcell roles** (1.3.1). Add `aria-rowcount`, `aria-colcount`, and `role="gridcell"` on cells.
- [ ] **Modal X button mislabeled `nav.esc`** (2.4.4). `aria-label="esc"` describes the keystroke, not the button purpose. Same issue in RoomShell back button. Introduce `nav.close` / `nav.back` keys and translate across 10 languages.
- [ ] **SignalFeed hops arrow contrast below AA** (1.4.3). `color.borderLight` (#b5b5b5) on white is 2.1:1. Switch to `color.muted` (4.5:1) or hide the arrow and rely on spacing.
- [ ] **SignalFeed icons color-only, no text alternative** (1.1.1, 1.4.1). Add visually-hidden `<span>metric:</span>` prefix before each icon.
- [ ] **Checkbox unchecked border has effective contrast ~1.9:1** (1.4.11). Border `#8a8a8a` (3.5:1) × `opacity 0.35` → too faint. Keep opacity only on fill; keep border at full opacity.
- [ ] **Direction arrows inside Switchboard dots not announced** (1.1.1). Extend `aria-label` to include wall direction when the arrow is rendered (e.g., `"S3 (on) — top wall"`).
- [ ] **RoomShell heading hierarchy backwards** (2.4.6). Sub-page uses `<h1>` for verb and `<h2>` for unit name. Swap to `<h2>`/`<h3>` so the document-level title stays as the h1.
- [ ] **TerminalDetail connections lack list semantics** (1.3.1). Flex rows with no `<ul>`/`<li>`. Wrap in a proper list.
- [ ] **Time format in SignalFeed not localized** (3.1.2). `toLocaleTimeString([],...)` uses browser locale, not app locale. Pass `i18n.language`.
- [ ] **ProcessorPage Escape handler is a window-level capture-phase listener** (2.1.2 edge case). Matches SystemPage pattern but stacks if pages nest. Structural — fix both.

### AA-nice-to-have

- [ ] StyleGuide page uses `<p>` for section headings instead of `<h2>`; no landmarks. Cosmetic; low priority.
- [ ] RoomShell content area is a plain `<div>`, not `<main>`. Adding `role="main"` helps landmark navigation.
- [ ] Terminal button aria-labels ("Monitor S3 in") describe terminal names rather than actions ("Show S3 connections"). Clarify verbs.
- [ ] Axe-core integration in the vitest suite for the new components (Switchboard, ProcessorPage, Modal, SignalFeed).

### VPAT refresh

- [ ] **`VPAT-2.5.md` does not cover the new components.** After P0+P1 fixes above, rewrite the relevant criteria rows to include Switchboard, ProcessorPage, ProcessorLibraryModal, SignalFeed, CableTerminal, RoomShell (new form), TerminalDetail, and Checkbox. Several current "Supports" rows will become "Partially Supports" until items are closed out.

---

## Pre-existing debt (from earlier audits)

### WCAG / Accessibility

- [ ] No component tests with axe-core for automated WCAG checking
- [ ] ExplorerTree has no integration tests for keyboard navigation
- [ ] Room system has no tests for screen reader announcements
- [ ] Switchboard table rows need scroll-into-view on keyboard focus
- [ ] CableTerminal focus indicator may be invisible on some backgrounds
- [ ] PLACEHOLDER_APPS signal types not translated (hardcoded English: "metric", "directive", etc.)
- [ ] Missing i18n keys for room system in 8 non-English languages (systemPage.audit, incoming, outgoing, etc.)

### Design

- [ ] S5 verb needs a better name than "Identity"
- [ ] Algedonic channel only on S5 — should other systems show an algedonic output?
- [ ] Switchboard empty rows look dead — consider placeholder text or subtle pattern
- [ ] Cable 45° bend direction is arbitrary — should bend direction encode meaning (in vs out)?
- [ ] 3D pane view inter-system cables (blue S3→S5, orange S4→S3, red S3→S2) — attempted with colored lines and hollow dots but couldn't get opaque rendering right in Three.js. Terminal dots rendered transparent/grey, z-fighting with system squares. Need a different approach — possibly custom shader material, or render cables as extruded tube geometry instead of Line. The visual concept is sound (colored cables connecting systems in detail view matching room terminal aesthetic) but the implementation needs rethinking.
- [ ] No visual distinction between essential/CORE apps and optional ones beyond the text label
- [ ] Terminal detail view is minimal — needs richer signal type descriptions when data model exists

### Technical

- [ ] Tree operations (duplicate, splice, move, delete) can create/destroy S2 connections — needs grammar of valid structural states for publish validation
- [ ] `isDescendant` in model.js is recursive without depth limit — could stack overflow on pathological trees
- [ ] ExplorerTree drag-drop uses HTML5 drag API which has known issues on mobile/touch
- [ ] No undo/redo system — model mutations are one-way
- [ ] Signal buffer design undecided: in-model (simple, causes re-renders) vs ref-based (performant, complex)
- [ ] DEV_TUNING panel still in RoomShell.jsx behind flag — remove before production (Switchboard's was removed during audit)
- [ ] Camera position helpers (focusTarget, paneTarget) don't account for tree bounds — could position off-screen for large trees
- [ ] Context providers (`accessibility.jsx`, `agent/config.jsx`, `i18n/index.jsx`, `signals/BusContext.jsx`) export both a component and a hook, breaking React fast-refresh. Low-priority HMR-only lint; splitting would touch ~58 call sites.

### Feature Completeness

- [ ] System pages are visual shells — no real data flow, signals, or processing
- [ ] Switchboard processors are placeholder data (PLACEHOLDER_APPS) — no app registry
- [ ] No app view (drill into processor) — only the switchboard level exists
- [ ] No signal model, no connectors, no transducers implemented
- [ ] No real-time signal flow or pulse animation on cables
- [ ] No inter-system signal routing (signals don't travel between rooms)
- [ ] No agent occupancy (who is responsible for what)
- [ ] No S5 parliamentary engine (motions, voting, docket)
- [ ] No S3 policy/constraint evaluation
- [ ] No S2 variety attenuation logic
- [ ] No S4 environment scanning
- [ ] No recursive contexts (drilling into an operation to see its internal VSM)
- [ ] No persistence — everything dies on refresh
- [ ] No multi-user / collaboration
- [ ] No real external connectors (API, webhook, etc.) — only manual entry planned
- [ ] Context menu doesn't include all tree operations on all node types
- [ ] Orphan nodes not visible in Explorer
- [ ] 3D right-click context menu missing rename action
