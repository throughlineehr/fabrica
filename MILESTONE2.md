# Fabrica Milestone 2 — Invite System & Distribution

**Status:** COMPLETE (code ready, deployment pending)
**Date:** 2026-06-09

## What's Built

User onboarding flow via invite links. Cybernetician creates invite → user clicks link → installs CLI → connects automatically.

```
Cybernetician                    User
     │                            │
     ├─ POST /api/invites ───────►│
     │  {rooms: ["S1","S2"]}      │
     │                            │
     │◄─ {token, url} ────────────┤
     │                            │
     ├─ Send invite URL ─────────►│ (email, slack, etc)
     │                            │
     │                            ├─ Opens landing page
     │                            │
     │                            ├─ brew install thirdcreed/fabrica/fabrica
     │                            ├─ fabrica install
     │                            ├─ fabrica start <invite-url>
     │                            │
     │◄─ User appears in rooms ───┤
```

## Components

### 1. Invite System (relay.go)

**Endpoints:**
- `POST /api/invites` — Create invite (auth required)
  - Body: `{"rooms": ["S1", "S2"]}`
  - Returns: `{"invite": {...}, "url": "/invite/TOKEN"}`

- `GET /api/invites/:token` — Get invite status (public)
  - Returns: `{"token": "...", "rooms": [...], "redeemed": bool}`

- `POST /invite/:token/redeem` — Redeem invite (public)
  - Body: `{"email": "...", "password": "..."}`
  - Returns: `{"user": {...}, "token": "auth-token"}`
  - Auto-assigns user to rooms specified in invite

- `GET /invite/:token` — Landing page (public)
  - HTML page with install instructions
  - Polls for redemption, shows success when complete

### 2. CLI Invite Handling (main.go)

```bash
fabrica start https://fabrica.acme.com/invite/TOKEN
```

Detects invite URL, extracts server + token, calls redeem endpoint, saves auth.

### 3. Landing Page

Clean HTML page with 4 steps:
1. Install via Homebrew
2. Run `fabrica install`
3. Run `fabrica start <full-invite-url>`
4. Restart Claude Code

Auto-updates to "You're connected!" when invite is redeemed.

## Deployment

### Option A: Simple VPS

```bash
# On server (DigitalOcean, Linode, etc)
fabrica start  # Runs on :8888

# Use Caddy for HTTPS
caddy reverse-proxy --from fabrica.yourcompany.com --to localhost:8888
```

### Option B: Docker

```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY cmd/daemon/ ./cmd/daemon/
COPY cmd/mcp-server/ ./cmd/mcp-server/
RUN cd cmd/daemon && go build -o /fabrica .
RUN cd cmd/mcp-server && go build -o /fabrica-mcp .

FROM alpine:latest
COPY --from=builder /fabrica /usr/local/bin/
COPY --from=builder /fabrica-mcp /usr/local/bin/
EXPOSE 8888
CMD ["fabrica", "start"]
```

### Option C: Fly.io (recommended for quick deploy)

```toml
# fly.toml
app = "fabrica-relay"
primary_region = "ord"

[http_service]
  internal_port = 8888
  force_https = true
```

```bash
fly launch
fly deploy
```

## Distribution (Homebrew)

### 1. Create tap repo

Create `thirdcreed/homebrew-fabrica` on GitHub with:

```
Formula/
  fabrica.rb
```

### 2. Build releases

```bash
cd cmd/daemon
make formula VERSION=0.1.0
```

Creates `dist/fabrica.rb` with correct SHA256 hashes.

### 3. Upload to GitHub

1. Create release `v0.1.0` on `thirdcreed/fabrica`
2. Upload tarballs from `dist/`
3. Copy `dist/fabrica.rb` to tap repo

### 4. Users install

```bash
brew install thirdcreed/fabrica/fabrica
```

## Persistence (TODO)

Current implementation is in-memory. For production:

- Users, invites, rooms need to persist to disk/database
- Options: SQLite, PostgreSQL, or simple JSON files
- Add on server startup: load state from disk
- Add on state change: save to disk

## Files

| File | Description |
|------|-------------|
| `cmd/daemon/relay.go` | Invite struct, CreateInvite, GetInvite, RedeemInvite, landing page |
| `cmd/daemon/main.go` | CLI invite URL detection, redeemInvite function |
| `cmd/daemon/Makefile` | `make formula` for releases |
| `homebrew/fabrica.rb` | Formula template |

## Testing

```bash
# Start server
fabrica start

# Login as admin
fabrica login

# Create invite
curl -X POST http://localhost:8888/api/invites \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rooms": ["S2"]}'

# View landing page
open http://localhost:8888/invite/TOKEN

# Redeem (new terminal, clear config first)
rm ~/.fabrica-auth.json
fabrica start http://localhost:8888/invite/TOKEN
```

## Next Steps

1. **Persistence** — Save state to disk/DB
2. **Deploy** — Set up server + domain
3. **Homebrew tap** — Create repo, upload release
4. **Admin UI** — Web interface for creating invites (currently API-only)
