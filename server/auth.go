package main

import (
	"strings"
)

// ClientContext holds the authenticated context for a client connection
type ClientContext struct {
	UserID      string   // User ID if authenticated as user
	AgentID     string   // Agent ID if authenticated as agent
	Role        string   // "user", "cybernetician", or "agent"
	ScopeNodeID *string  // Root of visible subtree (nil = see everything)
	Rooms       []string // Rooms this client can enter
}

// IsAuthenticated returns true if the client has a valid identity
func (c *ClientContext) IsAuthenticated() bool {
	return c.UserID != "" || c.AgentID != ""
}

// IsCybernetician returns true if the client is a cybernetician
func (c *ClientContext) IsCybernetician() bool {
	return c.Role == "cybernetician"
}

// CanSeeNode checks if this client can see a given node
func (c *ClientContext) CanSeeNode(nodeID string, state *State) bool {
	// Not authenticated = see nothing
	if !c.IsAuthenticated() {
		return false
	}

	// No scope restriction = see everything
	if c.ScopeNodeID == nil {
		return true
	}

	// Check if nodeID is in the subtree rooted at ScopeNodeID
	return isInSubtree(nodeID, *c.ScopeNodeID, state)
}

// CanEnterRoom checks if this client can enter a given room
func (c *ClientContext) CanEnterRoom(roomKey string) bool {
	// Not authenticated = no access
	if !c.IsAuthenticated() {
		return false
	}

	// Cyberneticians can enter any room in their scope
	// (scope check happens at node level, room inherits from node)
	if c.IsCybernetician() {
		return true
	}

	// Regular users/agents must be assigned to the room
	for _, r := range c.Rooms {
		if r == roomKey {
			return true
		}
	}

	return false
}

// CanModifyRoom checks if this client can modify a room (add processors, cables, etc.)
func (c *ClientContext) CanModifyRoom(roomKey string, state *State) bool {
	// Must be able to enter the room
	if !c.CanEnterRoom(roomKey) {
		return false
	}

	// Extract nodeID from roomKey (format: "nodeId:systemKey")
	parts := strings.SplitN(roomKey, ":", 2)
	if len(parts) != 2 {
		return false
	}
	nodeID := parts[0]

	// Must be able to see the node
	return c.CanSeeNode(nodeID, state)
}

// isInSubtree checks if nodeID is in the subtree rooted at rootID
func isInSubtree(nodeID, rootID string, state *State) bool {
	if nodeID == rootID {
		return true
	}

	state.mu.RLock()
	defer state.mu.RUnlock()

	// Walk up the tree from nodeID to see if we hit rootID
	current := nodeID
	visited := make(map[string]bool)

	for {
		if visited[current] {
			return false // Cycle detected
		}
		visited[current] = true

		parent := state.Model.Parents[current]
		if parent == nil {
			return false // Reached tree root without finding rootID
		}
		if *parent == rootID {
			return true
		}
		current = *parent
	}
}

// FilterStateForClient returns a filtered copy of state based on client's scope
func FilterStateForClient(state *State, ctx *ClientContext) StateSnapshot {
	if ctx == nil || !ctx.IsAuthenticated() {
		// Return empty state for unauthenticated clients
		return StateSnapshot{
			Model:      Model{Entities: map[string]Entity{}, Children: map[string][]string{}, Parents: map[string]*string{}},
			Processors: map[string][]ProcessorInstance{},
			Cables:     map[string][]Cable{},
		}
	}

	// No scope restriction = full state
	if ctx.ScopeNodeID == nil {
		return state.Snapshot()
	}

	state.mu.RLock()
	defer state.mu.RUnlock()

	// Build filtered model with only nodes in scope
	scopeRoot := *ctx.ScopeNodeID
	filteredEntities := make(map[string]Entity)
	filteredChildren := make(map[string][]string)
	filteredParents := make(map[string]*string)

	// Collect all nodes in the subtree
	var collectSubtree func(nodeID string)
	collectSubtree = func(nodeID string) {
		if entity, ok := state.Model.Entities[nodeID]; ok {
			filteredEntities[nodeID] = entity

			// Copy parent reference
			if parent := state.Model.Parents[nodeID]; parent != nil {
				parentCopy := *parent
				filteredParents[nodeID] = &parentCopy
			} else {
				filteredParents[nodeID] = nil
			}

			// Copy and recurse children
			if children, ok := state.Model.Children[nodeID]; ok {
				filteredChildren[nodeID] = children
				for _, childID := range children {
					collectSubtree(childID)
				}
			}
		}
	}

	collectSubtree(scopeRoot)

	// Filter processors and cables to only include rooms in scope
	filteredProcessors := make(map[string][]ProcessorInstance)
	filteredCables := make(map[string][]Cable)

	for roomKey, procs := range state.Processors {
		parts := strings.SplitN(roomKey, ":", 2)
		if len(parts) == 2 {
			nodeID := parts[0]
			if _, inScope := filteredEntities[nodeID]; inScope {
				filteredProcessors[roomKey] = procs
			}
		}
	}

	for roomKey, cables := range state.Cables {
		parts := strings.SplitN(roomKey, ":", 2)
		if len(parts) == 2 {
			nodeID := parts[0]
			if _, inScope := filteredEntities[nodeID]; inScope {
				filteredCables[roomKey] = cables
			}
		}
	}

	return StateSnapshot{
		Model: Model{
			Entities: filteredEntities,
			Children: filteredChildren,
			Parents:  filteredParents,
			RootID:   scopeRoot, // The scope root becomes the user's root
		},
		Processors: filteredProcessors,
		Cables:     filteredCables,
	}
}

// ValidateToken checks if a token is valid and returns userID
// For now, just returns the token as the userID (placeholder for real auth)
func ValidateToken(token string) (string, bool) {
	if token == "" {
		return "", false
	}
	return token, true
}
