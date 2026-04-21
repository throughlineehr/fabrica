// Tree queries — work on render trees (the assembled { id, type, children, x, layer } objects)

import { toWorld } from '../constants'

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

export function findParent(root, targetId) {
  if (root.id === targetId) return null
  for (const child of root.children) {
    if (child.id === targetId) return root
    const found = findParent(child, targetId)
    if (found) return found
  }
  return null
}

export function flattenTree(node) {
  const result = [node]
  for (const child of node.children) {
    result.push(...flattenTree(child))
  }
  return result
}

export function getLastNode(node) {
  if (node.children.length === 0) return node
  return getLastNode(node.children[node.children.length - 1])
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
