package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Default org ID for single-tenant mode
const DefaultOrgID = "00000000-0000-0000-0000-000000000001"

// DB wraps the database connection pool
type DB struct {
	pool *pgxpool.Pool
}

// NewDB creates a new database connection
func NewDB(databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Connection pool settings
	config.MaxConns = 10
	config.MinConns = 2
	config.MaxConnLifetime = time.Hour
	config.MaxConnIdleTime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	// Test connection
	if err := pool.Ping(context.Background()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping: %w", err)
	}

	return &DB{pool: pool}, nil
}

// Close closes the database connection pool
func (db *DB) Close() {
	db.pool.Close()
}

// RunMigrations runs all SQL migrations in the migrations directory
func (db *DB) RunMigrations(migrationsDir string) error {
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".sql" {
			continue
		}

		path := filepath.Join(migrationsDir, entry.Name())
		sql, err := os.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read %s: %w", entry.Name(), err)
		}

		log.Printf("Running migration: %s", entry.Name())
		if _, err := db.pool.Exec(context.Background(), string(sql)); err != nil {
			return fmt.Errorf("execute %s: %w", entry.Name(), err)
		}
	}

	return nil
}

// LoadState loads VSM state for an organization
func (db *DB) LoadState(orgID string) (*State, error) {
	var modelJSON, processorsJSON, cablesJSON []byte

	err := db.pool.QueryRow(context.Background(),
		`SELECT model, processors, cables FROM vsm_state WHERE org_id = $1`,
		orgID,
	).Scan(&modelJSON, &processorsJSON, &cablesJSON)

	if err != nil {
		// No state yet - return nil to signal creation of new state
		return nil, nil
	}

	state := &State{
		Processors: make(map[string][]ProcessorInstance),
		Cables:     make(map[string][]Cable),
	}

	if err := json.Unmarshal(modelJSON, &state.Model); err != nil {
		return nil, fmt.Errorf("unmarshal model: %w", err)
	}

	if err := json.Unmarshal(processorsJSON, &state.Processors); err != nil {
		return nil, fmt.Errorf("unmarshal processors: %w", err)
	}

	if err := json.Unmarshal(cablesJSON, &state.Cables); err != nil {
		return nil, fmt.Errorf("unmarshal cables: %w", err)
	}

	return state, nil
}

// SaveState persists VSM state for an organization
func (db *DB) SaveState(orgID string, state *State) error {
	state.mu.RLock()
	modelJSON, err := json.Marshal(state.Model)
	if err != nil {
		state.mu.RUnlock()
		return fmt.Errorf("marshal model: %w", err)
	}

	processorsJSON, err := json.Marshal(state.Processors)
	if err != nil {
		state.mu.RUnlock()
		return fmt.Errorf("marshal processors: %w", err)
	}

	cablesJSON, err := json.Marshal(state.Cables)
	if err != nil {
		state.mu.RUnlock()
		return fmt.Errorf("marshal cables: %w", err)
	}
	state.mu.RUnlock()

	_, err = db.pool.Exec(context.Background(),
		`INSERT INTO vsm_state (org_id, model, processors, cables, updated_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (org_id) DO UPDATE SET
		   model = EXCLUDED.model,
		   processors = EXCLUDED.processors,
		   cables = EXCLUDED.cables,
		   updated_at = NOW()`,
		orgID, modelJSON, processorsJSON, cablesJSON,
	)

	if err != nil {
		return fmt.Errorf("upsert state: %w", err)
	}

	return nil
}

// StateSaver handles async state persistence with debouncing
type StateSaver struct {
	db      *DB
	orgID   string
	state   *State
	pending bool
	mu      sync.Mutex
	stopCh  chan struct{}
}

// NewStateSaver creates a new async state saver
func NewStateSaver(db *DB, orgID string, state *State) *StateSaver {
	return &StateSaver{
		db:     db,
		orgID:  orgID,
		state:  state,
		stopCh: make(chan struct{}),
	}
}

// Start starts the background save loop
func (s *StateSaver) Start() {
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.mu.Lock()
				if s.pending {
					s.pending = false
					s.mu.Unlock()

					if err := s.db.SaveState(s.orgID, s.state); err != nil {
						log.Printf("Error saving state: %v", err)
					} else {
						log.Printf("State saved to database")
					}
				} else {
					s.mu.Unlock()
				}
			case <-s.stopCh:
				// Final save before exit
				s.mu.Lock()
				if s.pending {
					s.pending = false
					s.mu.Unlock()
					if err := s.db.SaveState(s.orgID, s.state); err != nil {
						log.Printf("Error saving final state: %v", err)
					}
				} else {
					s.mu.Unlock()
				}
				return
			}
		}
	}()
}

// Stop stops the background save loop
func (s *StateSaver) Stop() {
	close(s.stopCh)
}

// MarkDirty marks state as needing to be saved
func (s *StateSaver) MarkDirty() {
	s.mu.Lock()
	s.pending = true
	s.mu.Unlock()
}

// ============================================================================
// User Management
// ============================================================================

// User represents a user in the system
type User struct {
	ID          string         `json:"id"`
	OrgID       string         `json:"orgId"`
	Email       string         `json:"email"`
	Role        string         `json:"role"` // "user" | "cybernetician"
	ScopeNodeID *string        `json:"scopeNodeId,omitempty"`
	Preferences map[string]any `json:"preferences"`
	CreatedAt   time.Time      `json:"createdAt"`
}

// CreateUser creates a new user
func (db *DB) CreateUser(orgID, email, role string, scopeNodeID *string) (*User, error) {
	var user User
	err := db.pool.QueryRow(context.Background(),
		`INSERT INTO users (org_id, email, role, scope_node_id, preferences)
		 VALUES ($1, $2, $3, $4, '{}')
		 RETURNING id, org_id, email, role, scope_node_id, preferences, created_at`,
		orgID, email, role, scopeNodeID,
	).Scan(&user.ID, &user.OrgID, &user.Email, &user.Role, &user.ScopeNodeID, &user.Preferences, &user.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	return &user, nil
}

// GetUserByID retrieves a user by ID
func (db *DB) GetUserByID(userID string) (*User, error) {
	var user User
	var prefsJSON []byte
	err := db.pool.QueryRow(context.Background(),
		`SELECT id, org_id, email, role, scope_node_id, preferences, created_at
		 FROM users WHERE id = $1`,
		userID,
	).Scan(&user.ID, &user.OrgID, &user.Email, &user.Role, &user.ScopeNodeID, &prefsJSON, &user.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	if err := json.Unmarshal(prefsJSON, &user.Preferences); err != nil {
		user.Preferences = make(map[string]any)
	}

	return &user, nil
}

// GetUserByEmail retrieves a user by email
func (db *DB) GetUserByEmail(email string) (*User, error) {
	var user User
	var prefsJSON []byte
	err := db.pool.QueryRow(context.Background(),
		`SELECT id, org_id, email, role, scope_node_id, preferences, created_at
		 FROM users WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.OrgID, &user.Email, &user.Role, &user.ScopeNodeID, &prefsJSON, &user.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("get user by email: %w", err)
	}

	if err := json.Unmarshal(prefsJSON, &user.Preferences); err != nil {
		user.Preferences = make(map[string]any)
	}

	return &user, nil
}

// UpdateUser updates user fields
func (db *DB) UpdateUser(userID string, updates map[string]any) error {
	// Build dynamic update query
	if role, ok := updates["role"].(string); ok {
		_, err := db.pool.Exec(context.Background(),
			`UPDATE users SET role = $1 WHERE id = $2`,
			role, userID,
		)
		if err != nil {
			return fmt.Errorf("update role: %w", err)
		}
	}

	if scopeNodeID, ok := updates["scopeNodeId"]; ok {
		var scope *string
		if s, ok := scopeNodeID.(string); ok && s != "" {
			scope = &s
		}
		_, err := db.pool.Exec(context.Background(),
			`UPDATE users SET scope_node_id = $1 WHERE id = $2`,
			scope, userID,
		)
		if err != nil {
			return fmt.Errorf("update scope: %w", err)
		}
	}

	if prefs, ok := updates["preferences"].(map[string]any); ok {
		prefsJSON, err := json.Marshal(prefs)
		if err != nil {
			return fmt.Errorf("marshal preferences: %w", err)
		}
		_, err = db.pool.Exec(context.Background(),
			`UPDATE users SET preferences = $1 WHERE id = $2`,
			prefsJSON, userID,
		)
		if err != nil {
			return fmt.Errorf("update preferences: %w", err)
		}
	}

	return nil
}

// ListUsers returns all users in an organization
func (db *DB) ListUsers(orgID string) ([]*User, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT id, org_id, email, role, scope_node_id, preferences, created_at
		 FROM users WHERE org_id = $1 ORDER BY created_at`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var user User
		var prefsJSON []byte
		if err := rows.Scan(&user.ID, &user.OrgID, &user.Email, &user.Role, &user.ScopeNodeID, &prefsJSON, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		if err := json.Unmarshal(prefsJSON, &user.Preferences); err != nil {
			user.Preferences = make(map[string]any)
		}
		users = append(users, &user)
	}

	return users, nil
}

// DeleteUser removes a user
func (db *DB) DeleteUser(userID string) error {
	_, err := db.pool.Exec(context.Background(),
		`DELETE FROM users WHERE id = $1`,
		userID,
	)
	if err != nil {
		return fmt.Errorf("delete user: %w", err)
	}
	return nil
}

// ============================================================================
// User Room Assignments
// ============================================================================

// AddUserToRoom assigns a user to a room
func (db *DB) AddUserToRoom(userID, roomKey string) error {
	_, err := db.pool.Exec(context.Background(),
		`INSERT INTO user_room_assignments (user_id, room_key)
		 VALUES ($1, $2)
		 ON CONFLICT (user_id, room_key) DO NOTHING`,
		userID, roomKey,
	)
	if err != nil {
		return fmt.Errorf("add user to room: %w", err)
	}
	return nil
}

// RemoveUserFromRoom removes a user from a room
func (db *DB) RemoveUserFromRoom(userID, roomKey string) error {
	_, err := db.pool.Exec(context.Background(),
		`DELETE FROM user_room_assignments
		 WHERE user_id = $1 AND room_key = $2`,
		userID, roomKey,
	)
	if err != nil {
		return fmt.Errorf("remove user from room: %w", err)
	}
	return nil
}

// GetUserRooms returns all rooms a user is assigned to
func (db *DB) GetUserRooms(userID string) ([]string, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT room_key FROM user_room_assignments WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get user rooms: %w", err)
	}
	defer rows.Close()

	var rooms []string
	for rows.Next() {
		var roomKey string
		if err := rows.Scan(&roomKey); err != nil {
			return nil, fmt.Errorf("scan room: %w", err)
		}
		rooms = append(rooms, roomKey)
	}

	return rooms, nil
}

// ListUsersInRoom returns all users assigned to a room
func (db *DB) ListUsersInRoom(roomKey string) ([]*User, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT u.id, u.org_id, u.email, u.role, u.scope_node_id, u.preferences, u.created_at
		 FROM users u
		 JOIN user_room_assignments a ON u.id = a.user_id
		 WHERE a.room_key = $1
		 ORDER BY u.email`,
		roomKey,
	)
	if err != nil {
		return nil, fmt.Errorf("list users in room: %w", err)
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var user User
		var prefsJSON []byte
		if err := rows.Scan(&user.ID, &user.OrgID, &user.Email, &user.Role, &user.ScopeNodeID, &prefsJSON, &user.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		if err := json.Unmarshal(prefsJSON, &user.Preferences); err != nil {
			user.Preferences = make(map[string]any)
		}
		users = append(users, &user)
	}

	return users, nil
}

// ============================================================================
// Agent Management
// ============================================================================

// Agent represents an AI agent in the system
type Agent struct {
	ID        string         `json:"id"`
	OrgID     string         `json:"orgId"`
	Name      string         `json:"name"`
	AgentType string         `json:"agentType"`
	Config    map[string]any `json:"config"`
	CreatedAt time.Time      `json:"createdAt"`
}

// CreateAgent creates a new agent
func (db *DB) CreateAgent(orgID, name, agentType string, config map[string]any) (*Agent, error) {
	if config == nil {
		config = make(map[string]any)
	}
	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}

	var agent Agent
	var configBytes []byte
	err = db.pool.QueryRow(context.Background(),
		`INSERT INTO agents (org_id, name, agent_type, config)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, org_id, name, agent_type, config, created_at`,
		orgID, name, agentType, configJSON,
	).Scan(&agent.ID, &agent.OrgID, &agent.Name, &agent.AgentType, &configBytes, &agent.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("create agent: %w", err)
	}

	if err := json.Unmarshal(configBytes, &agent.Config); err != nil {
		agent.Config = make(map[string]any)
	}

	return &agent, nil
}

// GetAgentByID retrieves an agent by ID
func (db *DB) GetAgentByID(agentID string) (*Agent, error) {
	var agent Agent
	var configJSON []byte
	err := db.pool.QueryRow(context.Background(),
		`SELECT id, org_id, name, agent_type, config, created_at
		 FROM agents WHERE id = $1`,
		agentID,
	).Scan(&agent.ID, &agent.OrgID, &agent.Name, &agent.AgentType, &configJSON, &agent.CreatedAt)

	if err != nil {
		return nil, fmt.Errorf("get agent: %w", err)
	}

	if err := json.Unmarshal(configJSON, &agent.Config); err != nil {
		agent.Config = make(map[string]any)
	}

	return &agent, nil
}

// UpdateAgent updates agent fields
func (db *DB) UpdateAgent(agentID string, updates map[string]any) error {
	if name, ok := updates["name"].(string); ok {
		_, err := db.pool.Exec(context.Background(),
			`UPDATE agents SET name = $1 WHERE id = $2`,
			name, agentID,
		)
		if err != nil {
			return fmt.Errorf("update name: %w", err)
		}
	}

	if agentType, ok := updates["agentType"].(string); ok {
		_, err := db.pool.Exec(context.Background(),
			`UPDATE agents SET agent_type = $1 WHERE id = $2`,
			agentType, agentID,
		)
		if err != nil {
			return fmt.Errorf("update agent_type: %w", err)
		}
	}

	if config, ok := updates["config"].(map[string]any); ok {
		configJSON, err := json.Marshal(config)
		if err != nil {
			return fmt.Errorf("marshal config: %w", err)
		}
		_, err = db.pool.Exec(context.Background(),
			`UPDATE agents SET config = $1 WHERE id = $2`,
			configJSON, agentID,
		)
		if err != nil {
			return fmt.Errorf("update config: %w", err)
		}
	}

	return nil
}

// ListAgents returns all agents in an organization
func (db *DB) ListAgents(orgID string) ([]*Agent, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT id, org_id, name, agent_type, config, created_at
		 FROM agents WHERE org_id = $1 ORDER BY created_at`,
		orgID,
	)
	if err != nil {
		return nil, fmt.Errorf("list agents: %w", err)
	}
	defer rows.Close()

	var agents []*Agent
	for rows.Next() {
		var agent Agent
		var configJSON []byte
		if err := rows.Scan(&agent.ID, &agent.OrgID, &agent.Name, &agent.AgentType, &configJSON, &agent.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		if err := json.Unmarshal(configJSON, &agent.Config); err != nil {
			agent.Config = make(map[string]any)
		}
		agents = append(agents, &agent)
	}

	return agents, nil
}

// DeleteAgent removes an agent
func (db *DB) DeleteAgent(agentID string) error {
	_, err := db.pool.Exec(context.Background(),
		`DELETE FROM agents WHERE id = $1`,
		agentID,
	)
	if err != nil {
		return fmt.Errorf("delete agent: %w", err)
	}
	return nil
}

// ============================================================================
// Agent Room Assignments
// ============================================================================

// AddAgentToRoom assigns an agent to a room
func (db *DB) AddAgentToRoom(agentID, roomKey string) error {
	_, err := db.pool.Exec(context.Background(),
		`INSERT INTO agent_room_assignments (agent_id, room_key)
		 VALUES ($1, $2)
		 ON CONFLICT (agent_id, room_key) DO NOTHING`,
		agentID, roomKey,
	)
	if err != nil {
		return fmt.Errorf("add agent to room: %w", err)
	}
	return nil
}

// RemoveAgentFromRoom removes an agent from a room
func (db *DB) RemoveAgentFromRoom(agentID, roomKey string) error {
	_, err := db.pool.Exec(context.Background(),
		`DELETE FROM agent_room_assignments
		 WHERE agent_id = $1 AND room_key = $2`,
		agentID, roomKey,
	)
	if err != nil {
		return fmt.Errorf("remove agent from room: %w", err)
	}
	return nil
}

// GetAgentRooms returns all rooms an agent is assigned to
func (db *DB) GetAgentRooms(agentID string) ([]string, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT room_key FROM agent_room_assignments WHERE agent_id = $1`,
		agentID,
	)
	if err != nil {
		return nil, fmt.Errorf("get agent rooms: %w", err)
	}
	defer rows.Close()

	var rooms []string
	for rows.Next() {
		var roomKey string
		if err := rows.Scan(&roomKey); err != nil {
			return nil, fmt.Errorf("scan room: %w", err)
		}
		rooms = append(rooms, roomKey)
	}

	return rooms, nil
}

// ListAgentsInRoom returns all agents assigned to a room
func (db *DB) ListAgentsInRoom(roomKey string) ([]*Agent, error) {
	rows, err := db.pool.Query(context.Background(),
		`SELECT a.id, a.org_id, a.name, a.agent_type, a.config, a.created_at
		 FROM agents a
		 JOIN agent_room_assignments r ON a.id = r.agent_id
		 WHERE r.room_key = $1
		 ORDER BY a.name`,
		roomKey,
	)
	if err != nil {
		return nil, fmt.Errorf("list agents in room: %w", err)
	}
	defer rows.Close()

	var agents []*Agent
	for rows.Next() {
		var agent Agent
		var configJSON []byte
		if err := rows.Scan(&agent.ID, &agent.OrgID, &agent.Name, &agent.AgentType, &configJSON, &agent.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan agent: %w", err)
		}
		if err := json.Unmarshal(configJSON, &agent.Config); err != nil {
			agent.Config = make(map[string]any)
		}
		agents = append(agents, &agent)
	}

	return agents, nil
}
