// Fabrica Relay — embedded HTTP + WebSocket server.
//
// This is the Go port of server/relay.js. It handles:
// - JWT authentication (register, login)
// - Signal inbox management
// - Room membership
// - WebSocket relay for real-time updates

package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

// JWT settings
var (
	jwtSecret   []byte
	tokenExpiry = 24 * time.Hour
)

func init() {
	// Generate random JWT secret on startup
	jwtSecret = make([]byte, 32)
	rand.Read(jwtSecret)
}

// User represents an authenticated user
type User struct {
	ID           string   `json:"id"`
	Email        string   `json:"email"`
	PasswordHash string   `json:"-"`
	Rooms        []string `json:"rooms"`
	CreatedAt    int64    `json:"createdAt"`
}

// RelaySignal represents a queued signal
type RelaySignal struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Content   any    `json:"content"`
	From      string `json:"from"`
	FromEmail string `json:"fromEmail"`
	Room      string `json:"room"`
	Timestamp int64  `json:"timestamp"`
}

// Invite represents a user invitation
type Invite struct {
	Token     string   `json:"token"`
	Rooms     []string `json:"rooms"`
	CreatedBy string   `json:"createdBy"`
	CreatedAt int64    `json:"createdAt"`
	Redeemed  bool     `json:"redeemed"`
	RedeemedBy string  `json:"redeemedBy,omitempty"`
}

// Relay manages users, signals, and WebSocket connections
type Relay struct {
	mu            sync.RWMutex
	users         map[string]*User  // email -> user
	usersById     map[string]*User  // id -> user
	inboxes       map[string][]RelaySignal // userId -> signals
	roomMembers   map[string]map[string]bool // roomId -> set of userIds
	userSockets   map[string]map[*websocket.Conn]bool // userId -> set of connections
	invites       map[string]*Invite // token -> invite
	signalCounter int
	upgrader      websocket.Upgrader
}

// NewRelay creates a new relay instance
func NewRelay() *Relay {
	return &Relay{
		users:       make(map[string]*User),
		usersById:   make(map[string]*User),
		inboxes:     make(map[string][]RelaySignal),
		roomMembers: make(map[string]map[string]bool),
		userSockets: make(map[string]map[*websocket.Conn]bool),
		invites:     make(map[string]*Invite),
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
}

// hashPassword creates a SHA256 hash of the password
func hashPassword(password string) string {
	h := sha256.Sum256([]byte(password))
	return hex.EncodeToString(h[:])
}

// createToken generates a JWT-like token
func createToken(userID string) string {
	payload := map[string]any{
		"userId": userID,
		"exp":    time.Now().Add(tokenExpiry).UnixMilli(),
		"iat":    time.Now().UnixMilli(),
	}
	data, _ := json.Marshal(payload)
	encoded := base64.RawURLEncoding.EncodeToString(data)

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(encoded))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return encoded + "." + signature
}

// verifyToken validates a token and returns the user ID
func verifyToken(token string) string {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return ""
	}

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(parts[0]))
	expectedSig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	if parts[1] != expectedSig {
		return ""
	}

	data, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return ""
	}

	var payload map[string]any
	if err := json.Unmarshal(data, &payload); err != nil {
		return ""
	}

	exp, _ := payload["exp"].(float64)
	if int64(exp) < time.Now().UnixMilli() {
		return ""
	}

	userID, _ := payload["userId"].(string)
	return userID
}

// Register creates a new user account
func (r *Relay) Register(email, password string) (*User, string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if email == "" || password == "" {
		return nil, "", fmt.Errorf("email and password required")
	}

	if _, exists := r.users[email]; exists {
		return nil, "", fmt.Errorf("user already exists")
	}

	user := &User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: hashPassword(password),
		Rooms:        []string{},
		CreatedAt:    time.Now().UnixMilli(),
	}

	r.users[email] = user
	r.usersById[user.ID] = user

	token := createToken(user.ID)
	return user, token, nil
}

// Login authenticates a user
func (r *Relay) Login(email, password string) (*User, string, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	user, exists := r.users[email]
	if !exists || user.PasswordHash != hashPassword(password) {
		return nil, "", fmt.Errorf("invalid credentials")
	}

	token := createToken(user.ID)
	return user, token, nil
}

// GetUserFromToken returns the user for a valid token
func (r *Relay) GetUserFromToken(token string) *User {
	userID := verifyToken(token)
	if userID == "" {
		return nil
	}

	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.usersById[userID]
}

// JoinRoom adds a user to a room
func (r *Relay) JoinRoom(userID, roomID string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Add to room members
	if r.roomMembers[roomID] == nil {
		r.roomMembers[roomID] = make(map[string]bool)
	}
	r.roomMembers[roomID][userID] = true

	// Add to user's room list
	if user := r.usersById[userID]; user != nil {
		for _, rm := range user.Rooms {
			if rm == roomID {
				return // Already joined
			}
		}
		user.Rooms = append(user.Rooms, roomID)
	}
}

// GetUserRooms returns rooms a user belongs to
func (r *Relay) GetUserRooms(userID string) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if user := r.usersById[userID]; user != nil {
		return user.Rooms
	}
	return []string{}
}

// GetRoomMembers returns member count for a room
func (r *Relay) GetRoomMembers(roomID string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if members := r.roomMembers[roomID]; members != nil {
		return len(members)
	}
	return 0
}

// QueueSignal adds a signal to a user's inbox
func (r *Relay) QueueSignal(userID string, signal RelaySignal) {
	r.mu.Lock()
	r.signalCounter++
	signal.ID = fmt.Sprintf("sig_%d", r.signalCounter)
	signal.Timestamp = time.Now().UnixMilli()
	r.inboxes[userID] = append(r.inboxes[userID], signal)
	count := len(r.inboxes[userID])
	sockets := r.userSockets[userID]
	r.mu.Unlock()

	// Notify via WebSocket
	if sockets != nil {
		msg, _ := json.Marshal(map[string]any{
			"type":  "inbox_update",
			"count": count,
		})
		for conn := range sockets {
			conn.WriteMessage(websocket.TextMessage, msg)
		}
	}
}

// SendToRoom sends a signal to all room members except sender
func (r *Relay) SendToRoom(senderID, senderEmail, roomID, sigType string, content any) int {
	r.mu.RLock()
	members := r.roomMembers[roomID]
	memberCount := len(members)
	r.mu.RUnlock()

	signal := RelaySignal{
		Type:      sigType,
		Content:   content,
		From:      senderID,
		FromEmail: senderEmail,
		Room:      roomID,
	}

	for memberID := range members {
		if memberID != senderID {
			r.QueueSignal(memberID, signal)
		}
	}

	return memberCount
}

// GetInbox returns signals for a user
func (r *Relay) GetInbox(userID string) []RelaySignal {
	r.mu.RLock()
	defer r.mu.RUnlock()

	signals := r.inboxes[userID]
	if signals == nil {
		return []RelaySignal{}
	}
	return signals
}

// GetInboxCount returns the number of pending signals
func (r *Relay) GetInboxCount(userID string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.inboxes[userID])
}

// AckSignal removes a signal from inbox
func (r *Relay) AckSignal(userID, signalID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	inbox := r.inboxes[userID]
	for i, sig := range inbox {
		if sig.ID == signalID {
			r.inboxes[userID] = append(inbox[:i], inbox[i+1:]...)
			return true
		}
	}
	return false
}

// CreateInvite creates a new invitation with pre-assigned rooms
func (r *Relay) CreateInvite(creatorID string, rooms []string) *Invite {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Generate a short, URL-safe token
	tokenBytes := make([]byte, 12)
	rand.Read(tokenBytes)
	token := base64.RawURLEncoding.EncodeToString(tokenBytes)

	invite := &Invite{
		Token:     token,
		Rooms:     rooms,
		CreatedBy: creatorID,
		CreatedAt: time.Now().UnixMilli(),
		Redeemed:  false,
	}

	r.invites[token] = invite
	return invite
}

// GetInvite returns an invite by token
func (r *Relay) GetInvite(token string) *Invite {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.invites[token]
}

// RedeemInvite creates a new user from an invite
func (r *Relay) RedeemInvite(token, email, password string) (*User, string, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	invite := r.invites[token]
	if invite == nil {
		return nil, "", fmt.Errorf("invalid invite")
	}
	if invite.Redeemed {
		return nil, "", fmt.Errorf("invite already used")
	}

	if email == "" || password == "" {
		return nil, "", fmt.Errorf("email and password required")
	}

	if _, exists := r.users[email]; exists {
		return nil, "", fmt.Errorf("user already exists")
	}

	// Create user
	user := &User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: hashPassword(password),
		Rooms:        invite.Rooms,
		CreatedAt:    time.Now().UnixMilli(),
	}

	r.users[email] = user
	r.usersById[user.ID] = user

	// Join all rooms from invite
	for _, roomID := range invite.Rooms {
		if r.roomMembers[roomID] == nil {
			r.roomMembers[roomID] = make(map[string]bool)
		}
		r.roomMembers[roomID][user.ID] = true
	}

	// Mark invite as redeemed
	invite.Redeemed = true
	invite.RedeemedBy = user.ID

	authToken := createToken(user.ID)
	return user, authToken, nil
}

// RegisterSocket adds a WebSocket connection for a user
func (r *Relay) RegisterSocket(userID string, conn *websocket.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if r.userSockets[userID] == nil {
		r.userSockets[userID] = make(map[*websocket.Conn]bool)
	}
	r.userSockets[userID][conn] = true
}

// UnregisterSocket removes a WebSocket connection
func (r *Relay) UnregisterSocket(userID string, conn *websocket.Conn) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if sockets := r.userSockets[userID]; sockets != nil {
		delete(sockets, conn)
	}
}

// ServeHTTP handles all HTTP requests
func (r *Relay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	// CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if req.Method == "OPTIONS" {
		w.WriteHeader(204)
		return
	}

	path := req.URL.Path

	// Health check
	if path == "/health" && req.Method == "GET" {
		r.jsonResponse(w, 200, map[string]bool{"ok": true})
		return
	}

	// Auth: Register
	if path == "/auth/register" && req.Method == "POST" {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		r.parseBody(req, &body)

		user, token, err := r.Register(body.Email, body.Password)
		if err != nil {
			r.jsonResponse(w, 400, map[string]string{"error": err.Error()})
			return
		}
		r.jsonResponse(w, 201, map[string]any{
			"user":  map[string]any{"id": user.ID, "email": user.Email, "rooms": user.Rooms},
			"token": token,
		})
		return
	}

	// Auth: Login
	if path == "/auth/login" && req.Method == "POST" {
		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		r.parseBody(req, &body)

		user, token, err := r.Login(body.Email, body.Password)
		if err != nil {
			r.jsonResponse(w, 401, map[string]string{"error": err.Error()})
			return
		}
		r.jsonResponse(w, 200, map[string]any{
			"user":  map[string]any{"id": user.ID, "email": user.Email, "rooms": user.Rooms},
			"token": token,
		})
		return
	}

	// Auth: Me
	if path == "/auth/me" && req.Method == "GET" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		r.jsonResponse(w, 200, map[string]any{
			"user": map[string]any{"id": user.ID, "email": user.Email, "rooms": user.Rooms},
		})
		return
	}

	// API: Inbox count
	if path == "/api/inbox-count" && req.Method == "GET" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		r.jsonResponse(w, 200, map[string]int{"count": r.GetInboxCount(user.ID)})
		return
	}

	// API: Inbox
	if path == "/api/inbox" && req.Method == "GET" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		r.jsonResponse(w, 200, map[string]any{"signals": r.GetInbox(user.ID)})
		return
	}

	// API: Send
	if path == "/api/send" && req.Method == "POST" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}

		var body struct {
			Room    string `json:"room"`
			Type    string `json:"type"`
			Content any    `json:"content"`
		}
		r.parseBody(req, &body)

		if body.Room == "" {
			r.jsonResponse(w, 400, map[string]string{"error": "Room required"})
			return
		}
		if body.Type == "" {
			body.Type = "message"
		}

		memberCount := r.SendToRoom(user.ID, user.Email, body.Room, body.Type, body.Content)
		r.jsonResponse(w, 200, map[string]any{
			"sent":        true,
			"room":        body.Room,
			"memberCount": memberCount,
		})
		return
	}

	// API: Ack
	if strings.HasPrefix(path, "/api/ack/") && req.Method == "POST" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}

		signalID := strings.TrimPrefix(path, "/api/ack/")
		acked := r.AckSignal(user.ID, signalID)
		r.jsonResponse(w, 200, map[string]any{"acked": acked, "signalId": signalID})
		return
	}

	// API: Rooms
	if path == "/api/rooms" && req.Method == "GET" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}
		r.jsonResponse(w, 200, map[string]any{"rooms": r.GetUserRooms(user.ID)})
		return
	}

	// API: Join room
	if path == "/api/rooms/join" && req.Method == "POST" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}

		var body struct {
			Room string `json:"room"`
		}
		r.parseBody(req, &body)

		if body.Room == "" {
			r.jsonResponse(w, 400, map[string]string{"error": "Room required"})
			return
		}

		r.JoinRoom(user.ID, body.Room)
		r.jsonResponse(w, 200, map[string]any{
			"joined": body.Room,
			"rooms":  r.GetUserRooms(user.ID),
		})
		return
	}

	// API: Create invite (requires auth)
	if path == "/api/invites" && req.Method == "POST" {
		user := r.getUserFromRequest(req)
		if user == nil {
			r.jsonResponse(w, 401, map[string]string{"error": "Unauthorized"})
			return
		}

		var body struct {
			Rooms []string `json:"rooms"`
		}
		r.parseBody(req, &body)

		invite := r.CreateInvite(user.ID, body.Rooms)
		r.jsonResponse(w, 201, map[string]any{
			"invite": invite,
			"url":    fmt.Sprintf("/invite/%s", invite.Token),
		})
		return
	}

	// API: Get invite info (public)
	if strings.HasPrefix(path, "/api/invites/") && req.Method == "GET" {
		token := strings.TrimPrefix(path, "/api/invites/")
		token = strings.TrimSuffix(token, "/redeem") // In case someone hits the wrong endpoint

		invite := r.GetInvite(token)
		if invite == nil {
			r.jsonResponse(w, 404, map[string]string{"error": "Invite not found"})
			return
		}

		r.jsonResponse(w, 200, map[string]any{
			"token":    invite.Token,
			"rooms":    invite.Rooms,
			"redeemed": invite.Redeemed,
		})
		return
	}

	// API: Redeem invite (public)
	if strings.HasPrefix(path, "/invite/") && strings.HasSuffix(path, "/redeem") && req.Method == "POST" {
		token := strings.TrimPrefix(path, "/invite/")
		token = strings.TrimSuffix(token, "/redeem")

		var body struct {
			Email    string `json:"email"`
			Password string `json:"password"`
		}
		r.parseBody(req, &body)

		user, authToken, err := r.RedeemInvite(token, body.Email, body.Password)
		if err != nil {
			r.jsonResponse(w, 400, map[string]string{"error": err.Error()})
			return
		}

		r.jsonResponse(w, 201, map[string]any{
			"user":  map[string]any{"id": user.ID, "email": user.Email, "rooms": user.Rooms},
			"token": authToken,
		})
		return
	}

	// Invite landing page (public)
	if strings.HasPrefix(path, "/invite/") && req.Method == "GET" {
		token := strings.TrimPrefix(path, "/invite/")

		invite := r.GetInvite(token)
		if invite == nil {
			http.Error(w, "Invite not found", 404)
			return
		}

		r.serveInvitePage(w, invite)
		return
	}

	// WebSocket upgrade
	if req.Header.Get("Upgrade") == "websocket" {
		r.handleWebSocket(w, req)
		return
	}

	r.jsonResponse(w, 404, map[string]string{"error": "Not found"})
}

func (r *Relay) handleWebSocket(w http.ResponseWriter, req *http.Request) {
	token := req.URL.Query().Get("token")
	user := r.GetUserFromToken(token)

	conn, err := r.upgrader.Upgrade(w, req, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	if user != nil {
		r.RegisterSocket(user.ID, conn)
		defer r.UnregisterSocket(user.ID, conn)
	}

	// Read messages (keep connection alive)
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			break
		}
	}
}

func (r *Relay) getUserFromRequest(req *http.Request) *User {
	auth := req.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return r.GetUserFromToken(auth[7:])
	}
	return nil
}

func (r *Relay) parseBody(req *http.Request, v any) {
	body, _ := io.ReadAll(req.Body)
	json.Unmarshal(body, v)
}

func (r *Relay) jsonResponse(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func (r *Relay) serveInvitePage(w http.ResponseWriter, invite *Invite) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")

	if invite.Redeemed {
		fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head>
	<title>Fabrica - Invite Used</title>
	<style>
		body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; }
		h1 { color: #333; }
		.status { padding: 20px; background: #f5f5f5; border-radius: 8px; }
	</style>
</head>
<body>
	<h1>Fabrica</h1>
	<div class="status">
		<p>This invite has already been used.</p>
		<p>If you need a new invite, contact your administrator.</p>
	</div>
</body>
</html>`)
		return
	}

	rooms := strings.Join(invite.Rooms, ", ")

	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head>
	<title>Fabrica - Join</title>
	<style>
		body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 20px; background: #fafafa; }
		h1 { color: #333; margin-bottom: 8px; }
		.subtitle { color: #666; margin-bottom: 32px; }
		.step { background: white; padding: 20px; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
		.step-num { display: inline-block; width: 28px; height: 28px; background: #333; color: white; border-radius: 50%%; text-align: center; line-height: 28px; margin-right: 12px; font-size: 14px; }
		.step h3 { display: inline; font-size: 16px; }
		code { background: #f0f0f0; padding: 4px 8px; border-radius: 4px; font-family: monospace; }
		pre { background: #1a1a1a; color: #0f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
		.rooms { color: #666; font-size: 14px; margin-top: 8px; }
		.success { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 8px; display: none; }
		.success h2 { color: #155724; margin: 0 0 8px 0; }
	</style>
</head>
<body>
	<h1>Welcome to Fabrica</h1>
	<p class="subtitle">You've been invited to join. Follow these steps to get connected.</p>

	<div class="step">
		<span class="step-num">1</span>
		<h3>Install Fabrica</h3>
		<pre>brew install thirdcreed/fabrica/fabrica</pre>
		<p style="color:#666; font-size:14px; margin-top:8px;">Or: <code>curl -fsSL https://fabrica.dev/install.sh | sh</code></p>
	</div>

	<div class="step">
		<span class="step-num">2</span>
		<h3>Configure Claude Code</h3>
		<pre>fabrica install</pre>
	</div>

	<div class="step">
		<span class="step-num">3</span>
		<h3>Connect</h3>
		<pre id="connect-cmd">fabrica start [loading...]</pre>
		<p class="rooms">You'll be added to: %s</p>
	</div>
	<script>
		// Fill in the full URL based on current page
		document.getElementById('connect-cmd').textContent =
			'fabrica start ' + window.location.origin + '/invite/%s';
	</script>

	<div class="step">
		<span class="step-num">4</span>
		<h3>Restart Claude Code</h3>
		<p style="margin:8px 0 0 40px;">Close and reopen Claude Code to activate the Fabrica tools.</p>
	</div>

	<div class="success" id="success">
		<h2>✓ You're connected!</h2>
		<p>Fabrica is ready. You can close this page.</p>
	</div>

	<script>
		// Poll to check if user has connected
		const token = '%s';
		async function checkStatus() {
			try {
				const res = await fetch('/api/invites/' + token);
				const data = await res.json();
				if (data.redeemed) {
					document.getElementById('success').style.display = 'block';
					return;
				}
			} catch (e) {}
			setTimeout(checkStatus, 3000);
		}
		checkStatus();
	</script>
</body>
</html>`, rooms, invite.Token, invite.Token)
}
