# Fabrica — P0 to P1 Migration Plan

**Status:** DRAFT
**Date:** 2026-06-09

Moving from P0 (single-browser, no persistence) to P1 (server-backed,
multi-user, persistent).

---

## 1. What P1 Looks Like

You open the app. You create a VSM hierarchy. You put processors in
rooms and wire them together. You create users, assign them to rooms.
Agents get assigned to rooms too. Signals flow between processors as
configured. Users receive signals from rooms they're in. Everything
persists.

---

## 2. Repo Structure

```
fabrica/
  cmd/
    cli/            -- fabrica CLI, downloaded by users (client-side)
    mcp/            -- MCP server for Claude Code (client-side)
  server/           -- THE Fabrica server (Go)
  web/              -- React frontend
  homebrew/         -- brew formula
```

**Client-side binaries** (cmd/cli, cmd/mcp):
- Downloaded by users
- Run on user's machine
- Connect TO the Fabrica server

**Server** (server/):
- Hosted by the organization
- Holds all state
- Multiple clients connect to it

**Web** (web/):
- React frontend
- Connects to server via websocket
- Viewing and commanding, no signal processing

---

## 3. Core Concepts

### The Graph

- **Tree**: Hierarchy of management nodes and operations
- **Rooms**: Each node × system (S1-S5) = a room
- **Processors**: Run in rooms, emit and receive signals
- **Cables**: Connect processors to each other and to terminals
- **Terminals**: Connect rooms to each other (cross-room wiring)

### Users and Agents

- **Users**: People. Added via OAuth invite. Assigned to rooms.
- **Agents**: AI. Assigned to rooms. For now, answer messages contextlessly.
- **Being in a room**: Receive signals that reach that room. Connected to processes there.

### Permissions (two levels for now)

| Role | Tree visibility | Room access |
|------|-----------------|-------------|
| User | Their subtree (scope_node_id) | Only assigned rooms |
| Cybernetician | Their subtree | All rooms in subtree |
| Main cybernetician | Everything | Everything |

---

## 4. Data Model

```
users
  id
  email
  role: 'user' | 'cybernetician'
  scope_node_id          -- which subtree they can see
  preferences            -- language, accessibility, etc.
  created_at

user_room_assignments
  user_id
  room_key               -- "nodeId:systemKey"

agents
  id
  name
  type
  config

agent_room_assignments
  agent_id
  room_key

organizations
  id
  name

vsm_state
  org_id
  model                  -- tree: { entities, children, parents, rootId }
  processors             -- { "nodeId:systemKey": [...instances] }
  cables                 -- { "nodeId:systemKey": [...cables] }
```

---

## 5. Architecture

```
User's machine                     Company's Fabrica server
┌─────────────────┐               ┌─────────────────────────┐
│ Claude Code     │               │                         │
│       ↓         │               │  ┌─────────────────┐    │
│ cmd/mcp         │──────────────▶│  │ In Memory       │    │
│ cmd/cli         │   websocket   │  │ - Signal bus    │    │
└─────────────────┘               │  │ - Processors    │    │
                                  │  │ - Dispatcher    │    │
┌─────────────────┐               │  └────────┬────────┘    │
│ Browser         │               │           │             │
│ (web/)          │──────────────▶│  ┌────────▼────────┐    │
└─────────────────┘   websocket   │  │ Database        │    │
                                  │  │ - users         │    │
                                  │  │ - vsm_state     │    │
                                  │  │ - assignments   │    │
                                  │  └─────────────────┘    │
                                  │                         │
                                  │  server/ (Go)           │
                                  └─────────────────────────┘
```

---

## 6. Migration Steps — Detailed Specs

---

### STEP 1: Server Skeleton

**Goal:** Go server that accepts websocket connections and holds state in memory.

**Files to create:**

```
server/
  main.go           -- entry point, flags, startup
  server.go         -- HTTP server, routes
  websocket.go      -- upgrade, connection handling, broadcast
  auth.go           -- JWT creation/validation
  state.go          -- in-memory state struct
  go.mod
```

**Spec:**

```go
// state.go
type State struct {
    mu         sync.RWMutex
    Model      Model                         // tree
    Processors map[string][]ProcessorInstance // roomKey -> instances
    Cables     map[string][]Cable            // roomKey -> cables
}

type Model struct {
    Entities map[string]Entity   // id -> { type, name }
    Children map[string][]string // parentId -> childIds
    Parents  map[string]string   // childId -> parentId
    RootID   string
}
```

```go
// websocket.go
type Client struct {
    conn   *websocket.Conn
    userID string
    send   chan []byte
}

type Hub struct {
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
}

// On connect: send full state
// On state change: broadcast to all clients
```

```go
// main.go
func main() {
    flag.Parse()
    state := NewState()
    hub := NewHub()
    go hub.Run()

    http.HandleFunc("/ws", func(w, r) { serveWs(hub, state, w, r) })
    http.Handle("/", http.FileServer(http.Dir("../web/dist")))

    log.Fatal(http.ListenAndServe(":8080", nil))
}
```

**Test:**
1. `cd server && go run .`
2. Connect websocket to ws://localhost:8080/ws
3. Receive empty state: `{"model":{},"processors":{},"cables":{}}`
4. Connect second client, both see same state

**Does NOT include:**
- Commands (Step 2)
- Database (Step 5)
- Signal processing (Step 4)

---

### STEP 2: Agent API Commands

**Goal:** Server accepts commands via websocket, mutates state, broadcasts updates.

**Files to add/change:**

```
server/
  commands.go       -- command handlers
  tree.go           -- tree mutation logic (port from web/src/tree/)
```

**Wire protocol:**

```json
// Client -> Server
{
  "id": "cmd-123",
  "type": "command",
  "command": "addNode",
  "args": {
    "parentId": "uuid",
    "nodeType": "management"
  }
}

// Server -> Client (success)
{
  "id": "cmd-123",
  "type": "result",
  "ok": true,
  "data": { "nodeId": "new-uuid" }
}

// Server -> All Clients (state update)
{
  "type": "state",
  "model": { ... },
  "processors": { ... },
  "cables": { ... }
}
```

**Commands to implement (tree):**
- addNode(parentId, nodeType) → nodeId
- removeNode(nodeId)
- renameNode(nodeId, name)
- moveNode(nodeId, newParentId)

**Commands to implement (processors):**
- addProcessor(roomKey, defId, config) → instanceId
- removeProcessor(roomKey, instanceId)
- updateProcessorConfig(roomKey, instanceId, config)

**Commands to implement (cables):**
- addCable(roomKey, source, target) → cableId
- removeCable(roomKey, cableId)

**Test:**
1. Connect client
2. Send: `{"id":"1","type":"command","command":"addNode","args":{"parentId":"root","nodeType":"management"}}`
3. Receive result: `{"id":"1","type":"result","ok":true,"data":{"nodeId":"..."}}`
4. Receive state update with new node
5. Second client also receives state update

---

### STEP 3: Web Client Connection

**Goal:** React app connects to server, receives state, sends commands.

**Files to change:**

```
web/src/
  connection.js     -- websocket connection manager (new)
  App.jsx           -- use server state instead of local state
  agent/commands.js -- send commands via websocket
```

**Spec:**

```js
// connection.js
export function connect(url, onState, onSignal) {
  const ws = new WebSocket(url)

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.type === 'state') onState(msg)
    if (msg.type === 'signal') onSignal(msg)
  }

  return {
    send: (command, args) => {
      const id = crypto.randomUUID()
      ws.send(JSON.stringify({ id, type: 'command', command, args }))
      return id
    },
    close: () => ws.close()
  }
}
```

```jsx
// App.jsx (simplified)
function App() {
  const [state, setState] = useState(null)
  const connRef = useRef(null)

  useEffect(() => {
    connRef.current = connect(
      'ws://localhost:8080/ws',
      (msg) => setState({ model: msg.model, processors: msg.processors, cables: msg.cables }),
      (msg) => { /* handle signal */ }
    )
    return () => connRef.current.close()
  }, [])

  const agentAPI = useMemo(() => ({
    addNode: (parentId, type) => connRef.current.send('addNode', { parentId, nodeType: type }),
    // ... etc
  }), [])

  if (!state) return <div>Connecting...</div>

  return <AppContent state={state} agentAPI={agentAPI} />
}
```

**Test:**
1. Start server
2. Open web app
3. Create a node
4. Refresh page — node still there (server holds state)
5. Open in second browser — same tree

---

### STEP 4: Signal Processing on Server

**Goal:** Processors run on server, signals flow through cables.

**Files to add:**

```
server/
  bus.go            -- signal bus (publish/subscribe)
  signal.go         -- signal struct
  dispatcher.go     -- cable routing
  runtime.go        -- processor lifecycle
  processors/       -- processor implementations
    heartbeat.go
    tracer.go
    logger.go
    ...
```

**Spec:**

```go
// bus.go
type Bus struct {
    mu          sync.RWMutex
    subscribers map[string][]func(Signal)
}

func (b *Bus) Publish(channel string, signal Signal)
func (b *Bus) Subscribe(channel string, handler func(Signal)) func()
```

```go
// runtime.go
type Runtime struct {
    bus        *Bus
    dispatcher *Dispatcher
    state      *State
    handles    map[string]ProcessorHandle // instanceId -> handle
}

func (r *Runtime) Start()  // start all processors
func (r *Runtime) Stop()
func (r *Runtime) OnStateChange()  // restart changed processors
```

```go
// dispatcher.go
// Port logic from web/src/signals/dispatcher.js
type Dispatcher struct {
    cables      map[string][]Cable
    onTerminal  func(roomKey, terminalId string, signal Signal)
}

func (d *Dispatcher) Emit(signal Signal, from PortRef)
func (d *Dispatcher) DeliverFromTerminal(roomKey, terminalId string, signal Signal)
```

**Signal delivery to clients:**

When signal reaches a room's output:
1. Check who is assigned to this room
2. Send signal to those websocket clients

```go
// In websocket.go
func (h *Hub) DeliverSignal(roomKey string, signal Signal) {
    for client := range h.clients {
        if client.isInRoom(roomKey) {
            client.send <- signalMessage(roomKey, signal)
        }
    }
}
```

**Test:**
1. Add heartbeat processor to a room
2. See signals appearing in client
3. Add logger processor, wire to heartbeat
4. Logger receives signals from heartbeat
5. Close browser, reopen — processors still running, signals still flowing

---

### STEP 5: Database Persistence

**Goal:** State survives server restart.

**Files to add:**

```
server/
  db.go             -- database connection, queries
  migrations/
    001_schema.sql
```

**Schema:**

```sql
-- 001_schema.sql

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'user',
  scope_node_id VARCHAR(255),
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE user_room_assignments (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  room_key VARCHAR(255) NOT NULL,
  PRIMARY KEY (user_id, room_key)
);

CREATE TABLE agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  agent_type VARCHAR(50) NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_room_assignments (
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  room_key VARCHAR(255) NOT NULL,
  PRIMARY KEY (agent_id, room_key)
);

CREATE TABLE vsm_state (
  org_id UUID PRIMARY KEY REFERENCES organizations(id),
  model JSONB NOT NULL DEFAULT '{}',
  processors JSONB NOT NULL DEFAULT '{}',
  cables JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE invites (
  token VARCHAR(255) PRIMARY KEY,
  org_id UUID REFERENCES organizations(id),
  rooms TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  redeemed_at TIMESTAMP,
  redeemed_by UUID REFERENCES users(id)
);
```

**Spec:**

```go
// db.go
type DB struct {
    pool *pgxpool.Pool
}

func (db *DB) LoadState(orgID string) (*State, error)
func (db *DB) SaveState(orgID string, state *State) error
func (db *DB) GetUser(email string) (*User, error)
func (db *DB) CreateUser(user *User) error
func (db *DB) AssignUserToRoom(userID, roomKey string) error
// ... etc
```

**Server startup:**
1. Connect to Postgres
2. Load state from vsm_state
3. Start processor runtime
4. Accept connections

**On state change:**
1. Update in-memory state
2. Broadcast to clients
3. Persist to database (async, don't block)

**Test:**
1. Create tree, add processors
2. Stop server
3. Start server
4. State is restored

---

### STEP 6: User Management

**Goal:** Users can be created, assigned to rooms, have preferences.

**Commands to add:**
- createUser(email, role) → userId (cybernetician only)
- updateUser(userId, { preferences })
- addUserToRoom(userId, roomKey) (cybernetician only)
- removeUserFromRoom(userId, roomKey) (cybernetician only)
- listUsers() → users in scope
- listUsersInRoom(roomKey) → users

**UI in web/:**
- Users tab in tab bar
- Users panel in room (like Switchboard)
- Add user to room from multiple entry points

**Test:**
1. Cybernetician creates user via invite
2. User signs up via OAuth
3. Cybernetician assigns user to room
4. User can see that room, enter it
5. User cannot see rooms outside their scope

---

### STEP 7: Agent Assignments

**Goal:** AI agents can be assigned to rooms and receive signals.

**Commands to add:**
- createAgent(name, type, config) → agentId
- addAgentToRoom(agentId, roomKey)
- removeAgentFromRoom(agentId, roomKey)

**Integration with cmd/cli and cmd/mcp:**
- CLI connects to server as an agent
- Receives signals from assigned rooms
- Can send signals into rooms

**Test:**
1. Create agent
2. Assign to room
3. Connect via cmd/cli
4. Agent receives signals from that room
5. Agent sends signal, it flows through room

---

### STEP 8: Permissions Enforcement

**Goal:** Visibility and access rules are enforced.

**Rules:**
- Users see tree nodes in their scope only
- Users enter rooms they're assigned to only
- Cyberneticians enter any room in their scope
- Commands check permissions before executing

**Implementation:**
- State broadcasts are filtered per-client based on scope
- Command handlers check permissions
- Unauthorized commands return error

**Test:**
1. User tries to view node outside scope → not visible
2. User tries to enter unassigned room → blocked
3. User tries to add processor to room they can view but not enter → blocked
4. Cybernetician can enter any room in their subtree

---

## 7. What We're NOT Building Yet

- Graph database schema (JSON for now, migrate later)
- Event sourcing (snapshots for now)
- Distributed timing (single server, all synchronous)
- Fine-grained permissions (just user/cybernetician)
- Federation (single org)

---

## 8. Success Criteria

- [ ] Two users see the same tree
- [ ] User A adds processor, User B sees it
- [ ] Processor runs on server, emits signals
- [ ] Signals flow through cables as configured
- [ ] User assigned to room receives signals from that room
- [ ] State survives server restart
- [ ] Cybernetician can see all rooms in their scope
- [ ] User can only enter assigned rooms
- [ ] Invite flow works (OAuth)
- [ ] 60fps on client (no processing, just rendering)

---

## 9. Open Questions

1. **OAuth provider?** Auth0, Google, roll our own?
2. **Database?** Postgres assumed. Hosted where?
3. **Server hosting?** Fly.io, Railway, self-hosted?
4. **How does cmd/cli authenticate?** API key? OAuth device flow?

---

*Each step has a spec. Let's review them one by one.*
