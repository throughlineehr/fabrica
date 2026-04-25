import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { BusProvider, useBus } from '../signals/BusContext'

afterEach(() => cleanup())

function BusProbe({ onBus }) {
  const bus = useBus()
  onBus(bus)
  return null
}

describe('BusProvider / useBus', () => {
  it('useBus returns null without a Provider', () => {
    let captured
    render(<BusProbe onBus={(b) => { captured = b }} />)
    expect(captured).toBeNull()
  })

  it('useBus returns the bus when wrapped by BusProvider', () => {
    let captured
    render(
      <BusProvider>
        <BusProbe onBus={(b) => { captured = b }} />
      </BusProvider>
    )
    expect(captured).toBeTruthy()
    expect(captured.publish).toBeTypeOf('function')
    expect(captured.subscribe).toBeTypeOf('function')
  })

  it('the same bus reference is shared across siblings within one Provider', () => {
    let busA, busB
    render(
      <BusProvider>
        <BusProbe onBus={(b) => { busA = b }} />
        <BusProbe onBus={(b) => { busB = b }} />
      </BusProvider>
    )
    expect(busA).toBe(busB)
  })

  it('publish in one consumer is heard by subscribe in another', () => {
    let bus
    render(
      <BusProvider>
        <BusProbe onBus={(b) => { bus = b }} />
      </BusProvider>
    )
    const received = []
    bus.subscribe('test-channel', (msg) => received.push(msg))
    bus.publish('test-channel', { hello: 'world' })
    expect(received).toEqual([{ hello: 'world' }])
  })

  it('separate Providers create separate buses', () => {
    let busA, busB
    render(
      <>
        <BusProvider>
          <BusProbe onBus={(b) => { busA = b }} />
        </BusProvider>
        <BusProvider>
          <BusProbe onBus={(b) => { busB = b }} />
        </BusProvider>
      </>
    )
    expect(busA).not.toBe(busB)
  })
})
