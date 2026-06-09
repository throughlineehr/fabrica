package main

import (
	"log"
	"math/rand"
	"time"
)

// ============================================================================
// HEARTBEAT - Periodic metric emitter
// ============================================================================

var HeartbeatDef = &ProcessorDef{
	ID:          "heartbeat",
	Name:        "Heartbeat",
	Description: "Emits periodic metric signals",
	Category:    "source",
	Ports: ProcessorPorts{
		Inputs:  []PortDef{},
		Outputs: []PortDef{{ID: "out1", Label: "out"}},
	},
	Create: func(config map[string]any, runtime *ProcessorRuntime) ProcessorHandle {
		intervalMs := 3000
		if v, ok := config["interval"].(float64); ok {
			intervalMs = int(v)
		}
		if v, ok := config["intervalMs"].(float64); ok {
			intervalMs = int(v)
		}
		return &heartbeatHandle{
			runtime:    runtime,
			intervalMs: intervalMs,
		}
	},
}

type heartbeatHandle struct {
	runtime    *ProcessorRuntime
	intervalMs int
	stopCh     chan struct{}
	stopped    bool
}

func (h *heartbeatHandle) Start() {
	h.stopCh = make(chan struct{})
	go func() {
		ticker := time.NewTicker(time.Duration(h.intervalMs) * time.Millisecond)
		defer ticker.Stop()

		// Emit immediately
		h.emit()

		for {
			select {
			case <-ticker.C:
				h.emit()
			case <-h.stopCh:
				return
			}
		}
	}()
}

func (h *heartbeatHandle) Stop() {
	if !h.stopped && h.stopCh != nil {
		h.stopped = true
		close(h.stopCh)
	}
}

func (h *heartbeatHandle) OnInput(signal *Signal, portID string) {
	// Heartbeat has no inputs
}

func (h *heartbeatHandle) emit() {
	signal := CreateSignal(SignalTypeMetric, map[string]any{
		"key":   "heartbeat",
		"value": 50 + rand.Intn(50), // 50-99
	})
	signal.Source = SignalSource{
		ProcessorID:   h.runtime.InstanceID,
		ProcessorType: "heartbeat",
		RoomNodeID:    h.runtime.RoomNodeID,
		RoomSystemKey: h.runtime.RoomSystemKey,
	}
	signal.AppendTrace(h.runtime.InstanceID, "heartbeat", h.runtime.RoomNodeID, h.runtime.RoomSystemKey)

	// Emit on output port (for cable routing)
	h.runtime.Dispatcher.Emit(signal, h.runtime.InstanceID, "out1", 0)

	// Publish to processor events channel
	h.runtime.Bus.Publish(ProcessorEventsChannel(h.runtime.InstanceID), signal)

	// Deliver to clients viewing this room
	roomKey := h.runtime.RoomNodeID + ":" + h.runtime.RoomSystemKey
	if h.runtime.Hub != nil {
		h.runtime.Hub.DeliverSignal(roomKey, signal)
	}
}

// ============================================================================
// LOGGER - Signal sink that logs to console
// ============================================================================

var LoggerDef = &ProcessorDef{
	ID:          "logger",
	Name:        "Logger",
	Description: "Logs all received signals",
	Category:    "sink",
	Ports: ProcessorPorts{
		Inputs: []PortDef{
			{ID: "in1", Label: "1"},
			{ID: "in2", Label: "2"},
			{ID: "in3", Label: "3"},
			{ID: "in4", Label: "4"},
		},
		Outputs: []PortDef{},
	},
	Create: func(config map[string]any, runtime *ProcessorRuntime) ProcessorHandle {
		return &loggerHandle{runtime: runtime}
	},
}

type loggerHandle struct {
	runtime *ProcessorRuntime
	count   int
}

func (h *loggerHandle) Start() {}

func (h *loggerHandle) Stop() {}

func (h *loggerHandle) OnInput(signal *Signal, portID string) {
	if !signal.MatchesFilters(h.runtime.Filters) {
		return
	}

	h.count++
	log.Printf("[logger %s] %s: %v (port: %s, count: %d)",
		h.runtime.InstanceID[:8], signal.Type, signal.Content, portID, h.count)

	// Publish to processor events channel
	h.runtime.Bus.Publish(ProcessorEventsChannel(h.runtime.InstanceID), signal)
}

// ============================================================================
// TRACER - Passthrough that adds trace info
// ============================================================================

var TracerDef = &ProcessorDef{
	ID:          "tracer",
	Name:        "Tracer",
	Description: "Passes signals through, adding trace information",
	Category:    "flow",
	Ports: ProcessorPorts{
		Inputs: []PortDef{
			{ID: "in1", Label: "1"},
			{ID: "in2", Label: "2"},
			{ID: "in3", Label: "3"},
			{ID: "in4", Label: "4"},
		},
		Outputs: []PortDef{{ID: "out1", Label: "out"}},
	},
	Create: func(config map[string]any, runtime *ProcessorRuntime) ProcessorHandle {
		return &tracerHandle{runtime: runtime}
	},
}

type tracerHandle struct {
	runtime *ProcessorRuntime
}

func (h *tracerHandle) Start() {}

func (h *tracerHandle) Stop() {}

func (h *tracerHandle) OnInput(signal *Signal, portID string) {
	// Skip if already traced by us
	if signal.HasTraced(h.runtime.InstanceID) {
		return
	}

	// Apply filters
	if !signal.MatchesFilters(h.runtime.Filters) {
		return
	}

	// Add trace
	signal.AppendTrace(h.runtime.InstanceID, "tracer", h.runtime.RoomNodeID, h.runtime.RoomSystemKey)

	// Forward on output
	h.runtime.Dispatcher.Emit(signal, h.runtime.InstanceID, "out1", 0)

	// Publish to processor events channel
	h.runtime.Bus.Publish(ProcessorEventsChannel(h.runtime.InstanceID), signal)
}

// ============================================================================
// TEST GENERATOR - Emits test events on demand or periodically
// ============================================================================

var TestGeneratorDef = &ProcessorDef{
	ID:          "test-generator",
	Name:        "Test Generator",
	Description: "Generates test signals for debugging",
	Category:    "source",
	Ports: ProcessorPorts{
		Inputs:  []PortDef{},
		Outputs: []PortDef{{ID: "out1", Label: "out"}},
	},
	Create: func(config map[string]any, runtime *ProcessorRuntime) ProcessorHandle {
		return &testGenHandle{runtime: runtime}
	},
}

type testGenHandle struct {
	runtime *ProcessorRuntime
}

func (h *testGenHandle) Start() {
	// Emit one test signal on start
	signal := CreateSignal(SignalTypeEvent, map[string]any{
		"event": "test-generator-started",
		"room":  h.runtime.RoomNodeID + ":" + h.runtime.RoomSystemKey,
	})
	signal.Source = SignalSource{
		ProcessorID:   h.runtime.InstanceID,
		ProcessorType: "test-generator",
		RoomNodeID:    h.runtime.RoomNodeID,
		RoomSystemKey: h.runtime.RoomSystemKey,
	}
	signal.AppendTrace(h.runtime.InstanceID, "test-generator", h.runtime.RoomNodeID, h.runtime.RoomSystemKey)

	h.runtime.Dispatcher.Emit(signal, h.runtime.InstanceID, "out1", 0)
	h.runtime.Bus.Publish(ProcessorEventsChannel(h.runtime.InstanceID), signal)
}

func (h *testGenHandle) Stop() {}

func (h *testGenHandle) OnInput(signal *Signal, portID string) {}
