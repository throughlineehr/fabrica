# Fabrica — architectural notes, next chunk

Design notes for the next architectural wave. Nothing committed yet.
Intended as a place to return to when ready to make decisions.

Covers four entangled threads:

1. **Plugin contract for processors** — what do processor authors
   (and AIs) build against?
2. **Processors subsume agents** — the unifying move that came out of
   the parliamentary-processor design conversation.
3. **Front-end vs back-end split** — where does each piece run in a
   multi-user world?
4. **Three new first-class entities** — documents, users, and a
   clearer actor model.

Written after the 2026-04-23 audit so the CQRS surface is already
clean and the signal system is provably framework-free (see
`SIGNALS.md`, the REPL in `scripts/repl.js`, and
`AUDIT-2026-04-23.md`).

---

## 1. The unifying reframe: processors ARE agents

The big shift. Earlier drafts of this doc treated agents as a
separate concept that processors might consume as "tools." That's
wrong. **Every agent is a processor**, just one whose `create()`
wraps an LLM invocation instead of (or alongside) deterministic
logic. The processor contract subsumes:

- **Transform processors** — heartbeat, tracer, logger. Deterministic.
  No LLM. Runs on data.
- **Agent processors** — librarian, document-writer, motion-classifier.
  LLM-backed. Has a prompt, tools, responsibilities.
- **Human-room processors** — parliamentary, desk, vote. Multi-user
  session UI. Humans as participants; optionally agents-as-participants.
- **Orchestrator processors** — scheduling, routing. Don't produce
  content themselves; coordinate others.

One abstraction, one distribution story, one way for the plugin
ecosystem to grow.

---

## 2. The plugin contract, integrated

```js
{
  // Identity
  id: 'tracer',
  name: 'Tracer',
  description: 'Stamps signals with this room and timestamp.',
  version: '1.2.0',
  author: { name, url, license },
  repository: 'https://…',

  // Kind — the big shape selector
  kind: 'transform' | 'agent' | 'human-room' | 'orchestrator',

  // Contract — what it consumes and produces
  inputs:  [{ types: ['metric', 'event', 'narrative', 'alert'], tags: [...] }],
  outputs: [{ types: [...], tags: [...] }],
  placement: 'any' | ['s3', 's4'],
  suggestedSystems: ['s3'],

  // Defaults
  defaultConfig:  { /* operational knobs */ },
  defaultFilters: { types: null, tags: null, inputTerminals: null, outputTerminals: null },

  // Runtime — where create() executes
  runtime: 'server' | 'client' | 'either',

  // For kind === 'agent':
  agent: {
    prompt: '…',                     // system prompt
    tools: [
      { name: 'search_docs', processor: '@fabrica/doc-search' },
      { name: 'write_doc',   processor: '@fabrica/doc-store' },
      // Each tool resolves to a processor. The host runtime decides
      // whether to route via the signal bus (auditable, slower) or
      // via direct in-process call (fast, still logged synthetically
      // for audit). See §4.
    ],
    responsibilities: [              // declared duties, not just prose
      'maintain the policy document at this level',
      'refer other agents to relevant documents',
    ],
    model: 'claude-haiku-4-5',       // default, operator-overridable
    lifecycle: 'ephemeral' | 'persistent', // see §3
  },

  // For kind === 'human-room':
  room: {
    mode: 'desk' | 'vote' | 'discussion' | 'parliament',
    positions: [
      { id: 'chair',  assignment: 'elected' | 'sortition' | 'appointed' | 'any' },
      { id: 'member', assignment: 'any' },
    ],
    rules: 'rustys-rules' | 'simple-majority' | 'consensus' | null,
    transcribed: true,               // persists a transcript as signals
  },

  // Long-lived state the processor needs persisted — rooms need this.
  // Transform processors typically don't.
  stateSchema: {
    docket:        'array of motions',
    activeMotion:  'current motion or null',
    transcript:    'array of entries',
  },

  // Same shape. Runtime provides bus, tools, state get/set, llm invoke,
  // publish-to-user, publish-to-room.
  create(config, runtime) { return { start(), stop() } },

  // UI — React component for the detail view (always client-side)
  DetailView,
  detailViewProps: { instance, bus, onUpdateConfig, onClose },

  // Localization — processor ships its own i18n namespace
  i18n: { en: {…}, es: {…}, … },

  // Self-declared compliance (transparency, not enforcement)
  compliance: {
    wcag: 'AA' | 'AAA' | 'none',
    bundleSizeKb,
    externalRequests: ['openai.com'],
  },
}
```

### Tiers

- **Required for any processor**: contract shape, `create/start/stop`
  semantics, i18n structure (even if only English is provided),
  network manifest declared (`compliance.externalRequests`).
- **Required for "Fabrica Verified"**: WCAG 2.1 AA on `DetailView`
  (tested with axe-core), matches Swiss style tokens, ≥80% test
  coverage, an audit review.
- **Advisory otherwise**: non-verified processors show a "community"
  badge in the library picker; users self-select.

### Distribution

Three viable models:

1. **npm packages** (`@fabrica/processor-tracer`,
   `@acme/processor-foo`). Easy tooling, hard for non-devs.
   Best for v1.
2. **Registry + dynamic `import()` from CDN**. A "processor store."
   Bigger infra ask (registry, signing, moderation) but huge UX
   win for operators.
3. **Monorepo `processors/` folder with PR gate**. Simplest; scales
   to dozens but not thousands.

**Path**: start with npm + `processors/core/` folder for the three
built-ins. Add a registry when a third party wants to ship a
processor without touching this repo.

### Spec-driven AI authoring

Write `PROCESSOR-SPEC.md` with:
- Precise contract (JSON Schema for metadata, TypeScript for runtime)
- Reference implementations for each `kind` (heartbeat for transform,
  librarian for agent, parliamentary for human-room)
- Review checklist (a11y, i18n, contract correctness, safety)
- Prompt template: "Given this contract and one of the `kind` values,
  write a processor that does X"

With that in hand, an AI can one-shot a passable processor. A human
reviewer verifies in 15 minutes.

### Minimal first step

Extract the three core processors from `src/signals/library.js` into
`processors/core/{heartbeat,tracer,logger}/` as self-contained
folders with `index.js` + `DetailView.jsx` + `i18n.js`. The contract
interface is whatever falls out of that refactor. If all three
extract cleanly, the spec is real.

---

## 3. Agent lifecycle

Two modes worth naming:

- **Ephemeral (default)**. Wake up per message, fresh LLM context
  each time. No conversation memory — each input signal is a
  self-contained request. Many agents = many processors, each with
  its own subscription, parallel by default.
- **Persistent**. Maintains conversation history, learned state,
  cached retrievals. Declared via `stateSchema` + `agent.lifecycle:
  'persistent'`. Runtime persists state across message handlings.

Most agents should be ephemeral. A library that recommends specific
docs doesn't need memory of what it recommended last time —
information is in the bus, in the documents, in the tree. Persistent
is for specific cases (ongoing facilitator following a meeting from
start to end).

---

## 4. Tools — tools ARE processors

The earlier draft treated tools as a separate system (global tools,
shared state). That's wrong too. **Tools are processors; direct-call
is an optimization the runtime applies.**

The agent author declares tools abstractly:

```js
agent.tools = [
  { name: 'search_docs', processor: '@fabrica/doc-search' },
  { name: 'write_doc',   processor: '@fabrica/doc-store' },
]
```

The host resolves each tool to a live processor instance. Invocation
semantics are two-phase:

- **Signal round-trip (default)**: tool call publishes a request
  signal on the tool's input channel; agent awaits a response
  signal. Fully auditable — every tool use leaves a bus trail.
- **Direct binding (optimization)**: if the tool's processor is
  co-located in the same host process, the runtime can swap in a
  function call. Microsecond latency. Runtime wraps it with a
  synthetic audit-log entry so the trail is preserved.

Contract-level: the agent doesn't know or care. "Here's the tool,
here's its contract." The host binds appropriately.

What this earns:

- **Composability by default** — any processor can be used as a tool.
- **Auditability always on** — direct-binding synthesizes audit events.
- **Stateful tools are just stateful processors** — a rate limiter
  is a processor that remembers recent calls. A cache is a processor
  with a map. No special global-tool-state concept.
- **One distribution story** — ship a processor, some are designed
  to be used as tools.

"Truly global" things (telemetry, authentication context, `now()`)
aren't tools — they're ambient runtime properties passed in the
`runtime` argument alongside `bus`.

---

## 5. Decision-room taxonomy

Human-room processors come in shapes that deserve naming:

- **Desk** — single position, authoritative for scope. Position can be
  held by a human, an agent, or either (configurable per deployment).
  Used for "make a call and write it down."
- **Vote** — multi-participant, structured rules (Rusty's Rules,
  simple majority, consensus). Output: a decision + transcript +
  (if accepted) a policy diff.
- **Discussion** — open multi-participant conversation. Might produce
  a motion that gets tabled to a Vote room elsewhere.
- **Parliament / Congress** — composite. A tree of linked rooms with
  escalation, referral, amendment flows.

All share the `kind: 'human-room'` contract. Differ in `room.mode`,
`room.rules`, `room.positions`.

### The parliamentary processor in full

For reference — this is the worked example that forced the
architectural reframe.

**Docket.** Prioritized queue of motions.

**Sources of motions.**
- Signals arriving through S2 or S4 terminals, routed into room
  inputs, filtered by tag (e.g., `tags: ['motion']`).
- Signals from the `s5-parent` or `s5-children` terminals (the
  CRC-style chain in `SIGNALS.md`) — motions escalated up or
  delegated down.

**Motion signal shape.**
```js
{
  type: 'proposal',   // or keep 'narrative' with tags; TBD
  tags: ['motion'],
  content: {
    title, body, mover, priority,
    targetDocumentId,   // what it wants to change
    diff,               // git-diff of the proposed change
    history: [...],     // prior motions this one descends from
  },
}
```

**Scope routing.** "It will land on the S5 whose scope is
appropriate." Probably means: a scope tag on the motion indicates
which S5 in the recursion it belongs to; an orchestrator processor
routes it there.

**Meeting mechanics.**
- Multi-user chat room (video where possible).
- All the buttons for Rusty's Rules: motion, second, amend, table,
  call the question, vote, adjourn.
- Whole session transcribed — each utterance is a signal persisted
  on a transcript channel; finalized into an artifact at close.
- Participants may be humans, agents-as-participants, or both.

**Outcomes.**
- **Tabled** — motion gets routed to another room (same contract,
  `history` field grows).
- **Accepted (vote passes)** — an approval signal goes out carrying
  the policy diff. A separate document-writer agent (also a
  processor) picks it up, applies the diff, emits a
  `document-updated` signal. The librarian agent (yet another
  processor) updates its index.
- **Rejected** — rejection signal, no document change; history
  retained for future related motions.

**The composition pipeline.** This entire flow is processors talking
via signals:

```
[motion-filter]        agent — tag-filters "motion" off incoming terminals
      │ motion signal
      ▼
[parliamentary]        human-room — runs the meeting
      │ approval signal with policy-diff
      ▼
[document-writer]      agent with write_doc tool
      │ emits "document-updated" signal
      ▼
[librarian]            agent — indexes for future retrieval
```

Each processor is small, single-purpose, composable. The pipeline
exists because of the wiring topology, not a hardcoded orchestrator.
This is exactly what the signal plumbing was designed to enable.

**Position assignment** (chair, members). Open question: is
"elected/sortition/appointed" a field on the room processor, or its
own separate position-assignment processor that emits role-binding
signals? The latter is more composable; the former more ergonomic.

---

## 6. Front-end vs back-end split

The parliamentary example is a forcing function. It **cannot** run in
one browser: multi-user state, persistence, audit, secrets in
LLM-backed agents. Multiple pieces of the system now require a
backend. Settles the gating decision:

**Server-by-default for `agent` and `human-room` kinds. Client-only
stays for pure local UI (personal annotations, what-if previews).
`transform` processors are portable (`runtime: 'either'`).**

### What must live on the backend

1. **Model store** — one canonical tree per org.
2. **Bus** — redis pubsub with websockets to clients.
3. **Topology computation** — same code as today; just runs server-side.
4. **Processor instances owned by rooms** — storage + runtime. Heartbeats
   keep ticking after the browser closes.
5. **Agent API** — the authoritative one. Mutations go here.
   Commands serialize over websocket. Audit log at this boundary.
6. **Secrets-holding processors** — LLM keys, private endpoints.
7. **Audit log** — SOC 2 / StateRAMP immutable trail.
8. **User identity + permissions** — auth, RBAC, session.
9. **Document store** — see §8.

### The room-as-actor mapping

```
Room (nodeId, systemKey)
├── inbox           queue of incoming signals
├── processors[]    instances bound to this room (transform/agent/human-room)
├── subscribers[]   other rooms + live UI viewers + users
└── outbox          publishes → forwarders → other rooms, to users, to docs
```

The full actor list isn't just `{ rooms, processors }` anymore. It's
`{ rooms, processors, users, documents }`. Each is a first-class
entity with state, subscriptions, and operations. The signal bus
remains the uniform wire between all of them.

For v1 hosted: one Node process with `Map<roomKey, Room>`. Scales to
thousands of rooms. Heavy processors (LLMs) need a queue + worker
pool when the time comes.

### Client-side agent API shim

Still one API, but split by location:
- **Server agent API** — authoritative. Audit log at this boundary.
- **Client agent API shim** — same shape, forwards to server over
  websocket. UI can't tell the difference. Local-only UI state
  (panel open/closed) stays local.

The REPL and a hypothetical TUI keep working — they connect to the
server's agent API over websocket instead of instantiating locally.
In dev mode the in-process version stays for fast iteration.

### Sandboxing 3rd-party code

1. **Trust model** (like npm). Document risks. Fast to ship.
2. **Static manifest of allowed hosts** (`externalRequests: […]`)
   enforced via CSP. Medium friction, real defense.
3. **Web Worker sandbox** for `create()`, postMessage for runtime.
   UI components need iframe sandbox. Heaviest, safest.

**Path**: v1 is trust + manifest disclosure; graduate to Workers for
hosted SaaS when threat model demands.

---

## 7. Users are first-class

Users don't exist in today's model. Adding Users is on par with
adding Documents — it's a major addition, not a decoration.

### Users as actors

A user is a signal-bus citizen, kin to a room, a processor, an agent:

- **Subscribes to rooms** (like any other subscriber — rooms subscribe
  to rooms via terminals; users subscribe to rooms via… the same
  mechanism).
- **Receives signals** from rooms they're subscribed to, and from
  user-addressed channels (`user:${userId}:inbox`).
- **Emits signals** — actions in rooms they participate in (vote,
  motion, chat).
- **Can be affected by processors** — a vote result can change role
  bindings (a "membership processor" mediates; the vote itself
  doesn't know about user tables).

### View configuration

Per-user (and probably per-org-per-user). Shapes an operator might want:

- **Full app** — normal multi-panel experience (current UI).
- **Single-processor** — worker sees only their assigned desk / vote /
  chat room. That's the entire app for them.
- **Role-scoped** — sees every room tagged with their role (e.g.,
  all S3s they're a member of).

This is rendering policy, not deep infrastructure. The server knows
the user's subscriptions + config; the client decorates accordingly.

### Permissions

RBAC on rooms and on processor operations:
- Who can see room X
- Who can propose a motion
- Who can chair a meeting
- Who can invoke a given tool

Server-enforced. Client can't be trusted. This is where
SSO / SAML / OIDC plumbing lands — auth upfront, role claims on
the token, server translates to permissions.

### Scope note

The processor contract **doesn't** try to model users, auth, or
permissions directly. Those are runtime concerns the host deals
with. A processor can declare which user roles can interact with
it ("only chairs can call-the-question"), but user management
itself is the host's job. Processors are about **data flow and
transformation**; the host provides **identity, authorization, and
distribution**.

---

## 8. Documents are first-class

The parliamentary processor writes **policy documents**. Those aren't
tree nodes, aren't signals, aren't processor state. A new sub-system:

**Document store.** Policies, charters, procedures, constitutions.
- Keyed by `(scope, topic)` where scope maps to VSM recursion depth
  (root-S5 owns the corporate constitution; sub-S5s own division
  charters; etc.)
- Versioned (git-diff semantics).
- ACL'd (not all users see all documents).
- Change proposals submitted as diffs; applied atomically on approval.

**Signal contract touches documents via references, not by inlining**:
- Motion signal carries `targetDocumentId` + proposed diff.
- Approval signal carries `documentId` + final diff.
- Document-updated signal fires when a diff is applied, carrying the
  new version hash.

**Implementation path**: Postgres tables for v1
(`documents`, `document_versions`, `document_acl`). Emit
change-events via the bus. Later: object store for binaries,
a git-backed history if we want real diff/blame/merge.

---

## 9. Phased migration

No big-bang. Each phase unlocks capability; domain code barely
changes:

1. **Now** — everything client-side. No blockers to feature work.
2. **Phase 1** — extract a `server-state/` shim with the narrow
   interface `{ getModel, setModel, getProcessors, setProcessors }`.
   Today backed by React state; tomorrow backed by a backend
   over websocket. Nothing else changes.
3. **Phase 2** — websocket + server state storage (Postgres row =
   tree + processors snapshot). Single Node process, in-memory bus.
   Processors run server-side. Authentication lands. **Users and
   permissions arrive.** Real multi-user.
4. **Phase 3** — Redis pubsub for the bus. Multi-process scale.
   LLM/heavy-processor worker pool.
5. **Phase 4** — Plugin contract with the `runtime`/`kind`
   dimensions, CDN distribution, signed packages, trust tiers.
6. **Phase 5** — Document store + parliamentary processor.
   Depends on Phase 2 (persistence) + Phase 4 (agent processors).
7. **Phase 6+ — Cybersyn-class scale.** Everything in §§10-16 below.
   Shard-per-subtree, federated bus, tamper-evident audit, multi-region,
   governance-of-the-system. Not reached by incremental continuation —
   a deliberate architectural step.

Phases 1–2 are the hard call — that's where front/back actually
splits. Phases 3–5 are continuations that don't change the model.
Phase 6+ is a new architectural wave, designed toward but not
landed without a conscious commitment.

---

## 10. Scale target: Cybersyn 2026

The ambition. Not hyperbole — architectural planning needs a target,
and the target is **a VSM for the entire managed economy of Chile**.
We plan toward it from the start so we don't design ourselves into
a corner that blocks it.

### Back-of-envelope at full scale

- ~20M citizens; ~800k registered firms; several million economically
  active humans touching the system
- Aggregation: firms → sectors/regions → provinces → national. ~6-8
  VSM recursion levels
- **Rooms** (management units × systems): low millions
- **Processors** (agents + transforms + human rooms): low tens of
  millions at saturation
- **Signal rate**: low millions/sec at floor; peaks of 10-100M/sec
  with rich telemetry (IoT, POS, logistics, production lines)
- **Users online simultaneously**: low millions at peak hours
- **Storage**: petabytes across decades of transcripts, documents,
  audit logs
- **Latency budget**: sub-second p99 for user-facing actions, video
  for parliamentary sessions
- **Reliability**: national infrastructure, multi-region, 9s of
  uptime, tamper-evident audit

### The insight that makes the numbers work: VSM attenuates

Most "scale a pubsub to 100M msgs/sec" architectures fail because
they flatten the topology. **VSM is not flat — attenuation is built
into the model.**

- S2 regulates variety among S1 operations. Its literal job is to
  **reduce** the signal volume going up.
- S3 sees filtered, summarized input from S2 — not every S1 event.
- S4 sees less still — only trend/pattern/anomaly-worthy signals.
- S5 sees the smallest volume — only policy-relevant signals.

Applied here: **signal volume decreases exponentially up the tree.**
If 800k firms each emit 100 signals/sec at S1, by the time anything
reaches national S5 it's a handful per minute. Attenuators (S2
processors, aggregators, agents) do the reduction locally.

**The naive "100M msgs/sec global bus" problem never exists if the
topology is used correctly.** The bus needs to be fast within a
subtree. Cross-subtree traffic is tiny by construction.

**Scaling strategy**: partition by subtree. Not by anything else.

---

## 11. Sharding by subtree, bus topology

- **Shard = a subtree.** A Kubernetes namespace (or a small cluster)
  that owns one management unit and all descendants to the next
  shard boundary.
- **Shard boundaries are chosen by topology**, not by load balancer.
  Natural recursion levels: firm-shard (thousands of firms),
  sector-shard (tens of sectors), regional-shard (Chilean regiones),
  national-shard (one).
- **Moving a shard boundary is rare** and goes through a governance
  motion (§15).
- **Each shard runs**: its own bus (Redis or NATS), its own Postgres,
  its own processor scheduler, its own document cache.
- **Inter-shard backbone**: a low-volume topic for cross-shard signals
  (escalations, policy broadcasts). Kafka or similar — append-only,
  durable, replayable. The audit trail falls out of this for free.

### The bus, re-imagined

- **Within-shard**: Redis pubsub or NATS. Microsecond latency. No
  durable persistence needed — per-shard Postgres is the durable
  truth for room state.
- **Cross-shard**: Kafka log. Tens-of-ms latency, durable, replayable.
- The **transport seam** in `bus.js` stays the same contract. Runtime
  picks the backend based on signal scope. Our existing `hops[]`
  machinery generalizes — a signal with `hops: [shard-A, shard-B]`
  went across the backbone.
- **Wire format** for cross-shard: protobuf or CBOR over Kafka.
  Content-addressed for dedupe.

---

## 12. Execution and storage

### Processor execution

- **Ephemeral agents (default)**: Firecracker microVMs or V8 isolates,
  one per invocation. Scale to zero. Cheap. Sandboxed. Great fit for
  "wake up per message."
- **Persistent agents**: containers per instance, scheduled on the
  shard owning their room. Resource-accounted (CPU, memory, LLM
  calls/sec, tokens/sec).
- **Human-room processors**: longer-lived containers with stateful
  connections (WebRTC, websockets). Co-located with the room's shard.
- **LLM infrastructure**: per-shard cache of open-weight models
  (sovereign) + metered access to commercial APIs for fallback and
  capability we can't self-host yet. Failover across providers.
  Per-shard GPU pool — small shards share, big shards own.

### Storage, split by access pattern

| Tier | Contents | Backing | Retention |
|---|---|---|---|
| Hot | Active room state, in-flight signals | Per-shard in-memory + Redis | Seconds |
| Warm | Recent transcripts, document versions, last-N-days of signals | Per-shard Postgres + read replicas | Days to weeks |
| Cold | Archive, indexed search | Regional S3-compatible object store + OpenSearch | Years to indefinite |
| Immutable | Audit log | Hash-chained append-only log, cross-replicated across ≥3 regions | Forever |

The immutable audit log is non-negotiable for SOC 2, StateRAMP, and
the political context. Any mutation is detectable. No one — not
operators, not the government, not us — can rewrite history without
every participant noticing.

### Geographic layout

Chile is 4,300 km long. Latency matters.
- **Regional shards** — at least three (North: Antofagasta; Center:
  Santiago; South: Concepción or Temuco). Each serves its region's
  subtree.
- **National shard** — Santiago, replicated to a second Chilean
  location for DR.
- **Cross-border DR replica** (Argentina, Brazil, or Uruguay) for
  worst-case recovery only. Data stays in Chilean jurisdiction
  under normal operations.

---

## 13. Identity, permissions, sovereignty

### Identity federation

- **Citizen identity** via Chile's national Registro Civil (or
  equivalent IdP). OIDC claim-based.
- **Firm identity** via their own IdP (SAML/OIDC, SSO).
- **Worker participation**: claims link citizen → firms/roles. A
  worker at Firm X has a claim granting access to Firm X's rooms.
- **Pseudonymous participation** for privacy-sensitive paths
  (grievances, whistleblowing). Identity-blinding layer where
  legally permitted.

### Permissions

- **RBAC** with role inheritance. Compiled to compact forms (bloom
  filters, capability tokens) so "can user X vote in room Y" is a
  microsecond check.
- **Server-enforced**, always. Client cannot be trusted.
- **Session caching at the edge** (Cloudflare-style workers or a
  sovereign equivalent) for read-heavy hot paths.

### Sovereignty as a hard constraint

- **Infrastructure inside Chile** for primary operation. Cross-border
  replicas for DR only.
- **Open source**, auditable, Hippocratic-licensed (already committed
  in `COMPLIANCE-ROADMAP.md`).
- **No backdoors. No single-admin override that isn't logged and
  reviewable.** Not for us, not for operators, not for the state.
- **Open protocol** — any group can run their own Fabrica and
  interoperate. **The protocol is the sovereignty, not the
  deployment.** If the national instance is ever compromised,
  regional instances keep running and reconnect later.

---

## 14. Federated by default

The biggest architectural call inside Phase 6+. Instead of one giant
central Fabrica deployment, each shard is an **autonomous Fabrica
node** that federates with others.

- No single point of failure.
- Groups can run their own instances — a cooperative, a municipality,
  a sector — and federate when ready.
- Graceful degradation if parts of the federation go offline.
- Cross-border or cross-organization interop later is just another
  federation link.
- **Matches the VSM's recursive nature** — each management unit IS
  itself a full VSM. Running each as its own Fabrica is architectural
  honesty.

Federation protocol:
- Shared signal schema (already the processor contract)
- mTLS service-to-service between federated nodes
- Cross-node signals go through a trust-verified bridge; each node
  decides what it accepts from which peers
- Documents federate via signed manifests; policies can be cited
  across the federation without being copied

### What this means for the contract

Nothing. The processor contract stays identical. The host runtime
handles whether "emit signal to parent-S5" resolves to a local
in-memory bus, a cross-shard Kafka topic, or a cross-node
federation bridge. Same code, different hosts.

---

## 15. Governance of the system itself

This is where Cybersyn 2026 becomes real, not just technically but
politically.

**The system governs itself with its own abstractions.** Meta-level
processors (vote, desk, parliamentary) live in a dedicated
"governance" S5 and apply to **changing the system**, not just using
it. Eating our own dogfood at civic scale.

What goes through governance motions:
- Schema changes (new signal types, new processor `kind` values)
- Shard boundary movements (adding a region, splitting a sector)
- Code deployments (non-emergency)
- Processor approvals for the verified registry
- Policy document changes at every VSM level
- Emergency procedure invocations (retroactively reviewed)

Principles:
- **Technical committee is elected, not appointed.** Cannot be co-opted
  by a single faction.
- **Open development.** Every PR reviewed by elected reviewers. All
  discussion public (except for legitimate privacy cases, which
  have their own process).
- **Deployment cadence is itself a motion** — how often we ship,
  how we roll out, who gets priority access to new features.
- **No emergency deploy without a distinct procedure + after-the-fact
  review** by the governance body.

Citizens and workers have **observability access** to these
governance processes by default. Transparency is a design
requirement, not a feature.

---

## 16. Political resilience

The original Cybersyn was destroyed by a coup in 1973. The new
system has to be harder to seize.

- **Distributed authority**: no single datacenter, no single
  organization, no single operator holds everything.
- **Federation-ready** (§14): if the national system is compromised,
  regional systems keep running and reconnect later.
- **Open protocol**: any group can run their own Fabrica and
  interoperate. The protocol is the sovereignty.
- **Encrypted at every boundary**: TLS 1.3 + mTLS for service-to-
  service. Pseudonymous worker identity where privacy matters.
- **Cryptographically chained audit log**: tamper-evident,
  cross-replicated. Rewriting history requires compromising every
  participant — effectively impossible.
- **Code sovereignty**: the codebase is open, forkable, runnable
  offline. The state cannot disappear the software.

What we explicitly don't want:
- A single admin key, even held by "us."
- Dependencies on proprietary software that could be withdrawn.
- Cloud providers whose data centers are subject to extraterritorial
  warrant.
- Architectures that require always-on connectivity to a central
  service.

---

## 17. Settled decisions (from this conversation)

- **Processors subsume agents.** One contract, `kind` field selects
  shape. Agents, tools, human rooms, orchestrators, transforms —
  all processors.
- **Tools are processors.** Direct-call is a runtime optimization on
  a signal-round-trip contract. No separate "global tools" concept.
- **Server-by-default** for `agent` and `human-room` kinds.
  `transform` processors stay portable. Client-only for pure local
  UI (annotations, previews).
- **Users, documents, rooms, processors — four first-class actors**
  on the signal bus. Not a hierarchy, not one dominating the others.
- **Ephemeral agents are the default.** Persistent agents declare
  `stateSchema` + `lifecycle: 'persistent'`.
- **The contract doesn't know about users or auth.** Host runtime
  handles identity; processors just know about data flow and
  (at most) declare role-scoped interactions.

---

## 18. Open questions

**Parliamentary-specific:**
- How exactly does "scope routing" work? Tag on the motion indicating
  which S5 in the recursion it belongs to? An orchestrator that
  reads tree + motion and publishes to the right room?
- Is "motion" a new signal `type`, or stays as `narrative`/`proposal`
  with `tags: ['motion']`? Leaning toward the tag approach — keeps
  the type ontology small.
- Position assignment (chair/members via elected/sortition/appointed):
  is that baked into the human-room contract, or its own
  position-assignment processor emitting role-binding signals?

**Users:**
- Internal user store or IdP-only (SAML/OIDC)? Compliance roadmap
  implies IdP. That's probably the answer.
- View config keyed by `(userId, orgId)` or `userId`? The multi-tenant
  case argues for the former.
- User inbox — one channel or subdivided
  (`user:foo:notifications`, `user:foo:votes`, `user:foo:mentions`)?
- Zero-config user (no subscriptions) — sees empty app, or a fallback?

**Documents:**
- Versioning strategy: Postgres rows with a `version` column is
  easy. Git-backed history is nicer for blame/merge but more infra.
  Probably the former for v1.
- Document-level ACLs: per-document, per-scope, per-role? Probably
  per-document with role-based default grants.

**Broader:**
- Is "room" the right persistence granularity, or should signals
  also persist (signal history per room)?
- Collaboration conflict resolution: two users editing the same
  tree — last-write-wins, OT, CRDT? Probably last-write-wins for
  v2; CRDT is overkill until it isn't.
- Processor billing / resource limits in SaaS. CPU-heavy processors
  can't be unlimited for free tiers.
- Algedonic channel as a cross-tree priority bus? Currently
  S5-only visual. Could become a separate high-priority topic in
  the bus.
- Ephemeral-by-default agents: what does "wake up" mean for latency?
  Cold-start on every signal is fine for occasional use; might need
  pooled warm workers for chatty agents.

**Cybersyn-class (Phase 6+):**
- **Partnerships.** Running this at national scale in Chile requires
  partnerships — universities (Chile already has a cybernetics
  research lineage), unions, cooperatives, potentially municipal
  governments as early pilots before the full managed-economy role.
  Who's the first serious deployment partner?
- **Regulatory landing.** Data protection law (Chile's Ley 19.628
  and 2024 reforms), sectoral regulations (health, finance,
  education). SOC 2 / StateRAMP equivalents for Chilean / Latin
  American context. Who does the regulatory mapping?
- **Citizen identity.** Registro Civil integration is the obvious
  play. Is there precedent? Who has claim-based federation working
  at scale in Chile today?
- **Historical continuity.** Original Cybersyn's artifacts —
  documentation, Stafford Beer's papers, the Operations Room — are
  historically significant. Is there a relationship with the
  archives (Medina's work, MIT collections, Chilean national
  archives)? Does the new system carry forward design lessons,
  aesthetic, language?
- **Sectoral pilot vs. horizontal platform.** Launch with one
  sector (healthcare, education, or a specific cooperative
  federation) and prove it, or build horizontally as infrastructure?
  Pilots de-risk; horizontal matches the ambition.
- **Governance bootstrap.** The system governs itself via elected
  processors, but somebody has to bootstrap the first election.
  Who? How? (Foundation board? Initial rotating committee? Drawn
  by sortition from contributors?)
- **What happens to a federated node that goes rogue?** Federation
  implies trust, trust implies accountability. Federation bridges
  need a revocation protocol. Who gets to revoke, under what
  standard? Another thing governance has to decide.
- **Language and localization.** Spanish-first development? English
  for international contributors and long-term adoption? Mapudungun
  for indigenous participation? Accessibility across languages is
  already in WCAG conformance — this is about first-class authoring
  language, not just translation.
- **Cost model.** Running petabyte-scale sovereign infrastructure
  isn't free. Who pays? Tax-funded civic infrastructure? Cooperative
  membership dues? A foundation with international funding? The
  choice shapes political independence.

---

*Not a decided plan. Resume the conversation when ready to commit
to Phases 1+2 (the hard ones). Phase 6+ is a horizon target —
design toward it from Phase 1 so no early decision rules it out.*
