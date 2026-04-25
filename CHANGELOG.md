# Changelog

All notable changes to this project. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely;
versioning is calendar-based (YYYY-MM-DD) until a release scheme
formalizes.

---

## 2026-04-25 — Audit + WCAG fixes + cleanups

### Added
- `INTERNAL-WIRING-DESIGN.md` — full plan for Reason/Eurorack-style
  rack-back patch cables: declared ports on processors, cables as
  data, three input modalities (mouse/keyboard/agent), 16-phase
  migration. No permanent broadcast in the final state.
- `src/components/wiring/WiringDemo.jsx` + StyleGuide WIRING section —
  working visual + interaction reference for the design above.
  Verlet-spring cable physics with sleep-on-idle, mouse drag,
  keyboard patching with ghost cable, click-to-detach, donut-hole
  endpoint plugs.
- `Digest` processor (`src/signals/library.js`) — S1→S2 variety
  filter. Buffers room signals, flushes on debounce-or-threshold,
  asks an LLM for themes, emits one narrative signal per theme.
  Algedonic significance reserved for emergencies.
- `callProvider` in `src/agent/providers.js` — pure async wrapper
  composing the existing provider buildRequest/parseResponse
  contracts. Used by processors via `runtime.llm.prompt`.
- `connectors/slack/` — first connector. Socket Mode forwarder
  pushing Slack messages to the relay as JSON.
- Port annotations on all five built-in processors (heartbeat,
  tracer, logger, websocket-transducer, digest) per
  `INTERNAL-WIRING-DESIGN.md` §13 step 1. Mechanical, no behavior
  change. Unblocks the rest of the wiring migration.
- `I18N-TRANSLATION-PLAN.md` — per-language speaker checklist
  capturing the translation parity gap.
- `AUDIT-2026-04-25.md` — verification audit.
- `CHANGELOG.md` — this file.

### Fixed
- `RoomShell` back button visible text now matches its `aria-label`
  (WCAG 2.5.3, label-in-name).
- `SignalFeed` time formatting now passes the active locale to
  `toLocaleTimeString` (WCAG 3.1.2).
- `App.jsx`: AI config ref no longer mutates during render
  (`react-hooks/refs` lint).
- `server/relay.js`: forwarders preserve text vs binary frame type
  on rebroadcast (was sending text JSON as binary, breaking the
  websocket-transducer).

### Changed
- `README.md`: replaced Vite boilerplate with a real Fabrica README.
- `DEBT.md`: refreshed. Resolved items dropped, new items added,
  pre-existing items retained.
- `ROADMAP.md`: plateau-0 "what exists and works" now reflects 5
  processors, slack connector, internal-wiring design, and the
  styleguide demo.
- `PLUGIN-MANIFEST.md`: lists S1→S2 transducers (digest + future
  statistical equivalents) as a core-primitive category.
- `CLAUDE.md`: directory tree now includes `components/wiring/`.
- `VPAT-2.5.md`: bumped to v0.2.1 reflecting the two AA fixes
  above and the i18n parity caveat.

---

## 2026-04-23 — VPAT-blocking AA fixes + CQRS / architecture cleanup

(Documented in `AUDIT-2026-04-23.md`. Major work: full processor
subsystem moved through the agent API, Switchboard keyboard nav,
ProcessorLibraryModal focus trap, terminal target sizes, all the
WCAG 2.1 AA P0/P1 items the audit identified.)

---

## Pre-2026-04-23

Earlier history is in `git log`. See `ARCHITECTURE-NEXT.md` for the
state of design at that point and `ROADMAP.md` Part I for the
historical grade at plateau 0.
