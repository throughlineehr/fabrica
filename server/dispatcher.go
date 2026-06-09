package main

import (
	"sync"
)

const (
	MaxHops     = 32
	DedupeLimit = 256
)

// Dispatcher routes signals through the cable graph
type Dispatcher struct {
	mu sync.RWMutex

	// Cable graph per room
	cablesByRoom map[string][]Cable

	// Registered processors
	processors map[string]*ProcessorRegistration

	// Dedup: recently seen signal IDs per processor (LRU-ish, bounded)
	seenByInstance map[string][]string

	// Broadcast mode per instance
	broadcastByInstance map[string]bool

	// Terminal IDs per room (for broadcast fan-out)
	roomTerminals map[string][]string

	// Callback for cross-room delivery
	onTerminal func(fromRoomKey, terminalID string, signal *Signal, hopCount int)
}

// ProcessorRegistration holds a registered processor's info
type ProcessorRegistration struct {
	RoomKey      string
	InputHandler func(signal *Signal, portID string)
}

// NewDispatcher creates a new dispatcher
func NewDispatcher() *Dispatcher {
	return &Dispatcher{
		cablesByRoom:        make(map[string][]Cable),
		processors:          make(map[string]*ProcessorRegistration),
		seenByInstance:      make(map[string][]string),
		broadcastByInstance: make(map[string]bool),
		roomTerminals:       make(map[string][]string),
	}
}

// SetOnTerminal sets the callback for cross-room delivery
func (d *Dispatcher) SetOnTerminal(fn func(fromRoomKey, terminalID string, signal *Signal, hopCount int)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.onTerminal = fn
}

// SetCables updates the cable graph
func (d *Dispatcher) SetCables(cables map[string][]Cable) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.cablesByRoom = cables
}

// SetRoomTerminals sets terminal IDs per room
func (d *Dispatcher) SetRoomTerminals(terminals map[string][]string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.roomTerminals = terminals
}

// RegisterProcessor registers a processor for receiving signals
func (d *Dispatcher) RegisterProcessor(instanceID string, roomKey string, inputHandler func(signal *Signal, portID string)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.processors[instanceID] = &ProcessorRegistration{
		RoomKey:      roomKey,
		InputHandler: inputHandler,
	}
	d.seenByInstance[instanceID] = []string{}
}

// UnregisterProcessor removes a processor registration
func (d *Dispatcher) UnregisterProcessor(instanceID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	delete(d.processors, instanceID)
	delete(d.seenByInstance, instanceID)
	delete(d.broadcastByInstance, instanceID)
}

// SetBroadcast sets broadcast mode for a processor
func (d *Dispatcher) SetBroadcast(instanceID string, broadcast bool) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.broadcastByInstance[instanceID] = broadcast
}

// Emit sends a signal from a processor's output port
func (d *Dispatcher) Emit(signal *Signal, fromInstanceID, fromPortID string, hopCount int) {
	if hopCount > MaxHops {
		return // Cycle protection
	}

	d.mu.RLock()
	reg := d.processors[fromInstanceID]
	if reg == nil {
		d.mu.RUnlock()
		return
	}
	roomKey := reg.RoomKey
	cables := d.cablesByRoom[roomKey]
	broadcast := d.broadcastByInstance[fromInstanceID]
	terminals := d.roomTerminals[roomKey]
	onTerminal := d.onTerminal
	d.mu.RUnlock()

	// If broadcast mode, send to all terminals
	if broadcast {
		for _, terminalID := range terminals {
			if onTerminal != nil {
				cloned := signal.Clone()
				onTerminal(roomKey, terminalID, cloned, hopCount+1)
			}
		}
		return
	}

	// Find cables from this port
	for _, cable := range cables {
		if cable.Source.Kind != "jack" {
			continue
		}
		if cable.Source.InstanceID != fromInstanceID || cable.Source.PortID != fromPortID {
			continue
		}

		// Deliver based on target type
		if cable.Target.Kind == "jack" {
			// Internal delivery to another processor
			d.deliverToProcessor(signal, cable.Target.InstanceID, cable.Target.PortID, hopCount+1)
		} else if cable.Target.Kind == "terminal" {
			// Cross-room delivery
			if onTerminal != nil {
				cloned := signal.Clone()
				onTerminal(roomKey, cable.Target.TerminalID, cloned, hopCount+1)
			}
		}
	}
}

// DeliverFromTerminal handles signals arriving from another room
func (d *Dispatcher) DeliverFromTerminal(roomKey, terminalID string, signal *Signal, hopCount int) {
	if hopCount > MaxHops {
		return
	}

	d.mu.RLock()
	cables := d.cablesByRoom[roomKey]
	d.mu.RUnlock()

	// Find cables from this terminal
	for _, cable := range cables {
		if cable.Source.Kind != "terminal" || cable.Source.TerminalID != terminalID {
			continue
		}

		if cable.Target.Kind == "jack" {
			d.deliverToProcessor(signal, cable.Target.InstanceID, cable.Target.PortID, hopCount+1)
		}
		// terminal→terminal cables don't make sense within a room
	}
}

// deliverToProcessor sends a signal to a processor's input
func (d *Dispatcher) deliverToProcessor(signal *Signal, instanceID, portID string, hopCount int) {
	d.mu.RLock()
	reg := d.processors[instanceID]
	seen := d.seenByInstance[instanceID]
	d.mu.RUnlock()

	if reg == nil {
		return
	}

	// Dedup check
	for _, id := range seen {
		if id == signal.ID {
			return // Already seen this signal
		}
	}

	// Add to seen list (bounded)
	d.mu.Lock()
	d.seenByInstance[instanceID] = append(d.seenByInstance[instanceID], signal.ID)
	if len(d.seenByInstance[instanceID]) > DedupeLimit {
		d.seenByInstance[instanceID] = d.seenByInstance[instanceID][1:]
	}
	d.mu.Unlock()

	// Call the input handler
	if reg.InputHandler != nil {
		reg.InputHandler(signal, portID)
	}
}
