// Tree module — re-exports from model, layout, and queries
// Also provides buildRenderTree which bridges model → render tree

import { applyLayout } from './layout'

export { createModel, addNode, removeNode, renameNode, moveNode, insertParent, spliceNode, duplicateSubtree, detachNode, createOrphan, validateModel, canAddManagement, canAddOperation } from './model'
export { exportModel, exportModelCompact, importModel } from './serialize'
export { parseShorthand } from './shorthand'
export { applyLayout } from './layout'
export { findNode, containsNode, nodeHasS2, findParent, flattenTree, getLastNode, getTreeBounds } from './queries'

// Build a render tree from the flat model, with layout positions computed
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
    name: entity.name || '',
    children: childIds.map(cid => buildNode(model, cid)),
  }
}
