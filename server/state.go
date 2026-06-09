package main

import (
	"sync"
)

// State holds the entire VSM state in memory
type State struct {
	mu         sync.RWMutex
	Model      Model                          `json:"model"`
	Processors map[string][]ProcessorInstance `json:"processors"`
	Cables     map[string][]Cable             `json:"cables"`
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
	ID        string         `json:"id"`
	DefID     string         `json:"defId"`
	Config    map[string]any `json:"config"`
	Filters   Filters        `json:"filters"`
	Broadcast bool           `json:"broadcast,omitempty"`
}

// Filters for processor input/output
type Filters struct {
	Types []string `json:"types"`
	Tags  []string `json:"tags"`
}

// Cable connects ports/terminals
type Cable struct {
	ID       string        `json:"id"`
	Source   PortRef       `json:"source"`
	Target   PortRef       `json:"target"`
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

// Processor operations

// AddProcessor adds a processor instance to a room
func (s *State) AddProcessor(roomKey string, defID string, config map[string]any) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	instanceID := generateUUID()
	instance := ProcessorInstance{
		ID:     instanceID,
		DefID:  defID,
		Config: config,
		Filters: Filters{
			Types: []string{},
			Tags:  []string{},
		},
	}

	s.Processors[roomKey] = append(s.Processors[roomKey], instance)
	return instanceID, nil
}

// RemoveProcessor removes a processor instance from a room
func (s *State) RemoveProcessor(roomKey string, instanceID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	instances, ok := s.Processors[roomKey]
	if !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Room has no processors"}
	}

	found := false
	newInstances := make([]ProcessorInstance, 0, len(instances)-1)
	for _, inst := range instances {
		if inst.ID == instanceID {
			found = true
		} else {
			newInstances = append(newInstances, inst)
		}
	}

	if !found {
		return &CommandError{Code: "NOT_FOUND", Message: "Processor not found"}
	}

	s.Processors[roomKey] = newInstances
	return nil
}

// UpdateProcessorConfig updates a processor's config
func (s *State) UpdateProcessorConfig(roomKey string, instanceID string, config map[string]any) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	instances, ok := s.Processors[roomKey]
	if !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Room has no processors"}
	}

	for i, inst := range instances {
		if inst.ID == instanceID {
			// Merge config
			for k, v := range config {
				instances[i].Config[k] = v
			}
			s.Processors[roomKey] = instances
			return nil
		}
	}

	return &CommandError{Code: "NOT_FOUND", Message: "Processor not found"}
}

// Cable operations

// AddCable adds a cable to a room
func (s *State) AddCable(roomKey string, source PortRef, target PortRef) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	cableID := generateUUID()
	cable := Cable{
		ID:     cableID,
		Source: source,
		Target: target,
	}

	s.Cables[roomKey] = append(s.Cables[roomKey], cable)
	return cableID, nil
}

// RemoveCable removes a cable from a room
func (s *State) RemoveCable(roomKey string, cableID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	cables, ok := s.Cables[roomKey]
	if !ok {
		return &CommandError{Code: "NOT_FOUND", Message: "Room has no cables"}
	}

	found := false
	newCables := make([]Cable, 0, len(cables)-1)
	for _, c := range cables {
		if c.ID == cableID {
			found = true
		} else {
			newCables = append(newCables, c)
		}
	}

	if !found {
		return &CommandError{Code: "NOT_FOUND", Message: "Cable not found"}
	}

	s.Cables[roomKey] = newCables
	return nil
}
