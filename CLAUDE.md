# Fabrica — Contribution Guide

## What this is
An isometric 3D visualization of a viable system model (VSM). Built with React + Vite + @react-three/fiber + @react-three/drei + lucide-react. Represents an organization as management units and operations with five subsystems (S1–S5).

## Architecture

```
src/
  styles.js              <- SINGLE SOURCE OF TRUTH: fonts, colors, type tokens, ui component styles
  constants.js           <- ALL numbers: grid, systems, camera, opacity, timing, geometry, z-index, a11y scaling
  tree.js                <- Data model (entities + adjacency + parents), commands, layout, queries
  accessibility.jsx      <- React context: epilepsy, fontVisibility, dyslexia modes
  App.jsx                <- State + composition. No rendering logic.
  StyleGuide.jsx         <- Visual reference at ?styleguide
  main.jsx               <- Entry point, wraps in AccessibilityProvider
  hooks/
    useNodeOpacity.js    <- 3D shape opacity (handles epilepsy: highlight vs dim)
    useA11yType.js       <- Modified type tokens (handles fontVisibility + dyslexia)
  components/
    IsoSquare.jsx        <- Diamond/square (S5, S4, S3)
    IsoEllipse.jsx       <- Circle (S1/operations)
    IsoTriangle.jsx      <- Triangle (S2). Exports TRI_BOTTOM.
    RoundedRectOutline.jsx <- Mesh outline (NOT lines). Also exports RoundedRectFill.
    Connection.jsx       <- Elbow + attenuator styles. Also straight, curved, dashed.
    MetaUnit.jsx         <- S5+S4+S3 group + rounded rect + optional S2
    OperationNode.jsx    <- S1 circle only (leaf node, S2 owned by parent management)
    MetaTree.jsx         <- Recursive renderer: connections, S2 chains, pane/focus/dim
    CameraController.jsx <- Lerp/snap camera, user-interrupt, epilepsy instant mode
    HUD.jsx              <- Breadcrumbs, detail panels (compact/expanded), instructions
    UI.jsx               <- ContextMenu
    SystemPage.jsx       <- Full-page system detail (entered from pane mode)
    TabSystem.jsx        <- Settings/Explorer/Tools panels, Filter bar, keyboard shortcuts
```

## Data model (tree.js)
State is `model = { entities, children, parents, rootId }`:
- `entities: { [uuid]: { type } }` — flat map
- `children: { [parentId]: [childId, ...] }` — adjacency
- `parents: { [childId]: parentId }` — reverse lookup
- Render tree derived: `buildRenderTree(model)` → `{ id, type, children, x, layer }`
- Commands: `addNode(model, parentId, type)`, `removeNode(model, id)` — pure, return new model
- Validation: `canAddManagement()`, `canAddOperation()` — enforce tree rules

## Node types & rules
- **management** — MetaUnit. Can have child management OR one operation (not both).
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
- **E** = Explorer (stub)
- **T** = Tools (node, listen, users stubs)
- **F** = Filter bar (top-center, system color checkboxes)
- Escape closes active panel (captures before HUD's escape handler)
- Eye icon top-right hides/shows all tabs
- Panels are resizable, frosted glass background

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
- Helpers: toWorld(), getNodeCenterY(), getSystemPanePosition()

## Running
```
npm run dev          # localhost:5173
?styleguide          # style guide page
```
