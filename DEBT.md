# Fabrica — Debt Tracker

Living document. Update as debts are created or resolved.

## WCAG / Accessibility

- [ ] No component tests with axe-core for automated WCAG checking
- [ ] ExplorerTree has no integration tests for keyboard navigation
- [ ] Room system has no tests for screen reader announcements
- [ ] Switchboard table rows need scroll-into-view on keyboard focus
- [ ] CableTerminal focus indicator may be invisible on some backgrounds
- [ ] PLACEHOLDER_APPS signal types not translated (hardcoded English: "metric", "directive", etc.)
- [ ] Missing i18n keys for room system in 8 non-English languages (systemPage.audit, incoming, outgoing, etc.)

## Design

- [ ] S5 verb needs a better name than "Identity"
- [ ] Algedonic channel only on S5 — should other systems show an algedonic output?
- [ ] Switchboard empty rows look dead — consider placeholder text or subtle pattern
- [ ] Cable 45° bend direction is arbitrary — should bend direction encode meaning (in vs out)?
- [ ] 3D pane view inter-system cables (blue S3→S5, orange S4→S3, red S3→S2) — attempted with colored lines and hollow dots but couldn't get opaque rendering right in Three.js. Terminal dots rendered transparent/grey, z-fighting with system squares. Need a different approach — possibly custom shader material, or render cables as extruded tube geometry instead of Line. The visual concept is sound (colored cables connecting systems in detail view matching room terminal aesthetic) but the implementation needs rethinking.
- [ ] No visual distinction between essential/CORE apps and optional ones beyond the text label
- [ ] Terminal detail view is minimal — needs richer signal type descriptions when data model exists

## Technical

- [ ] Tree operations (duplicate, splice, move, delete) can create/destroy S2 connections — needs grammar of valid structural states for publish validation
- [ ] `isDescendant` in model.js is recursive without depth limit — could stack overflow on pathological trees
- [ ] ExplorerTree drag-drop uses HTML5 drag API which has known issues on mobile/touch
- [ ] No undo/redo system — model mutations are one-way
- [ ] Signal buffer design undecided: in-model (simple, causes re-renders) vs ref-based (performant, complex)
- [ ] DEV_TUNING panel still in RoomShell.jsx behind flag — remove before production (Switchboard's was removed during audit)
- [ ] Camera position helpers (focusTarget, paneTarget) don't account for tree bounds — could position off-screen for large trees
- [ ] **Signal channel mismatch**: `App.jsx` heartbeats publish to `${parentId}:signals:s1-to-s2` (via processors.js) but `SystemPage` subscribes to `${nodeId}:signals`. Signals don't reach rooms. Decision pending: collapse to one channel per node (simplest, matches SystemPage comment) vs. keep s1→s2→s3 channel split and wire an S2 relay.
- [ ] Context providers (`accessibility.jsx`, `agent/config.jsx`, `i18n/index.jsx`, `signals/BusContext.jsx`) export both a component and a hook, breaking React fast-refresh. Low-priority HMR-only lint; splitting would touch ~58 call sites.

## Feature Completeness

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
