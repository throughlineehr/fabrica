package main

import (
	"encoding/json"
	"fmt"
	"log"
)

// HandleCommand processes a command and returns a result
func (h *Hub) HandleCommand(client *Client, msg Message) {
	var result map[string]any
	var err error

	switch msg.Command {
	// Tree commands
	case "addNode":
		result, err = h.cmdAddNode(msg.Args)
	case "removeNode":
		result, err = h.cmdRemoveNode(msg.Args)
	case "renameNode":
		result, err = h.cmdRenameNode(msg.Args)
	case "moveNode":
		result, err = h.cmdMoveNode(msg.Args)

	// Processor commands (require room access)
	case "addProcessor":
		result, err = h.cmdAddProcessor(client, msg.Args)
	case "removeProcessor":
		result, err = h.cmdRemoveProcessor(client, msg.Args)
	case "updateProcessorConfig":
		result, err = h.cmdUpdateProcessorConfig(client, msg.Args)

	// Cable commands (require room access)
	case "addCable":
		result, err = h.cmdAddCable(client, msg.Args)
	case "removeCable":
		result, err = h.cmdRemoveCable(client, msg.Args)

	// User commands
	case "createUser":
		result, err = h.cmdCreateUser(msg.Args)
	case "getUser":
		result, err = h.cmdGetUser(msg.Args)
	case "updateUser":
		result, err = h.cmdUpdateUser(msg.Args)
	case "deleteUser":
		result, err = h.cmdDeleteUser(msg.Args)
	case "listUsers":
		result, err = h.cmdListUsers(msg.Args)
	case "addUserToRoom":
		result, err = h.cmdAddUserToRoom(msg.Args)
	case "removeUserFromRoom":
		result, err = h.cmdRemoveUserFromRoom(msg.Args)
	case "getUserRooms":
		result, err = h.cmdGetUserRooms(msg.Args)
	case "listUsersInRoom":
		result, err = h.cmdListUsersInRoom(msg.Args)

	// Auth commands
	case "login":
		result, err = h.cmdLogin(client, msg.Args)
	case "loginAsAgent":
		result, err = h.cmdLoginAsAgent(client, msg.Args)
	case "logout":
		result, err = h.cmdLogout(client, msg.Args)
	case "whoami":
		result, err = h.cmdWhoami(client, msg.Args)

	// Agent commands
	case "createAgent":
		result, err = h.cmdCreateAgent(msg.Args)
	case "getAgent":
		result, err = h.cmdGetAgent(msg.Args)
	case "updateAgent":
		result, err = h.cmdUpdateAgent(msg.Args)
	case "deleteAgent":
		result, err = h.cmdDeleteAgent(msg.Args)
	case "listAgents":
		result, err = h.cmdListAgents(msg.Args)
	case "addAgentToRoom":
		result, err = h.cmdAddAgentToRoom(msg.Args)
	case "removeAgentFromRoom":
		result, err = h.cmdRemoveAgentFromRoom(msg.Args)
	case "getAgentRooms":
		result, err = h.cmdGetAgentRooms(msg.Args)
	case "listAgentsInRoom":
		result, err = h.cmdListAgentsInRoom(msg.Args)

	// Invite commands (cybernetician only)
	case "createInvite":
		result, err = h.cmdCreateInvite(client, msg.Args)
	case "listInvites":
		result, err = h.cmdListInvites(client, msg.Args)
	case "revokeInvite":
		result, err = h.cmdRevokeInvite(client, msg.Args)

	default:
		err = &CommandError{Code: "UNKNOWN_COMMAND", Message: fmt.Sprintf("Unknown command: %s", msg.Command)}
	}

	// Send result to client
	h.sendResult(client, msg.ID, result, err)

	// If successful, broadcast state to all clients
	if err == nil {
		h.BroadcastState()

		// Notify runtime of processor/cable changes
		if h.runtime != nil {
			switch msg.Command {
			case "addProcessor", "removeProcessor", "updateProcessorConfig",
				"addCable", "removeCable":
				h.runtime.OnStateChange()
			}
		}
	}
}

func (h *Hub) sendResult(client *Client, msgID string, data map[string]any, err error) {
	ok := err == nil
	response := Message{
		ID:   msgID,
		Type: "result",
		Ok:   &ok,
		Data: data,
	}

	if err != nil {
		if cmdErr, ok := err.(*CommandError); ok {
			response.Error = cmdErr.Code + ": " + cmdErr.Message
		} else {
			response.Error = err.Error()
		}
	}

	data_bytes, _ := json.Marshal(response)
	client.send <- data_bytes
}

// Tree commands

func (h *Hub) cmdAddNode(args map[string]any) (map[string]any, error) {
	parentID, ok := args["parentId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "parentId is required"}
	}

	nodeType, ok := args["nodeType"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "nodeType is required"}
	}

	nodeID, err := h.state.AddNode(parentID, nodeType)
	if err != nil {
		return nil, err
	}

	log.Printf("Added node %s (%s) under %s", nodeID, nodeType, parentID)
	return map[string]any{"nodeId": nodeID}, nil
}

func (h *Hub) cmdRemoveNode(args map[string]any) (map[string]any, error) {
	nodeID, ok := args["nodeId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "nodeId is required"}
	}

	err := h.state.RemoveNode(nodeID)
	if err != nil {
		return nil, err
	}

	log.Printf("Removed node %s", nodeID)
	return nil, nil
}

func (h *Hub) cmdRenameNode(args map[string]any) (map[string]any, error) {
	nodeID, ok := args["nodeId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "nodeId is required"}
	}

	name, ok := args["name"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "name is required"}
	}

	err := h.state.RenameNode(nodeID, name)
	if err != nil {
		return nil, err
	}

	log.Printf("Renamed node %s to '%s'", nodeID, name)
	return nil, nil
}

func (h *Hub) cmdMoveNode(args map[string]any) (map[string]any, error) {
	nodeID, ok := args["nodeId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "nodeId is required"}
	}

	newParentID, ok := args["newParentId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "newParentId is required"}
	}

	err := h.state.MoveNode(nodeID, newParentID)
	if err != nil {
		return nil, err
	}

	log.Printf("Moved node %s to parent %s", nodeID, newParentID)
	return nil, nil
}

// Processor commands

func (h *Hub) cmdAddProcessor(client *Client, args map[string]any) (map[string]any, error) {
	roomKey, ok := args["roomKey"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	// Check room access
	if client.ctx != nil && !client.ctx.CanModifyRoom(roomKey, h.state) {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "No access to this room"}
	}

	defID, ok := args["defId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "defId is required"}
	}

	config, _ := args["config"].(map[string]any)
	if config == nil {
		config = make(map[string]any)
	}

	instanceID, err := h.state.AddProcessor(roomKey, defID, config)
	if err != nil {
		return nil, err
	}

	log.Printf("Added processor %s (def: %s) to room %s", instanceID, defID, roomKey)
	return map[string]any{"instanceId": instanceID}, nil
}

func (h *Hub) cmdRemoveProcessor(client *Client, args map[string]any) (map[string]any, error) {
	roomKey, ok := args["roomKey"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	// Check room access
	if client.ctx != nil && !client.ctx.CanModifyRoom(roomKey, h.state) {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "No access to this room"}
	}

	instanceID, ok := args["instanceId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "instanceId is required"}
	}

	err := h.state.RemoveProcessor(roomKey, instanceID)
	if err != nil {
		return nil, err
	}

	log.Printf("Removed processor %s from room %s", instanceID, roomKey)
	return nil, nil
}

func (h *Hub) cmdUpdateProcessorConfig(client *Client, args map[string]any) (map[string]any, error) {
	roomKey, ok := args["roomKey"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	// Check room access
	if client.ctx != nil && !client.ctx.CanModifyRoom(roomKey, h.state) {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "No access to this room"}
	}

	instanceID, ok := args["instanceId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "instanceId is required"}
	}

	config, ok := args["config"].(map[string]any)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "config is required"}
	}

	err := h.state.UpdateProcessorConfig(roomKey, instanceID, config)
	if err != nil {
		return nil, err
	}

	log.Printf("Updated config for processor %s in room %s", instanceID, roomKey)
	return nil, nil
}

// Cable commands

func (h *Hub) cmdAddCable(client *Client, args map[string]any) (map[string]any, error) {
	roomKey, ok := args["roomKey"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	// Check room access
	if client.ctx != nil && !client.ctx.CanModifyRoom(roomKey, h.state) {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "No access to this room"}
	}

	sourceMap, ok := args["source"].(map[string]any)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "source is required"}
	}

	targetMap, ok := args["target"].(map[string]any)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "target is required"}
	}

	source := portRefFromMap(sourceMap)
	target := portRefFromMap(targetMap)

	cableID, err := h.state.AddCable(roomKey, source, target)
	if err != nil {
		return nil, err
	}

	log.Printf("Added cable %s in room %s", cableID, roomKey)
	return map[string]any{"cableId": cableID}, nil
}

func (h *Hub) cmdRemoveCable(client *Client, args map[string]any) (map[string]any, error) {
	roomKey, ok := args["roomKey"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	// Check room access
	if client.ctx != nil && !client.ctx.CanModifyRoom(roomKey, h.state) {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "No access to this room"}
	}

	cableID, ok := args["cableId"].(string)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "cableId is required"}
	}

	err := h.state.RemoveCable(roomKey, cableID)
	if err != nil {
		return nil, err
	}

	log.Printf("Removed cable %s from room %s", cableID, roomKey)
	return nil, nil
}

// Auth commands

func (h *Hub) cmdLogin(client *Client, args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Authentication requires database"}
	}

	email, ok := args["email"].(string)
	if !ok || email == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "email is required"}
	}

	user, err := h.db.GetUserByEmail(email)
	if err != nil {
		return nil, &CommandError{Code: "NOT_FOUND", Message: "User not found"}
	}

	// Get user's room assignments
	rooms, err := h.db.GetUserRooms(user.ID)
	if err != nil {
		rooms = []string{}
	}

	// Set client context
	client.ctx = &ClientContext{
		UserID:      user.ID,
		Role:        user.Role,
		ScopeNodeID: user.ScopeNodeID,
		Rooms:       rooms,
	}
	client.userID = user.Email

	log.Printf("User logged in: %s (%s)", user.Email, user.Role)

	// Send filtered state
	h.sendStateToClient(client)

	return map[string]any{
		"user": userToMap(user),
	}, nil
}

func (h *Hub) cmdLoginAsAgent(client *Client, args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Authentication requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	agent, err := h.db.GetAgentByID(agentID)
	if err != nil {
		return nil, &CommandError{Code: "NOT_FOUND", Message: "Agent not found"}
	}

	// Get agent's room assignments
	rooms, err := h.db.GetAgentRooms(agentID)
	if err != nil {
		rooms = []string{}
	}

	// Set client context
	client.ctx = &ClientContext{
		AgentID: agent.ID,
		Role:    "agent",
		Rooms:   rooms,
	}
	client.userID = "agent:" + agent.Name

	log.Printf("Agent logged in: %s (%s)", agent.Name, agent.AgentType)

	// Send filtered state (agents get full tree but limited rooms)
	h.sendStateToClient(client)

	return map[string]any{
		"agent": agentToMap(agent),
	}, nil
}

func (h *Hub) cmdLogout(client *Client, args map[string]any) (map[string]any, error) {
	if client.ctx != nil {
		log.Printf("Client logged out: %s", client.userID)
	}
	client.ctx = nil
	client.userID = "anonymous"

	// Send full state (unauthenticated)
	h.sendStateToClient(client)

	return nil, nil
}

func (h *Hub) cmdWhoami(client *Client, args map[string]any) (map[string]any, error) {
	if client.ctx == nil || !client.ctx.IsAuthenticated() {
		return map[string]any{
			"authenticated": false,
		}, nil
	}

	result := map[string]any{
		"authenticated": true,
		"role":          client.ctx.Role,
		"rooms":         client.ctx.Rooms,
	}

	if client.ctx.UserID != "" {
		result["userId"] = client.ctx.UserID
	}
	if client.ctx.AgentID != "" {
		result["agentId"] = client.ctx.AgentID
	}
	if client.ctx.ScopeNodeID != nil {
		result["scopeNodeId"] = *client.ctx.ScopeNodeID
	}

	return result, nil
}

// Helper to convert map to PortRef
func portRefFromMap(m map[string]any) PortRef {
	ref := PortRef{}
	if v, ok := m["kind"].(string); ok {
		ref.Kind = v
	}
	if v, ok := m["instanceId"].(string); ok {
		ref.InstanceID = v
	}
	if v, ok := m["portId"].(string); ok {
		ref.PortID = v
	}
	if v, ok := m["terminalId"].(string); ok {
		ref.TerminalID = v
	}
	return ref
}

// User commands

func (h *Hub) cmdCreateUser(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	email, ok := args["email"].(string)
	if !ok || email == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "email is required"}
	}

	role, ok := args["role"].(string)
	if !ok {
		role = "user" // default
	}
	if role != "user" && role != "cybernetician" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "role must be 'user' or 'cybernetician'"}
	}

	var scopeNodeID *string
	if s, ok := args["scopeNodeId"].(string); ok && s != "" {
		scopeNodeID = &s
	}

	user, err := h.db.CreateUser(DefaultOrgID, email, role, scopeNodeID)
	if err != nil {
		return nil, &CommandError{Code: "CREATE_FAILED", Message: err.Error()}
	}

	log.Printf("Created user %s (%s, %s)", user.ID, email, role)
	return map[string]any{
		"userId": user.ID,
		"user":   userToMap(user),
	}, nil
}

func (h *Hub) cmdGetUser(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	user, err := h.db.GetUserByID(userID)
	if err != nil {
		return nil, &CommandError{Code: "NOT_FOUND", Message: "User not found"}
	}

	return map[string]any{"user": userToMap(user)}, nil
}

func (h *Hub) cmdUpdateUser(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	updates, ok := args["updates"].(map[string]any)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "updates is required"}
	}

	if err := h.db.UpdateUser(userID, updates); err != nil {
		return nil, &CommandError{Code: "UPDATE_FAILED", Message: err.Error()}
	}

	log.Printf("Updated user %s", userID)
	return nil, nil
}

func (h *Hub) cmdDeleteUser(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	if err := h.db.DeleteUser(userID); err != nil {
		return nil, &CommandError{Code: "DELETE_FAILED", Message: err.Error()}
	}

	log.Printf("Deleted user %s", userID)
	return nil, nil
}

func (h *Hub) cmdListUsers(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	users, err := h.db.ListUsers(DefaultOrgID)
	if err != nil {
		return nil, &CommandError{Code: "LIST_FAILED", Message: err.Error()}
	}

	userMaps := make([]map[string]any, len(users))
	for i, u := range users {
		userMaps[i] = userToMap(u)
	}

	return map[string]any{"users": userMaps}, nil
}

func (h *Hub) cmdAddUserToRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	if err := h.db.AddUserToRoom(userID, roomKey); err != nil {
		return nil, &CommandError{Code: "ASSIGN_FAILED", Message: err.Error()}
	}

	log.Printf("Added user %s to room %s", userID, roomKey)
	return nil, nil
}

func (h *Hub) cmdRemoveUserFromRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	if err := h.db.RemoveUserFromRoom(userID, roomKey); err != nil {
		return nil, &CommandError{Code: "UNASSIGN_FAILED", Message: err.Error()}
	}

	log.Printf("Removed user %s from room %s", userID, roomKey)
	return nil, nil
}

func (h *Hub) cmdGetUserRooms(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	userID, ok := args["userId"].(string)
	if !ok || userID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "userId is required"}
	}

	rooms, err := h.db.GetUserRooms(userID)
	if err != nil {
		return nil, &CommandError{Code: "GET_ROOMS_FAILED", Message: err.Error()}
	}

	return map[string]any{"rooms": rooms}, nil
}

func (h *Hub) cmdListUsersInRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "User management requires database"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	users, err := h.db.ListUsersInRoom(roomKey)
	if err != nil {
		return nil, &CommandError{Code: "LIST_FAILED", Message: err.Error()}
	}

	userMaps := make([]map[string]any, len(users))
	for i, u := range users {
		userMaps[i] = userToMap(u)
	}

	return map[string]any{"users": userMaps}, nil
}

// Helper to convert User to map for JSON response
func userToMap(u *User) map[string]any {
	m := map[string]any{
		"id":          u.ID,
		"email":       u.Email,
		"role":        u.Role,
		"preferences": u.Preferences,
		"createdAt":   u.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if u.ScopeNodeID != nil {
		m["scopeNodeId"] = *u.ScopeNodeID
	}
	return m
}

// Agent commands

func (h *Hub) cmdCreateAgent(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	name, ok := args["name"].(string)
	if !ok || name == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "name is required"}
	}

	agentType, ok := args["agentType"].(string)
	if !ok || agentType == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentType is required"}
	}

	config, _ := args["config"].(map[string]any)

	agent, err := h.db.CreateAgent(DefaultOrgID, name, agentType, config)
	if err != nil {
		return nil, &CommandError{Code: "CREATE_FAILED", Message: err.Error()}
	}

	log.Printf("Created agent %s (%s, %s)", agent.ID, name, agentType)
	return map[string]any{
		"agentId": agent.ID,
		"agent":   agentToMap(agent),
	}, nil
}

func (h *Hub) cmdGetAgent(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	agent, err := h.db.GetAgentByID(agentID)
	if err != nil {
		return nil, &CommandError{Code: "NOT_FOUND", Message: "Agent not found"}
	}

	return map[string]any{"agent": agentToMap(agent)}, nil
}

func (h *Hub) cmdUpdateAgent(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	updates, ok := args["updates"].(map[string]any)
	if !ok {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "updates is required"}
	}

	if err := h.db.UpdateAgent(agentID, updates); err != nil {
		return nil, &CommandError{Code: "UPDATE_FAILED", Message: err.Error()}
	}

	log.Printf("Updated agent %s", agentID)
	return nil, nil
}

func (h *Hub) cmdDeleteAgent(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	if err := h.db.DeleteAgent(agentID); err != nil {
		return nil, &CommandError{Code: "DELETE_FAILED", Message: err.Error()}
	}

	log.Printf("Deleted agent %s", agentID)
	return nil, nil
}

func (h *Hub) cmdListAgents(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agents, err := h.db.ListAgents(DefaultOrgID)
	if err != nil {
		return nil, &CommandError{Code: "LIST_FAILED", Message: err.Error()}
	}

	agentMaps := make([]map[string]any, len(agents))
	for i, a := range agents {
		agentMaps[i] = agentToMap(a)
	}

	return map[string]any{"agents": agentMaps}, nil
}

func (h *Hub) cmdAddAgentToRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	if err := h.db.AddAgentToRoom(agentID, roomKey); err != nil {
		return nil, &CommandError{Code: "ASSIGN_FAILED", Message: err.Error()}
	}

	log.Printf("Added agent %s to room %s", agentID, roomKey)
	return nil, nil
}

func (h *Hub) cmdRemoveAgentFromRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	if err := h.db.RemoveAgentFromRoom(agentID, roomKey); err != nil {
		return nil, &CommandError{Code: "UNASSIGN_FAILED", Message: err.Error()}
	}

	log.Printf("Removed agent %s from room %s", agentID, roomKey)
	return nil, nil
}

func (h *Hub) cmdGetAgentRooms(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	agentID, ok := args["agentId"].(string)
	if !ok || agentID == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "agentId is required"}
	}

	rooms, err := h.db.GetAgentRooms(agentID)
	if err != nil {
		return nil, &CommandError{Code: "GET_ROOMS_FAILED", Message: err.Error()}
	}

	return map[string]any{"rooms": rooms}, nil
}

func (h *Hub) cmdListAgentsInRoom(args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Agent management requires database"}
	}

	roomKey, ok := args["roomKey"].(string)
	if !ok || roomKey == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "roomKey is required"}
	}

	agents, err := h.db.ListAgentsInRoom(roomKey)
	if err != nil {
		return nil, &CommandError{Code: "LIST_FAILED", Message: err.Error()}
	}

	agentMaps := make([]map[string]any, len(agents))
	for i, a := range agents {
		agentMaps[i] = agentToMap(a)
	}

	return map[string]any{"agents": agentMaps}, nil
}

// Helper to convert Agent to map for JSON response
func agentToMap(a *Agent) map[string]any {
	return map[string]any{
		"id":        a.ID,
		"name":      a.Name,
		"agentType": a.AgentType,
		"config":    a.Config,
		"createdAt": a.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
}

// Invite commands (cybernetician only)

func (h *Hub) cmdCreateInvite(client *Client, args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Invite management requires database"}
	}

	// Check cybernetician role
	if client.ctx == nil || client.ctx.Role != "cybernetician" {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "Only cyberneticians can create invites"}
	}

	// Parse rooms array
	var rooms []string
	if roomsRaw, ok := args["rooms"].([]any); ok {
		for _, r := range roomsRaw {
			if s, ok := r.(string); ok {
				rooms = append(rooms, s)
			}
		}
	}

	invite, err := h.db.CreateInvite(DefaultOrgID, client.ctx.UserID, rooms)
	if err != nil {
		return nil, &CommandError{Code: "CREATE_FAILED", Message: err.Error()}
	}

	log.Printf("Created invite %s with rooms %v", invite.Token, rooms)
	return map[string]any{
		"token":     invite.Token,
		"inviteUrl": "/invite/" + invite.Token,
		"invite":    inviteToMap(invite),
	}, nil
}

func (h *Hub) cmdListInvites(client *Client, args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Invite management requires database"}
	}

	// Check cybernetician role
	if client.ctx == nil || client.ctx.Role != "cybernetician" {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "Only cyberneticians can list invites"}
	}

	invites, err := h.db.ListInvites(DefaultOrgID)
	if err != nil {
		return nil, &CommandError{Code: "LIST_FAILED", Message: err.Error()}
	}

	inviteMaps := make([]map[string]any, len(invites))
	for i, inv := range invites {
		inviteMaps[i] = inviteToMap(inv)
	}

	return map[string]any{"invites": inviteMaps}, nil
}

func (h *Hub) cmdRevokeInvite(client *Client, args map[string]any) (map[string]any, error) {
	if h.db == nil {
		return nil, &CommandError{Code: "NO_DATABASE", Message: "Invite management requires database"}
	}

	// Check cybernetician role
	if client.ctx == nil || client.ctx.Role != "cybernetician" {
		return nil, &CommandError{Code: "FORBIDDEN", Message: "Only cyberneticians can revoke invites"}
	}

	token, ok := args["token"].(string)
	if !ok || token == "" {
		return nil, &CommandError{Code: "INVALID_ARGS", Message: "token is required"}
	}

	if err := h.db.DeleteInvite(token); err != nil {
		return nil, &CommandError{Code: "DELETE_FAILED", Message: err.Error()}
	}

	log.Printf("Revoked invite %s", token)
	return nil, nil
}

// Helper to convert Invite to map for JSON response
func inviteToMap(inv *Invite) map[string]any {
	m := map[string]any{
		"token":     inv.Token,
		"rooms":     inv.Rooms,
		"createdBy": inv.CreatedBy,
		"createdAt": inv.CreatedAt.Format("2006-01-02T15:04:05Z07:00"),
	}
	if inv.RedeemedAt != nil {
		m["redeemedAt"] = inv.RedeemedAt.Format("2006-01-02T15:04:05Z07:00")
	}
	if inv.RedeemedBy != nil {
		m["redeemedBy"] = *inv.RedeemedBy
	}
	return m
}
