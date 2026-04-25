# Slack connector

Forwards Slack channel messages into Fabrica via the relay. Uses Socket
Mode, so no public HTTPS endpoint is needed — the bot connects outward
to Slack from your machine.

Two scripts in this folder:

- `index.js` — the real connector. Talks to Slack, forwards to the relay.
- `stdin.js` — a stub that reads stdin and forwards. Used to verify the
  relay round-trip without Slack credentials.

## One-time Slack app setup

1. Go to https://api.slack.com/apps and click **Create New App** → **From scratch**.
2. Name it (e.g. "Fabrica") and pick your workspace.
3. In the left sidebar:
   - **Socket Mode** → toggle **Enable Socket Mode** on. When prompted,
     create an **App-Level Token** with the scope `connections:write`.
     Save the `xapp-...` token — this is your `SLACK_APP_TOKEN`.
   - **OAuth & Permissions** → under **Bot Token Scopes** add:
     - `channels:history` — read messages in public channels
     - `channels:read`    — see channel names
     - `groups:history`   — (optional) read messages in private channels
     - `groups:read`      — (optional) see private channel names
     - `users:read`       — resolve user IDs to names
   - **Event Subscriptions** → toggle **Enable Events** on. Under
     **Subscribe to bot events** add:
     - `message.channels`
     - `message.groups` (if you added the groups scopes)
4. Back in **OAuth & Permissions**, click **Install to Workspace**.
   Approve. Save the `xoxb-...` Bot User OAuth Token — this is your
   `SLACK_BOT_TOKEN`.
5. In Slack, invite the bot to any channel you want to read:
   `/invite @Fabrica`

## Configure

```sh
cp connectors/slack/.env.example connectors/slack/.env
# edit connectors/slack/.env, fill in SLACK_BOT_TOKEN and SLACK_APP_TOKEN
```

`.env` is gitignored — your tokens never enter the repo. The npm script
loads it automatically via Node's `--env-file-if-exists` flag.

## Run

In one terminal:

```sh
npm run relay
```

In another:

```sh
npm run connector:slack
```

(If you'd rather pass tokens inline without `.env`, you still can:
`SLACK_BOT_TOKEN=xoxb-... SLACK_APP_TOKEN=xapp-... npm run connector:slack`)

Now in Fabrica:

1. `npm run dev`
2. Drill into an S1 operation
3. Add a **WebSocket Transducer** processor
4. Set:
   - **URL**: `ws://localhost:8888/slack/all`
   - **Format**: JSON
   - **Signal type**: narrative
   - **Tags**: `slack`
5. Anything anyone says in any channel the bot is in shows up live.

## Optional env

- `RELAY_URL` — override the relay path. Default
  `ws://localhost:8888/slack/all`. If you set this to e.g.
  `ws://localhost:8888/slack/engineering`, point your transducer at
  the same path.
- `SLACK_INCLUDE_SUBTYPES=1` — also forward edits, deletes, joins,
  bot messages, file uploads. Off by default; only plain user messages
  are forwarded.

## Signal payload shape

Each message becomes a JSON payload:

```json
{
  "source": "slack",
  "channel": "engineering",
  "channelId": "C0123456",
  "user": "Alice Adams",
  "userId": "U0123456",
  "text": "shipped the migration",
  "ts": "1714000000.000123",
  "threadTs": null,
  "subtype": null
}
```

Fabrica's websocket-transducer parses this as the signal `content`.
SignalFeed renders it; you can wire it to processors that filter on
`channel` or `user` via tags later.

## Plans

This connector currently lives in the Fabrica repo as the *first*
connector. Long-term it'll move out into its own package
(`@fabrica-connector/slack`) — see `PLUGIN-MANIFEST.md`. Until the
plugin loader exists, keeping it in-repo is the path of least friction.
