// Fabrica Relay — connects to the Fabrica server and exposes an API for MCP tools.
//
// The relay:
// - Reads config from ~/.fabrica-auth.json
// - Connects to the main Fabrica server via WebSocket
// - Authenticates with stored token
// - Receives signals for the user's assigned rooms
// - Exposes HTTP endpoints for MCP tools to read/send signals

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// Relay connects to the server and exposes local API
type Relay struct {
	mu        sync.RWMutex
	serverURL string
	token     string
	email     string
	conn      *websocket.Conn
	inbox     []Signal
	rooms     []string
	msgID     atomic.Int64
	pending   map[string]chan map[string]any // msgID -> response channel
	pendingMu sync.Mutex
}

// NewRelay creates a relay that reads config from ~/.fabrica-auth.json
func NewRelay() (*Relay, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("can't find home dir: %w", err)
	}

	configPath := filepath.Join(home, ".fabrica-auth.json")
	data, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("no config found at %s - run 'fabrica login' first", configPath)
	}

	var cfg struct {
		ServerURL string `json:"serverUrl"`
		Token     string `json:"token"`
		Email     string `json:"email"`
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	if cfg.ServerURL == "" {
		return nil, fmt.Errorf("serverUrl not set in config - run 'fabrica login' first")
	}
	if cfg.Token == "" {
		return nil, fmt.Errorf("not logged in - run 'fabrica login' first")
	}

	return &Relay{
		serverURL: cfg.ServerURL,
		token:     cfg.Token,
		email:     cfg.Email,
		inbox:     []Signal{},
		pending:   make(map[string]chan map[string]any),
	}, nil
}

// Connect establishes WebSocket connection and authenticates
func (r *Relay) Connect() error {
	// Convert http:// to ws://
	wsURL := strings.Replace(r.serverURL, "http://", "ws://", 1)
	wsURL = strings.Replace(wsURL, "https://", "wss://", 1)
	wsURL = strings.TrimSuffix(wsURL, "/") + "/ws"

	log.Printf("Connecting to %s", wsURL)

	// Send token in Authorization header
	headers := http.Header{}
	if r.token != "" {
		headers.Set("Authorization", "Bearer "+r.token)
	}

	conn, _, err := websocket.DefaultDialer.Dial(wsURL, headers)
	if err != nil {
		return fmt.Errorf("websocket dial failed: %w", err)
	}
	r.conn = conn

	// Start reading messages
	go r.readLoop()

	// Get rooms from whoami
	result, err := r.sendCommand("whoami", nil)
	if err == nil {
		if authenticated, ok := result["authenticated"].(bool); ok && authenticated {
			log.Printf("Authenticated successfully")
		}
		if rooms, ok := result["rooms"].([]any); ok {
			for _, room := range rooms {
				if s, ok := room.(string); ok {
					r.rooms = append(r.rooms, s)
				}
			}
			log.Printf("Assigned to %d rooms", len(r.rooms))
		}
	} else {
		log.Printf("Warning: whoami failed: %v", err)
	}

	return nil
}

// readLoop handles incoming WebSocket messages
func (r *Relay) readLoop() {
	for {
		_, data, err := r.conn.ReadMessage()
		if err != nil {
			log.Printf("WebSocket read error: %v", err)
			return
		}

		var msg map[string]any
		if err := json.Unmarshal(data, &msg); err != nil {
			continue
		}

		// Handle response to our command
		if msgType, ok := msg["type"].(string); ok && msgType == "result" {
			if id, ok := msg["id"].(string); ok {
				r.pendingMu.Lock()
				if ch, exists := r.pending[id]; exists {
					ch <- msg
					delete(r.pending, id)
				}
				r.pendingMu.Unlock()
			}
			continue
		}

		// Handle signal delivery
		if msgType, ok := msg["type"].(string); ok && msgType == "signal" {
			r.handleSignal(msg)
		}
	}
}

// handleSignal processes incoming signals
func (r *Relay) handleSignal(msg map[string]any) {
	sigData, ok := msg["signal"].(map[string]any)
	if !ok {
		return
	}

	sig := Signal{
		ID:        getString(sigData, "id"),
		Type:      getString(sigData, "type"),
		Timestamp: int64(getFloat(sigData, "timestamp")),
	}
	// Content can be string or map
	sig.Content = sigData["content"]

	// Extract from/fromEmail from source if present
	if source, ok := sigData["source"].(map[string]any); ok {
		if ext, ok := source["externalSource"].(string); ok {
			sig.From = ext
		}
	}

	if room, ok := msg["roomKey"].(string); ok {
		sig.Room = room
	}

	r.mu.Lock()
	r.inbox = append(r.inbox, sig)
	r.mu.Unlock()

	id := sig.ID
	if len(id) > 8 {
		id = id[:8]
	}
	log.Printf("Signal received: %s (type: %s)", id, sig.Type)
}

// sendCommand sends a command and waits for response
func (r *Relay) sendCommand(command string, args map[string]any) (map[string]any, error) {
	id := fmt.Sprintf("msg_%d", r.msgID.Add(1))

	msg := map[string]any{
		"id":      id,
		"type":    "command",
		"command": command,
	}
	if args != nil {
		msg["args"] = args
	}

	// Create response channel
	ch := make(chan map[string]any, 1)
	r.pendingMu.Lock()
	r.pending[id] = ch
	r.pendingMu.Unlock()

	// Send
	data, _ := json.Marshal(msg)
	if err := r.conn.WriteMessage(websocket.TextMessage, data); err != nil {
		r.pendingMu.Lock()
		delete(r.pending, id)
		r.pendingMu.Unlock()
		return nil, err
	}

	// Wait for response
	select {
	case resp := <-ch:
		if errMsg, ok := resp["error"].(string); ok && errMsg != "" {
			return nil, fmt.Errorf(errMsg)
		}
		if data, ok := resp["data"].(map[string]any); ok {
			return data, nil
		}
		return resp, nil
	case <-time.After(10 * time.Second):
		r.pendingMu.Lock()
		delete(r.pending, id)
		r.pendingMu.Unlock()
		return nil, fmt.Errorf("timeout waiting for response")
	}
}

// GetInbox returns pending signals
func (r *Relay) GetInbox() []Signal {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]Signal, len(r.inbox))
	copy(result, r.inbox)
	return result
}

// GetInboxCount returns number of pending signals
func (r *Relay) GetInboxCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.inbox)
}

// AckSignal removes a signal from inbox
func (r *Relay) AckSignal(signalID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, sig := range r.inbox {
		if sig.ID == signalID {
			r.inbox = append(r.inbox[:i], r.inbox[i+1:]...)
			return true
		}
	}
	return false
}

// SendSignal sends a signal to the server (to all assigned rooms if room is empty)
func (r *Relay) SendSignal(room, sigType, content string, tags []string) (map[string]any, error) {
	args := map[string]any{
		"content": content,
		"type":    sigType,
	}
	if room != "" {
		args["room"] = room
	}
	// If room is empty, server sends to all assigned rooms
	if len(tags) > 0 {
		args["tags"] = tags
	}
	return r.sendCommand("sendSignal", args)
}

// GetRooms returns assigned rooms
func (r *Relay) GetRooms() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	result := make([]string, len(r.rooms))
	copy(result, r.rooms)
	return result
}

// ServeHTTP handles local API requests from MCP tools
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if req.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}

	path := req.URL.Path

	// Health check
	if path == "/health" {
		r.jsonResp(w, 200, map[string]any{"ok": true, "connected": r.conn != nil})
		return
	}

	// Inbox count (for status line)
	if path == "/api/inbox-count" {
		r.jsonResp(w, 200, map[string]int{"count": r.GetInboxCount()})
		return
	}

	// Inbox
	if path == "/api/inbox" {
		r.jsonResp(w, 200, map[string]any{"signals": r.GetInbox()})
		return
	}

	// Send
	if path == "/api/send" && req.Method == "POST" {
		var body struct {
			Room    string   `json:"room"`
			Type    string   `json:"type"`
			Content string   `json:"content"`
			Tags    []string `json:"tags"`
		}
		r.parseBody(req, &body)

		if body.Type == "" {
			body.Type = "narrative"
		}

		result, err := r.SendSignal(body.Room, body.Type, body.Content, body.Tags)
		if err != nil {
			r.jsonResp(w, 400, map[string]string{"error": err.Error()})
			return
		}
		r.jsonResp(w, 200, map[string]any{"sent": true, "result": result})
		return
	}

	// Ack
	if strings.HasPrefix(path, "/api/ack/") && req.Method == "POST" {
		signalID := strings.TrimPrefix(path, "/api/ack/")
		acked := r.AckSignal(signalID)
		r.jsonResp(w, 200, map[string]any{"acked": acked})
		return
	}

	// Rooms
	if path == "/api/rooms" {
		r.jsonResp(w, 200, map[string]any{"rooms": r.GetRooms()})
		return
	}

	r.jsonResp(w, 404, map[string]string{"error": "not found"})
}

func (r *Relay) jsonResp(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (r *Relay) parseBody(req *http.Request, v any) {
	body, _ := io.ReadAll(req.Body)
	json.Unmarshal(body, v)
}

func getString(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

func getFloat(m map[string]any, key string) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return 0
}
