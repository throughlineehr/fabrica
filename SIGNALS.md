# Fabrica — Signal Wiring

How nerve signals move through the VSM. Covers the transport, the channel
model, how topology is derived from the tree, how it rewires when the tree
mutates, and what has to change when we swap the in-memory bus for real
websockets + redis.

If you're here to change behavior: start at the bottom ("Where to edit for
common tasks"). If you're here to understand the design: read top to bottom.

---

## 1. The layers (what depends on what)

```
┌────────────────────────────────────────────────────────────────┐
│  components/  (room UI, switchboard, processor page)          │
│        ↑                                                        │
│        │ reads processor state, renders room topology           │
│        │                                                        │
│  App.jsx                                                        │
│    • owns processor state (Map<roomKey, instance[]>)           │
│    • useEffect([tree]): computes topology, wires bus            │
│    • render-time prune: processors for deleted rooms are gone  │
│    • useEffect([processors]): starts/stops running instances    │
│        ↑                                                        │
│  ──────┼────── boundary: below this line, no React. Pure JS.   │
│        ↓                                                        │
│  signals/                                                       │
│    topology.js  — tree → { roomKey → sources[] }  (terminals)  │
│    wiring.js    — topology → live forwarders (side-effect)      │
│    library.js   — processor definitions (heartbeat/tracer/log)  │
│    signal.js    — signal shape + trace/hops helpers             │
│    bus.js       — TRANSPORT. publish/subscribe. channel names. │
└────────────────────────────────────────────────────────────────┘
```

The critical seam is `bus.js`. Everything above it calls `bus.publish(...)`
and `bus.subscribe(...)` and nothing else. That's the contract that survives
the migration to websockets.

---

## 2. Signal shape

Every signal is a plain object (`signals/signal.js`):

```js
{
  id:               crypto.randomUUID(),
  type:             'metric' | 'event' | 'narrative' | 'alert',
  content:          { /* type-specific payload */ },
  source:           { processorId, processorType, roomNodeId, roomSystemKey },
  trace:            [ { processorId, processorType, roomNodeId, roomSystemKey, timestamp } ],
  hops:             [ 'nodeId:systemKey', ... ],    // CLONED per delivery
  delivered:        [ 'nodeId:systemKey', ... ],    // MUTATED in place
  arrivalTerminal:  'terminalId' | undefined,
  tags:             [],
  timestamp:        Date.now(),
}
```

The fields that look similar but serve different purposes:

- **`trace[]`** — processor visits. Rich metadata. Used by processors
  themselves. The `tracer` uses `hasTraced(signal, instanceId)` to avoid
  re-stamping. Any future processor that wants to avoid echo-chambering
  does the same.

- **`hops[]`** — per-delivery path record. Cloned on every forward. When
  a subscriber receives a signal, its `hops` array ends at that subscriber's
  own room. Useful for display/debugging — shows the actual path this
  delivery took.

- **`delivered[]`** — shared loop-prevention record. All forwarders on the
  same synchronous dispatch see and mutate the SAME array. First forwarder
  to claim a target pushes it in; sibling forwarders see it and skip. This
  is what prevents diamond-path duplicate deliveries. Order is meaningless.

- **`arrivalTerminal`** — when a forwarder delivers a signal to a target
  room, it stamps the room's terminal id that represents this edge. Used
  by processors to filter by input terminal. Signals that originate inside
  a room (not via forwarding) have no `arrivalTerminal`.

- **`tags[]`** — free-form labels. Processors can filter by them
  (`filters.tags`). Producers aren't forced to add any.

---

## 3. Channels

There are two kinds of channels, and all channel names are produced by
helpers in `bus.js` — no hardcoded strings outside that file.

| Channel                  | Producer                                       | Consumer                         |
|---                       |---                                             |---                               |
| `room:{nodeId}:{sysKey}` | Processors publishing to their own room        | Forwarders, room-level viewers   |
| `proc:{instanceId}:events` | Each processor, logging its own activity    | The processor app page           |

The room channel is the **only** cross-room surface. Anything that wants
to know about another room's activity subscribes to that room's channel
through the wiring layer, never directly.

The events channel is per-processor and is used only for the processor's
own "what did I do" log. It's never forwarded or subscribed-to across rooms.

### Publishing into a room

Never call `bus.publish('room:...', signal)` from a processor. Use:

```js
import { publishToRoom } from '../signals/bus'
publishToRoom(bus, roomNodeId, roomSystemKey, signal)
```

This appends the current room to `signal.hops[]` before publishing. The
forwarder layer uses that to avoid re-delivering the signal to a room it
already visited.

---

## 4. Topology — terminals are the wiring rules

**Terminals are the single source of truth for both the visible cables on
the walls and the real pubsub subscriptions.** A cable you see is a real
subscription; a subscription you make is a real cable. They cannot drift.

`signals/topology.js` exposes three functions:

### `buildRoomTerminals(node, systemKey, tree)`

Returns the list of terminals for this specific room. Each terminal:

```js
{
  id:        's3-children',              // stable within the room
  wall:      'top' | 'bottom' | 'left' | 'right',  // visual only
  colorKey:  's5' | 's4' | 's3' | 's2' | 's1' | 'audit',
  dir:       'both',                     // invariant — see below
  labelKey:  'systems.s3',               // i18n key
}
```

**All terminals are `dir: 'both'`.** Every VSM cable is a two-way channel:
if A can talk to B, B can talk to A. This is a permanent invariant, not a
per-terminal decision. In the switchboard UI, every terminal shows up in
both the Incoming and Outgoing columns — configure input filters on one
side, output routing on the other.

The switch statement still encodes WHICH edges exist per system:

- **S1 (operation):** talks to parent S3 (directive cable), parent S2 (coordination), parent S3 (audit).
- **S2 (regulator / Corporate Regulation Center):** talks to direct child operations' S1, own S3, adjacent sibling S2s (one on each side — `s2-sibling-left` / `s2-sibling-right`), parent's S2 via `s2-parent`, and direct management children's S2s via `s2-children`. The parent/children pair implements the CRC chain — each recursion level's S2 is the level-above's Corporate Regulation Center.
- **S3 (regulator):** talks to parent S3, management children's S3, own S4/S5/S2, child operations and management children (audit, which also includes parent).
- **S4 (intelligence):** talks to parent S4, own S3, management children's S4, own S5.
- **S5 (identity):** talks to parent S5, own S3, own S4, management children's S5.

Each "talks to" is bidirectional. Full stop. **Every edge is defined from both
sides** — if parent's room has a terminal pointing to a child, the child's room
has a terminal pointing back. This symmetry is checked by a test; the switchboard
surfaces every cable as a colored dot in both the Incoming and Outgoing columns.

### `resolveTerminalConnections(node, systemKey, tree, tr)`

Returns `{ terminalId: [{ id, name, systemKey, verb }, ...] }` — which
actual tree nodes sit on the other end of each terminal. This is what
walks the tree. `tr` is optional; `computeRoomSubscriptions` passes an
identity function since it only needs ids.

### `computeRoomSubscriptions(tree)`

Combines the other two. For every room in the tree, for every terminal
(all are `dir: 'both'`), for every peer connection, produces one entry
in the result:

```js
{
  [targetRoomKey]: [
    { sourceRoomKey, sourceTerminalId, terminalId, colorKey },
    ...
  ]
}
```

- `terminalId` — the IN terminal on the **target** room. Stamped onto
  signals as `arrivalTerminal` when delivered, so processors can filter
  "only signals that arrived via s5-out."
- `sourceTerminalId` — the OUT terminal on the **source** room. Used by
  the wiring layer for output routing: if a publisher sets
  `signal.outgoingTerminals = ['s4-in', 's5-in']`, only forwarders whose
  sourceTerminalId is in that list actually deliver. This is how a
  processor can publish to "just S4" instead of broadcasting to every
  outgoing cable.

Both terminal ids describe the same edge from each side. For edges where
one side is defined but the other is implicit (common in the current VSM
rule set — e.g., S1 operation doesn't define its own outbound-to-parent
terminal explicitly), `sourceTerminalId` may be null. A null source
terminal id simply means output routing is a no-op for that edge — the
forwarder always delivers.

This map is what the wiring layer consumes.

---

## 5. Wiring — topology into live subscriptions

`signals/wiring.js` has one exported function:

```js
wireTopology(bus, topology) → cleanup
```

For every `(sourceRoomKey, targetRoomKey)` pair, it creates a **forwarder**:
a subscription on the source channel that republishes to the target channel.

### Why `delivered[]` is mutated but `hops[]` is cloned

This is subtle and worth understanding. Two requirements are in tension:

1. **Loop prevention** — we need a *shared* "this target has been claimed"
   record so sibling forwarders running in the same synchronous dispatch
   don't all deliver to the same target down diamond paths.
2. **Path record** — each subscriber's `hops[]` should end at THAT
   subscriber, so the displayed trail is the actual route the signal took.

If we use a single shared array for both, `hops[]` ends up being the UNION
of every path any forwarder took, ordered by whichever forwarder fired first.
A subscriber at X can see hops ending at some unrelated sibling room Y.

If we clone `hops[]` per delivery to fix that, we lose the shared state
that prevented loops — diamond paths deliver to the same target twice.

**Fix: two fields.**

- `delivered[]` — mutated in place. Same reference flows through every
  forwarder in the synchronous dispatch. First forwarder to claim a target
  pushes it in; siblings see it and skip. Order is meaningless here.
- `hops[]` — cloned per delivery. Each forwarder copies the incoming `hops`
  and appends its target. The subscriber receives a signal whose `hops`
  ends at the subscriber's own room.

```js
function wireForwarder(bus, source, sourceTerminalId, target, targetTerminalId) {
  return bus.subscribe(`room:${source}`, (signal) => {
    // Output routing: publisher can restrict which outbound cables carry this signal.
    if (signal.outgoingTerminals && sourceTerminalId &&
        !signal.outgoingTerminals.includes(sourceTerminalId)) {
      return
    }
    if (!signal.delivered) signal.delivered = []
    if (signal.delivered.includes(target)) return
    signal.delivered.push(target)                     // mutate shared set
    bus.publish(`room:${target}`, {
      ...signal,
      hops: [...(signal.hops || []), target],         // clone path record
      arrivalTerminal: targetTerminalId,              // stamp the incoming terminal
    })
  })
}
```

### Consequences

- The approach only works because the bus is synchronous — all forwarders
  for a given publish fire inside one JS call stack. When we move to
  websockets, the `delivered` mutation trick stops working across the
  network. Plan: replace with bus-level id-based dedupe (see §8).

---

## 6. Dynamic rewiring — when the tree changes

The tree is React state. `App.jsx`:

```js
const tree     = useMemo(() => buildRenderTree(model), [model])
const topology = useMemo(() => computeRoomSubscriptions(tree), [tree])

useEffect(() => {
  if (!bus) return
  return wireTopology(bus, topology)   // returns cleanup
}, [bus, topology])
```

On every tree mutation, `topology` is recomputed. Its reference changes
(new object), the effect's deps change, React calls the previous cleanup
(tearing down every forwarder from the old topology) and then invokes
`wireTopology` fresh. There is no diffing — we teardown and rebuild
everything on every mutation. At the scales Fabrica is likely to hit
(dozens of rooms, hundreds of forwarders), this is fine.

Signal in-flight during rewire? Worst case: the same signal is forwarded
under both the old and new topology. `hops[]` still prevents loops.

### Processor pruning on tree delete

When a node is deleted, its rooms no longer exist in the tree. Processors
attached to those rooms need to stop running and vanish from state.

This happens during render, not in an effect, so the processor runtime
effect sees the pruned state on the same pass:

```js
const [prevTreeForPrune, setPrevTreeForPrune] = useState(tree)
if (tree !== prevTreeForPrune) {
  setPrevTreeForPrune(tree)
  const liveRooms = new Set(enumerateRooms(tree).map(r => makeRoomKey(...)))
  setProcessors(prev => filterOutDeadRooms(prev, liveRooms))
}
```

This is the React 19 "sync state to prop" pattern — valid (not a cascading
setState) because the `if` guard prevents it from running every render.

Deleting a node therefore:

1. Removes its rooms from the topology → forwarders to/from those rooms
   are torn down.
2. Prunes processors in those rooms from state → their runtime effect
   calls `stop()` on them.
3. Closes the processor page if the viewed processor was in a pruned room
   (the component's guard calls `setProcessorView(null)` via `queueMicrotask`).

If a management child is replaced with an operation, the same mechanism
does the right thing: `s3-children` terminals disappear (ops aren't
management), but `audit` picks up the operation's S1 as a peer. Subscriptions
flip automatically.

---

## 7. Processor lifecycle

Processors are NOT stored in the tree / VSM model. They live in App-level
state:

```js
processors = {
  'nodeId:systemKey': [
    { id: instanceId, defId: 'heartbeat', config: { intervalMs: 3000 } },
    ...
  ],
  ...
}
```

One `useEffect([processors])` handles lifecycle:

```js
useEffect(() => {
  const running = []
  for (const [key, instances] of Object.entries(processors)) {
    for (const inst of instances) {
      const handle = def.create(inst.config, runtime)
      handle.start()
      running.push(handle)
    }
  }
  return () => running.forEach(h => h.stop())
}, [bus, processors])
```

Every time `processors` changes (add, remove, or prune), React tears down
all running handles and recreates them. Like the topology effect, this is
coarse but simple. For a handful of processors, rebuilding on every
mutation is free. If we ever need fine-grained diffing, the change point
is well-defined.

### Processor interface (`signals/library.js`)

```js
{
  id: 'heartbeat',
  name: 'Heartbeat',
  description: '…',
  hasInputs:  false,        // capability flag — does this processor read signals?
  hasOutputs: true,         // does it emit?
  placement:  'any',        // or ['s3', 's4'] subset
  defaultConfig: { intervalMs: 3000 },
  create(config, runtime) {
    // runtime = { bus, instanceId, roomNodeId, roomSystemKey, filters }
    return { start(), stop() }
  },
}
```

- `hasInputs` / `hasOutputs` are capability flags. A processor either
  reads signals or it doesn't. What it filters for is configured per
  *instance* (see filters below), not per library entry.
- `placement` gates which rooms this processor can be added to. All
  three shipped processors say `'any'`.

### Instance filters

Each processor instance owns a `filters` object that narrows which
incoming signals its runtime reacts to AND which outgoing cables it
publishes on:

```js
filters = {
  types:           ['metric', 'alert'] | null,   // null = any type
  tags:            ['urgent'] | null,            // null = no tag constraint
  inputTerminals:  ['s5-out', 's4-out'] | null,  // null = any terminal (incl. internal)
  outputTerminals: ['s3-in'] | null,             // null = every outgoing terminal
}
```

`null` on any axis means "no constraint on that axis."

- **Input filters** (`types`, `tags`, `inputTerminals`) gate which incoming
  signals reach the processor's callback. Applied at the subscribe boundary
  via `signalMatches(signal, filters)` from `signals/filter.js`.

- **Output routing** (`outputTerminals`) gates which OUT cables carry the
  processor's published signals. Enforced by the forwarder layer — the
  processor stamps `outgoingTerminals` onto published signals, and
  forwarders whose source-side terminal isn't in that list skip delivery.

Filters are edited **inline in the switchboard row** — each processor
row has colored dot rows for input/output terminals (toggle to include/
exclude), a small chip row for signal types, and an inline tags input.

Gotcha: when `inputTerminals` is set, signals originating *inside* the
room (no `arrivalTerminal`) are excluded. Clear the filter to see those.

### Channel discipline for processor authors

Do:

```js
publishToRoom(bus, roomNodeId, roomSystemKey, signal)     // room output
bus.publish(eventsChannel(instanceId), signal)            // own events log
bus.subscribe(roomChannel(roomNodeId, roomSystemKey), cb) // room input
```

Do NOT construct channel strings directly. `bus.js` is the only file that
knows channel name formats.

---

## 8. Migration to websockets + redis

When we flip the switch:

- **`bus.js`** is the only file that changes implementation. The exported
  interface (`createBus()` returning `{ publish, subscribe }`, plus the
  channel-name helpers) stays identical.
- `publish` becomes "send message over websocket with `{ channel, signal }`."
- `subscribe` becomes "tell the websocket server to add me to this channel's
  subscriber set."
- Redis sits behind the websocket server and handles the actual pubsub
  fan-out across connected clients.

### What stays the same

- All of `topology.js`, `wiring.js`, `library.js`, `signal.js`.
- The processor interface.
- The App.jsx effects.
- Channel naming.

### What might need to change

- **Synchronous mutation trick for `hops[]`.** Across network boundaries,
  "the same signal object" is no longer meaningful. Two clients forwarding
  the same logical signal will have separate deserialized copies. Two fixes:

  a. Every forwarder emits the `hops`-updated signal back through the bus
     so peers see the update. Requires the bus to echo forwards to peers
     before declaring delivery complete. Complex.

  b. Switch to **id-based dedupe** at the bus level. The bus keeps a small
     LRU of recently-seen `(channel, signal.id)` pairs and drops duplicates
     at the subscriber boundary. Cleaner, lives entirely in transport,
     nothing above the bus changes.

  **Plan B is the move.** When implementing the websocket bus, add this
  dedupe. The in-memory bus doesn't need it because synchronous mutation
  works for in-process.

- **Ordering.** In-memory pubsub is total-order per channel. Redis pubsub
  is not (across shards / partitions). Forwarder logic today assumes
  in-order delivery; most of the logic doesn't actually care, but if we
  grow processors that do, they'll need explicit sequence numbers.

- **Subscription persistence.** In-memory subs die with the process.
  Websocket reconnects will need to re-subscribe on reconnect. Handle
  this in the bus (not above) — the contract stays `subscribe(ch, cb)`.

---

## 9. Tests

- `test/topology.test.js` — the VSM wiring rules; tree mutations change
  the subscription map correctly.
- `test/wiring.test.js` — forwarders deliver once across diamond paths;
  bidirectional edges don't loop; cleanup kills all forwarders.
- `test/signals.test.js` — bus primitives, signal shape, and each
  processor's runtime behavior (heartbeat timing, tracer loop-skip,
  logger sink behavior).

New processor? Add a unit test that exercises its `start`/`stop` lifecycle
and its signal production/consumption. Use the bus directly; no React.

---

## 10. Where to edit for common tasks

| Task                                    | File                                  |
|---                                      |---                                    |
| Add a new processor                     | `signals/library.js`                  |
| Change VSM wiring rules (which terminal subscribes to what) | `signals/topology.js` — `buildRoomTerminals` + `resolveTerminalConnections` (keep them in sync) |
| Change forwarder loop-prevention logic  | `signals/wiring.js`                   |
| Change signal shape / add a field       | `signals/signal.js` (+ all consumers) |
| Change what channel names look like     | `signals/bus.js` (only)               |
| Swap in-memory bus for websocket        | `signals/bus.js` — `createBus()` body |
| Change room UI for processor rows       | `components/room/Switchboard.jsx`     |
| Change processor app page               | `components/ProcessorPage.jsx`        |
| Change what counts as a "live" room (for processor pruning) | `signals/topology.js` — `enumerateRooms` |

---

## 11. Known gaps

These are tracked in `DEBT.md` — listed here for context:

- **No intra-room wiring.** A processor's output always goes out the room's
  cables. Later: outputs of processor A become the input of processor B
  within the same room (composable internal complexity). Needs an internal
  bus layer, terminal-to-processor graph state, and row-level UI to draw
  the connections.
- **Terminal definitions don't declare accepted signal types.** Types are
  enforced by processor filters, not at the wiring layer. A terminal can
  currently carry any type.
- **No persistence.** Processors die on reload.
- **Processor operational config (e.g. heartbeat `intervalMs`) is shown
  read-only as JSON.** Making it editable is straightforward when needed.
- **Ephemeral processor state.** No undo/redo. No agent.
