package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
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
	userID string         // Legacy field for logging
	ctx    *ClientContext // Authentication context
}

// Hub manages all connected clients
type Hub struct {
	mu         sync.RWMutex
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	state      *State
	runtime    *Runtime     // Set after creation
	saver      *StateSaver  // Set after creation, nil if no database
	db         *DB          // Set after creation, nil if no database
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

// BroadcastState sends current state to all clients (filtered per client)
func (h *Hub) BroadcastState() {
	h.mu.RLock()
	for client := range h.clients {
		h.sendStateToClient(client)
	}
	h.mu.RUnlock()

	// Mark state as dirty for async persistence
	if h.saver != nil {
		h.saver.MarkDirty()
	}
}

func (h *Hub) sendStateToClient(client *Client) {
	var snapshot StateSnapshot
	if client.ctx != nil && client.ctx.IsAuthenticated() {
		snapshot = FilterStateForClient(h.state, client.ctx)
	} else {
		// Unauthenticated clients get full state for now (backwards compat)
		// In production, this should be empty or require login
		snapshot = h.state.Snapshot()
	}

	msg := Message{
		Type:  "state",
		State: snapshot,
	}
	data, _ := json.Marshal(msg)
	client.send <- data
}

// ClientCount returns the number of connected clients
func (h *Hub) ClientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// DeliverSignal sends a signal to clients in a room
func (h *Hub) DeliverSignal(roomKey string, signal *Signal) {
	msg := SignalMessage{
		Type:    "signal",
		RoomKey: roomKey,
		Signal:  signal,
	}
	data, _ := json.Marshal(msg)

	h.mu.RLock()
	defer h.mu.RUnlock()

	// For now, send to all clients (room filtering comes in Step 6)
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			// Client buffer full, skip
		}
	}
}

// SignalMessage is the wire format for signal delivery
type SignalMessage struct {
	Type    string  `json:"type"`
	RoomKey string  `json:"roomKey"`
	Signal  *Signal `json:"signal"`
}

// Message is the wire format
type Message struct {
	ID      string         `json:"id,omitempty"`
	Type    string         `json:"type"`
	Command string         `json:"command,omitempty"`
	Args    map[string]any `json:"args,omitempty"`
	State   StateSnapshot  `json:"state,omitempty"`
	Ok      *bool          `json:"ok,omitempty"`
	Error   string         `json:"error,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
}

// ServeWs handles websocket upgrade requests
func ServeWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	userID := "anonymous"
	var clientCtx *ClientContext

	// Try to authenticate from session cookie
	user, err := GetUserFromSession(hub, r)
	if err == nil && user != nil {
		userID = user.Email

		// Get user's rooms
		var rooms []string
		if hub.db != nil {
			rooms, _ = hub.db.GetUserRooms(user.ID)
		}

		// Build client context
		clientCtx = &ClientContext{
			UserID:      user.ID,
			Role:        user.Role,
			ScopeNodeID: user.ScopeNodeID,
			Rooms:       rooms,
		}
	} else if hub.db != nil {
		// Try Authorization header (Bearer token) for CLI clients
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			session, err := hub.db.GetSession(token)
			if err == nil && session != nil {
				user, err := hub.db.GetUserByID(session.UserID)
				if err == nil && user != nil {
					userID = user.Email
					rooms, _ := hub.db.GetUserRooms(user.ID)
					clientCtx = &ClientContext{
						UserID:      user.ID,
						Role:        user.Role,
						ScopeNodeID: user.ScopeNodeID,
						Rooms:       rooms,
					}
				}
			}
		}
	}

	// Fallback to query param token for backwards compat
	if clientCtx == nil {
		token := r.URL.Query().Get("token")
		if token != "" {
			userID, _ = ValidateToken(token)
		}
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
		ctx:    clientCtx,
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
	c.hub.HandleCommand(c, msg)
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
