// Maps a processor def id to its detail view component.
// When a processor has no entry here, ProcessorPage falls back to a JSON view.

import { WebSocketTransducerView } from './WebSocketTransducerView.jsx'

export const processorViews = {
  'websocket-transducer': WebSocketTransducerView,
}

export function getProcessorView(defId) {
  return processorViews[defId] || null
}
