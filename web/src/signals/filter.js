// Signal filter primitives. A processor instance carries a `filters` object
// that narrows which incoming signals it reacts to *after* they've been
// routed in via cables. Filtering by terminal lists used to live here; that
// concern moved to the cable graph (a signal arrives at a processor only if
// a cable carried it there). Filters now apply only to type/tag.

export function normalizeFilters(filters) {
  return {
    types: filters?.types || null,                                       // null = any type
    tags: filters?.tags && filters.tags.length > 0 ? filters.tags : null, // null = any tag
  }
}

export function defaultFilters() {
  return { types: null, tags: null }
}

// Does this signal satisfy the filter? null/unset fields match anything.
export function signalMatches(signal, filters) {
  const f = normalizeFilters(filters)
  if (f.types && !f.types.includes(signal.type)) return false
  if (f.tags && !f.tags.some(tag => signal.tags?.includes(tag))) return false
  return true
}
