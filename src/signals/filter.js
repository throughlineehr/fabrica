// Signal filter primitives. A processor instance carries a `filters` object
// that narrows which incoming signals it reacts to. null/undefined means
// "no constraint on this dimension".

export function normalizeFilters(filters) {
  return {
    types: filters?.types || null,                    // null = any type
    tags: filters?.tags && filters.tags.length > 0 ? filters.tags : null,
    inputTerminals: filters?.inputTerminals || null,  // null = any incoming terminal (incl. internal)
    outputTerminals: filters?.outputTerminals || null, // null = publish to every outgoing terminal
  }
}

export function defaultFilters() {
  return { types: null, tags: null, inputTerminals: null, outputTerminals: null }
}

// Does this signal satisfy the filter? null/unset fields match anything.
export function signalMatches(signal, filters) {
  const f = normalizeFilters(filters)
  if (f.types && !f.types.includes(signal.type)) return false
  if (f.tags && !f.tags.some(tag => signal.tags?.includes(tag))) return false
  if (f.inputTerminals) {
    // If user has restricted to specific terminals, internal (no arrivalTerminal)
    // signals are excluded. Clear the filter to receive internal signals too.
    if (!signal.arrivalTerminal) return false
    if (!f.inputTerminals.includes(signal.arrivalTerminal)) return false
  }
  return true
}
