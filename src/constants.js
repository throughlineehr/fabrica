import { color } from './styles'

// --- Grid & Layout ---
export const SQUARE_SIZE = 1
export const MARGIN = 0.2
export const CELL = SQUARE_SIZE + MARGIN
export const LAYER_SPACING = 1.5
export const NODE_SPACING = 1

// --- Systems ---
export const SYSTEMS = {
  s5: { color: color.s5.fill, strokeColor: color.s5.stroke, yOffset: 0, shape: 'diamond' },
  s4: { color: color.s4.fill, strokeColor: color.s4.stroke, yOffset: 1, shape: 'diamond' },
  s3: { color: color.s3.fill, strokeColor: color.s3.stroke, yOffset: 2, shape: 'diamond' },
}

export const EXTERNAL_SYSTEMS = {
  s2: { color: color.s2.fill, strokeColor: color.s2.stroke, shape: 'triangle' },
  s1: { color: color.s1.fill, strokeColor: color.s1.stroke, shape: 'ellipse' },
}

// S2 positioning
export const S2_Y_OFFSET = SYSTEMS.s3.yOffset + 1
export const S2_PANE_X_OFFSET = 1.5
export const S2_PANE_SCALE = 2.1

// --- Camera ---
export const FOCUS_DISTANCE = 3
export const PANE_DISTANCE = 5
export const SYSTEM_VIEW_DISTANCE = 2
export const TREE_VIEW_ZOOM = 1.2
export const CAMERA_FOV = 45
export const CAMERA_NEAR = 0.1
export const CAMERA_FAR = 1000
export const CAMERA_INITIAL = [10, 8, 12]
export const CAMERA_LOOK_INITIAL = [0, -2, 1]
export const CAMERA_LERP_SPEED = 0.08
export const CAMERA_SNAP_THRESHOLD = 0.05

// --- Opacity ---
export const OPACITY = {
  fillNormal: 0.45,
  fillDimmed: 0.08,
  fillHighlighted: 0.7,
  strokeNormal: 1,
  strokeDimmed: 0.15,
  strokeHighlighted: 1,
  outlineDimmed: 0.1,
  connectionDimmed: 0.1,
}

// --- Animation Timings (ms) ---
export const TRANSITION = {
  zoomIn: 300,
  fadeComplete: 700,
  fadeBack: 400,
  cssDuration: '0.4s',
}

// --- Tree ---
export const MAX_TREE_DEPTH = 20

// --- Geometry ---
export const ELLIPSE_RADIUS = SQUARE_SIZE * 0.4
export const TRIANGLE_SIZE_RATIO = 0.55
export const ROUNDED_RECT_RADIUS = 0.2
export const ROUNDED_RECT_STROKE = 0.06
export const CONNECTION_DOT_RADIUS = 0.03

// --- Accessibility Scaling ---
export const FONT_VISIBILITY_SCALE = 0.4
export const FONT_VISIBILITY_WEIGHT_BOOST = 200

// --- Z-Index ---
export const Z_INDEX = {
  systemPage: 100,
  hud: 900,
  menu: 1000,
}

// --- Coordinate Transform ---
export function toWorld(x, y, z) {
  return [x * CELL, z * LAYER_SPACING, y * CELL]
}

// Get the center Y offset for a node (for camera targeting)
export function getNodeCenterY(node) {
  return node.type === 'operation' ? SYSTEMS.s3.yOffset : 1
}

// Get the pane-view world position of a system on a node
export function getSystemPanePosition(node, systemKey) {
  let x = node.x
  let y
  if (SYSTEMS[systemKey]) {
    y = SYSTEMS[systemKey].yOffset
  } else if (systemKey === 's1') {
    y = SYSTEMS.s3.yOffset
  } else if (systemKey === 's2') {
    x = node.x + S2_PANE_X_OFFSET
    y = SYSTEMS.s3.yOffset
  }
  return toWorld(x, y, node.layer)
}
