// Entity model — flat stores, CRUD commands, validation

export function createModel(rootType = 'management') {
  const rootId = crypto.randomUUID()
  return {
    entities: { [rootId]: { type: rootType } },
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
