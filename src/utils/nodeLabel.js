// Shared node label formatting

export function shortId(id) { return id ? id.slice(0, 5) : '' }

export function nodeLabel(node, tr) {
  if (!node) return ''
  return (node.type === 'operation' ? tr('nav.operation') : tr('nav.unit')) + ' ' + shortId(node.id)
}

export function nodeLabelShort(node, tr) {
  if (!node) return ''
  return (node.type === 'operation' ? tr('nav.op') : tr('nav.unit')) + ' ' + shortId(node.id)
}
