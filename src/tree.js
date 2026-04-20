import { NODE_SPACING, toWorld } from './constants'

// =============================================================================
// MODEL — flat entity store + adjacency
// =============================================================================

// Create a new empty model
export function createModel(rootType = 'management') {
  const rootId = crypto.randomUUID()
  return {
    entities: { [rootId]: { type: rootType } },
    children: { [rootId]: [] },
    parents: { [rootId]: null },
    rootId,
  }
}

// Get entity by id (used by future server/query layer)
export function getEntity(model, id) {
  return model.entities[id] || null
}

// Get children ids (used by future server/query layer)
export function getChildren(model, id) {
  return model.children[id] || []
}

// =============================================================================
// COMMANDS — pure functions: model in, model out
// =============================================================================

export function canAddOperation(model, parentId) {
  const parent = model.entities[parentId]
  if (!parent || parent.type !== 'management') return false
  const childIds = model.children[parentId] || []
  // Can't add operation if already has one
  if (childIds.some(id => model.entities[id]?.type === 'operation')) return false
  // Can't add operation if managing other managers
  if (childIds.some(id => model.entities[id]?.type === 'management')) return false
  return true
}

export function canAddManagement(model, parentId) {
  const parent = model.entities[parentId]
  if (!parent || parent.type !== 'management') return false
  const childIds = model.children[parentId] || []
  // Can't add management if already has an operation
  if (childIds.some(id => model.entities[id]?.type === 'operation')) return false
  return true
}

export function addNode(model, parentId, nodeType) {
  if (!model.entities[parentId]) return model
  if (nodeType === 'operation' && !canAddOperation(model, parentId)) return model
  if (nodeType === 'management' && !canAddManagement(model, parentId)) return model
  const id = crypto.randomUUID()
  return {
    ...model,
    entities: { ...model.entities, [id]: { type: nodeType } },
    children: {
      ...model.children,
      [parentId]: [...(model.children[parentId] || []), id],
      [id]: [],
    },
    parents: { ...model.parents, [id]: parentId },
  }
}

export function removeNode(model, nodeId) {
  if (nodeId === model.rootId) return model
  if (!model.entities[nodeId]) return model

  const parentId = model.parents[nodeId]
  if (!parentId) return model

  // Collect all descendants to remove
  const toRemove = new Set()
  const collect = (id) => {
    toRemove.add(id)
    for (const cid of (model.children[id] || [])) collect(cid)
  }
  collect(nodeId)

  const entities = { ...model.entities }
  const children = { ...model.children }
  const parents = { ...model.parents }
  for (const id of toRemove) {
    delete entities[id]
    delete children[id]
    delete parents[id]
  }
  children[parentId] = children[parentId].filter(id => id !== nodeId)

  return { ...model, entities, children, parents }
}

// =============================================================================
// RENDER TREE — built from model, consumed by components
// =============================================================================

// Build a tree structure that components can render
// Output nodes have: { id, type, children: [...], x, layer }
export function buildRenderTree(model) {
  const tree = buildNode(model, model.rootId)
  applyLayout(tree)
  return tree
}

function buildNode(model, id) {
  const entity = model.entities[id]
  const childIds = model.children[id] || []
  return {
    id,
    type: entity.type,
    children: childIds.map(cid => buildNode(model, cid)),
  }
}

// =============================================================================
// LAYOUT — computes x, layer positions on a render tree
// =============================================================================

function layoutTree(node, depth = 0) {
  node.layer = -depth
  if (node.children.length === 0) {
    node._width = 1
    node._x = 0
    return node
  }
  node.children.forEach((child) => layoutTree(child, depth + 1))
  const totalWidth = node.children.reduce((sum, c) => sum + c._width, 0)
    + (node.children.length - 1) * NODE_SPACING
  let cursor = -totalWidth / 2
  for (const child of node.children) {
    child._x = cursor + child._width / 2
    cursor += child._width + NODE_SPACING
  }
  node._x = (node.children[0]._x + node.children[node.children.length - 1]._x) / 2
  node._width = totalWidth
  return node
}

function assignPositions(node, parentX = 0) {
  node.x = parentX + node._x
  for (const child of node.children) {
    assignPositions(child, node.x)
  }
}

function applyLayout(tree) {
  layoutTree(tree)
  assignPositions(tree)
  return tree
}

// =============================================================================
// QUERIES — work on render trees
// =============================================================================

export function findNode(node, id) {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export function containsNode(node, id) {
  if (node.id === id) return true
  for (const child of node.children) {
    if (containsNode(child, id)) return true
  }
  return false
}

export function nodeHasS2(node) {
  if (node.type === 'operation') return true
  return node.children.some(c => nodeHasS2(c))
}

export function getTreeBounds(node) {
  const pos = toWorld(node.x, 1, node.layer)
  let minX = pos[0], maxX = pos[0], minY = pos[1], maxY = pos[1], minZ = pos[2], maxZ = pos[2]
  for (const child of node.children) {
    const cb = getTreeBounds(child)
    minX = Math.min(minX, cb.minX); maxX = Math.max(maxX, cb.maxX)
    minY = Math.min(minY, cb.minY); maxY = Math.max(maxY, cb.maxY)
    minZ = Math.min(minZ, cb.minZ); maxZ = Math.max(maxZ, cb.maxZ)
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}
