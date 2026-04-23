// Entity model — flat stores, CRUD commands, validation

function isDescendant(model, id, targetId) {
  for (const cid of (model.children[id] || [])) {
    if (cid === targetId || isDescendant(model, cid, targetId)) return true
  }
  return false
}

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

// Can this node be spliced (removed with children promoted to parent)?
// Blocked when promoting children would create mixed-type siblings or orphan operations.
export function canSplice(model, nodeId) {
  if (!model.entities[nodeId]) return false
  if (nodeId === model.rootId) return false
  if (model.entities[nodeId].type !== 'management') return false
  const parentId = model.parents[nodeId]
  if (!parentId) return false
  const nodeChildren = model.children[nodeId] || []
  if (nodeChildren.length === 0) return false

  const parentChildren = model.children[parentId] || []
  const siblingCount = parentChildren.length - 1 // excluding this node

  const hasOpChildren = nodeChildren.some(id => model.entities[id]?.type === 'operation')

  // Operations must be sole children — can't promote them alongside siblings
  if (hasOpChildren) {
    if (siblingCount > 0) return false // would mix with existing siblings
    if (nodeChildren.length > 1) return false // multiple children can't all be ops
  }

  // Parent already has an operation — can't add more children
  if (parentChildren.some(id => id !== nodeId && model.entities[id]?.type === 'operation')) {
    return false
  }

  return true
}

// --- Commands ---
// Draft mode: structural operations succeed as long as data integrity is maintained.
// VSM-specific rules (mixed types, leaf operations) are checked by validateModel() separately.

export function addNode(model, parentId, nodeType) {
  if (!model.entities[parentId]) return model
  if (model.entities[parentId].type === 'operation') return model // can't add children to operations
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
// Optional insertIndex places at a specific position in the new parent's children.
// Cannot move root. Cannot move into own descendants. Cannot create invalid structures.
export function moveNode(model, nodeId, newParentId, insertIndex) {
  if (!model.entities[nodeId] || !model.entities[newParentId]) return model
  if (nodeId === model.rootId) return model
  // No-op if already at destination and no specific position requested
  if (model.parents[nodeId] === newParentId && insertIndex == null) return model
  if (isDescendant(model, nodeId, newParentId)) return model
  // Can't move into an operation (operations are leaves)
  if (model.entities[newParentId].type === 'operation') return model

  const oldParentId = model.parents[nodeId]
  const oldSiblings = model.children[oldParentId].filter(id => id !== nodeId)
  const newSiblings = oldParentId === newParentId
    ? [...oldSiblings] // same parent — work from filtered list
    : [...(model.children[newParentId] || [])]

  if (insertIndex != null && insertIndex >= 0 && insertIndex <= newSiblings.length) {
    newSiblings.splice(insertIndex, 0, nodeId)
  } else {
    newSiblings.push(nodeId)
  }

  return {
    ...model,
    children: {
      ...model.children,
      [oldParentId]: oldSiblings,
      [newParentId]: newSiblings,
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
export function spliceNode(model, nodeId) {
  if (!model.entities[nodeId]) return model
  if (nodeId === model.rootId) return model
  if (model.entities[nodeId].type !== 'management') return model
  const parentId = model.parents[nodeId]
  if (!parentId) return model

  const nodeChildren = model.children[nodeId] || []
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
// Optional insertIndex places the copy at a specific position.
export function duplicateSubtree(model, nodeId, targetParentId, insertIndex) {
  if (!model.entities[nodeId] || !model.entities[targetParentId]) return model
  if (model.entities[targetParentId].type === 'operation') return model // can't add under operations
  if (nodeId === targetParentId) return model
  if (isDescendant(model, nodeId, targetParentId)) return model

  const entities = { ...model.entities }
  const children = { ...model.children }
  const parents = { ...model.parents }
  children[targetParentId] = [...(children[targetParentId] || [])]

  function copyNode(sourceId, newParentId) {
    const newId = crypto.randomUUID()
    entities[newId] = { ...model.entities[sourceId], name: model.entities[sourceId].name ? model.entities[sourceId].name + ' (copy)' : '' }
    children[newId] = []
    parents[newId] = newParentId
    children[newParentId].push(newId)
    for (const childId of (model.children[sourceId] || [])) {
      copyNode(childId, newId)
    }
    return newId
  }

  // For insertIndex, we build the copy then move it into position
  const newRootId = copyNode(nodeId, targetParentId)
  if (insertIndex != null && insertIndex >= 0) {
    // copyNode appended to end — move to correct position
    const arr = children[targetParentId]
    arr.splice(arr.length - 1, 1) // remove from end
    arr.splice(insertIndex, 0, newRootId) // insert at position
  }

  return { ...model, entities, children, parents }
}

// Create a standalone node not attached to any parent.
// Used for bottom-up building — attach it later with moveNode.
export function createOrphan(model, nodeType, name = '') {
  const id = crypto.randomUUID()
  return {
    model: {
      ...model,
      entities: { ...model.entities, [id]: { type: nodeType, name } },
      children: { ...model.children, [id]: [] },
      parents: { ...model.parents, [id]: null },
    },
    nodeId: id,
  }
}

// --- Validation ---
// Returns a list of issues. Empty list = valid for publishing.

export function validateModel(model) {
  const issues = []

  for (const [id, entity] of Object.entries(model.entities)) {
    const childIds = model.children[id] || []
    const parentId = model.parents[id]

    // Orphan check (non-root without parent)
    if (id !== model.rootId && !parentId) {
      issues.push({ nodeId: id, type: 'orphan', message: `${entity.name || id.slice(0, 8)} is not connected to the tree` })
    }

    // Unnamed node
    if (!entity.name) {
      issues.push({ nodeId: id, type: 'unnamed', message: `${entity.type} ${id.slice(0, 8)} has no name` })
    }

    // Operation with children
    if (entity.type === 'operation' && childIds.length > 0) {
      issues.push({ nodeId: id, type: 'operation-has-children', message: `Operation ${entity.name || id.slice(0, 8)} should not have children` })
    }

    // Management with mixed types
    if (entity.type === 'management' && childIds.length > 0) {
      const types = new Set(childIds.map(cid => model.entities[cid]?.type))
      if (types.has('management') && types.has('operation')) {
        issues.push({ nodeId: id, type: 'mixed-children', message: `${entity.name || id.slice(0, 8)} has both management and operation children` })
      }
    }

    // Management with multiple operations
    if (entity.type === 'management') {
      const opCount = childIds.filter(cid => model.entities[cid]?.type === 'operation').length
      if (opCount > 1) {
        issues.push({ nodeId: id, type: 'multiple-operations', message: `${entity.name || id.slice(0, 8)} has ${opCount} operations (max 1)` })
      }
    }

    // Management leaf (no children, no operation) — warning, not error
    if (entity.type === 'management' && childIds.length === 0 && id !== model.rootId) {
      issues.push({ nodeId: id, type: 'empty-management', severity: 'warning', message: `${entity.name || id.slice(0, 8)} has no children or operations` })
    }
  }

  return issues
}

// Detach a node from its parent. Node and its subtree become orphans.
// Can be reattached later with moveNode.
export function detachNode(model, nodeId) {
  if (!model.entities[nodeId]) return model
  if (nodeId === model.rootId) return model
  const parentId = model.parents[nodeId]
  if (!parentId) return model // already detached

  return {
    ...model,
    children: {
      ...model.children,
      [parentId]: model.children[parentId].filter(id => id !== nodeId),
    },
    parents: { ...model.parents, [nodeId]: null },
  }
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
