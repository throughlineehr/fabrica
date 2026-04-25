# Fabrica — Contribution Guide

## What this is
An isometric 3D visualization of a viable system model (VSM). Built with React + Vite + @react-three/fiber + @react-three/drei + lucide-react. Represents an organization as management units and operations with five subsystems (S1–S5).

## Architecture

```
src/
  styles.js              <- SINGLE SOURCE OF TRUTH: fonts, colors, type tokens, ui component styles
  constants.js           <- ALL numbers: grid, systems, camera, opacity, timing, geometry, z-index, a11y scaling
  accessibility.jsx      <- React context: epilepsy, fontVisibility, dyslexia modes
  App.jsx                <- State + composition. No rendering logic.
  StyleGuide.jsx         <- Visual reference at ?styleguide
  main.jsx               <- Entry point, wraps providers (I18n, Accessibility, AIConfig)
  tree/
    index.js             <- Re-exports + buildRenderTree
    model.js             <- Entity store, CRUD commands, validation, tree operations
    layout.js            <- Position algorithm (x, layer computation)
    queries.js           <- findNode, containsNode, nodeHasS2, flattenTree, etc.
    serialize.js         <- YAML import/export (full + compact)
    shorthand.js         <- BUILD shorthand parser for AI agent
  agent/
    commands.js          <- Agent command API (createAgentAPI, AGENT_DSL)
    providers.js         <- AI provider configs (Anthropic, OpenAI, Google, Ollama)
    config.jsx           <- AIConfig context (API key, provider, model selection)
    index.js             <- Re-exports
  hooks/
    useNodeOpacity.js    <- 3D shape opacity (handles epilepsy: highlight vs dim)
    useA11yType.js       <- Modified type tokens (handles fontVisibility + dyslexia)
    usePatternTexture.js <- Color-blind pattern textures for 3D shapes
    useTreeKeyboard.js   <- Explorer keyboard handler (nav, cut/copy/paste, delete, rename)
  utils/
    nodeLabel.js         <- Shared node label formatting (name or fallback)
    resolveColor.js      <- Maps colorKey to {fill, stroke} pair (used by all room components)
  i18n/
    index.jsx            <- I18n context + useTranslation hook
    en.js + 8 languages  <- Translation files
  components/
    IsoSquare.jsx        <- Diamond/square (S5, S4, S3)
    IsoEllipse.jsx       <- Circle (S1/operations)
    IsoTriangle.jsx      <- Triangle (S2). Exports TRI_BOTTOM.
    RoundedRectOutline.jsx <- Mesh outline (NOT lines)
    Connection.jsx       <- Elbow + attenuator styles
    MetaUnit.jsx         <- S5+S4+S3 group + rounded rect + optional S2
    OperationNode.jsx    <- S1 circle only (leaf node)
    MetaTree.jsx         <- Recursive 3D tree renderer
    CameraController.jsx <- Lerp/snap camera, user-interrupt
    Keycap.jsx           <- Keyboard shortcut indicator (<kbd>)
    HUD.jsx              <- Composition: breadcrumbs, detail panels, instructions
    UI.jsx               <- ContextMenu (3D right-click)
    SystemPage.jsx       <- System room entry point, routes to RoomShell + Switchboard
    TabSystem.jsx        <- Panel orchestrator (Settings, Explorer, Tools, Agent, Filter)
    ExplorerTree.jsx     <- DOM tree view (keyboard nav, drag-drop, cut/copy/paste, inline actions, delete confirm)
    room/
      RoomShell.jsx              <- Universal system room container: fixed-position cable terminals on edges, content center
      CableTerminal.jsx          <- Cable terminal button: SVG path with 45° bend, hollow dot, navigable labels
      Switchboard.jsx            <- Processor row table: inline dots for in/out, type/tag filters, direction arrows on color collision
      SignalFeed.jsx             <- Live log; aria-live=polite; renders hops per signal
      ProcessorLibraryModal.jsx  <- Picker for processors from the library, filtered by room placement
      TerminalDetail.jsx         <- Detail view of selected terminal's connections (clickable navigation)
    (terminal topology and wiring rules live in src/signals/topology.js — the same module drives both the visual cables and the real subscriptions)
    hud/
      Breadcrumb.jsx     <- Navigation breadcrumb
      DetailPanel.jsx    <- Compact + expanded detail views (with editable name)
      Instructions.jsx   <- Contextual keyboard hints
    tabs/
      FilterBar.jsx      <- System visibility filter
      SettingsPanel.jsx  <- Accessibility, language, AI config
      AgentPanel.jsx     <- AI chat with voice I/O, command execution
    wiring/
      WiringDemo.jsx     <- Working visual + interaction reference for the rack-back patch cable view (used by StyleGuide; future home of the production primitives per INTERNAL-WIRING-DESIGN.md)
  test/
    setup.js
    tree-model.test.js
    tree-operations.test.js
    tree-queries.test.js
    tree-serialize.test.js
    tree-shorthand.test.js
    tree-validate.test.js
    tree-complexity.test.js
```

## Data model (tree/model.js)
State is `model = { entities, children, parents, rootId }`:
- `entities: { [uuid]: { type, name } }` — flat map
- `children: { [parentId]: [childId, ...] }` — adjacency
- `parents: { [childId]: parentId }` — reverse lookup (null for root and orphans)
- Render tree derived: `buildRenderTree(model)` → `{ id, type, name, children, x, layer }`

### Commands (all pure, return new model):
- `addNode(parentId, type)` — add child (blocked only on operations)
- `removeNode(nodeId)` — cascade delete (node + all descendants)
- `spliceNode(nodeId)` — remove node, promote children to grandparent
- `detachNode(nodeId)` — disconnect from parent, keep as orphan
- `moveNode(nodeId, newParentId)` — reparent entire subtree
- `insertParent(nodeId)` — insert new management above this node
- `duplicateSubtree(nodeId, targetParentId)` — deep copy with new IDs
- `createOrphan(model, type, name)` — create standalone unattached node
- `renameNode(nodeId, name)` — set/change name
- `canSplice(model, nodeId)` — checks if splice won't create mixed-type siblings

### Draft/Validate model:
- **Draft mode** (default): relaxed rules, mixed types allowed, orphans allowed
- **Validate mode** (`validateModel(model)`): returns list of issues for publish gate
  - orphan, unnamed, mixed-children, multiple-operations, empty-management, operation-has-children

## Node types & rules (enforced at publish, relaxed in draft)
- **management** — MetaUnit. Should have child management OR one operation (not both).
- **operation** — S1 circle. Leaf only. S2 owned by parent management, not by operation.

## Systems
**Inside meta unit (SYSTEMS):** S5 (purple, y=0), S4 (orange, y=1), S3 (blue, y=2)
**Outside (EXTERNAL_SYSTEMS):** S2 (red triangle), S1 (green circle)

**S2 rules:**
- Management gets S2 if `nodeHasS2()` returns true (recursive: any descendant has operations)
- Management with direct operation child: S2 on management's layer, operation connects up to it
- Management of managers: own S2, rightmost child S2 connects up with attenuator
- Sibling S2s chain with attenuator (elbow + zigzag)
- S3-to-own-S2: plain elbow, black in pane view, red in tree view
- In pane view: S2 moves beside node at S2_PANE_X_OFFSET, scaled by S2_PANE_SCALE

## Accessibility (accessibility.jsx)
Global context with three modes:
- **Epilepsy**: No dimming (highlighted node brightens instead), camera snaps, transitions instant
- **Font visibility** (0–1 slider): Scales font size by FONT_VISIBILITY_SCALE, boosts weight by FONT_VISIBILITY_WEIGHT_BOOST
- **Dyslexia**: Switches to Lexend font (FONT_DYSLEXIA)

**How to use in components:**
- 3D shapes: `useNodeOpacity(dimmed, highlighted)` — returns [fillOp, strokeOp]
- HTML text: `const t = useA11yType()` — then use `t.mono`, `t.h3`, etc. instead of `type.*`
- Connections/outlines: check `useAccessibility().epilepsy` to skip dimming

**Rules:** Never import `type` directly for rendered text in components. Always use `useA11yType()`. The only exception is `styles.js` itself and `StyleGuide.jsx` (reference page).

## Tab system (TabSystem.jsx)
- **S** = Settings (accessibility toggles, display, account stubs)
- **E** = Explorer (full tree view with keyboard nav, drag-drop, cut/copy/paste)
- **T** = Tools (node, listen, users stubs)
- **F** = Filter bar (top-center, system color checkboxes)
- Escape closes active panel (captures before HUD's escape handler)
- Eye icon top-right hides/shows all tabs
- Panels are resizable, frosted glass background

## Explorer tree (ExplorerTree.jsx + useTreeKeyboard.js)
- Full file-system-style keyboard navigation
- **Arrows**: Navigate nodes (Up/Down move focus, Right expands or enters, Left collapses or goes to parent)
- **Enter/Space**: Activate node (focus/pane for data nodes, open system page for system nodes)
- **Cmd/Ctrl+X/C/V**: Cut/copy/paste with interleaved position selector (arrow up/down alternates between "on node" highlight and "between nodes" line)
- **Delete/Backspace**: Delete with inline confirmation (Delete again or Enter confirms, Escape cancels)
- **F2**: Inline rename
- **Escape**: Cancel clipboard → back navigation (priority order)
- **Home/End**: Jump to first/last node
- **Drag and drop**: Data nodes draggable (except root). Drop zones: upper 65% = drop INTO, lower 35% = drop AFTER
- Actions group per node: Rename, Add management, Add operation, Duplicate, Splice, Delete (availability gated by canAddManagement/canAddOperation/canSplice)
- Systems (S1-S5) in tree enter pane/detail view on selection, Enter opens system page
- Action nodes focus their parent meta-unit in 3D
- All screen reader announcements translated via i18n

## 3D context menu (UI.jsx)
- Right-click on any node shows applicable commands
- Items: Add management, Add operation, Duplicate, Splice, Delete (red, danger style)
- Separator between add and destructive actions
- Keyboard navigable (arrows + Enter), Escape closes

## System rooms (room/)
- Each system (S1-S5) opens into a full-viewport room via SystemPage → RoomShell
- Cable terminals are fixed-position at viewport edges, SVG paths with 45° bends clipped at screen edge
- Terminal labels show connected node names (resolved from tree), clickable to navigate along the cable
- Switchboard is an accessible `<table role="grid">` showing processors: inputs (colored dots + type), name, outputs, status
- ROOM_TERMINALS in constants.js defines per-system-type terminal configs (wall, color, direction)
- `resolveColor()` shared utility in `utils/resolveColor.js` — never duplicate
- Tuning constants in RoomShell (edgeOffset, tuning objects) — set DEV_TUNING=true to re-enable interactive sliders

## Style rules
- Swiss modernism. No decoration. No emoji. No rounded corners on menus.
- ALL colors from `styles.js → color`. ALL type from `useA11yType()` hook (not static import).
- Icons: lucide-react, 16px, 1.5 stroke weight
- Context menus: grid card, left accent border, mono font
- Never use `Line` (drei) for thick outlines — use mesh shapes
- Never hardcode values — constants.js for numbers, styles.js for design tokens

## Camera & navigation
- Perspective camera, OrbitControls disabled in focus/pane/transition
- `target.instant = true` snaps camera (epilepsy mode forces this)
- User input (pointerdown/wheel) cancels lerp
- Flow: default → hover → focus (dbl-click) → pane (dbl-click) → system page (dbl-click shape)
- Breadcrumb navigation top-left (clickable segments)
- Escape steps back one level (panels take priority)
- Double-click empty space goes back

## Constants (constants.js)
All magic numbers live here in named groups:
- Grid: SQUARE_SIZE, MARGIN, CELL, LAYER_SPACING, NODE_SPACING
- Systems: SYSTEMS, EXTERNAL_SYSTEMS, S2_Y_OFFSET, S2_PANE_X_OFFSET, S2_PANE_SCALE
- Tree: MAX_TREE_DEPTH
- Camera: FOCUS_DISTANCE, PANE_DISTANCE, SYSTEM_VIEW_DISTANCE, TREE_VIEW_ZOOM, CAMERA_*
- Opacity: OPACITY.fillNormal/fillDimmed/fillHighlighted/strokeNormal/strokeDimmed/etc.
- Timing: TRANSITION.zoomIn/fadeComplete/fadeBack/cssDuration
- Geometry: ELLIPSE_RADIUS, TRIANGLE_SIZE_RATIO, ROUNDED_RECT_*, CONNECTION_DOT_RADIUS
- A11y: FONT_VISIBILITY_SCALE, FONT_VISIBILITY_WEIGHT_BOOST
- Z-Index: Z_INDEX.systemPage/hud/menu
- Explorer: EXPLORER.indent/iconSize/rowMinHeight/dropLineHeight/pasteHighlightAlpha
- Helpers: toWorld(), getNodeCenterY(), getSystemPanePosition()
- Camera presets: focusTarget(node), paneTarget(node), systemTarget(node, systemKey)

## Running
```
npm run dev          # localhost:5173
?styleguide          # style guide page
```

## Working with Caleb (letterrip mode)

If Caleb signals he's stepping away ("I'm leaving," "going to lay
down," "logging off," etc.), enter **letterrip mode** for the agreed
task batch: execute every item without per-item confirmation, pick
defensible defaults for ambiguities and document them in the commit,
and don't pad with "want me to X next?" prompts. Still pause for
destructive git operations, side effects outside the repo, and
genuine product-direction questions. Default outside letterrip is
normal collaborative cadence with brief check-ins at meaningful
boundaries. Triggered by him stating he's away — never enter
preemptively.

(Same rule lives in `~/CLAUDE.md` global; this section ensures
project-scoped sessions inherit it.)
