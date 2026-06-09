// Fabrica — CLI for terminal ↔ agent interaction.
//
// Commands:
//   fabrica install         Configure Claude Code MCP + status line
//   fabrica start           Start the server (relay + daemon)
//   fabrica stop            Stop the server
//   fabrica login           Auth flow, stores token
//   fabrica status          Show connection status, inbox count
//   fabrica inbox           List pending signals
//   fabrica send <room> <message>  Send signal
//
// One binary, no dependencies. Just install and go.

package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	defaultRelayURL   = "http://localhost:8888"
	defaultPort       = 8888
	configFileName    = ".fabrica-auth.json"
	pidFileName       = ".fabrica.pid"
	statusScriptName  = "fabrica-status.sh"
)

type Config struct {
	Token    string `json:"token"`
	Email    string `json:"email"`
	UserID   string `json:"userId"`
	RelayURL string `json:"relayUrl"`
}

type Signal struct {
	ID        string `json:"id"`
	Type      string `json:"type"`
	Content   any    `json:"content"`
	From      string `json:"from"`
	FromEmail string `json:"fromEmail,omitempty"`
	Room      string `json:"room"`
	Timestamp int64  `json:"timestamp"`
}

var config Config

func configPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, configFileName)
}

func pidPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, pidFileName)
}

func claudeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude")
}

func claudeConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".claude.json")
}

func claudeSettingsPath() string {
	return filepath.Join(claudeDir(), "settings.json")
}

func statusScriptPath() string {
	return filepath.Join(claudeDir(), statusScriptName)
}

func loadConfig() error {
	data, err := os.ReadFile(configPath())
	if err != nil {
		if os.IsNotExist(err) {
			return nil // No config yet
		}
		return err
	}
	return json.Unmarshal(data, &config)
}

func saveConfig() error {
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(configPath(), data, 0600)
}

func relayURL() string {
	if config.RelayURL != "" {
		return config.RelayURL
	}
	if url := os.Getenv("FABRICA_RELAY_URL"); url != "" {
		return url
	}
	return defaultRelayURL
}

func executablePath() string {
	exe, err := os.Executable()
	if err != nil {
		return "fabrica"
	}
	return exe
}

// cmdInstall configures Claude Code MCP and status line
func cmdInstall() {
	home, _ := os.UserHomeDir()
	exe := executablePath()

	// Ensure ~/.claude directory exists
	if err := os.MkdirAll(claudeDir(), 0755); err != nil {
		fmt.Printf("Error creating .claude directory: %v\n", err)
		os.Exit(1)
	}

	// 1. Create status line script
	statusScript := `#!/bin/bash
# Read config (handles both compact and pretty-printed JSON)
CONFIG=$(python3 -c "import json; c=json.load(open('$HOME/.fabrica-auth.json')); print(c.get('token',''), c.get('relayUrl','http://localhost:8888'))" 2>/dev/null)
TOKEN=$(echo "$CONFIG" | cut -d' ' -f1)
SERVER=$(echo "$CONFIG" | cut -d' ' -f2)

if [ -z "$TOKEN" ]; then
  echo ""
  exit 0
fi

COUNT=$(curl -s -H "Authorization: Bearer $TOKEN" "$SERVER/api/inbox-count" 2>/dev/null | grep -o '"count":[0-9]*' | grep -o '[0-9]*')

if [ -z "$COUNT" ]; then
  echo ""
elif [ "$COUNT" = "0" ]; then
  echo "⚫ fabrica"
else
  echo "🟢 fabrica: $COUNT"
fi
`
	if err := os.WriteFile(statusScriptPath(), []byte(statusScript), 0755); err != nil {
		fmt.Printf("Error writing status script: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ Created %s\n", statusScriptPath())

	// 2. Update ~/.claude/settings.json with status line
	settings := make(map[string]any)
	if data, err := os.ReadFile(claudeSettingsPath()); err == nil {
		json.Unmarshal(data, &settings)
	}
	settings["statusLine"] = map[string]any{
		"type":      "command",
		"command":   statusScriptPath(),
		"refreshMs": 5000,
	}
	settingsData, _ := json.MarshalIndent(settings, "", "  ")
	if err := os.WriteFile(claudeSettingsPath(), settingsData, 0644); err != nil {
		fmt.Printf("Error writing settings: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ Updated %s\n", claudeSettingsPath())

	// 3. Update ~/.claude.json with MCP server
	claudeConfig := make(map[string]any)
	if data, err := os.ReadFile(claudeConfigPath()); err == nil {
		json.Unmarshal(data, &claudeConfig)
	}

	// Find the MCP binary (should be alongside this binary)
	mcpPath := filepath.Join(filepath.Dir(exe), "fabrica-mcp")
	if _, err := os.Stat(mcpPath); os.IsNotExist(err) {
		// Try in same directory
		mcpPath = filepath.Join(filepath.Dir(exe), "..", "mcp-server", "fabrica-mcp")
	}

	// Get or create mcpServers at global level
	mcpServers, _ := claudeConfig["mcpServers"].(map[string]any)
	if mcpServers == nil {
		mcpServers = make(map[string]any)
	}
	mcpServers["fabrica"] = map[string]any{
		"type":    "stdio",
		"command": mcpPath,
	}
	claudeConfig["mcpServers"] = mcpServers

	claudeData, _ := json.MarshalIndent(claudeConfig, "", "  ")
	if err := os.WriteFile(claudeConfigPath(), claudeData, 0644); err != nil {
		fmt.Printf("Error writing claude config: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ Updated %s\n", claudeConfigPath())

	fmt.Println("")
	fmt.Println("Installation complete!")
	fmt.Println("")
	fmt.Println("Next steps:")
	fmt.Printf("  1. Run: %s start\n", exe)
	fmt.Println("  2. Restart Claude Code")
	fmt.Printf("  3. Run: %s login\n", home)
}

// cmdStart runs the server in the background
func cmdStart(args []string) {
	// Check if already running
	if pid := readPid(); pid > 0 {
		if processExists(pid) {
			fmt.Printf("Fabrica is already running (PID %d)\n", pid)
			fmt.Println("Use 'fabrica stop' to stop it first.")
			os.Exit(1)
		}
	}

	// Handle server URL or invite URL argument
	var inviteToken string
	if len(args) > 0 {
		serverURL := args[0]
		// Ensure it has a scheme
		if !strings.HasPrefix(serverURL, "http://") && !strings.HasPrefix(serverURL, "https://") {
			serverURL = "https://" + serverURL
		}

		// Check if this is an invite URL
		if strings.Contains(serverURL, "/invite/") {
			// Extract server base URL and invite token
			parts := strings.SplitN(serverURL, "/invite/", 2)
			config.RelayURL = parts[0]
			inviteToken = parts[1]
			fmt.Printf("Connecting to %s with invite...\n", config.RelayURL)
		} else {
			config.RelayURL = serverURL
			fmt.Printf("Connecting to %s\n", serverURL)
		}

		if err := saveConfig(); err != nil {
			fmt.Printf("Warning: couldn't save config: %v\n", err)
		}
	} else if config.RelayURL == "" {
		// Default to local server (runs embedded relay)
		config.RelayURL = defaultRelayURL
	}

	// Only run embedded relay for localhost
	runLocalRelay := strings.Contains(config.RelayURL, "localhost") || strings.Contains(config.RelayURL, "127.0.0.1")

	needsLogin := config.Token == ""

	// Remote server - just login, no local server needed
	if !runLocalRelay {
		fmt.Printf("Connected to %s\n", config.RelayURL)

		// If we have an invite token, redeem it
		if inviteToken != "" {
			fmt.Println("")
			fmt.Println("Redeeming invite...")
			if err := redeemInvite(inviteToken); err != nil {
				fmt.Printf("Error: %v\n", err)
				os.Exit(1)
			}
			return
		}

		if needsLogin {
			fmt.Println("")
			fmt.Println("No account found. Let's set one up.")
			fmt.Println("")
			cmdLogin()
		}
		return
	}

	// Local server - fork to background
	if os.Getenv("FABRICA_FOREGROUND") != "1" {
		// Create log file for background process
		home, _ := os.UserHomeDir()
		logPath := filepath.Join(home, ".fabrica.log")
		logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			fmt.Printf("Error creating log file: %v\n", err)
			os.Exit(1)
		}

		cmd := exec.Command(os.Args[0], "start")
		cmd.Env = append(os.Environ(), "FABRICA_FOREGROUND=1")
		cmd.Stdout = logFile
		cmd.Stderr = logFile
		cmd.Stdin = nil
		// Detach from parent process group
		cmd.SysProcAttr = &syscall.SysProcAttr{
			Setpgid: true,
		}

		if err := cmd.Start(); err != nil {
			fmt.Printf("Error starting background process: %v\n", err)
			os.Exit(1)
		}

		// Give the process a moment to start
		time.Sleep(500 * time.Millisecond)

		// Check if it's still running
		if !processExists(cmd.Process.Pid) {
			fmt.Println("Error: Server failed to start. Check ~/.fabrica.log for details.")
			os.Exit(1)
		}

		// Write PID file
		if err := os.WriteFile(pidPath(), []byte(strconv.Itoa(cmd.Process.Pid)), 0644); err != nil {
			fmt.Printf("Warning: couldn't write PID file: %v\n", err)
		}

		fmt.Printf("Fabrica started (PID %d)\n", cmd.Process.Pid)
		fmt.Println("Server running on http://localhost:8888")
		fmt.Printf("Logs: %s\n", logPath)

		// If no account, prompt for login now that server is running
		if needsLogin {
			fmt.Println("")
			fmt.Println("No account found. Let's set one up.")
			fmt.Println("")
			cmdLogin()
		}
		return
	}

	// Running in foreground (backgrounded process)
	runServer()
}

// cmdStop stops the running server
func cmdStop() {
	pid := readPid()
	if pid <= 0 {
		fmt.Println("Fabrica is not running (no PID file)")
		return
	}

	if !processExists(pid) {
		fmt.Printf("Fabrica is not running (stale PID %d)\n", pid)
		os.Remove(pidPath())
		return
	}

	process, err := os.FindProcess(pid)
	if err != nil {
		fmt.Printf("Error finding process: %v\n", err)
		os.Exit(1)
	}

	if err := process.Signal(syscall.SIGTERM); err != nil {
		fmt.Printf("Error stopping process: %v\n", err)
		os.Exit(1)
	}

	os.Remove(pidPath())
	fmt.Printf("Fabrica stopped (PID %d)\n", pid)
}

func readPid() int {
	data, err := os.ReadFile(pidPath())
	if err != nil {
		return 0
	}
	pid, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	return pid
}

func processExists(pid int) bool {
	process, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds. Send signal 0 to check.
	return process.Signal(syscall.Signal(0)) == nil
}

// runServer starts the embedded relay server
func runServer() {
	relay := NewRelay()

	port := defaultPort
	if p := os.Getenv("FABRICA_PORT"); p != "" {
		fmt.Sscanf(p, "%d", &port)
	}

	// Handle shutdown gracefully
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		os.Remove(pidPath())
		os.Exit(0)
	}()

	fmt.Printf("Fabrica server listening on http://localhost:%d\n", port)

	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), relay); err != nil {
		fmt.Printf("Server error: %v\n", err)
		os.Exit(1)
	}
}

func apiRequest(method, path string, body any) (map[string]any, error) {
	var reqBody io.Reader
	if body != nil {
		data, _ := json.Marshal(body)
		reqBody = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, relayURL()+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if config.Token != "" {
		req.Header.Set("Authorization", "Bearer "+config.Token)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connection failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	if errMsg, ok := result["error"].(string); ok {
		return result, fmt.Errorf(errMsg)
	}

	return result, nil
}

func cmdLogin() {
	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Email: ")
	email, _ := reader.ReadString('\n')
	email = strings.TrimSpace(email)

	fmt.Print("Password: ")
	password, _ := reader.ReadString('\n')
	password = strings.TrimSpace(password)

	// Try login first
	result, err := apiRequest("POST", "/auth/login", map[string]string{
		"email":    email,
		"password": password,
	})

	if err != nil {
		// If login fails, try register
		result, err = apiRequest("POST", "/auth/register", map[string]string{
			"email":    email,
			"password": password,
		})
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Registered new account.")
	}

	token, _ := result["token"].(string)
	user, _ := result["user"].(map[string]any)
	userId, _ := user["id"].(string)

	config.Token = token
	config.Email = email
	config.UserID = userId

	if err := saveConfig(); err != nil {
		fmt.Printf("Warning: couldn't save config: %v\n", err)
	}

	fmt.Printf("Logged in as %s\n", email)
}

func redeemInvite(token string) error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Email: ")
	email, _ := reader.ReadString('\n')
	email = strings.TrimSpace(email)

	fmt.Print("Password: ")
	password, _ := reader.ReadString('\n')
	password = strings.TrimSpace(password)

	result, err := apiRequest("POST", "/invite/"+token+"/redeem", map[string]string{
		"email":    email,
		"password": password,
	})
	if err != nil {
		return err
	}

	authToken, _ := result["token"].(string)
	user, _ := result["user"].(map[string]any)
	userId, _ := user["id"].(string)
	rooms, _ := user["rooms"].([]any)

	config.Token = authToken
	config.Email = email
	config.UserID = userId

	if err := saveConfig(); err != nil {
		fmt.Printf("Warning: couldn't save config: %v\n", err)
	}

	fmt.Printf("Welcome! Logged in as %s\n", email)
	fmt.Printf("Rooms: %v\n", rooms)
	return nil
}

func cmdStatus() {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	result, err := apiRequest("GET", "/auth/me", nil)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	user, _ := result["user"].(map[string]any)
	email, _ := user["email"].(string)
	rooms, _ := user["rooms"].([]any)

	countResult, _ := apiRequest("GET", "/api/inbox-count", nil)
	count, _ := countResult["count"].(float64)

	fmt.Printf("User: %s\n", email)
	fmt.Printf("Inbox: %d signals\n", int(count))
	fmt.Printf("Rooms: %v\n", rooms)
	fmt.Printf("Relay: %s\n", relayURL())
}

func cmdInbox() {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	result, err := apiRequest("GET", "/api/inbox", nil)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	signals, _ := result["signals"].([]any)
	if len(signals) == 0 {
		fmt.Println("Inbox empty.")
		return
	}

	fmt.Printf("Inbox (%d signals):\n\n", len(signals))
	for _, s := range signals {
		sig, _ := s.(map[string]any)
		id, _ := sig["id"].(string)
		sigType, _ := sig["type"].(string)
		content := sig["content"]
		from, _ := sig["fromEmail"].(string)
		room, _ := sig["room"].(string)
		ts, _ := sig["timestamp"].(float64)

		t := time.UnixMilli(int64(ts))
		fmt.Printf("[%s] %s\n", id, t.Format("15:04:05"))
		fmt.Printf("  From: %s | Room: %s | Type: %s\n", from, room, sigType)
		if content != nil {
			contentJSON, _ := json.MarshalIndent(content, "  ", "  ")
			fmt.Printf("  Content: %s\n", contentJSON)
		}
		fmt.Println()
	}
}

func cmdSend(args []string) {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	if len(args) < 2 {
		fmt.Println("Usage: fabrica send <room> <message>")
		os.Exit(1)
	}

	room := args[0]
	message := strings.Join(args[1:], " ")

	result, err := apiRequest("POST", "/api/send", map[string]any{
		"room":    room,
		"type":    "message",
		"content": message,
	})
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	sent, _ := result["sent"].(bool)
	memberCount, _ := result["memberCount"].(float64)
	if sent {
		fmt.Printf("Sent to room '%s' (%d members)\n", room, int(memberCount))
	}
}

func cmdAck(args []string) {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	if len(args) < 1 {
		fmt.Println("Usage: fabrica ack <signal-id>")
		os.Exit(1)
	}

	signalID := args[0]

	result, err := apiRequest("POST", "/api/ack/"+signalID, nil)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	acked, _ := result["acked"].(bool)
	if acked {
		fmt.Printf("Acknowledged: %s\n", signalID)
	} else {
		fmt.Printf("Signal not found: %s\n", signalID)
	}
}

func cmdJoin(args []string) {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	if len(args) < 1 {
		fmt.Println("Usage: fabrica join <room>")
		os.Exit(1)
	}

	room := args[0]

	result, err := apiRequest("POST", "/api/rooms/join", map[string]string{
		"room": room,
	})
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	joined, _ := result["joined"].(string)
	fmt.Printf("Joined room: %s\n", joined)
}

func cmdRooms() {
	if config.Token == "" {
		fmt.Println("Not logged in. Run: fabrica login")
		os.Exit(1)
	}

	result, err := apiRequest("GET", "/api/rooms", nil)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	rooms, _ := result["rooms"].([]any)
	if len(rooms) == 0 {
		fmt.Println("Not assigned to any rooms. Use: fabrica join <room>")
		return
	}

	fmt.Println("Rooms:")
	for _, r := range rooms {
		fmt.Printf("  - %v\n", r)
	}
}


func printUsage() {
	fmt.Println("Fabrica CLI")
	fmt.Println("")
	fmt.Println("Setup:")
	fmt.Println("  install              Configure Claude Code MCP + status line")
	fmt.Println("  start [server-url]   Connect to server (local if no URL)")
	fmt.Println("  stop                 Stop local server")
	fmt.Println("")
	fmt.Println("Commands:")
	fmt.Println("  login           Authenticate with server")
	fmt.Println("  status          Show connection status and inbox count")
	fmt.Println("  inbox           List pending signals")
	fmt.Println("  send <room> <message>  Send a signal")
	fmt.Println("  ack <signal-id> Acknowledge a signal")
	fmt.Println("  join <room>     Join a room")
	fmt.Println("  rooms           List your rooms")
	fmt.Println("")
	fmt.Println("Environment:")
	fmt.Println("  FABRICA_PORT          Server port (default: 8888)")
}

func main() {
	if err := loadConfig(); err != nil {
		fmt.Printf("Warning: couldn't load config: %v\n", err)
	}

	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	cmd := os.Args[1]
	args := os.Args[2:]

	switch cmd {
	case "install":
		cmdInstall()
	case "start":
		cmdStart(args)
	case "stop":
		cmdStop()
	case "login":
		cmdLogin()
	case "status":
		cmdStatus()
	case "inbox":
		cmdInbox()
	case "send":
		cmdSend(args)
	case "ack":
		cmdAck(args)
	case "join":
		cmdJoin(args)
	case "rooms":
		cmdRooms()
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Printf("Unknown command: %s\n", cmd)
		printUsage()
		os.Exit(1)
	}
}
