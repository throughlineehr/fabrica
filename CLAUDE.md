# Fabrica — Contribution Guide

## What this is
An isometric 3D visualization of a viable system model (VSM). Built with React + Vite + @react-three/fiber + @react-three/drei. Represents an organization as a hierarchy of management units and operations, each containing subsystems (S1–S5).

## Architecture

```
src/
  styles.js              <- SINGLE SOURCE OF TRUTH: colors, typography, UI component styles
  constants.js           <- ALL numbers: layout, opacity, timing, camera, z-index, geometry, helpers
  tree.js                <- Pure functions: layout algorithm, tree traversal, clone, find, nodeHasS2
  App.jsx                <- State + composition only. No rendering logic.
  StyleGuide.jsx         <- Visual reference at ?styleguide
  components/
    IsoSquare.jsx        <- Diamond/square node (S5, S4, S3)
    IsoEllipse.jsx       <- Circle node (S1/operations)
    IsoTriangle.jsx      <- Triangle node (S2). Exports TRI_BOTTOM for alignment.
    RoundedRectOutline.jsx <- Mesh-based outline + fill (NOT lines)
    Connection.jsx       <- Elbow + attenuator connection styles
    MetaUnit.jsx         <- S5+S4+S3 group + optional S2 triangle
    OperationNode.jsx    <- S1 circle + S2 triangle (leaf node)
    MetaTree.jsx         <- Recursive tree renderer
    CameraController.jsx <- Lerp camera with snap + user-interrupt
    HUD.jsx              <- Detail panels + instructions + title
    UI.jsx               <- ContextMenu + BackButton
    SystemPage.jsx       <- Full-page system detail view
```

## Node types
- **management** — MetaUnit (S5/S4/S3 in rounded rect). Can have children. Gets S2 if any descendant has operations.
- **operation** — S1 circle + S2 triangle. Leaf only, no children.

## Systems
**Inside meta unit (SYSTEMS):** S5 (purple, y=0), S4 (orange, y=1), S3 (blue, y=2)
**Outside meta unit (EXTERNAL_SYSTEMS):** S2 (red triangle), S1 (green circle)

**S2 rules:**
- Operations always have S2
- Management gets S2 if any descendant has operations (`nodeHasS2()` in tree.js)
- Sibling S2s chain with attenuator connections
- Rightmost S2 child connects up to parent S2 with attenuator
- S3-to-own-S2 connector has NO attenuator, uses black color in pane view
- In pane view, S2 moves beside the node at `S2_PANE_X_OFFSET` (not below)

## Coordinate system
- `toWorld(x, y, z)` → `[x * CELL, z * LAYER_SPACING, y * CELL]`
- `getNodeCenterY(node)` — returns center y for camera targeting (differs for management vs operation)
- `getSystemPanePosition(node, systemKey)` — returns world position of a system in pane view (handles S2 offset)

## Constants (constants.js)
ALL magic numbers live here. Key groups:
- **Grid**: SQUARE_SIZE, MARGIN, CELL, LAYER_SPACING, NODE_SPACING
- **S2**: S2_Y_OFFSET, S2_PANE_X_OFFSET, S2_PANE_SCALE
- **Camera**: FOCUS_DISTANCE, PANE_DISTANCE, SYSTEM_VIEW_DISTANCE, TREE_VIEW_ZOOM, CAMERA_*
- **Opacity**: OPACITY.fillNormal/fillDimmed/strokeNormal/strokeDimmed/outlineDimmed/connectionDimmed
- **Timing**: TRANSITION.zoomIn/fadeComplete/fadeBack/cssDuration
- **Geometry**: ELLIPSE_RADIUS, ROUNDED_RECT_RADIUS, ROUNDED_RECT_STROKE, CONNECTION_DOT_RADIUS
- **Z-Index**: Z_INDEX.systemPage/hud/menu
- **Helpers**: toWorld(), getNodeCenterY(), getSystemPanePosition()

## Style rules
- Swiss modernism. No decoration. No emoji.
- ALL colors from `styles.js → color`. ALL type from `styles.js → type`.
- Type levels: hero, title, h1, h2, h3, body, caption, mono, monoBold, label
- Context menus: grid card, left accent border, no rounded corners
- Buttons: left-bar tab (2px border, no bg, mono bold)
- Never use `Line` (drei) for thick outlines — use mesh shapes
- Never hardcode hex colors, opacity, timing, z-index, or geometry values
- Never unmount the Canvas — overlay system pages on top

## Camera & interaction
- Perspective camera, OrbitControls disabled in focus/pane/transition modes
- `target.instant = true` snaps camera without lerp
- User input (pointerdown/wheel) cancels lerp animation
- Flow: default → hover → focus (dbl-click) → pane (dbl-click) → system page (dbl-click shape)
- Back steps one level at a time
- Right-click: context menu (Add management / Add operation). Not on operations.

## Running
```
npm run dev          # localhost:5173
?styleguide          # style guide page
```
