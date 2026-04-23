import { createContext, useContext, useMemo } from 'react'
import { createBus } from './bus'

const BusContext = createContext(null)

export function BusProvider({ children }) {
  const bus = useMemo(() => createBus(), [])
  return <BusContext.Provider value={bus}>{children}</BusContext.Provider>
}

export function useBus() {
  return useContext(BusContext)
}
