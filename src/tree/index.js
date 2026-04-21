// Tree module — re-exports from model, layout, and queries
// Also provides buildRenderTree which bridges model → render tree

import { applyLayout } from './layout'

export { createModel, addNode, removeNode, canAddManagement, canAddOperation } from './model'
export { exportModel, exportModelCompact, importModel } from './serialize'
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
    children: childIds.map(cid => buildNode(model, cid)),
  }
}
