package main

import (
	"sync"
)

// Bus is an in-memory publish/subscribe message bus
type Bus struct {
	mu          sync.RWMutex
	subscribers map[string]map[int]func(*Signal) // channel -> id -> handler
	nextID      int
}

// NewBus creates a new message bus
func NewBus() *Bus {
	return &Bus{
		subscribers: make(map[string]map[int]func(*Signal)),
	}
}

// Publish sends a signal to all subscribers of a channel
func (b *Bus) Publish(channel string, signal *Signal) {
	b.mu.RLock()
	subs := b.subscribers[channel]
	b.mu.RUnlock()

	if subs == nil {
		return
	}

	// Call handlers outside the lock to prevent deadlocks
	for _, handler := range subs {
		handler(signal)
	}
}

// Subscribe registers a handler for a channel, returns unsubscribe function
func (b *Bus) Subscribe(channel string, handler func(*Signal)) func() {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.subscribers[channel] == nil {
		b.subscribers[channel] = make(map[int]func(*Signal))
	}

	id := b.nextID
	b.nextID++
	b.subscribers[channel][id] = handler

	return func() {
		b.mu.Lock()
		defer b.mu.Unlock()
		delete(b.subscribers[channel], id)
		if len(b.subscribers[channel]) == 0 {
			delete(b.subscribers, channel)
		}
	}
}

// Channel naming helpers

// RoomChannel returns the channel for all signals in a room
func RoomChannel(roomKey string) string {
	return "room:" + roomKey
}

// ProcessorEventsChannel returns the channel for a processor's events
func ProcessorEventsChannel(instanceID string) string {
	return "proc:" + instanceID + ":events"
}
