// The pure command surface — the things that can be applied symmetrically
// on client (locally, via setState) or server (canonically, persisted, then
// echoed back to subscribers).
//
// Each command: `(slice, args) → { slice, result }`. No side effects, no
// React, no I/O. The "slice" is the state slice the command mutates; the
// caller is responsible for applying the returned slice to their store.
//
// agent/commands.js wraps these in side-effecting setters for the React
// app. When we lift to server, the wrappers become WebSocket dispatch.

export {
  addCable, removeCable,
  pruneCablesByRoom, pruneCablesByProcessor,
} from './cables'

export {
  addProcessor, removeProcessor,
  updateProcessorFilters, updateProcessorConfig,
  pruneProcessorsByRoom,
} from './processors'
