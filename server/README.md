# server/

Fabrica's tiny server-side surface.

## relay.js — stateless WebSocket relay

A pure broadcast pipe between *connectors* (which read from the outside
world) and Fabrica's `websocket-transducer` processors (which read into
S1 rooms). Every URL path is an independent channel.

### Run

```sh
npm run relay
# Fabrica relay listening on ws://localhost:8888
```

Override port: `PORT=9000 npm run relay`.

### Use

A connector pushes events to a path:

```
ws://localhost:8888/slack/general
```

A `websocket-transducer` in a Fabrica S1 room subscribes to the same
URL. The relay forwards each message to all *other* peers on that path
(senders never receive their own messages).

### Why this exists

P0 Fabrica is a browser app. It can't keep a Slack bot token, can't
sustain a long Slack connection, and can't be a server-side webhook
target. Connectors solve all of that — they live outside the browser,
hold credentials, talk to external APIs, and push the cleaned-up
events at this relay.

The relay is intentionally minimum-viable: stateless, no auth, no
persistence. Those concerns belong to P1's full server.
