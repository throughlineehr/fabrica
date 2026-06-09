// Fabrica MCP Server — Exposes fabrica tools to Claude Code.
//
// This server implements the Model Context Protocol (MCP) over stdio,
// providing tools for Claude to interact with the Fabrica signal system.
//
// Tools:
//   fabrica_inbox      - Fetch pending signals
//   fabrica_send       - Send a signal to a room
//   fabrica_ack        - Acknowledge a signal
//   fabrica_rooms      - List user's assigned rooms
//   fabrica_join_room  - Join a room

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const (
	serverURL = "http://localhost:8888"
)

// MCP Protocol types
type JSONRPCRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      any             `json:"id"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type JSONRPCResponse struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id,omitempty"`
	Result  any    `json:"result,omitempty"`
	Error   *Error `json:"error,omitempty"`
}

type Error struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type InitializeParams struct {
	ProtocolVersion string `json:"protocolVersion"`
	ClientInfo      struct {
		Name    string `json:"name"`
		Version string `json:"version"`
	} `json:"clientInfo"`
	Capabilities struct{} `json:"capabilities"`
}

type InitializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	ServerInfo      ServerInfo   `json:"serverInfo"`
	Capabilities    Capabilities `json:"capabilities"`
}

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type Capabilities struct {
	Tools ToolsCapability `json:"tools"`
}

type ToolsCapability struct {
	ListChanged bool `json:"listChanged"`
}

type Tool struct {
	Name        string     `json:"name"`
	Description string     `json:"description"`
	InputSchema JSONSchema `json:"inputSchema"`
}

type JSONSchema struct {
	Type       string              `json:"type"`
	Properties map[string]Property `json:"properties,omitempty"`
	Required   []string            `json:"required,omitempty"`
}

type Property struct {
	Type        string `json:"type"`
	Description string `json:"description"`
}

type ToolCallParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

type ToolResult struct {
	Content []ContentBlock `json:"content"`
	IsError bool           `json:"isError,omitempty"`
}

type ContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// Tools definition
var tools = []Tool{
	{
		Name:        "fabrica_inbox",
		Description: "Fetch pending signals from the Fabrica inbox. Returns a list of signals waiting for your attention.",
		InputSchema: JSONSchema{Type: "object"},
	},
	{
		Name:        "fabrica_send",
		Description: "Send a signal to a Fabrica room. Use this to communicate with agents in specific rooms.",
		InputSchema: JSONSchema{
			Type: "object",
			Properties: map[string]Property{
				"room":    {Type: "string", Description: "The room ID to send the signal to"},
				"content": {Type: "string", Description: "The message content to send"},
				"type":    {Type: "string", Description: "Signal type (default: 'message')"},
			},
			Required: []string{"room", "content"},
		},
	},
	{
		Name:        "fabrica_ack",
		Description: "Acknowledge a signal, removing it from the inbox. Use the signal ID from fabrica_inbox.",
		InputSchema: JSONSchema{
			Type: "object",
			Properties: map[string]Property{
				"signal_id": {Type: "string", Description: "The ID of the signal to acknowledge"},
			},
			Required: []string{"signal_id"},
		},
	},
	{
		Name:        "fabrica_rooms",
		Description: "List the rooms you are assigned to.",
		InputSchema: JSONSchema{Type: "object"},
	},
	{
		Name:        "fabrica_join_room",
		Description: "Join a Fabrica room to receive signals from it.",
		InputSchema: JSONSchema{
			Type: "object",
			Properties: map[string]Property{
				"room": {Type: "string", Description: "The room ID to join"},
			},
			Required: []string{"room"},
		},
	},
}

// Config for auth token
type Config struct {
	Token string `json:"token"`
}

var authToken string

func init() {
	// Load auth token from config file
	home, _ := os.UserHomeDir()
	configPath := filepath.Join(home, ".fabrica-auth.json")
	if data, err := os.ReadFile(configPath); err == nil {
		var cfg Config
		if json.Unmarshal(data, &cfg) == nil {
			authToken = cfg.Token
		}
	}
}

func serverRequest(method, path string, body any) (map[string]any, error) {
	var reqBody io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, serverURL+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if authToken != "" {
		req.Header.Set("Authorization", "Bearer "+authToken)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fabrica not running? Run: fabrica start")
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	return result, nil
}

func handleToolCall(name string, args map[string]any) ToolResult {
	switch name {
	case "fabrica_inbox":
		result, err := serverRequest("GET", "/api/inbox", nil)
		if err != nil {
			return errorResult(err.Error())
		}
		signals, _ := result["signals"].([]any)
		if len(signals) == 0 {
			return textResult("Your inbox is empty.")
		}
		var sb bytes.Buffer
		sb.WriteString(fmt.Sprintf("You have %d signals:\n\n", len(signals)))
		for _, s := range signals {
			sig, _ := s.(map[string]any)
			id, _ := sig["id"].(string)
			sigType, _ := sig["type"].(string)
			content := sig["content"]
			from, _ := sig["fromEmail"].(string)
			room, _ := sig["room"].(string)
			ts, _ := sig["timestamp"].(float64)
			t := time.UnixMilli(int64(ts))

			sb.WriteString(fmt.Sprintf("**[%s]** %s\n", id, t.Format("15:04:05")))
			sb.WriteString(fmt.Sprintf("From: %s | Room: %s | Type: %s\n", from, room, sigType))
			if content != nil {
				contentJSON, _ := json.Marshal(content)
				sb.WriteString(fmt.Sprintf("Content: %s\n", contentJSON))
			}
			sb.WriteString("\n")
		}
		return textResult(sb.String())

	case "fabrica_send":
		room, _ := args["room"].(string)
		content, _ := args["content"].(string)
		sigType, _ := args["type"].(string)
		if sigType == "" {
			sigType = "message"
		}

		result, err := serverRequest("POST", "/api/send", map[string]any{
			"room":    room,
			"type":    sigType,
			"content": content,
		})
		if err != nil {
			return errorResult(err.Error())
		}

		sent, _ := result["sent"].(bool)
		memberCount, _ := result["memberCount"].(float64)
		if sent {
			return textResult(fmt.Sprintf("Signal sent to room '%s' (%d members)", room, int(memberCount)))
		}
		return errorResult("Failed to send signal")

	case "fabrica_ack":
		signalID, _ := args["signal_id"].(string)

		result, err := serverRequest("POST", "/api/ack/"+signalID, nil)
		if err != nil {
			return errorResult(err.Error())
		}

		acked, _ := result["acked"].(bool)
		if acked {
			return textResult(fmt.Sprintf("Signal %s acknowledged and removed from inbox", signalID))
		}
		return textResult(fmt.Sprintf("Signal %s not found in inbox", signalID))

	case "fabrica_rooms":
		result, err := serverRequest("GET", "/api/rooms", nil)
		if err != nil {
			return errorResult(err.Error())
		}

		rooms, _ := result["rooms"].([]any)
		if len(rooms) == 0 {
			return textResult("You are not assigned to any rooms. Use fabrica_join_room to join one.")
		}

		var sb bytes.Buffer
		sb.WriteString("Your rooms:\n")
		for _, r := range rooms {
			sb.WriteString(fmt.Sprintf("- %v\n", r))
		}
		return textResult(sb.String())

	case "fabrica_join_room":
		room, _ := args["room"].(string)

		result, err := serverRequest("POST", "/api/rooms/join", map[string]string{
			"room": room,
		})
		if err != nil {
			return errorResult(err.Error())
		}

		joined, _ := result["joined"].(string)
		return textResult(fmt.Sprintf("Joined room: %s", joined))

	default:
		return errorResult(fmt.Sprintf("Unknown tool: %s", name))
	}
}

func textResult(text string) ToolResult {
	return ToolResult{
		Content: []ContentBlock{{Type: "text", Text: text}},
	}
}

func errorResult(text string) ToolResult {
	return ToolResult{
		Content: []ContentBlock{{Type: "text", Text: "Error: " + text}},
		IsError: true,
	}
}

func handleRequest(req JSONRPCRequest) JSONRPCResponse {
	switch req.Method {
	case "initialize":
		var params InitializeParams
		json.Unmarshal(req.Params, &params)

		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: InitializeResult{
				ProtocolVersion: "2024-11-05",
				ServerInfo: ServerInfo{
					Name:    "fabrica-mcp",
					Version: "1.0.0",
				},
				Capabilities: Capabilities{
					Tools: ToolsCapability{ListChanged: false},
				},
			},
		}

	case "notifications/initialized":
		// Client confirmed initialization - no response needed
		return JSONRPCResponse{}

	case "tools/list":
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  map[string]any{"tools": tools},
		}

	case "tools/call":
		var params ToolCallParams
		json.Unmarshal(req.Params, &params)

		result := handleToolCall(params.Name, params.Arguments)
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  result,
		}

	default:
		return JSONRPCResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &Error{Code: -32601, Message: "Method not found: " + req.Method},
		}
	}
}

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	// Increase buffer size for large messages
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var req JSONRPCRequest
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			resp := JSONRPCResponse{
				JSONRPC: "2.0",
				Error:   &Error{Code: -32700, Message: "Parse error"},
			}
			out, _ := json.Marshal(resp)
			fmt.Println(string(out))
			continue
		}

		resp := handleRequest(req)
		// Don't send response for notifications (no ID)
		if resp.JSONRPC == "" && resp.ID == nil {
			continue
		}

		out, _ := json.Marshal(resp)
		fmt.Println(string(out))
	}
}
