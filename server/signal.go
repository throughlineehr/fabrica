package main

import (
	"time"
)

// SignalType represents the type of signal
type SignalType string

const (
	SignalTypeMetric    SignalType = "metric"
	SignalTypeEvent     SignalType = "event"
	SignalTypeNarrative SignalType = "narrative"
	SignalTypeAlert     SignalType = "alert"
)

// Signal is the core data unit flowing through the system
type Signal struct {
	ID        string         `json:"id"`
	Type      SignalType     `json:"type"`
	Content   map[string]any `json:"content"`
	Source    SignalSource   `json:"source"`
	Trace     []TraceEntry   `json:"trace"`
	Hops      []HopEntry     `json:"hops"`
	Delivered []string       `json:"delivered"` // Room keys that have seen this signal
	Tags      []string       `json:"tags"`
	Timestamp int64          `json:"timestamp"` // Unix milliseconds
}

// SignalSource identifies where a signal originated
type SignalSource struct {
	ProcessorID     string `json:"processorId,omitempty"`
	ProcessorType   string `json:"processorType,omitempty"`
	RoomNodeID      string `json:"roomNodeId,omitempty"`
	RoomSystemKey   string `json:"roomSystemKey,omitempty"`
	ExternalSource  string `json:"externalSource,omitempty"`
}

// TraceEntry records a processor visit
type TraceEntry struct {
	ProcessorID   string `json:"processorId"`
	ProcessorType string `json:"processorType,omitempty"`
	RoomNodeID    string `json:"roomNodeId,omitempty"`
	RoomSystemKey string `json:"roomSystemKey,omitempty"`
	Timestamp     int64  `json:"timestamp"`
}

// HopEntry records a delivery hop
type HopEntry struct {
	FromRoom   string `json:"fromRoom"`
	ToRoom     string `json:"toRoom"`
	TerminalID string `json:"terminalId"`
	HopCount   int    `json:"hopCount"`
}

// CreateSignal creates a new signal with defaults
func CreateSignal(signalType SignalType, content map[string]any) *Signal {
	return &Signal{
		ID:        generateUUID(),
		Type:      signalType,
		Content:   content,
		Trace:     []TraceEntry{},
		Hops:      []HopEntry{},
		Delivered: []string{},
		Tags:      []string{},
		Timestamp: time.Now().UnixMilli(),
	}
}

// AppendTrace adds a trace entry for a processor visit
func (s *Signal) AppendTrace(processorID, processorType, roomNodeID, roomSystemKey string) {
	s.Trace = append(s.Trace, TraceEntry{
		ProcessorID:   processorID,
		ProcessorType: processorType,
		RoomNodeID:    roomNodeID,
		RoomSystemKey: roomSystemKey,
		Timestamp:     time.Now().UnixMilli(),
	})
}

// HasTraced checks if a processor has already seen this signal
func (s *Signal) HasTraced(processorID string) bool {
	for _, t := range s.Trace {
		if t.ProcessorID == processorID {
			return true
		}
	}
	return false
}

// Clone creates a copy of the signal (for forking delivery paths)
func (s *Signal) Clone() *Signal {
	clone := &Signal{
		ID:        s.ID,
		Type:      s.Type,
		Content:   make(map[string]any),
		Source:    s.Source,
		Trace:     make([]TraceEntry, len(s.Trace)),
		Hops:      make([]HopEntry, len(s.Hops)),
		Delivered: s.Delivered, // Shared reference for loop prevention
		Tags:      make([]string, len(s.Tags)),
		Timestamp: s.Timestamp,
	}
	for k, v := range s.Content {
		clone.Content[k] = v
	}
	copy(clone.Trace, s.Trace)
	copy(clone.Hops, s.Hops)
	copy(clone.Tags, s.Tags)
	return clone
}

// MatchesFilters checks if signal passes type/tag filters
func (s *Signal) MatchesFilters(filters Filters) bool {
	// Type filter: nil or empty means any type
	if len(filters.Types) > 0 {
		found := false
		for _, t := range filters.Types {
			if SignalType(t) == s.Type {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}

	// Tag filter: nil or empty means any tags
	if len(filters.Tags) > 0 {
		found := false
		for _, filterTag := range filters.Tags {
			for _, signalTag := range s.Tags {
				if filterTag == signalTag {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if !found {
			return false
		}
	}

	return true
}
