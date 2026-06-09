package main

import (
	"log"
	"strings"
	"sync"
)

// Runtime manages processor lifecycle
type Runtime struct {
	mu         sync.RWMutex
	bus        *Bus
	dispatcher *Dispatcher
	state      *State
	handles    map[string]ProcessorHandle // instanceID -> handle
	hub        *Hub                       // For delivering signals to clients
}

// NewRuntime creates a new processor runtime
func NewRuntime(state *State, hub *Hub) *Runtime {
	bus := NewBus()
	dispatcher := NewDispatcher()

	r := &Runtime{
		bus:        bus,
		dispatcher: dispatcher,
		state:      state,
		handles:    make(map[string]ProcessorHandle),
		hub:        hub,
	}

	// Set up cross-room routing via topology
	dispatcher.SetOnTerminal(r.handleTerminalDelivery)

	return r
}

// Start initializes the runtime and starts all existing processors
func (r *Runtime) Start() {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Sync cables to dispatcher
	r.syncCables()

	// Start all processors
	r.state.mu.RLock()
	for roomKey, instances := range r.state.Processors {
		for _, inst := range instances {
			r.startProcessor(roomKey, inst)
		}
	}
	r.state.mu.RUnlock()

	log.Printf("Runtime started with %d processors", len(r.handles))
}

// Stop shuts down all processors
func (r *Runtime) Stop() {
	r.mu.Lock()
	defer r.mu.Unlock()

	for instanceID, handle := range r.handles {
		handle.Stop()
		r.dispatcher.UnregisterProcessor(instanceID)
	}
	r.handles = make(map[string]ProcessorHandle)

	log.Printf("Runtime stopped")
}

// OnStateChange should be called when processors/cables change
func (r *Runtime) OnStateChange() {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Sync cables
	r.syncCables()

	// Determine which processors should be running
	shouldRun := make(map[string]bool)
	instanceToRoom := make(map[string]string)
	instanceToInst := make(map[string]ProcessorInstance)

	r.state.mu.RLock()
	for roomKey, instances := range r.state.Processors {
		for _, inst := range instances {
			shouldRun[inst.ID] = true
			instanceToRoom[inst.ID] = roomKey
			instanceToInst[inst.ID] = inst
		}
	}
	r.state.mu.RUnlock()

	// Stop processors that shouldn't be running
	for instanceID, handle := range r.handles {
		if !shouldRun[instanceID] {
			handle.Stop()
			r.dispatcher.UnregisterProcessor(instanceID)
			delete(r.handles, instanceID)
			log.Printf("Stopped processor %s", instanceID[:8])
		}
	}

	// Start processors that should be running but aren't
	for instanceID := range shouldRun {
		if _, running := r.handles[instanceID]; !running {
			roomKey := instanceToRoom[instanceID]
			inst := instanceToInst[instanceID]
			r.startProcessor(roomKey, inst)
		}
	}
}

// startProcessor creates and starts a single processor
func (r *Runtime) startProcessor(roomKey string, inst ProcessorInstance) {
	def := GetProcessorDef(inst.DefID)
	if def == nil {
		log.Printf("Unknown processor def: %s", inst.DefID)
		return
	}

	// Parse room key
	parts := strings.SplitN(roomKey, ":", 2)
	if len(parts) != 2 {
		log.Printf("Invalid room key: %s", roomKey)
		return
	}
	nodeID, systemKey := parts[0], parts[1]

	// Create runtime context
	runtime := &ProcessorRuntime{
		Bus:           r.bus,
		Dispatcher:    r.dispatcher,
		Hub:           r.hub,
		InstanceID:    inst.ID,
		RoomNodeID:    nodeID,
		RoomSystemKey: systemKey,
		Filters:       inst.Filters,
	}

	// Create handle
	handle := def.Create(inst.Config, runtime)
	if handle == nil {
		log.Printf("Processor %s.Create returned nil", inst.DefID)
		return
	}

	// Register with dispatcher
	r.dispatcher.RegisterProcessor(inst.ID, roomKey, handle.OnInput)

	// Set broadcast mode if configured
	if inst.Broadcast {
		r.dispatcher.SetBroadcast(inst.ID, true)
	}

	// Start the processor
	handle.Start()
	r.handles[inst.ID] = handle

	log.Printf("Started processor %s (%s) in %s", inst.ID[:8], inst.DefID, roomKey)
}

// syncCables copies cables from state to dispatcher
func (r *Runtime) syncCables() {
	r.state.mu.RLock()
	cables := make(map[string][]Cable)
	for k, v := range r.state.Cables {
		cables[k] = v
	}
	r.state.mu.RUnlock()

	r.dispatcher.SetCables(cables)
}

// handleTerminalDelivery routes signals across rooms via terminals
func (r *Runtime) handleTerminalDelivery(fromRoomKey, terminalID string, signal *Signal, hopCount int) {
	// TODO: Look up topology to find peer rooms connected via this terminal
	// For now, just log it
	log.Printf("Terminal delivery: %s -> %s (signal %s)", fromRoomKey, terminalID, signal.ID[:8])

	// Deliver to clients in this room
	if r.hub != nil {
		r.hub.DeliverSignal(fromRoomKey, signal)
	}
}

// GetBus returns the signal bus
func (r *Runtime) GetBus() *Bus {
	return r.bus
}

// GetDispatcher returns the dispatcher
func (r *Runtime) GetDispatcher() *Dispatcher {
	return r.dispatcher
}
