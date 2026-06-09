package main

// ProcessorDef defines a processor type
type ProcessorDef struct {
	ID          string
	Name        string
	Description string
	Category    string
	Placement   []string // Which system rooms can host this, empty = any
	Ports       ProcessorPorts
	Create      func(config map[string]any, runtime *ProcessorRuntime) ProcessorHandle
}

// ProcessorPorts defines input/output ports
type ProcessorPorts struct {
	Inputs  []PortDef
	Outputs []PortDef
}

// PortDef defines a single port
type PortDef struct {
	ID    string
	Label string
}

// ProcessorRuntime is passed to Create()
type ProcessorRuntime struct {
	Bus           *Bus
	Dispatcher    *Dispatcher
	Hub           *Hub // For delivering signals to clients
	InstanceID    string
	RoomNodeID    string
	RoomSystemKey string
	Filters       Filters
}

// ProcessorHandle is returned by Create()
type ProcessorHandle interface {
	Start()
	Stop()
	OnInput(signal *Signal, portID string)
}

// ProcessorRegistry holds all available processor definitions
var ProcessorRegistry = map[string]*ProcessorDef{}

// RegisterProcessor adds a processor def to the registry
func RegisterProcessor(def *ProcessorDef) {
	ProcessorRegistry[def.ID] = def
}

// GetProcessorDef looks up a processor definition
func GetProcessorDef(defID string) *ProcessorDef {
	return ProcessorRegistry[defID]
}

// Initialize built-in processors
func init() {
	RegisterProcessor(HeartbeatDef)
	RegisterProcessor(LoggerDef)
	RegisterProcessor(TracerDef)
	RegisterProcessor(TestGeneratorDef)
}
