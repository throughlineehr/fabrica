# Step 1: Server Skeleton

**Goal:** Go server that accepts websocket connections and holds VSM state in memory.

---

## Files

```
server/
  go.mod
  main.go         -- entry point, flags, startup
  state.go        -- in-memory VSM state
  websocket.go    -- connection handling, hub, broadcast
  auth.go         -- JWT creation/validation (stub for now)
```

---

## go.mod

```go
module github.com/thirdcreed/fabrica/server

go 1.23

require (
    github.com/google/uuid v1.6.0
    github.com/gorilla/websocket v1.5.3
)
```

---

## state.go

```go
package main

import (
    "sync"
)

// State holds the entire VSM state in memory
type State struct {
    mu         sync.RWMutex
    Model      Model                            `json:"model"`
    Processors map[string][]ProcessorInstance   `json:"processors"`
    Cables     map[string][]Cable               `json:"cables"`
}

// Model is the tree structure
type Model struct {
    Entities map[string]Entity   `json:"entities"`
    Children map[string][]string `json:"children"`
    Parents  map[string]*string  `json:"parents"`
    RootID   string              `json:"rootId"`
}

// Entity is a node in the tree
type Entity struct {
    Type string `json:"type"` // "management" | "operation"
    Name string `json:"name"`
}

// ProcessorInstance is a processor running in a room
type ProcessorInstance struct {
    ID       string         `json:"id"`
    DefID    string         `json:"defId"`
    Config   map[string]any `json:"config"`
    Filters  Filters        `json:"filters"`
    Broadcast bool          `json:"broadcast,omitempty"`
}

// Filters for processor input/output
type Filters struct {
    Types []string `json:"types,omitempty"`
    Tags  []string `json:"tags,omitempty"`
}

// Cable connects ports/terminals
type Cable struct {
    ID       string  `json:"id"`
    Source   PortRef `json:"source"`
    Target   PortRef `json:"target"`
    Settings CableSettings `json:"settings,omitempty"`
}

// PortRef identifies a port (jack or terminal)
type PortRef struct {
    Kind       string `json:"kind"` // "jack" | "terminal"
    InstanceID string `json:"instanceId,omitempty"`
    PortID     string `json:"portId,omitempty"`
    TerminalID string `json:"terminalId,omitempty"`
}

// CableSettings for filtering on cables
type CableSettings struct {
    Types    []string `json:"types,omitempty"`
    Tags     []string `json:"tags,omitempty"`
    Mute     bool     `json:"mute,omitempty"`
    ColorKey string   `json:"colorKey,omitempty"`
}

// NewState creates a new empty state with a root node
func NewState() *State {
    rootID := generateUUID()
    return &State{
        Model: Model{
            Entities: map[string]Entity{
                rootID: {Type: "management", Name: ""},
            },
            Children: map[string][]string{
                rootID: {},
            },
            Parents: map[string]*string{
                rootID: nil,
            },
            RootID: rootID,
        },
        Processors: make(map[string][]ProcessorInstance),
        Cables:     make(map[string][]Cable),
    }
}

// Snapshot returns a copy of state for sending to clients
func (s *State) Snapshot() StateSnapshot {
    s.mu.RLock()
    defer s.mu.RUnlock()
    return StateSnapshot{
        Model:      s.Model,
        Processors: s.Processors,
        Cables:     s.Cables,
    }
}

// StateSnapshot is what we send to clients
type StateSnapshot struct {
    Model      Model                          `json:"model"`
    Processors map[string][]ProcessorInstance `json:"processors"`
    Cables     map[string][]Cable             `json:"cables"`
}
```

---

## websocket.go

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"

    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool { return true },
}

// Client represents a connected websocket client
type Client struct {
    hub    *Hub
    conn   *websocket.Conn
    send   chan []byte
    userID string
}

// Hub manages all connected clients
type Hub struct {
    mu         sync.RWMutex
    clients    map[*Client]bool
    broadcast  chan []byte
    register   chan *Client
    unregister chan *Client
    state      *State
}

// NewHub creates a new hub
func NewHub(state *State) *Hub {
    return &Hub{
        clients:    make(map[*Client]bool),
        broadcast:  make(chan []byte, 256),
        register:   make(chan *Client),
        unregister: make(chan *Client),
        state:      state,
    }
}

// Run starts the hub's main loop
func (h *Hub) Run() {
    for {
        select {
        case client := <-h.register:
            h.mu.Lock()
            h.clients[client] = true
            h.mu.Unlock()
            log.Printf("Client connected: %s (total: %d)", client.userID, len(h.clients))

            // Send current state to new client
            h.sendStateToClient(client)

        case client := <-h.unregister:
            h.mu.Lock()
            if _, ok := h.clients[client]; ok {
                delete(h.clients, client)
                close(client.send)
            }
            h.mu.Unlock()
            log.Printf("Client disconnected: %s (total: %d)", client.userID, len(h.clients))

        case message := <-h.broadcast:
            h.mu.RLock()
            for client := range h.clients {
                select {
                case client.send <- message:
                default:
                    close(client.send)
                    delete(h.clients, client)
                }
            }
            h.mu.RUnlock()
        }
    }
}

// BroadcastState sends current state to all clients
func (h *Hub) BroadcastState() {
    msg := Message{
        Type: "state",
        State: h.state.Snapshot(),
    }
    data, _ := json.Marshal(msg)
    h.broadcast <- data
}

func (h *Hub) sendStateToClient(client *Client) {
    msg := Message{
        Type: "state",
        State: h.state.Snapshot(),
    }
    data, _ := json.Marshal(msg)
    client.send <- data
}

// Message is the wire format
type Message struct {
    ID      string        `json:"id,omitempty"`
    Type    string        `json:"type"`
    Command string        `json:"command,omitempty"`
    Args    map[string]any `json:"args,omitempty"`
    State   StateSnapshot `json:"state,omitempty"`
    Ok      *bool         `json:"ok,omitempty"`
    Error   string        `json:"error,omitempty"`
    Data    map[string]any `json:"data,omitempty"`
}

// ServeWs handles websocket upgrade requests
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
    // For now, accept any connection (auth comes later)
    token := r.URL.Query().Get("token")
    userID := "anonymous"
    if token != "" {
        // TODO: validate token, extract userID
        userID = token
    }

    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        log.Printf("Upgrade error: %v", err)
        return
    }

    client := &Client{
        hub:    hub,
        conn:   conn,
        send:   make(chan []byte, 256),
        userID: userID,
    }

    hub.register <- client

    go client.writePump()
    go client.readPump()
}

func (c *Client) readPump() {
    defer func() {
        c.hub.unregister <- c
        c.conn.Close()
    }()

    for {
        _, data, err := c.conn.ReadMessage()
        if err != nil {
            if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
                log.Printf("Read error: %v", err)
            }
            break
        }

        var msg Message
        if err := json.Unmarshal(data, &msg); err != nil {
            log.Printf("Parse error: %v", err)
            continue
        }

        // Handle commands (Step 2 will add real handlers)
        if msg.Type == "command" {
            c.handleCommand(msg)
        }
    }
}

func (c *Client) handleCommand(msg Message) {
    // Stub: just echo back that we got it
    // Step 2 will implement actual command handling
    ok := true
    response := Message{
        ID:   msg.ID,
        Type: "result",
        Ok:   &ok,
        Data: map[string]any{"received": msg.Command},
    }
    data, _ := json.Marshal(response)
    c.send <- data
}

func (c *Client) writePump() {
    defer c.conn.Close()

    for message := range c.send {
        if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
            log.Printf("Write error: %v", err)
            return
        }
    }
}
```

---

## auth.go

```go
package main

// Stub for now - real auth in Step 5

// ValidateToken checks if a token is valid and returns userID
// For now, just returns the token as the userID
func ValidateToken(token string) (string, bool) {
    if token == "" {
        return "anonymous", true
    }
    return token, true
}
```

---

## main.go

```go
package main

import (
    "flag"
    "fmt"
    "log"
    "net/http"

    "github.com/google/uuid"
)

var (
    port     = flag.Int("port", 8080, "Server port")
    webDir   = flag.String("web", "../web/dist", "Path to web static files")
)

func generateUUID() string {
    return uuid.New().String()
}

func main() {
    flag.Parse()

    state := NewState()
    hub := NewHub(state)
    go hub.Run()

    // Websocket endpoint
    http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
        ServeWs(hub, w, r)
    })

    // Health check
    http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("ok"))
    })

    // Serve static files (the React app)
    fs := http.FileServer(http.Dir(*webDir))
    http.Handle("/", fs)

    addr := fmt.Sprintf(":%d", *port)
    log.Printf("Fabrica server starting on %s", addr)
    log.Printf("Serving web from %s", *webDir)
    log.Fatal(http.ListenAndServe(addr, nil))
}
```

---

## Test Plan

1. **Build and run:**
   ```bash
   cd server
   go mod init github.com/thirdcreed/fabrica/server
   go mod tidy
   go run .
   ```

2. **Connect via wscat (or browser console):**
   ```bash
   wscat -c ws://localhost:8080/ws
   ```

3. **Verify state received:**
   Should receive:
   ```json
   {"type":"state","state":{"model":{"entities":{"<uuid>":{"type":"management","name":""}},"children":{"<uuid>":[]},"parents":{"<uuid>":null},"rootId":"<uuid>"},"processors":{},"cables":{}}}
   ```

4. **Send a test command:**
   ```json
   {"id":"1","type":"command","command":"test","args":{}}
   ```

   Should receive:
   ```json
   {"id":"1","type":"result","ok":true,"data":{"received":"test"}}
   ```

5. **Connect second client:**
   Both should have same state.

---

## What This Enables

- Server runs, holds state
- Clients connect via websocket
- Clients receive current state on connect
- Multiple clients see same state
- Foundation for Step 2 (commands that mutate state)

---

## What This Does NOT Include

- Real auth (just accepts any connection)
- Real commands (just echoes)
- Database (all in memory)
- Signal processing (Step 4)
- Users/agents (Step 6-7)
