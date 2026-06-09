# Fabrica Daemon

CLI and HTTP server for terminal ↔ agent interaction with Fabrica.

## Quick Start

```bash
# Build
make build

# Login
./fabrica login

# Run daemon (background service for Claude Code)
./fabrica daemon
```

## Commands

| Command | Description |
|---------|-------------|
| `fabrica login` | Authenticate with relay |
| `fabrica status` | Show connection status and inbox count |
| `fabrica inbox` | List pending signals |
| `fabrica send <room> <message>` | Send a signal |
| `fabrica ack <signal-id>` | Acknowledge a signal |
| `fabrica join <room>` | Join a room |
| `fabrica rooms` | List your rooms |
| `fabrica daemon` | Run HTTP server for MCP tools |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `FABRICA_RELAY_URL` | Relay server URL | `http://localhost:8888` |
| `FABRICA_DAEMON_PORT` | Daemon HTTP port | `8889` |

## HTTP Endpoints (Daemon Mode)

When running `fabrica daemon`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/inbox-count` | GET | Get inbox count (for status line) |
| `/inbox` | GET | List all signals |
| `/send` | POST | Send signal `{ room, type, content }` |
| `/ack/:id` | POST | Acknowledge signal |
| `/rooms` | GET | List rooms |
| `/rooms/join` | POST | Join room `{ room }` |

## MCP Integration

The `fabrica-mcp` binary provides Claude Code integration:

```json
// ~/.claude.json
{
  "mcpServers": {
    "fabrica": {
      "type": "stdio",
      "command": "/path/to/fabrica-mcp"
    }
  }
}
```

**MCP Tools:**
- `fabrica_inbox` - Fetch pending signals
- `fabrica_send` - Send signal to room
- `fabrica_ack` - Acknowledge signal
- `fabrica_rooms` - List assigned rooms
- `fabrica_join_room` - Join a room

## Status Line

Add to `~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.claude/fabrica-status.sh",
    "refreshInterval": 5
  }
}
```

The status script shows `[fabrica: N]` when signals are pending.

## Architecture

```
Claude Code → MCP Server → Daemon HTTP → Relay WebSocket → Fabrica UI
                ↓
         Status Line polls /inbox-count
```

The daemon maintains a WebSocket connection to the relay for live updates
and provides a simple HTTP API that the MCP server calls.
