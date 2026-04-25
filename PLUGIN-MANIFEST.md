# Fabrica — Plugin Manifest Design

How third parties extend Fabrica without their code being bundled into
Fabrica. The goal: ship Fabrica with a small set of *generic primitives*
(websocket transducer, http transducer, http effector, …) and let
plugins compose them into named, friendlier presets.

This doc captures the design we settled on while building the first
transducer. It is the path from "Fabrica ships with Slack stuff" (no)
to "anyone can publish a plugin" (yes).

Companion docs:
- `ROADMAP.md` — when each layer of this lands (P1 manifest, P2 sandbox)
- `ARCHITECTURE-NEXT.md` — broader plugin notes
- `server/README.md`, `connectors/README.md` — the connector half today

---

## The frame

A plugin has up to three pieces:

1. **A manifest** (JSON file) — Fabrica-side. Describes what the plugin
   shows in the library modal, its config form, what generic primitive
   it extends.
2. **A connector** (separate process) — outside Fabrica. Holds
   credentials, talks to the external API, pushes to the relay.
3. **(Optional) A custom DetailView** — Fabrica-side. For plugins whose
   config UX outgrows what the schema can describe (e.g. a Slack channel
   picker that shows your real channels). Sandboxed in P2+.

Most plugins need only (1) + (2). The third is the escape hatch.

---

## The manifest

```json
{
  "schemaVersion": "1",
  "id": "slack-channel",
  "name": "Slack Channel",
  "description": "Read messages from a Slack channel.",
  "version": "1.0.0",
  "publisher": {
    "name": "Fabrica Connectors",
    "url": "https://github.com/example/fabrica-slack"
  },
  "kind": "transducer",
  "extends": "websocket-transducer",
  "placement": ["s1"],
  "tags": ["slack", "chat"],
  "icon": "slack",
  "defaults": {
    "parse": "json",
    "signalType": "narrative",
    "tags": ["slack"]
  },
  "configSchema": [
    {
      "key": "channel",
      "label": "Channel",
      "type": "text",
      "placeholder": "general",
      "required": true,
      "default": "general"
    },
    {
      "key": "includeBots",
      "label": "Include bot messages",
      "type": "boolean",
      "default": false
    }
  ],
  "compute": {
    "url": "ws://localhost:8888/slack/{channel}"
  },
  "connector": {
    "name": "@fabrica-connector/slack",
    "version": "^1.0.0",
    "endpoint": "https://connectors.fabrica.example/slack",
    "selfHostable": true,
    "auth": "oauth2:slack"
  },
  "compliance": {
    "externalRequests": ["wss://*.slack.com", "https://slack.com/api/*"],
    "dataResidency": "follows-connector",
    "license": "Hippocratic-2.1"
  }
}
```

### Field-by-field

- **`schemaVersion`** — manifest schema version. Fabrica refuses
  manifests with a schemaVersion it doesn't understand.
- **`id`** — globally unique. Suggested form: `publisher-name/plugin-id`
  in P2+ when there's a registry; flat in P1.
- **`kind`** — `transducer | effector | processor`. Determines library-
  modal grouping and validates `placement`.
- **`extends`** — the generic primitive this plugin wraps. The primitive
  must be present in the running Fabrica's library. Example primitives:
  - `websocket-transducer` (already exists)
  - `http-poll-transducer` (P1)
  - `http-webhook-transducer` (P1, requires server)
  - `mqtt-transducer` (P1)
  - `http-effector` (P1)
- **`placement`** — system keys this plugin can be placed in. For
  transducers/effectors, `["s1"]`.
- **`defaults`** — values for the underlying primitive's config that the
  plugin sets without user choice (e.g. always parse JSON for Slack).
- **`configSchema`** — array of fields shown to the user in the detail
  view. Field types in v1:
  - `text` (string, optional placeholder, regex validation)
  - `number` (with min/max/step)
  - `boolean` (rendered as a Toggle)
  - `select` (with options)
  - `secret` (password-style; never echoed; stored encrypted at server)
  - `tags` (multi-select free-text)
- **`compute`** — derived config values. Templates use `{key}`
  substitution against the user's configSchema input. Result is merged
  on top of `defaults` and below user overrides. Compute is the bridge
  between the human-friendly fields and the underlying primitive.
- **`connector`** — descriptor for the out-of-process half:
  - `name`, `version` — npm-style identification
  - `endpoint` — a hosted instance, if the publisher offers one
  - `selfHostable` — whether users can run it themselves
  - `auth` — declared auth method (`none | apiKey | oauth2:<provider>`)
- **`compliance`** — declarations for sandboxing, audit, sovereignty:
  - `externalRequests` — hosts/protocols the connector touches
  - `dataResidency` — where data flows (`follows-connector`,
    `eu-only`, `us-only`, custom)
  - `license` — license under which the plugin runs (Hippocratic-2.1
    enforced at install time in P5+)

---

## How Fabrica loads manifests

### P1 — registered installs (npm-style)

1. User clicks `+ Plugin` in library modal → enters package name or URL
2. Fabrica fetches the manifest, validates the schema
3. If valid, manifest is added to the user's local plugin store
4. Library modal regenerates from the union of built-in + installed
5. Plugin removal = remove from local store + restart any running
   instances of it

The manifest store could be:
- LocalStorage (P0/P1 single-user)
- Per-user Postgres row (P1+ multi-user)
- Per-org with admin-managed install (P3+)

### P2 — sandboxed UI plugins

For plugins that need a custom DetailView beyond what `configSchema`
can express:

```json
{
  "ui": {
    "detailView": "https://cdn.example.com/slack-plugin/v1/view.js",
    "sandbox": "iframe",
    "permissions": ["slack:channels:read"]
  }
}
```

The view runs in an iframe with a postMessage protocol:
- `getConfig()` → returns current config
- `updateConfig(patch)` → sets config
- `requestPermission(scope)` → opens consent dialog
- The iframe cannot reach Fabrica's main React state, the agent API,
  the bus, or any other plugin's state.

### P5 — federated registry

Plugins published to a registry, signed by publisher, verified at
install. Hippocratic License enforced. Multiple registries allowed
(no central authority). Same UX as native app stores; fundamentally
different trust model (federated, not centralized).

---

## Worked example: slack-channel plugin

End-to-end with the manifest above:

1. **Publisher creates** a manifest file + a connector package
   `@fabrica-connector/slack` (Node + Slack Bolt SDK).
2. **User clicks Install** in Fabrica's library modal. Fabrica fetches
   manifest, shows publisher info, asks for confirmation.
3. **User confirms.** Manifest added to user's plugin store. "Slack
   Channel" appears in library modal under "Transducers".
4. **User adds a Slack Channel** to an S1 room. ProcessorPage shows a
   form with one text field ("Channel: general") and a checkbox.
5. **User fills `channel = #engineering`.** Behind the scenes, Fabrica:
   - Computes `url = "ws://localhost:8888/slack/#engineering"` from the
     `compute` template
   - Merges `defaults` (parse=json, signalType=narrative, tags=[slack])
   - Instantiates a `websocket-transducer` with this config
6. **User starts a connector** for the first time:
   - If `connector.endpoint` is set and they choose hosted: OAuth flow
     against Slack via the publisher's hosted service; connector
     instance spins up; pushes to the hosted relay path
   - If self-hosted: user installs `@fabrica-connector/slack`, runs
     `fabrica-slack-connect --token=$SLACK_TOKEN --channel=#engineering`,
     which connects to `ws://localhost:8888/slack/#engineering`
7. **Messages flow.** Slack → connector → relay → transducer → S1 room
   → S2/S3/etc.

Fabrica never touched Slack. Fabrica's `library.js` never grew a Slack
import. The only Slack-aware code lives in the connector (publisher's
repo) and the manifest (one JSON file).

---

## What stays in Fabrica core

- The 5–10 generic primitives:
  - **Transducers**: websocket, http-poll, http-webhook (P1+), mqtt,
    file-watch (with local daemon)
  - **Effectors**: http-post, websocket-send, file-write
  - **S1→S2 transducers** (variety filters): digest (LLM-backed buffer
    + theming), and statistical equivalents (Welford / sigma /
    trend / CUSUM) per `fabrica_subsystem_references`.
  - **Processors**: heartbeat, tracer, logger, filter, mapper, debouncer,
    counter, threshold (the Counter/Tagger track from earlier)
- The relay (server-side, P0)
- The manifest loader (P1)
- The form generator (P1, renders configSchema)
- The sandbox host (P2, for custom DetailViews)
- The plugin store + install/remove UI (P1)

That's it. Everything else is plugin territory.

---

## What is *out of scope* for the manifest

These are connector concerns and stay in publisher's code:

- Authentication flows (OAuth, API key generation)
- Rate-limit handling for external APIs
- Schema mapping from external system's events to Fabrica signals
- Persistent state (last-seen cursors, dedup memory)
- Connection management (reconnect, backoff)
- Anything specific to the external system's protocol

This split is a hard line. If a manifest tries to specify any of the
above, the design is wrong: that belongs in the connector.

---

## Effectors are symmetric

Everything above applies in mirror:
- Effector manifest extends `http-effector` instead of `websocket-transducer`
- `defaults` set HTTP method, headers
- `configSchema` collects URL, payload template
- Connector consumes from a relay path and acts on the outside world

The library modal groups by `kind`: Transducers, Processors, Effectors.

---

## Open questions

- **Versioning of the underlying primitive.** If `websocket-transducer`'s
  contract changes, do all plugins extending it break? Need a
  primitives-version compatibility matrix.
- **Manifest distribution.** P1 = paste URL. P2+ = registry. What's the
  registry shape? Federated? Centralized? Both?
- **OAuth flow standardization.** Should Fabrica broker OAuth flows for
  hosted connectors, or push that responsibility entirely to publishers?
  Likely Fabrica brokers (better UX, avoids each publisher reinventing
  the redirect URI).
- **Permissions consent UX.** When a plugin declares `externalRequests`,
  how is that surfaced at install time? Detail view? Modal? Required
  to accept Hippocratic License click-through?
- **Pre-install validation.** Can Fabrica connect to the manifest's
  declared connector endpoint before completing install? Useful for
  sanity, but adds dependency on connector being live at install time.
- **Plugin updates.** When a manifest's version changes, prompt user?
  Auto-update with minor version? Lock to version they installed?

---

## What this means for what we build first

In order:
1. Add a **second generic primitive** (probably `http-poll-transducer`)
   to validate that the plugin model isn't shaped only around websockets.
2. Build the **manifest loader** (P1) — given a JSON file, register it
   as a derived processor in the library.
3. Build the **schema-driven form generator** — consumes `configSchema`,
   renders the same Field components our WebSocketTransducerView
   already uses.
4. Build the **install/remove UI** — paste URL, confirm, done.
5. *(P2)* Sandboxed DetailView host for custom UIs.

Stages 1-4 are doable in P0/P1 without server changes beyond what we
already have. Stage 5 is the real "P2: plugin ecosystem" milestone.
