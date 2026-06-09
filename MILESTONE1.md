# Fabrica Milestone 1 — Terminal ↔ Agent Interaction

**Status:** COMPLETE (tested and working)
**Date:** 2026-06-09

## What's Built

Terminal-to-agent signal flow via MCP tools. You can interact with VSM agents from Claude Code.

```
Claude Code ──MCP──▶ fabrica-mcp ──HTTP──▶ fabrica daemon ──WS──▶ relay ◀── Fabrica UI
                                                │
                                    Status line polls /inbox-count
```

## Components

### 1. Relay Server (enhanced)
**Location:** `server/relay.js`, `server/auth.js`
- JWT auth: `/auth/register`, `/auth/login`, `/auth/me`
- Signal API: `/api/inbox`, `/api/send`, `/api/ack/:id`, `/api/rooms`, `/api/rooms/join`
- WebSocket with token auth
- In-memory user store (replace with DB for production)

### 2. Go Daemon
**Location:** `cmd/daemon/`
**Binary:** `cmd/daemon/fabrica`

Commands:
```bash
fabrica login           # Auth, stores token in ~/.fabrica-auth.json
fabrica status          # Show user, inbox count, rooms
fabrica inbox           # List pending signals
fabrica send <room> <msg>
fabrica ack <signal-id>
fabrica join <room>
fabrica rooms
fabrica daemon          # Run HTTP server on :8889
```

### 3. MCP Server
**Location:** `cmd/mcp-server/`
**Binary:** `cmd/mcp-server/fabrica-mcp`

Tools for Claude:
- `fabrica_inbox` — fetch pending signals
- `fabrica_send` — send signal to room
- `fabrica_ack` — acknowledge signal
- `fabrica_rooms` — list assigned rooms
- `fabrica_join_room` — join a room

### 4. Status Line
**Script:** `~/.claude/fabrica-status.sh`
**Config:** `~/.claude/settings.json`

Shows `[fabrica: N]` when signals pending, `[fabrica]` when empty.

## How to Run

```bash
# Terminal 1: Start relay
cd /Users/calebcreed/fabrica
npm run relay

# Terminal 2: Start daemon (first time: login)
cd /Users/calebcreed/fabrica/cmd/daemon
./fabrica login          # Enter email + password
./fabrica join S2        # Join a room
./fabrica daemon         # Run in foreground (or background with &)

# Restart Claude Code to pick up MCP config
```

## MCP Config

Already added to `~/.claude.json` under `projects["/Users/calebcreed"].mcpServers`:

```json
"fabrica": {
  "type": "stdio",
  "command": "/Users/calebcreed/fabrica/cmd/mcp-server/fabrica-mcp"
}
```

## Test Account

- Email: `caleb@fabrica.local`
- Password: `test123`
- Rooms: `S2`
- Config: `~/.fabrica-auth.json`

## Verified Working

- [x] Relay auth endpoints
- [x] Daemon CLI commands
- [x] Daemon HTTP server (:8889)
- [x] MCP protocol + all 5 tools
- [x] Signal send/receive between users
- [x] Status line updates
- [x] Ack removes from inbox

## What's Next (Milestone 2+)

Per the plan, after terminal↔agent works:
- Room stubs in Fabrica UI (minimal shell components)
- Each room shows "Signal received" indicator
- Discuss architecture per room before building out

## Files Created/Modified

| File | Change |
|------|--------|
| `server/relay.js` | Added HTTP server, auth, signal routing |
| `server/auth.js` | NEW: JWT auth module |
| `cmd/daemon/main.go` | NEW: Go CLI + HTTP daemon |
| `cmd/daemon/go.mod` | NEW: Go module |
| `cmd/daemon/Makefile` | NEW: Build scripts |
| `cmd/daemon/README.md` | NEW: Usage docs |
| `cmd/mcp-server/main.go` | NEW: MCP server |
| `cmd/mcp-server/go.mod` | NEW: Go module |
| `~/.claude.json` | Added fabrica MCP server |
| `~/.claude/settings.json` | Added statusLine config |
| `~/.claude/fabrica-status.sh` | NEW: Status script |
| `package.json` | Added daemon scripts |

## Build

```bash
cd cmd/daemon && make all   # Builds both daemon and mcp-server
```
