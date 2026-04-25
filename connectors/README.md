# connectors/

Bridges between the outside world and Fabrica's S1 transducers.
Each connector is a standalone Node process that:

1. Talks to a specific external system (Slack, Discord, an MQTT broker,
   a sensor, an email inbox, …)
2. Holds the credentials for that system
3. Pushes events into Fabrica via the relay (see `../server/relay.js`)

A connector is **not** part of Fabrica's React app. It runs in its
own process. Kill it without affecting the app; restart it without
affecting the app.

## Why connectors are separate processes

- Credentials never enter the browser
- External-API failure is isolated from the UI
- A user can run only the connectors they need, on any machine
- The same Fabrica deployment can have different connectors per
  organization without rebuilding

## Pattern

```
  outside world          connector              relay              Fabrica
  ────────────       ────────────────       ───────────       ──────────────
  Slack channel  →   slack/index.js   →    ws://...:8888/    →   websocket-
  Discord guild  →   discord/index.js →    /slack/general    →   transducer
  MQTT topic     →   mqtt/index.js    →    /discord/foo      →   in S1 room
  ...
```

Each connector publishes to a path. The corresponding S1 transducer
in Fabrica subscribes to the same path.

## Connectors today

### slack/

- `stdin.js` — stub that reads lines from stdin and forwards them.
  Use this to test the relay round-trip without Slack credentials.
  Real Slack support (Socket Mode + Bolt SDK) lands next.

```sh
npm run relay                              # one terminal
echo "hello world" | node connectors/slack/stdin.js   # another
# In Fabrica: add a websocket-transducer at S1 with URL
# ws://localhost:8888/slack/general — each line becomes a signal.
```

## Adding a connector

1. Create a folder under `connectors/<name>/`
2. Write a Node script that connects to the external system
3. Forward each event as a JSON message to the relay path of your choice
4. Document the path and event shape in a README in that folder
