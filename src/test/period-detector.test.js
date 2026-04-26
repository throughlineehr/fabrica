// Black-box test for the Period Detector. Build a clean sine wave, feed it
// through the processor, advance fake timers to trigger the autocorrelation
// check, and assert that a detection signal arrives with a periodMs close
// to the wave's period. Then pin the negative case: random noise alone
// must NOT fire a detection.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function setup(configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const detections = []
  // Spy receives whatever the detector emits on its 'detection' output.
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => detections.push(signal),
  })
  dispatcher.registerProcessor('emitter', { roomKey: ROOM, inputHandler: () => {} })
  dispatcher.setCables({
    [ROOM]: [
      { id: 'c1', source: { kind: 'jack', instanceId: 'pd', portId: 'detection' },
                  target: { kind: 'jack', instanceId: 'spy', portId: 'in' } },
    ],
  })
  const def = getProcessorDef('period-detector')
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'pd', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('pd', { roomKey: ROOM, inputHandler: inst.onInput })
  inst.start()
  return { bus, dispatcher, inst, detections }
}

function feedSine({ inst, periodMs, sampleMs, totalSamples, amp = 10, baseline = 50, noise = 0 }) {
  const start = Date.now()
  for (let i = 0; i < totalSamples; i++) {
    const t = i * sampleMs
    const value = baseline + amp * Math.sin(2 * Math.PI * t / periodMs) + (noise ? (Math.random() - 0.5) * 2 * noise : 0)
    const sig = createSignal('metric', { value }, {})
    sig.timestamp = start + t
    inst.onInput({ signal: sig })
  }
}

describe('period-detector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('detects a clean sine wave and emits a detection with periodMs close to truth', () => {
    const { inst, detections } = setup({ checkIntervalMs: 1000, threshold: 0.5, minPeriodMs: 500 })
    // 6 cycles of a 4000ms period sampled every 100ms = 240 samples
    feedSine({ inst, periodMs: 4000, sampleMs: 100, totalSamples: 240, amp: 10, noise: 0 })
    vi.advanceTimersByTime(1100)
    expect(detections.length).toBeGreaterThan(0)
    const d = detections[0]
    expect(d.tags).toContain('detection')
    expect(d.tags).toContain('periodic')
    // Allow some lag-quantisation error — bestLag is integer samples
    expect(d.content.periodMs).toBeGreaterThanOrEqual(3500)
    expect(d.content.periodMs).toBeLessThanOrEqual(4500)
    expect(d.content.confidence).toBeGreaterThan(0.5)
    inst.stop()
  })

  it('stays silent on pure white noise (no spurious detection)', () => {
    const { inst, detections } = setup({ checkIntervalMs: 1000, threshold: 0.5 })
    const start = Date.now()
    for (let i = 0; i < 200; i++) {
      const sig = createSignal('metric', { value: (Math.random() - 0.5) * 20 }, {})
      sig.timestamp = start + i * 100
      inst.onInput({ signal: sig })
    }
    vi.advanceTimersByTime(1100)
    expect(detections).toHaveLength(0)
    inst.stop()
  })

  it('refuses to detect when buffer is too small', () => {
    const { inst, detections } = setup({ checkIntervalMs: 1000 })
    // Only 16 samples — below the 32-sample floor
    feedSine({ inst, periodMs: 1000, sampleMs: 100, totalSamples: 16, amp: 10 })
    vi.advanceTimersByTime(1100)
    expect(detections).toHaveLength(0)
    inst.stop()
  })

  it('respects the threshold knob — high threshold suppresses weak signals', () => {
    const { inst, detections } = setup({ checkIntervalMs: 1000, threshold: 0.95 })
    // Sine + heavy noise — autocorr will peak but below 0.95
    feedSine({ inst, periodMs: 4000, sampleMs: 100, totalSamples: 240, amp: 5, noise: 8 })
    vi.advanceTimersByTime(1100)
    expect(detections).toHaveLength(0)
    inst.stop()
  })
})
