# Operations & System Rooms — Design Reference

This is a reference document, not an execution plan. Pull from it as needed.

## The Spatial Grammar

Every system room is a bounded space. Cables enter/exit through the walls. Color = information type. Direction = organizational relationship. Subway-map aesthetic — clean structural lines, pulse animation on signal activity.

### Cable Colors
- **Green** — S1/operational signals
- **Red** — S2/coordination
- **Blue** — S3/regulatory
- **Orange** — S4/intelligence
- **Purple** — S5/identity
- **Yellow** — S3* audit (parasympathetic, sporadic, bidirectional)
- **Algedonic** — Emergency bypass (any level direct to S5)

### Room Cable Layouts

**S1 (Operation)**
- TOP: Blue in (from local S3)
- RIGHT: Red out (to S2)
- LEFT: Yellow in/out (S3* audit)

**S2 (Coordination)**
- BOTTOM: Green in (from S1s)
- UP/DOWN: Red (S2 chain)
- LEFT: Blue out/in (to/from S3)

**S3 (Regulation)**
- BOTTOM: Blue in (from child S3s)
- TOP: Orange out/in (to/from S4)
- LEFT: Yellow out/in (S3* audit)
- RIGHT: Red in/out (to/from S2)

**S4 (Intelligence)**
- BOTTOM: Orange in (child S4s) + Blue in/out (to/from S3)
- TOP: Purple out/in (to/from S5)

**S5 (Identity)**
- BOTTOM: Purple in/out (child S5s) + Orange in/out (to/from S4)
- Algedonic receiver from any level

### Visual Treatment
- Static cables with pulse on signal activity
- Thick lines (3-4px), system color, rounded caps
- Terminal dots at wall entry points
- Swiss modernism — structural, not ornamental

---

## Data Models (for when we need them)

### Signal
```js
{ id, type: 'metric'|'event'|'narrative'|'alert',
  source: { connectorId, origin },
  timestamp, ttl, content: { ... }, tags: [] }
```

### Connector
```js
{ id, type: 'manual'|'api'|'webhook'|'timeseries'|'file'|'form'|'query',
  name, config: { ... }, signalMapping: { signalType },
  enabled, lastSignalAt }
```

### Transducer
- Welford adaptive baseline (self-learning, O(1) storage)
- Trend detection (linear regression over sliding window)
- CUSUM step detection (cumulative sum change detection)
- Triple index: Actuality / Capability / Potentiality

### Operation Properties Extension
```js
{ purpose, connectors[], transducers[],
  snapshot: { signalCount, health, tripleIndex },
  occupancy: { owner, delegates, notes },
  parameters: {} }
```

---

## Three Levels of Zoom

1. **3D view** — isometric model, navigate to a node, dive into a system
2. **Room view** — the switchboard. Wall terminals on edges, app slots in a ruled grid. Same for all systems.
3. **App view** — click into an app, it's its own room. Terminals inherited from wiring, interior is heterogeneous.

Navigation: 3D → Room → App. Each level: terminals on edges, content in middle.

## The App Architecture

Every room is a universal container. Apps make each system type different. Cables connect to the nervous system. The switchboard wires apps to cables.

### App Contract
```js
{ type, name, systems: [], essential: true|false,
  inputs: [{ key, dataType, color, required }],
  outputs: [{ key, dataType, color }],
  component: ReactComponent,
  analysisOutputs: [{ key, name, type }],
  describe(): string, commands: {} }
```

- `essential: true` = structural, cannot be removed (S3 homeostat, S5 parliament)
- `essential: false` = user-added, constrained by `systems` field
- Internal chaining: app outputs can feed other app inputs (DAG inside the room)
- Dashboard tab auto-generated from installed apps' `analysisOutputs`

### Default Essential Apps
- S1: Signal receiver, basic transducer
- S2: Variety attenuator
- S3: P-Q-R-S homeostat
- S4: Environment scanner, S3-S5 switch
- S5: Parliamentary engine

## Possible Implementation Order

Small steps. Each is standalone and shippable.

1. **`updateProperties` in model.js** — lets any entity store arbitrary properties. One function, one test.
2. **Serialization** — round-trip `properties` through YAML export/import.
3. **Room shell with cable terminals** — visual cable entry/exit points. Establishes the spatial grammar. No data flow yet.
4. **Switchboard grid component** — the ruled table showing apps with inputs/outputs. Empty at first.
5. **App contract + registry** — define the interface, register built-in apps per system type.
6. **Signal model** — `src/signals/index.js` with pushSignal, pruneExpired. Pure functions, tested.
7. **S1 signal receiver app (essential)** — simplest app: accepts manual entry, shows signal feed.
8. **App view shell** — click into an app, see its own terminal room with interior content.
9. **Welford transducer app** — first real processor. Takes metric signals, maintains baseline, outputs deviations.
10. **Triple index bar** — A/C/P visualization component.
11. **Dashboard tab** — auto-generated cards from installed apps' analysis outputs.
12. **Mock signal generator** — synthetic data streams for testing.
13. **Internal chaining** — wire app outputs to other app inputs.
14. **Trend + CUSUM modes** — additional transducer detection modes.
15. **Viability validation** — check required terminals connected, essential apps configured.
16. **Inter-system signal routing** — signals flowing between rooms through the cables.

Each step builds on the previous but none requires the next. Stop anywhere and the app still works.

---

## Prior Art (from Caleb's prototypes)

### vsm-js concepts to carry forward
- Synapse/transducer batched signal analysis (not real-time reaction)
- AI as structural variety attenuator (PASS/BLOCK at channel junctions)
- Triple-mode transducers (Welford + trend + CUSUM)
- Parliamentary S5 (Rusty's Rules state machine)
- S3 constraint solving (natural language -> MiniZinc)
- Recursive contexts (every operation can contain a full VSM)
- Role-based agent occupancy

### Rust VSM concepts to carry forward
- Channel-based routing (not point-to-point)
- Regulatory centers as autonomous processors
- Aggregate state snapshots (not event logs) — Beer's principle
- Signal TTL (ephemeral by default)
- Anomalous signals table (flagged for investigation)
