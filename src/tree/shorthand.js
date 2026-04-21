// Shorthand tree notation parser
//
// Format: each line is "  name: type" where indentation (2 spaces) = depth
// Type is "management" or "operation" (or "m" / "o" for short)
//
// Example:
//   CEO: m
//     Marketing: m
//       Social Media: o
//       Content: o
//     Engineering: m
//       Frontend Team: o
//
// Produces a full model with names and structure.

export function parseShorthand(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length === 0) throw new Error('Empty shorthand')

  const entities = {}
  const children = {}
  const parents = {}
  const stack = [] // { id, indent }
  let rootId = null

  for (const line of lines) {
    const match = line.match(/^(\s*)(.+?):\s*(management|operation|m|o)\s*$/)
    if (!match) continue

    const indent = match[1].length
    const name = match[2].trim()
    const rawType = match[3].trim()
    const type = (rawType === 'm' || rawType === 'management') ? 'management' : 'operation'
    const id = crypto.randomUUID()

    entities[id] = { type, name }
    children[id] = []

    // Pop stack until we find the parent at a lower indent
    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }

    if (stack.length === 0) {
      // Root node
      parents[id] = null
      rootId = id
    } else {
      const parentId = stack[stack.length - 1].id
      parents[id] = parentId
      children[parentId].push(id)
    }

    stack.push({ id, indent })
  }

  if (!rootId) throw new Error('No valid nodes found in shorthand')
  return { entities, children, parents, rootId }
}
