// Layout algorithm — assigns x, layer positions to render tree nodes

import { NODE_SPACING } from '../constants'

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

export function applyLayout(tree) {
  layoutTree(tree)
  assignPositions(tree)
  return tree
}
