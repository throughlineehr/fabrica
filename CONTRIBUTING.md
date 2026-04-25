# Contributing to Fabrica

Thanks for your interest. Fabrica is an open organizational-cybernetics
tool licensed under the Hippocratic License 3.0 — see `LICENSE.md` for
the full text and the use restrictions.

## Quick start

```sh
git clone <repo-url>
cd Fabrica
npm install
npm run dev          # localhost:5173
```

You should see the 3D viable system model. Visit `?styleguide` to
explore the design tokens and the wiring-demo reference.

### Other entry points

```sh
npm run relay              # local websocket relay (dev tool)
npm run connector:slack    # Slack → relay connector (needs .env)
npm run repl               # terminal REPL driving the same agent API
```

### Verify before pushing

```sh
npm test                   # vitest
npx eslint 'src/**/*.{js,jsx}'
npm run build              # vite build
```

The pre-commit hook runs the test suite. Don't bypass it with
`--no-verify` unless explicitly necessary; if a hook is failing,
investigate the underlying issue.

## How the codebase is laid out

Read `CLAUDE.md` first — it has the full directory map and the
conventions.

The load-bearing invariants:

1. **`tree/` is 100% pure** — no React, no I/O, no bus.
2. **`signals/` is framework-free** — React only in `BusContext.jsx`
   and `useSignalLog.js`.
3. **`bus.js` is the only place channel name formats live** — never
   write `"room:..."` or `"proc:..."` literals elsewhere; an ESLint
   rule enforces this.
4. **The agent API is the sole mutation surface** — every human and
   AI action flows through `src/agent/commands.js`. See `SIGNALS.md`
   §7 for the contract.
5. **No upward dependencies** — `signals/` and `tree/` never import
   from `components/`.
6. **Terminals drive both rendering AND wiring** — single source of
   truth in `signals/topology.js`.
7. **Every cable is bidirectional** — all terminals declare
   `dir: 'both'`, edges defined from both sides, symmetry checked
   by test.

Violating any of the above breaks downstream goals (audit log,
websocket migration, plugin contract, federation). Don't.

## Style + tokens

- **Colors**: from `src/styles.js → color`. Don't write hex literals
  in components (an ESLint rule enforces this for `src/components/`).
- **Type**: via `useA11yType()` hook. Don't import the `type` token
  directly into rendered components — the hook honors font-visibility
  scaling and dyslexia-mode font swap.
- **Components**: Swiss modernism. Flat, structural, no decoration,
  no rounded corners on menus/cards. Lucide icons at 16px / 1.5
  stroke.
- **Numbers**: from `src/constants.js`. Magic numbers in components
  should be the exception.

## Accessibility is a hard requirement

WCAG 2.1 Level AA. See `VPAT-2.5.md` for the conformance report and
`AUDIT-2026-04-25.md` for the latest verification.

- Every interactive element keyboard-reachable.
- Focus indicators visible (`:focus-visible` rule in `index.css`;
  per-component overrides where the global ring is obscured).
- Live-region announcements (`aria-live=polite`) on state changes
  via `agentAPI.announce`.
- Color is never the only signal — pair with shape, pattern, or text.
- Targets ≥ 24×24 px (`button`, `[role="button"]`, etc. enforced via
  CSS `min-width`/`min-height`).
- All user-visible text via `useTranslation()`. New strings need
  English in `en.js` plus a key for translation. Locale parity work
  is tracked in `I18N-TRANSLATION-PLAN.md`.

`src/test/axe-smoke.test.jsx` runs axe-core against the key
components on every CI cycle. New components should be added to it.

## Tests

- **Unit / integration tests** live in `src/test/`.
- We use **vitest** with `jsdom`.
- Component tests use `@testing-library/react`.
- Pure modules in `tree/` / `signals/` are tested without React.
- Test count today: 225+. PRs that drop coverage are reviewed
  carefully; the bar is "no regression on any module's behavior."

When adding a feature:

1. Add a test for the new behavior.
2. Update or add doc references (CLAUDE.md, SIGNALS.md, etc.)
3. Run lint + tests before pushing.
4. Update `CHANGELOG.md`.
5. If the feature has accessibility surface, add it to
   `axe-smoke.test.jsx`.

## Commit style

We use multi-line commit messages with a clear subject and a body
explaining *why*:

```
Subject: short imperative under 70 chars

Body explains the why, not the what. Reference design docs by name
when helpful (SIGNALS.md, INTERNAL-WIRING-DESIGN.md, etc.). Group
related changes under one commit.

Co-Authored-By: ...
```

Look at recent `git log` for examples. Squash-merge style for PRs.

## Design docs

Read these in this order if you're new:

1. `README.md` — overview
2. `CLAUDE.md` — architecture + conventions
3. `SIGNALS.md` — signal layer in depth
4. `ROADMAP.md` — where we are, where we're going
5. `INTERNAL-WIRING-DESIGN.md` — the next big UI shift
6. `ARCHITECTURE-NEXT.md` — designs not yet built
7. `PLUGIN-MANIFEST.md` — plugin contract
8. `KEYBOARD-SHORTCUTS.md` — every hotkey
9. `DEBT.md` — what's known to be broken or pending

Audit history: `AUDIT-2026-04-23.md`, `AUDIT-2026-04-25.md`.

## License + ethics

By contributing, you agree your contribution will be licensed under
the Hippocratic License 3.0. The license restricts use by military,
intelligence, mass-surveillance, and weapons organizations. See
`LICENSE.md` and `COMPLIANCE-ROADMAP.md` §0 for the full ethical
framing.

## Reporting issues

- Code: GitHub issues.
- Accessibility: <thirdcreed@gmail.com>.
- Security: <thirdcreed@gmail.com> (please don't post security issues
  publicly until the maintainer has had a chance to address them).
