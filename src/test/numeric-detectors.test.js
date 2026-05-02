// Black-box tests for the three numeric detectors.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(defId, configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const detections = []
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => detections.push(signal),
  })
  const def = getProcessorDef(defId)
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'p', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('p', { roomKey: ROOM, inputHandler: inst.onInput })
  dispatcher.setCables({
    [ROOM]: [
      { id: 'c', source: { kind: 'jack', instanceId: 'p', portId: 'detection' },
                  target: { kind: 'jack', instanceId: 'spy', portId: 'in' } },
    ],
  })
  inst.start()
  return { inst, detections }
}

function feed(inst, value, atMs) {
  const sig = createSignal('metric', { value }, {})
  sig.timestamp = atMs
  inst.onInput({ signal: sig })
}

// --- step-detector --------------------------------------------------------

describe('step-detector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('detects a clear level shift', () => {
    const { inst, detections } = spawn('step-detector', { windowSize: 8, threshold: 3, checkIntervalMs: 500, cooldownMs: 0 })
    const start = Date.now()
    // 16 samples around 50, then 16 around 70 — clear step of +20
    for (let i = 0; i < 16; i++) feed(inst, 50 + (Math.random() - 0.5), start + i * 100)
    for (let i = 0; i < 16; i++) feed(inst, 70 + (Math.random() - 0.5), start + (16 + i) * 100)
    vi.advanceTimersByTime(600)
    expect(detections.length).toBeGreaterThan(0)
    const d = detections[0]
    expect(d.tags).toContain('step')
    expect(d.content.subkind).toBe('step')
    expect(Math.abs(d.content.magnitude - 20)).toBeLessThan(2)
    expect(Math.abs(d.content.t)).toBeGreaterThan(3)
    inst.stop()
  })

  it('does NOT fire on a flat noisy stream', () => {
    const { inst, detections } = spawn('step-detector', { windowSize: 8, threshold: 3, checkIntervalMs: 500, cooldownMs: 0 })
    const start = Date.now()
    for (let i = 0; i < 32; i++) feed(inst, 50 + (Math.random() - 0.5), start + i * 100)
    vi.advanceTimersByTime(600)
    expect(detections).toHaveLength(0)
    inst.stop()
  })

  it('cooldown suppresses re-firing on the same step', () => {
    const { inst, detections } = spawn('step-detector', { windowSize: 8, threshold: 3, checkIntervalMs: 200, cooldownMs: 5000 })
    const start = Date.now()
    for (let i = 0; i < 16; i++) feed(inst, 50, start + i * 100)
    for (let i = 0; i < 16; i++) feed(inst, 70, start + (16 + i) * 100)
    // Multiple check ticks after the step lands
    vi.advanceTimersByTime(1000)
    // Add more high values — should NOT re-fire while in cooldown
    for (let i = 0; i < 16; i++) feed(inst, 70, start + (32 + i) * 100)
    vi.advanceTimersByTime(1000)
    expect(detections).toHaveLength(1)
    inst.stop()
  })
})

// --- trend-detector -------------------------------------------------------

describe('trend-detector', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('detects a positive slope and reports it in units-per-second', () => {
    const { inst, detections } = spawn('trend-detector', { windowSize: 32, threshold: 3, checkIntervalMs: 1000, minSamples: 16 })
    const start = Date.now()
    // 32 samples rising at +1 per sample (+10/s at 100ms sampling)
    for (let i = 0; i < 32; i++) feed(inst, 50 + i, start + i * 100)
    vi.advanceTimersByTime(1100)
    expect(detections.length).toBeGreaterThan(0)
    const d = detections[0]
    expect(d.tags).toContain('trend')
    expect(d.content.direction).toBe('up')
    // Slope of 1/sample at 100ms intervals = 10/s
    expect(d.content.slope).toBeGreaterThan(8)
    expect(d.content.slope).toBeLessThan(12)
    inst.stop()
  })

  it('detects a negative slope as direction "down"', () => {
    const { inst, detections } = spawn('trend-detector', { windowSize: 32, threshold: 3, checkIntervalMs: 1000, minSamples: 16 })
    const start = Date.now()
    for (let i = 0; i < 32; i++) feed(inst, 100 - i, start + i * 100)
    vi.advanceTimersByTime(1100)
    expect(detections.length).toBeGreaterThan(0)
    expect(detections[0].content.direction).toBe('down')
    expect(detections[0].content.slope).toBeLessThan(0)
    inst.stop()
  })

  it('does NOT fire on flat noisy data', () => {
    const { inst, detections } = spawn('trend-detector', { windowSize: 32, threshold: 3, checkIntervalMs: 1000, minSamples: 16 })
    const start = Date.now()
    for (let i = 0; i < 32; i++) feed(inst, 50 + (Math.random() - 0.5) * 2, start + i * 100)
    vi.advanceTimersByTime(1100)
    expect(detections).toHaveLength(0)
    inst.stop()
  })

  it('respects minSamples — silent until enough data', () => {
    const { inst, detections } = spawn('trend-detector', { windowSize: 32, threshold: 3, checkIntervalMs: 1000, minSamples: 50 })
    const start = Date.now()
    for (let i = 0; i < 32; i++) feed(inst, 50 + i, start + i * 100)
    vi.advanceTimersByTime(1100)
    expect(detections).toHaveLength(0)
    inst.stop()
  })
})

// --- anomaly-detector -----------------------------------------------------

describe('anomaly-detector', () => {
  it('flags a 5σ outlier as anomalous', () => {
    const { inst, detections } = spawn('anomaly-detector', { threshold: 3, warmupSamples: 30 })
    // 30 warmup samples around 50 with stddev ~1
    for (let i = 0; i < 30; i++) feed(inst, 50 + (Math.random() - 0.5), Date.now())
    // A clear outlier: 5σ away from baseline
    feed(inst, 100, Date.now())
    expect(detections.length).toBeGreaterThan(0)
    const d = detections[0]
    expect(d.tags).toContain('anomaly')
    expect(d.content.subkind).toBe('anomaly')
    expect(Math.abs(d.content.z)).toBeGreaterThan(3)
    inst.stop()
  })

  it('stays silent during warmup even on extreme values', () => {
    const { inst, detections } = spawn('anomaly-detector', { threshold: 3, warmupSamples: 30 })
    for (let i = 0; i < 5; i++) feed(inst, 50 + (Math.random() - 0.5), Date.now())
    feed(inst, 9999, Date.now())   // Massive outlier — but we're still warming up
    expect(detections).toHaveLength(0)
    inst.stop()
  })

  it('keeps the baseline stable across repeated anomalies (no drift)', () => {
    const { inst, detections } = spawn('anomaly-detector', { threshold: 3, warmupSamples: 30 })
    for (let i = 0; i < 30; i++) feed(inst, 50 + (Math.random() - 0.5), Date.now())
    // Several anomalies in a row — baseline mean should remain near 50
    for (let i = 0; i < 5; i++) feed(inst, 200, Date.now())
    expect(detections.length).toBeGreaterThanOrEqual(5)
    // The most recent detection still sees mean ≈ 50 (anomalies excluded)
    const last = detections[detections.length - 1]
    expect(Math.abs(last.content.mean - 50)).toBeLessThan(1)
  })

  it('does not fire on non-numeric content', () => {
    const { inst, detections } = spawn('anomaly-detector', { threshold: 3, warmupSamples: 5 })
    for (let i = 0; i < 5; i++) feed(inst, 50, Date.now())
    inst.onInput({ signal: createSignal('metric', { value: 'oops' }, {}) })
    inst.onInput({ signal: createSignal('metric', { value: NaN }, {}) })
    expect(detections).toHaveLength(0)
    inst.stop()
  })
})
