// Model serialization — YAML DSL for the viable system model
//
// Format:
//   type: management
//   children:
//     - type: management
//       children:
//         - type: operation
//     - type: operation
//
// Each node can optionally include an `id` field. If omitted on import,
// UUIDs are generated. This keeps the DSL readable while supporting
// round-trip fidelity when needed.

import YAML from 'yaml'

// --- Export ---

export function exportModel(model) {
  const tree = buildExportTree(model, model.rootId)
  return YAML.stringify(tree, { indent: 2 })
}

function buildExportTree(model, id) {
  const entity = model.entities[id]
  const childIds = model.children[id] || []
  const node = { type: entity.type }
  if (entity.name) node.name = entity.name

  // Include id for round-trip fidelity
  node.id = id

  if (childIds.length > 0) {
    node.children = childIds.map(cid => buildExportTree(model, cid))
  }

  return node
}

// --- Import ---

export function importModel(yamlString) {
  const tree = YAML.parse(yamlString)
  if (!tree || !tree.type) throw new Error('Invalid model: root must have a type')
  return buildModelFromTree(tree)
}

function buildModelFromTree(tree) {
  const entities = {}
  const children = {}
  const parents = {}

  function walk(node, parentId) {
    const id = node.id || crypto.randomUUID()
    entities[id] = { type: node.type, name: node.name || '' }
    children[id] = []
    parents[id] = parentId

    if (parentId) {
      children[parentId].push(id)
    }

    if (node.children) {
      for (const child of node.children) {
        walk(child, id)
      }
    }

    return id
  }

  const rootId = walk(tree, null)
  return { entities, children, parents, rootId }
}

// --- Compact format (no IDs, minimal) ---

export function exportModelCompact(model) {
  const tree = buildCompactTree(model, model.rootId)
  return YAML.stringify(tree, { indent: 2 })
}

function buildCompactTree(model, id) {
  const entity = model.entities[id]
  const childIds = model.children[id] || []
  const node = { type: entity.type }
  if (entity.name) node.name = entity.name

  if (childIds.length > 0) {
    node.children = childIds.map(cid => buildCompactTree(model, cid))
  }

  return node
}
