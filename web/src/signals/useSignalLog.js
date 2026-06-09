// Logger hook — subscribes to a channel and accumulates signals.
// Used by the S3 logger processor to show a running log.

import { useState, useEffect } from 'react'

export function useSignalLog(bus, channel, maxEntries = 50) {
  const [log, setLog] = useState([])

  useEffect(() => {
    if (!bus || !channel) return
    return bus.subscribe(channel, (signal) => {
      setLog(prev => [signal, ...prev].slice(0, maxEntries))
    })
  }, [bus, channel, maxEntries])

  return log
}
