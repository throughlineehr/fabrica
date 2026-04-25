# Fabrica

An isometric 3D visualization of a viable system model (VSM). Tree-edit
your organization, drill into a system room, wire processors to signal
buses, and watch the nervous system come alive.

Stafford Beer's VSM, made tactile.

## What's here

- **3D model** — isometric tree of management units and operations.
  Subsystems S1–S5 with the right cabling between them. Drag, drop,
  rename, splice, duplicate.
- **System rooms** — each S1/S2/S3/S4/S5 is its own room with cable
  terminals on the walls and a switchboard for processors.
- **Signal bus** — framework-free `signals/` layer with terminals as
  the single source of truth for both visible cables and real
  pubsub subscriptions.
- **Processors** — heartbeat, tracer, logger, websocket transducer,
  digest. Add a Slack-feed transducer, hook a digest, watch themes
  emerge.
- **Agent API** — every mutation flows through one command surface.
  Same API drives the React UI, the REPL, and the AI agent.
- **Accessibility** — WCAG 2.1 AA. Parallel DOM tree alongside the
  3D canvas. Keyboard everywhere. Screen-reader live regions.
  Color-blind patterns, epilepsy mode, dyslexia font, font scaling.
  10 languages including RTL Arabic.

## Run

```sh
npm install
npm run dev          # localhost:5173
```

Visit `?styleguide` for the design-system reference page.

## Other entry points

```sh
npm run relay              # local websocket relay (dev tool)
npm run connector:slack    # Slack → relay connector (needs .env)
npm run repl               # terminal REPL driving the same agent API
npm run test               # 178+ tests, vitest
npm run build              # production build
```

## Design references

Living docs at the project root:

- [`CLAUDE.md`](./CLAUDE.md) — architecture overview, contribution guide
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — onboarding for new contributors
- [`SIGNALS.md`](./SIGNALS.md) — signal wiring layer in depth
- [`ROADMAP.md`](./ROADMAP.md) — plateau-by-plateau path from personal
  tool to Cybersyn-class infrastructure
- [`ARCHITECTURE-NEXT.md`](./ARCHITECTURE-NEXT.md) — designs not yet
  built (plugin contract, governance, federation)
- [`INTERNAL-WIRING-DESIGN.md`](./INTERNAL-WIRING-DESIGN.md) —
  Reason/Eurorack-style internal wiring (the rack-flip view)
- [`PLUGIN-MANIFEST.md`](./PLUGIN-MANIFEST.md) — plugin extension surface
- [`DESIGN-OPERATIONS.md`](./DESIGN-OPERATIONS.md) — spatial grammar,
  cable colors, app contract
- [`COMPLIANCE-ROADMAP.md`](./COMPLIANCE-ROADMAP.md) — accessibility,
  security, ethics, certifications
- [`KEYBOARD-SHORTCUTS.md`](./KEYBOARD-SHORTCUTS.md) — every hotkey
- [`I18N-TRANSLATION-PLAN.md`](./I18N-TRANSLATION-PLAN.md) — translation
  parity gap + per-language speaker checklist
- [`DEBT.md`](./DEBT.md) — living debt list
- [`CHANGELOG.md`](./CHANGELOG.md) — release notes
- [`VPAT-2.5.md`](./VPAT-2.5.md) — accessibility conformance report
- `AUDIT-2026-04-23.md`, `AUDIT-2026-04-25.md` — periodic audit snapshots

## License

Hippocratic License 3.0 — see `LICENSE.md`. Permitted for organizations
working toward human flourishing; not for military, intelligence, mass
surveillance, weapons, or human-rights violations.

## Contact

thirdcreed@gmail.com
