// Entity model — flat stores, CRUD commands, validation

export function createModel(rootType = 'management') {
  const rootId = crypto.randomUUID()
  return {
    entities: { [rootId]: { type: rootType, name: '' } },
    children: { [rootId]: [] },
    parents: { [rootId]: null },
    rootId,
  }
}

// --- Validation ---

export function canAddOperation(model, parentId) {
  const parent = model.entities[parentId]
  if (!parent || parent.type !== 'management') return false
  const childIds = model.children[parentId] || []
  if (childIds.some(id => model.entities[id]?.type === 'operation')) return false
  if (childIds.some(id => model.entities[id]?.type === 'management')) return false
  return true
}

export function canAddManagement(model, parentId) {
  const parent = model.entities[parentId]
  if (!parent || parent.type !== 'management') return false
  const childIds = model.children[parentId] || []
  if (childIds.some(id => model.entities[id]?.type === 'operation')) return false
  return true
}

// --- Commands ---

export function addNode(model, parentId, nodeType) {
  if (!model.entities[parentId]) return model
  if (nodeType === 'operation' && !canAddOperation(model, parentId)) return model
  if (nodeType === 'management' && !canAddManagement(model, parentId)) return model
  const id = crypto.randomUUID()
  return {
    ...model,
    entities: { ...model.entities, [id]: { type: nodeType, name: '' } },
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

// Move a node to a new parent. Detaches from current parent, attaches to new.
// Cannot move root. Cannot move into own descendants. Cannot create invalid structures.
export function moveNode(model, nodeId, newParentId) {
  if (!model.entities[nodeId] || !model.entities[newParentId]) return model
  if (nodeId === model.rootId) return model
  if (newParentId === model.parents[nodeId]) return model // already there
  // Can't move into own subtree
  const isDescendant = (id, targetId) => {
    for (const cid of (model.children[id] || [])) {
      if (cid === targetId || isDescendant(cid, targetId)) return true
    }
    return false
  }
  if (isDescendant(nodeId, newParentId)) return model
  // Target must be management
  if (model.entities[newParentId].type !== 'management') return model
  // Check structure validity: if target has an operation, can't add management there
  const nodeType = model.entities[nodeId].type
  const targetKids = model.children[newParentId] || []
  if (nodeType === 'management' && targetKids.some(id => model.entities[id]?.type === 'operation')) return model
  if (nodeType === 'operation' && targetKids.some(id => model.entities[id]?.type === 'management')) return model
  if (nodeType === 'operation' && targetKids.some(id => model.entities[id]?.type === 'operation')) return model

  const oldParentId = model.parents[nodeId]
  return {
    ...model,
    children: {
      ...model.children,
      [oldParentId]: model.children[oldParentId].filter(id => id !== nodeId),
      [newParentId]: [...(model.children[newParentId] || []), nodeId],
    },
    parents: { ...model.parents, [nodeId]: newParentId },
  }
}

// Insert a new management parent above a node.
// The node's current parent becomes grandparent, the new node becomes the parent.
export function insertParent(model, nodeId) {
  if (!model.entities[nodeId]) return model
  const oldParentId = model.parents[nodeId]
  const newId = crypto.randomUUID()

  if (nodeId === model.rootId) {
    // Inserting above root: new node becomes the root
    return {
      ...model,
      entities: { ...model.entities, [newId]: { type: 'management', name: '' } },
      children: {
        ...model.children,
        [newId]: [nodeId],
      },
      parents: { ...model.parents, [nodeId]: newId, [newId]: null },
      rootId: newId,
    }
  }

  return {
    ...model,
    entities: { ...model.entities, [newId]: { type: 'management', name: '' } },
    children: {
      ...model.children,
      [oldParentId]: model.children[oldParentId].map(id => id === nodeId ? newId : id),
      [newId]: [nodeId],
    },
    parents: { ...model.parents, [nodeId]: newId, [newId]: oldParentId },
  }
}

// Flatten: remove a node and reconnect its children to its parent.
// Only works on management nodes (not root, not operations).
export function flattenNode(model, nodeId) {
  if (!model.entities[nodeId]) return model
  if (nodeId === model.rootId) return model
  if (model.entities[nodeId].type !== 'management') return model
  const parentId = model.parents[nodeId]
  if (!parentId) return model

  const nodeChildren = model.children[nodeId] || []
  // Check: parent can't have mixed management+operation after flattening
  const parentKids = model.children[parentId].filter(id => id !== nodeId)
  const allKids = [...parentKids, ...nodeChildren]
  const hasMgmt = allKids.some(id => model.entities[id]?.type === 'management')
  const hasOp = allKids.some(id => model.entities[id]?.type === 'operation')
  if (hasMgmt && hasOp) return model // would create invalid structure

  const entities = { ...model.entities }
  const children = { ...model.children }
  const parents = { ...model.parents }

  // Remove the node, splice its children into the parent's children list
  const idx = children[parentId].indexOf(nodeId)
  children[parentId] = [
    ...children[parentId].slice(0, idx),
    ...nodeChildren,
    ...children[parentId].slice(idx + 1),
  ]
  // Update parents of promoted children
  for (const cid of nodeChildren) {
    parents[cid] = parentId
  }
  // Remove the flattened node
  delete entities[nodeId]
  delete children[nodeId]
  delete parents[nodeId]

  return { ...model, entities, children, parents }
}

// Duplicate a subtree under a new parent (or same parent).
// Deep copies all nodes with new IDs. Names are preserved.
export function duplicateSubtree(model, nodeId, targetParentId) {
  if (!model.entities[nodeId] || !model.entities[targetParentId]) return model
  if (model.entities[targetParentId].type !== 'management') return model

  const entities = { ...model.entities }
  const children = { ...model.children }
  const parents = { ...model.parents }

  function copyNode(sourceId, parentId) {
    const newId = crypto.randomUUID()
    entities[newId] = { ...model.entities[sourceId], name: model.entities[sourceId].name ? model.entities[sourceId].name + ' (copy)' : '' }
    children[newId] = []
    parents[newId] = parentId
    children[parentId].push(newId)
    for (const childId of (model.children[sourceId] || [])) {
      copyNode(childId, newId)
    }
    return newId
  }

  const newRootId = copyNode(nodeId, targetParentId)
  return { ...model, entities, children, parents }
}

export function renameNode(model, nodeId, name) {
  if (!model.entities[nodeId]) return model
  return {
    ...model,
    entities: {
      ...model.entities,
      [nodeId]: { ...model.entities[nodeId], name },
    },
  }
}
