package main

// Tree mutation operations
// Ported from web/src/tree/model.js

// AddNode adds a child node to a parent
func (s *State) AddNode(parentID string, nodeType string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Validate parent exists
	if _, ok := s.Model.Entities[parentID]; !ok {
		return "", &CommandError{Code: "INVALID_PARENT", Message: "Parent node does not exist"}
	}

	// Operations cannot have children
	if s.Model.Entities[parentID].Type == "operation" {
		return "", &CommandError{Code: "INVALID_PARENT", Message: "Operations cannot have children"}
	}

	// Validate node type
	if nodeType != "management" && nodeType != "operation" {
		return "", &CommandError{Code: "INVALID_TYPE", Message: "Node type must be 'management' or 'operation'"}
	}

	// Create new node
	nodeID := generateUUID()
	s.Model.Entities[nodeID] = Entity{Type: nodeType, Name: ""}
	s.Model.Parents[nodeID] = &parentID
	s.Model.Children[nodeID] = []string{}

	// Add to parent's children
	s.Model.Children[parentID] = append(s.Model.Children[parentID], nodeID)

	return nodeID, nil
}

// RemoveNode removes a node and all its descendants
func (s *State) RemoveNode(nodeID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Cannot remove root
	if nodeID == s.Model.RootID {
		return &CommandError{Code: "CANNOT_REMOVE_ROOT", Message: "Cannot remove root node"}
	}

	// Validate node exists
	if _, ok := s.Model.Entities[nodeID]; !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Node does not exist"}
	}

	// Collect all descendants
	toRemove := s.collectDescendants(nodeID)
	toRemove = append(toRemove, nodeID)

	// Remove from parent's children
	parentID := s.Model.Parents[nodeID]
	if parentID != nil {
		children := s.Model.Children[*parentID]
		newChildren := make([]string, 0, len(children)-1)
		for _, c := range children {
			if c != nodeID {
				newChildren = append(newChildren, c)
			}
		}
		s.Model.Children[*parentID] = newChildren
	}

	// Delete all collected nodes
	for _, id := range toRemove {
		delete(s.Model.Entities, id)
		delete(s.Model.Children, id)
		delete(s.Model.Parents, id)

		// Also clean up processors and cables for rooms associated with this node
		for key := range s.Processors {
			if nodeIDFromRoomKey(key) == id {
				delete(s.Processors, key)
			}
		}
		for key := range s.Cables {
			if nodeIDFromRoomKey(key) == id {
				delete(s.Cables, key)
			}
		}
	}

	return nil
}

// RenameNode sets the name of a node
func (s *State) RenameNode(nodeID string, name string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	entity, ok := s.Model.Entities[nodeID]
	if !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Node does not exist"}
	}

	entity.Name = name
	s.Model.Entities[nodeID] = entity
	return nil
}

// MoveNode reparents a node to a new parent
func (s *State) MoveNode(nodeID string, newParentID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Cannot move root
	if nodeID == s.Model.RootID {
		return &CommandError{Code: "CANNOT_MOVE_ROOT", Message: "Cannot move root node"}
	}

	// Validate node exists
	if _, ok := s.Model.Entities[nodeID]; !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Node does not exist"}
	}

	// Validate new parent exists
	if _, ok := s.Model.Entities[newParentID]; !ok {
		return &CommandError{Code: "INVALID_PARENT", Message: "New parent does not exist"}
	}

	// Cannot move to operation
	if s.Model.Entities[newParentID].Type == "operation" {
		return &CommandError{Code: "INVALID_PARENT", Message: "Operations cannot have children"}
	}

	// Cannot move to self or descendant
	if nodeID == newParentID || s.isDescendant(newParentID, nodeID) {
		return &CommandError{Code: "CYCLE_DETECTED", Message: "Cannot move node to itself or its descendant"}
	}

	// Remove from old parent's children
	oldParentID := s.Model.Parents[nodeID]
	if oldParentID != nil {
		children := s.Model.Children[*oldParentID]
		newChildren := make([]string, 0, len(children)-1)
		for _, c := range children {
			if c != nodeID {
				newChildren = append(newChildren, c)
			}
		}
		s.Model.Children[*oldParentID] = newChildren
	}

	// Add to new parent's children
	s.Model.Children[newParentID] = append(s.Model.Children[newParentID], nodeID)
	s.Model.Parents[nodeID] = &newParentID

	return nil
}

// Helper: collect all descendants of a node (excluding the node itself)
func (s *State) collectDescendants(nodeID string) []string {
	var result []string
	children := s.Model.Children[nodeID]
	for _, c := range children {
		result = append(result, c)
		result = append(result, s.collectDescendants(c)...)
	}
	return result
}

// Helper: check if targetID is a descendant of ancestorID
func (s *State) isDescendant(targetID, ancestorID string) bool {
	for _, c := range s.Model.Children[ancestorID] {
		if c == targetID {
			return true
		}
		if s.isDescendant(targetID, c) {
			return true
		}
	}
	return false
}

// Helper: extract nodeID from roomKey ("nodeId:systemKey")
func nodeIDFromRoomKey(roomKey string) string {
	for i := 0; i < len(roomKey); i++ {
		if roomKey[i] == ':' {
			return roomKey[:i]
		}
	}
	return roomKey
}

// CommandError for structured error responses
type CommandError struct {
	Code    string
	Message string
}

func (e *CommandError) Error() string {
	return e.Message
}
