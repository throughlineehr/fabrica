# Fabrica — Architectural Roadmap

A multi-plateau climb from "personal VSM tool" to "Cybersyn-class managed
economy platform." Each plateau is a **shippable, breathable resting
point**: a usable system, ready to hold weight, that doesn't block the
next climb.

**Companion docs:**
- `SIGNALS.md` — current state of the signal wiring layer (plateau 0)
- `AUDIT-2026-04-23.md` — snapshot of the current system's health
- `ARCHITECTURE-NEXT.md` — design notes for unresolved architecture
- `COMPLIANCE-ROADMAP.md` — legal, ethical, certification track
- `DEBT.md` — living debt list

This doc is the synthesis: where we are, where we're going, what gates
each transition, and what traps to avoid.

---

## Part I — State of the architecture (audit)

### Where we are: concrete reality at plateau 0

**What exists and works** (covered by 178+ passing tests, lint-clean
modulo five known fast-refresh debt entries, documented):

| Layer | Shape | Evidence |
|---|---|---|
| Tree model | Pure immutable entity store with CRUD, validation, layout, queries, YAML serialize, BUILD shorthand parser | `src/tree/`, 40+ tests |
| Signal system | Framework-free bus + signal + topology + wiring + filter + library (5 processors: heartbeat, tracer, logger, websocket-transducer, digest) | `src/signals/`, 20+ tests, `SIGNALS.md` |
| Terminal topology | VSM wiring rules derived from the tree; every cable bidirectional; symmetric from both sides | `src/signals/topology.js`, symmetry test |
| Agent API | Single mutation surface. All human + AI actions flow through it. Covers model, processors, settings, navigation, queries; LLM access for processors via `runtime.llm.prompt` | `src/agent/commands.js`, `src/agent/providers.js`, 19+ agent tests |
| First connector | Slack via Socket Mode → relay → websocket-transducer | `connectors/slack/`, `server/relay.js` |
| Digest processor | S1→S2 variety filter: buffer-debounce-or-threshold-flush with LLM-backed theming, algedonic significance flagged for emergency fast-path | `src/signals/library.js`, `src/test/digest.test.js`, `INTERNAL-WIRING-DESIGN.md` (forward) |
| React UI | Explorer tree (drag/drop, keyboard, inline rename/delete), 3D canvas, room shell with cable terminals, switchboard, processor page, signal feed, library modal, checkbox primitive | `src/components/` |
| Internal wiring (designed) | Reason/Eurorack-style rack-back patch cables, fully designed (16-phase migration plan) and a working visual + interaction reference in the styleguide | `INTERNAL-WIRING-DESIGN.md`, `src/components/wiring/WiringDemo.jsx`, StyleGuide WIRING section |
| Accessibility | WCAG 2.1 AA per refreshed VPAT. Row keyboard nav, focus trap in modals, live-region announcements, target sizes, color contrast, 10 languages with RTL. Translation parity gap on processor/signal UI documented in `I18N-TRANSLATION-PLAN.md`. | `VPAT-2.5.md`, `AUDIT-2026-04-25.md` |
| REPL | Terminal front-end driving the same agent API. Proof the domain is framework-free | `scripts/repl.js`, `npm run repl` |

**Seven architectural invariants** are currently held:

1. `signals/` is framework-free (no React except two named edges)
2. `tree/` is 100% pure (immutable commands, no side effects)
3. `bus.js` is the sole transport seam (channel names constructed only there)
4. No upward dependencies (components → signals/tree, never reverse)
5. Terminals drive both rendering AND wiring from one definition
6. The agent API is the sole mutation surface (tree, processors, settings)
7. Every cable is bidirectional (all terminals `dir: 'both'`, edges defined from both sides)

**Current grades** (from AUDIT-2026-04-23 + follow-up work):

- CQRS: **A**
- Architecture: **A-**
- WCAG 2.1 AA: **A-**

### What's designed but not built

From `ARCHITECTURE-NEXT.md`, settled through conversation but not yet
reflected in code:

- **Processors subsume agents.** `kind: transform | agent | human-room | orchestrator` selects shape. One contract, one distribution story.
- **Tools ARE processors.** Direct-call is a runtime optimization; no separate "global tools" concept.
- **Server-by-default** for `agent` and `human-room` kinds. Transform processors stay portable. Client-only reserved for local UI only.
- **Four first-class actors** on the bus: rooms, processors, users, documents. Not hierarchical.
- **Ephemeral agents by default.** Persistent via `stateSchema` + `lifecycle: 'persistent'`.
- **The contract stays ignorant of users, auth, permissions.** Host runtime handles those.
- **Federated-by-default** at scale. Each shard is an autonomous Fabrica node.
- **The system governs itself** using its own parliamentary processors.
- **The protocol is the sovereignty, not the deployment.**

### What's still open

Explicit open questions, by domain:

- **Parliamentary mechanics**: scope routing of motions, "motion" as signal type or tag, position assignment mechanism
- **Users**: IdP vs internal store (leaning IdP), view-config key shape, inbox channel granularity, zero-config fallback
- **Documents**: versioning strategy (Postgres version column vs git-backed), ACL granularity
- **Broader**: signal persistence granularity, collaboration conflict resolution, billing model, algedonic as cross-tree priority bus, ephemeral agent cold-start latency
- **Cybersyn-class**: partnerships, regulatory landing, Registro Civil integration, historical continuity (Beer's papers, Medina's archives), pilot vs horizontal, governance bootstrap, federation revocation, language-first, cost model

### Graded assessment

| Layer | Current quality | Ready for… |
|---|---|---|
| Tree model | A — mature, tested, pure | Any plateau |
| Signal system | A- — clean, tested, bus seam intact | P4 without major rework |
| Agent API / CQRS | A — single chokepoint, serialized commands | P1 wire protocol as-is |
| UI / WCAG | A- — AA compliant, VPAT fresh | P1. New screens need audit per-feature. |
| Plugin surface | D — processor shape is there but not extracted | P2 requires extraction |
| Persistence | F — nothing persists; everything dies on refresh | P1 hard requirement |
| Multi-user | F — single browser, no sync, no auth | P1 hard requirement |
| Documents | F — concept exists in notes, zero code | P3 hard requirement |
| Sharding | F — single-process assumption throughout | P4 hard requirement |
| Federation | F — no concept at all | P5 hard requirement |
| Sovereign multi-region | F | P6 hard requirement |
| Self-governance | F | P7 hard requirement |

### Summary of Part I

We have a **solid plateau-0 system**. The hard invariants (framework-free
domain, single command surface, transport seam) are held and tested.
The domain layer will outlive every UI, every transport, every
deployment model. That's the foundation the roadmap builds on.

---

## Part II — Plateau roadmap

Each plateau is a ship-and-breathe point. Usable system, real value,
no rush. Criteria for "stable enough to climb" listed at each.

### Plateau 0 — Personal VSM tool (here, now)

**What it is**: a single-user browser app for modeling a Viable System
Model. Tree editing, room exploration, processor experimentation
locally, signal flow visualization, 10-language a11y.

**Who it serves**: practitioners learning VSM, cybernetics researchers,
consultants prototyping organizational models, teachers demonstrating
Beer's diagrams.

**Value**: genuine. A working VSM tool with no peer in the open-source
landscape. Ships.

**What's missing** (acceptable for P0): persistence, multi-user,
authentication, servers.

**Climb-ready criteria** (all ✓):
- Tests green, lint clean, build clean
- CQRS verified (single chokepoint)
- Domain proven framework-free (REPL works)
- WCAG AA with refreshed VPAT
- Plugin contract sketched (if not implemented)

---

### Plateau 1 — Server-backed, single-org, multi-user

**Target deliverable**: a web app where members of one organization can
collaborate on one VSM in real time. Data persists. Authentication
works. Admin can invite members.

**What's new** (the real work):
- **Backend server**: Node process with the agent API exposed via
  websocket. Same `createAgentAPI` shape as today, just with state
  setters hitting Postgres instead of React state.
- **Persistence**: Postgres table for model + processors snapshot per
  org. Write-through on every agent command. Audit log table (not yet
  cryptographically chained — just append-only with timestamps).
- **Authentication**: external IdP via OIDC (Auth0, Keycloak, Google
  Workspace, whatever's pragmatic). No internal password management.
- **Authorization v1**: one role per user (member / admin). Admin can
  invite, demote, remove. No fine-grained permissions yet.
- **Client agent API shim**: the web app's `createAgentAPI` becomes a
  websocket forwarder. Same interface. All mutations go to server.
- **Server-side processor runtime**: the existing `src/signals/`
  code runs on the server. Processors keep ticking when browsers
  close. Fabrica's first always-on feature.
- **Users as subscribers**: user sessions subscribe to the rooms
  they're viewing. Bus pushes updates via websocket. Presence
  indicator ("Alli is here").

**Architectural guardrails for P1** (don't paint into a corner):
- The server must use the existing agent API unchanged. If anything
  needs to change, change the agent API *first* and update the client
  simultaneously. The agent API is the wire protocol.
- Signal bus inside the server is in-memory (not yet Redis). Just
  instantiate `createBus()` once per process. Don't reach for
  distributed infrastructure yet — it will block honest feedback.
- User model stays minimal: `{ id, email, orgId, role }`. Resist the
  urge to build a CRM. More in P3/P5 when use cases demand.
- Persistence is **snapshot-only** for v1: the whole `{ model,
  processors }` serialized on every mutation. Naive but correct.
  Event-sourcing comes in P4.
- No plugin extraction yet — P2 is the right moment. Keep processors
  in `src/signals/library.js`.

**Value at P1**: small teams can actually use this. A consulting
client, a co-op board, a department modeling itself.

**Rough scope**: ~4–8 weeks with one engineer. Biggest unknowns are
auth stack choice and hosting (probably Fly.io or Render for speed).

**Climb-ready criteria**:
- Two users can edit the same tree simultaneously without data loss
- A processor added by user A is visible to user B
- Processor state survives server restart (restart pulls from Postgres)
- Audit log records every mutation (queryable, if not yet tamper-proof)
- Auth works for at least one IdP
- Load tested: 100 rooms × 50 concurrent users × 10 msg/sec bus
  traffic without falling over
- Zero references to hardcoded channel strings (bus.js seam intact)
- All P0 invariants still hold

**Breathe here** before climbing to P2. Use the system. Make decisions
informed by real usage. The temptation to race to the plugin ecosystem
is real; resist. Real usage reveals what the plugin contract actually
needs to support.

---

### Plateau 2 — Plugin ecosystem

**Target deliverable**: processors are standalone packages. Anyone
can write one. Core processors live in their own folder as reference
implementations. Operators can install third-party processors.

**What's new**:
- **Contract formalization**: `PROCESSOR-SPEC.md` with JSON Schema for
  metadata + TypeScript for runtime. Contract covers `kind`, inputs,
  outputs, `DetailView`, i18n, compliance declarations, `runtime`
  (server/client/either).
- **Extract core processors**: move heartbeat, tracer, logger out of
  `src/signals/library.js` into `processors/core/{heartbeat,tracer,logger}/`
  as self-contained packages. This is what reveals the real contract
  shape — what does a processor actually need from its runtime?
- **Plugin loader**: at server startup, scan `processors/` for
  installed packages and register them. For v2, this is "whatever's in
  `node_modules` matching `@fabrica/processor-*`." No dynamic loading
  at runtime yet.
- **Library picker enhancements**: shows installed processors with
  metadata (author, version, compliance tier). Verified badge for
  core + audited processors.
- **Sandboxing — light**: declared `externalRequests` manifest
  enforced via CSP. No code sandboxing yet (trust the install).
- **First non-core processor**: write one that's genuinely useful to
  demonstrate the contract. Candidate: **motion-filter** (tag-filters
  signals by `tags: ['motion']` and republishes), laying groundwork
  for P3.

**Architectural guardrails**:
- The contract is what falls out of extracting the three core processors.
  If extraction is hard, the contract is wrong; don't paper over.
- Keep the plugin runtime boringly simple. No dynamic fetch, no
  sandboxing rabbit-hole. Just locally installed packages.
- `DetailView` is the ONE place where React crosses into processor
  territory. Processors that don't need a DetailView don't provide one
  (and the host renders a fallback).
- Don't couple distribution to CDNs or signed packages yet. Those are
  P5-P6 concerns. v2 = npm only.

**Value at P2**: a real ecosystem starts. Other teams can extend
Fabrica without touching core. The contract serves both human and AI
authors — an AI given the spec can one-shot a processor.

**Rough scope**: ~3–5 weeks. The extraction is the most time-consuming
part; contract falls out of it. Plugin loader is small.

**Climb-ready criteria**:
- Three core processors extracted and working as external packages
- One non-core processor (motion-filter) shipped, installed, working
- `PROCESSOR-SPEC.md` written and reviewed
- A processor author unfamiliar with the codebase can ship a working
  processor in one afternoon given only the spec
- CSP + `externalRequests` manifest enforced
- All P0+P1 invariants still hold

**Breathe here**. See if the community starts writing processors.
Let contract gaps surface. Document learned patterns.

---

### Plateau 3 — Documents + decision-making

**Target deliverable**: organizations can make decisions inside the
system. Motions get proposed, meetings happen, policies get
written. First visible piece of "VSM for real organizational work."

**What's new**:
- **Document store**: Postgres tables for `documents`,
  `document_versions`, `document_acl`. Keyed by `(scope, topic)`
  where scope maps to VSM recursion level. Git-diff-shaped proposed
  changes. Atomic apply on approval.
- **Parliamentary processor**: `kind: 'human-room'`, Rusty's Rules,
  multi-user room with real-time chat (video optional). Docket, motion
  state machine, transcript-as-signals, approval output.
- **Desk processor**: `kind: 'human-room'`, single-position. Can be
  held by human or agent.
- **Vote processor**: simpler than parliamentary — direct vote on a
  proposition with rules (simple-majority, consensus, etc.)
- **First real agent processors**:
  - **motion-classifier**: LLM-backed. Reads narrative signals with
    `tags: ['proposal']`, decides if they're motions, what priority,
    routes to the right docket.
  - **document-writer**: receives approval signals, applies diffs,
    emits document-updated signals.
  - **librarian**: maintains an index of policies, answers reference
    queries from other agents.
- **Position-assignment processor**: emits role-binding signals. Rules
  for election, sortition, appointment, rotation. Reads from user
  membership.
- **Transcript handling**: each meeting's signal stream persists to
  a dedicated audit table. Finalized into an artifact document on
  close.

**Architectural guardrails**:
- The parliamentary processor is the **first large stress test** of
  the plugin contract. If building it requires contract changes, make
  them — this is exactly why we breathe between plateaus.
- Documents are NOT tree nodes. They're their own sub-system, keyed
  by scope. Cross-linked via IDs in signals, not inlined.
- Ephemeral agents stay the default. Only the parliamentary facilitator
  (if we have one) is persistent, and only during active meetings.
- Keep LLM usage declared: each agent's `externalRequests` manifest
  names which providers it contacts.
- Resist building "Fabrica Slack." The chat is scoped to parliamentary
  meeting rooms only — the point is decisions, not general
  communication.

**Value at P3**: first visible governance capability. Co-ops, boards,
worker assemblies, small legislatures can actually run meetings and
produce policy. This is where Fabrica's politics becomes real.

**Rough scope**: ~6–10 weeks. Parliamentary is big. Documents are
straightforward. Agent processors depend on LLM infrastructure
decisions.

**Climb-ready criteria**:
- A real meeting has been run, with real users voting on a real
  proposal, producing a real policy document change
- Transcript + audit trail is complete and queryable
- Librarian agent correctly retrieves relevant documents
- Document store handles git-diff proposals cleanly
- All P0-P2 invariants hold
- New invariant: **signal lineage is always preserved** — any
  document change can be traced back through the motion, the
  approval, and the participant votes. No "dark" mutations.

**Breathe here** longer than previous plateaus. This is the first
plateau where real organizations are using Fabrica for real
decisions. Learn what governance actually needs. Let users tell us
what's missing.

---

### Plateau 4 — Multi-shard single-org

**Target deliverable**: a single Fabrica deployment serving a large
organization (thousands of rooms, hundreds of concurrent users) via
multiple Node processes coordinated by a shared bus and persistence
layer.

**What's new**:
- **Redis pubsub** as the inter-process bus. `bus.js` gets a new
  adapter. Topology unchanged.
- **Event sourcing** replaces snapshot persistence. Every command
  appended to an event log; state is a fold. Enables replay, rewind,
  parallel subscribers.
- **Shard-per-subtree**: processor scheduler places processors on the
  node owning the subtree they live in. Cross-shard signals route
  through Redis.
- **Per-shard read replicas** for Postgres. Hot-path reads hit local.
- **Worker pool for heavy agents**: LLM-backed agents can saturate a
  node. Spin them off to a queue-processed worker fleet.
- **Observability**: Prometheus metrics per shard, Grafana
  dashboards, distributed tracing. The system becomes legible to
  its operators.
- **Fine-grained permissions**: role-based but per-room. Who can
  chair, who can vote, who can add processors. The agent API gains
  authorization checks.

**Architectural guardrails**:
- Shard boundaries must align with VSM recursion. Don't balance by
  load — balance by topology. Use the attenuation insight: signals
  within a subtree are dense, between subtrees are sparse.
- The in-memory `Map<roomKey, Room>` pattern generalizes to
  multi-process. Each process owns a slice. Cross-shard = Redis.
- The attenuation insight becomes critical: verify under load that
  bus throughput at S3+ stays orders of magnitude below S1. If it
  doesn't, processors below are missing attenuators; fix the model,
  not the transport.
- Event log format is forward-compatible. Define it carefully: the
  log from P4 should be replayable on the P7 system.

**Value at P4**: large organizations can deploy Fabrica. Thousands
of users, thousands of rooms, still one instance, still one org.

**Rough scope**: ~8–12 weeks. Event sourcing is the biggest lift.
Sharding is conceptually clean.

**Climb-ready criteria**:
- Load-tested at 10,000 rooms × 1,000 concurrent users × 10K
  signals/sec aggregate without degradation
- Any shard can fail and another takes over within 30s (basic HA)
- Event replay reconstructs identical state
- Cross-shard signal latency p99 under 100ms
- Attenuation verified: S3-level bus < 1% of S1-level
- All prior invariants hold

**Breathe here**. At this point Fabrica can serve a major
organization. Let one do so. Gather operational scars before
federating.

---

### Plateau 5 — Federation

**Target deliverable**: multiple independent Fabrica deployments can
interoperate. A cooperative federation can model itself across
member organizations, each running their own instance.

**What's new**:
- **Federation protocol**: mTLS between Fabrica nodes. Signed
  manifests for document federation. Trust-verified signal routing.
- **Cross-node signal bridge**: each node declares what it exports
  and what it imports. Bridges respect those declarations.
- **Document federation**: policies can be cited cross-node without
  being copied. Signed references resolve to the source of truth.
- **Federation governance**: each node decides which peers it trusts
  and what it accepts from them. Revocation protocol for peers who
  go rogue.
- **Recursive VSM made explicit**: a node participating as a
  "child" in a federation shows up as an operation in the parent
  federation's tree. Navigate into it and you're navigating into
  another whole Fabrica.
- **Offline-capable operation**: federated nodes keep working when
  the federation is partitioned. Sync on reconnect.

**Architectural guardrails**:
- Federation is per-node decision. No central registry required.
  Any two nodes that trust each other can federate.
- Don't build a blockchain. Document federation uses signed
  manifests and hash references. Cryptographic, not distributed-
  consensus.
- Respect sovereignty at every hop. A signal going across nodes
  may need to be attenuated or transformed at the border for data
  protection reasons. The bridge is a first-class transformation
  point.
- The protocol is the sovereignty. If we design the protocol
  correctly, forking is a feature, not a threat.

**Value at P5**: first real cooperative-federation deployment.
Unions, sectoral associations, federations of municipalities. This
is where Fabrica starts to look like the infrastructure for something
bigger than any single org.

**Rough scope**: ~10–16 weeks. Federation protocol design is a
significant chunk. Per-node governance is fiddly.

**Climb-ready criteria**:
- Three independent Fabrica nodes interoperate correctly over real
  networks
- Document federation works: a policy cited in node A resolves
  correctly when referenced from node B
- Partition tolerance: disconnect any node; the other two keep
  working; reconnect and they sync without data loss
- A peer revocation has been exercised (deliberately cut off a
  compromised node; verify all others ignore its signals)
- First real cooperative federation uses it
- All prior invariants hold

**Breathe here.** Federation is a major inflection. Time to let
real multi-org dynamics play out before scaling to regions.

---

### Plateau 6 — Sovereign multi-region

**Target deliverable**: Fabrica deployed regionally (initially
in Chile). Compliant with national data protection law.
Audit-log-chained and cross-replicated. Regulatorily procurable.
First sectoral pilot (healthcare, education, or cooperative sector)
in production.

**What's new**:
- **Regional shards**: Chile divided into North / Center / South
  regions. Each runs its own shard cluster. National shard in
  Santiago with DR to a second Chilean location.
- **Cross-border DR**: replica in Argentina or Brazil for
  worst-case recovery only. Normal operations stay in-country.
- **Cryptographically chained audit log**: hash-chained,
  cross-replicated across ≥3 regions. Tamper-evident.
- **Regulatory compliance**: Chilean Ley 19.628 (data protection),
  sectoral regulations for the pilot's domain. SOC 2 Type II in
  progress. Hippocratic License enforced.
- **Registro Civil integration**: citizens authenticate via national
  IdP where appropriate. Firms via their own IdPs.
- **Pseudonymous participation** for privacy-sensitive paths
  (grievances, whistleblowing). Identity-blinding where legally
  permitted.
- **Sovereignty hardening**: open source, auditable, no backdoors,
  no single-admin override that isn't logged and reviewable.
- **First sectoral pilot**: one sector (likely a worker-cooperative
  federation, a healthcare network, or a municipal pilot) operating
  Fabrica as organizational infrastructure.

**Architectural guardrails**:
- Sovereignty is a hard constraint, not a preference. Primary
  infrastructure stays in Chile. No data leaves the country under
  normal operation.
- Audit log is non-negotiable. Every mutation cryptographically
  chained. Rewriting history detectable by any participant.
- No single key — not ours, not the operator's, not the state's —
  that can silently override. Everything is logged, everything is
  reviewable.
- Regulatory work is political work. Engineering alone cannot clear
  it. Budget time for legal, policy, and partnership work — it can
  easily match engineering time.

**Value at P6**: Fabrica is procurable by governments,
cooperatives, and regulated industries. First real-world stakes.
Ready to operate critical infrastructure for a sector.

**Rough scope**: ~12–24 months. Regulatory work dominates.
Engineering is significant but not the critical path after about
month 6.

**Climb-ready criteria**:
- SOC 2 Type II or equivalent certification
- Chilean Ley 19.628 compliance audited
- Pilot sector has been operating Fabrica in production for ≥6
  months without major incident
- Audit log has been verified tamper-evident by independent auditor
- Disaster recovery drill passed: lose a region, recover within SLA
- Cryptographic chain verified by third party
- Registro Civil integration (or equivalent) live
- All prior invariants hold

**Breathe here** — possibly for a long time. P6 is the end of
"engineering-led climb" and the beginning of "political-led climb."
Partnerships, public trust, regulatory standing matter as much as
code.

---

### Plateau 7 — Cybersyn-class

**Target deliverable**: Fabrica at the scale of a national managed
economy. Millions of users, millions of rooms, tens of millions of
processors, peak signal rates in the 10-100M/sec range. The system
governs itself via its own abstractions. Recognized as civic
infrastructure.

**What's new**:
- **Firecracker microVMs / V8 isolates** for ephemeral agent
  execution at scale. Scale-to-zero.
- **Kafka cross-shard backbone**: millions of rooms, attenuation-
  aware signal routing across a continent of shards.
- **Open-weight LLM infrastructure**: sovereign model serving.
  Commercial API fallback for capability we can't self-host.
- **Governance-of-the-system** via Fabrica's own parliamentary
  processors. Schema changes, shard boundary moves, code
  deployments all go through audited motions. Eating our own
  dogfood at civic scale.
- **Elected technical committee**. No single operator override.
- **Observability as civic transparency**: citizens have read
  access to aggregated metrics of their sector. Workers have read
  access to their firm's metrics. Transparency by design.
- **Historical continuity**: relationship with Beer's papers,
  Medina's archives, original Cybersyn artifacts. Design language
  carries forward lessons.
- **Multi-language authoring**: Spanish-first internally,
  Mapudungun for indigenous participation, English for
  international contributors.

**Architectural guardrails**:
- Everything in P7 depends on the discipline of P0-P6. One missed
  invariant at any prior plateau and P7 is blocked.
- The attenuation insight is what makes the math work. If a
  deployment ever has to scale the bus itself rather than attenuate,
  something is architecturally wrong — the topology isn't being used
  correctly. Fix the model, not the infrastructure.
- Governance-of-the-system means we (the builders) become subject
  to the same accountability as everyone else. No developer
  override of governance decisions.
- Political resilience is architectural. Federation + open protocol
  + distributed authority + code sovereignty = a system that
  survives attempts to seize it.

**Value at P7**: the system the original Cybersyn team was building
toward, with forty years of learning. Organizational cybernetics at
national scale, democratically governed, sovereign by design.

**Rough scope**: years. Not a project timeline. A generational
effort.

**Stable criteria** (not "climb-ready" — this is the top):
- Serving a real managed economy (or significant fraction thereof)
- Governance of the system works: schema changes have actually been
  voted through; emergency deploys have actually been retroactively
  reviewed; a technical committee has been elected and rotated
- Federation includes cross-border partners (South American
  cooperation)
- Open contributions from outside the core team exceed core-team
  contributions
- Historical record: Cybersyn 1's lessons consciously inform
  Cybersyn 2 at documented decision points

---

## Part III — Invariants we carry forward

These must not be violated at any plateau transition. Violating one
either blocks a future plateau or opens a trap door that collapses
a prior one.

### Core invariants (never violate)

1. **The domain layer is framework-free.** `tree/`, `signals/` (minus
   two named React edges), `agent/` have no React, no DOM, no
   browser assumptions. Required for REPL, required for server-side
   processors, required for every future UI and every future scale.

2. **The transport seam is the bus.** All channel names constructed
   via helpers in `bus.js`. Protocols swap behind that seam.
   Required for P4 Redis, P5 federation, P6 multi-region.

3. **The agent API is the sole mutation surface.** Every human and
   AI action flows through `createAgentAPI`. Required for audit
   log (P1+), for undo (any plateau), for websocket wire protocol
   (P1+), for governance-over-time (P7).

4. **Terminals drive both rendering and wiring.** Single source of
   truth for the VSM topology. A visible cable IS a real
   subscription. Required for plugin authors not to maintain two
   definitions. Required for self-documentation.

5. **Signal shape carries its own audit trail.** `trace[]` +
   `hops[]` + `delivered[]` + `tags[]` + `timestamp`. Required for
   P6 audit, for P7 observability, for every cross-plateau debug.

6. **Every cable is bidirectional.** If A can talk to B, B can talk
   to A. Edges defined from both sides. Symmetry checked by test.
   Required for federation (each side trusts equally), for
   governance (no one-way authority channels).

7. **Attenuation is the scaling strategy.** Aggregate at the
   correct S2/S3/S4 level, not at the bus. Required for P4, P5, P7.
   If we ever scale the bus itself beyond what VSM predicts, the
   model is wrong; fix the model.

### New invariants introduced at specific plateaus

| Plateau | New invariant |
|---|---|
| P1 | Persistence via event log (not just snapshots, eventually) |
| P2 | Plugin contract is stable within a major version |
| P3 | Signal lineage is always preserved (document → approval → motion → votes traceable) |
| P4 | Shard boundaries align with VSM recursion, not load |
| P5 | Federation is per-node decision; no central registry |
| P6 | No single-admin override that isn't logged and reviewable |
| P7 | System governance goes through system's own processors |

Each of these becomes a test, a lint rule, or a review-checklist
item from the moment of introduction.

---

## Part IV — Traps to avoid at each transition

Failure modes that would block or complicate the next climb.

### P0 → P1 traps

- **Building server-side logic that bypasses the agent API.** Server
  must forward through `createAgentAPI`, not construct its own
  mutation paths. If even one mutation doesn't go through, audit
  log + undo + replay all break.
- **Picking an auth stack that doesn't federate.** Internal passwords
  block IdP integration later. IdP-only from day one.
- **Baking in single-tenant assumptions.** Data model must include
  `orgId` everywhere from the start, even if there's only one org.
- **Over-sanitizing the signal bus.** If every cross-user signal
  goes through a queue for "safety," latency kills real-time UX.
  Trust the bus; audit the mutations.

### P1 → P2 traps

- **Extracting before the contract is clear.** If extraction forces
  contract-shape decisions that weren't clear, don't paper over —
  redesign the contract. The extracted form IS the contract.
- **Shipping a "marketplace" without verification.** If any
  processor can install, one malicious processor contaminates every
  deployment. Start with trusted-only, build verification tier
  before opening.
- **Overbuilding the sandbox.** Web Workers + iframe sandbox is
  appropriate for P5+. For P2, trust model + manifest is enough
  and prevents yaks from being shaved.

### P2 → P3 traps

- **Building parliamentary as a one-off feature.** It must be a
  processor like any other. If it requires core changes, that's
  feedback about the contract, not a "special case."
- **Coupling documents to the tree.** Documents are a sibling
  sub-system. If a document becomes "a node with special behavior,"
  the abstraction collapses.
- **Ad-hoc LLM integration.** Every agent should declare its model
  + externalRequests. No hidden calls. No shared mutable global
  state between agents.

### P3 → P4 traps

- **Sharding by user or by org.** Either of those loses the
  attenuation advantage. Shard by subtree, always.
- **Snapshotting instead of event-sourcing at this scale.** Snapshot
  persistence saves time in P1 but becomes a disaster at thousands
  of rooms. Event log from P4 onward.
- **Letting cross-shard signal volume grow quadratically.** If
  subtrees aren't attenuating correctly, S3+ traffic blows up.
  Build alerts for "attenuation ratio below threshold."

### P4 → P5 traps

- **A central federation registry.** Once "federation" requires a
  central authority, the protocol is no longer the sovereignty.
  Peer-to-peer or don't bother.
- **Inconsistent federation schemas.** If node A's processors don't
  parse node B's signals, federation is broken. Schema is part of
  the protocol.
- **Trust without revocation.** Peer revocation must work before
  federation ships. First compromised node otherwise poisons the
  whole federation.

### P5 → P6 traps

- **Engineering-only thinking.** P6 requires lawyers, partners,
  operators, policy. If engineering drives P6, P6 doesn't land.
- **Letting the audit log become optional.** Once there's a way to
  bypass it ("just for this migration," "just for ops"), SOC 2 is
  gone and so is the whole tamper-evident story.
- **Single admin override.** If operators can silently reach in,
  political resilience is broken. Everything through the agent API
  with audit, period.

### P6 → P7 traps

- **Treating governance as a feature instead of a constraint.** At
  P7, governance is how decisions get made about the system itself.
  Developers are subject to it. No exemption.
- **Coupling to proprietary vendors.** Any dependency that could
  be withdrawn by a foreign state or corporation is a seizure
  vector. Open weights, open protocols, open infra.
- **Centralizing for "consistency."** A single source of truth at
  national scale is a single point of failure. Federation all the
  way up.

---

## Part V — Breathing discipline

Between each plateau, **slow down deliberately**. The pressure to
rush to the next level is strongest right after shipping the current
one — feedback is sparse, ambition is hot. Resist.

### Criteria for "breathe here" (min. stay per plateau):

- P0 → P1: **1 month** of real single-user usage before planning P1
- P1 → P2: **3 months** of real multi-user usage from ≥3 orgs
- P2 → P3: **6 months** of plugin ecosystem activity — at least 5
  non-core processors in regular use by real deployments
- P3 → P4: **9 months** of real governance usage — at least 20
  meetings that produced real policy changes across ≥3 organizations
- P4 → P5: **12 months** at multi-shard scale, load-tested in
  anger, at least 1 major production deployment
- P5 → P6: **18+ months** of federation in production, including
  at least one demonstrated peer revocation
- P6 → P7: **years**. P7 is a generational target. P6 can operate
  indefinitely.

### What "breathe" actually means:

- Stop adding features. Close the backlog of the prior plateau
  before opening the next.
- Talk to users. Real users, operating real deployments. What do
  they wish they had? What surprised them? What hurts?
- Document learned patterns. The stuff that worked. The things that
  didn't. Future plateau decisions need this record.
- Update DEBT.md and the invariants list. Some invariants will
  need refinement based on lived experience.
- Run the audit cycle (CQRS / architecture / WCAG) before climbing.
  The 2026-04-23 audit is the template. Each climb starts from a
  clean baseline.

### When NOT to breathe (legitimately climb faster):

- If a security incident demands it (patch + harden → maybe skip
  a plateau's breathing)
- If a real deployment partner with funded timeline drives it (their
  needs justify the pace)
- Otherwise: breathe.

---

## Summary

| Plateau | What it is | Months of effort | Serves |
|---|---|---|---|
| P0 | Personal VSM tool | 0 (here) | practitioners, researchers, students |
| P1 | Server-backed single-org | 1-2 | small teams, consulting clients |
| P2 | Plugin ecosystem | 1-1.5 | extensibility, ecosystem growth |
| P3 | Documents + parliamentary | 2-3 | co-ops, boards, worker assemblies |
| P4 | Multi-shard | 2-3 | large organizations |
| P5 | Federation | 3-4 | cooperative federations, unions |
| P6 | Sovereign multi-region | 12-24 | sectoral civic infrastructure |
| P7 | Cybersyn-class | years | national managed economy |

Cumulative: **realistic 4-6 years** to reach P6 with one engineer +
partnerships; **P7 is open-ended**.

Every plateau is a shippable, breathable place. None need to be
skipped, and skipping any is likely the trap that collapses the
later climb.

*The protocol is the sovereignty, not the deployment.
The attenuation is the scaling, not the bus.
The agent API is the mutation surface, not the UI.
The breathing is the discipline, not the pace.*

---

*Roadmap. Not a committed plan. Revise as the journey teaches.*
