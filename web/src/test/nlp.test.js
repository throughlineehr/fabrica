// Unit tests for the non-LLM NLP processors. Each processor is dropped
// onto a tiny dispatcher harness with a spy that captures whatever it
// emits, then we feed it text via signal.content.text and assert on the
// outputs.

import { describe, it, expect } from 'vitest'
import { createBus } from '../signals/bus'
import { createSignal } from '../signals/signal'
import { getProcessorDef } from '../signals/library'
import { createDispatcher } from '../signals/dispatcher'

const ROOM = 'r:s3'

function spawn(defId, configOverrides = {}) {
  const bus = createBus()
  const dispatcher = createDispatcher({ onTerminal: () => {} })
  const out = []
  dispatcher.registerProcessor('spy', {
    roomKey: ROOM,
    inputHandler: ({ signal }) => out.push(signal),
  })
  const def = getProcessorDef(defId)
  const inst = def.create(
    { ...def.defaultConfig, ...configOverrides },
    { bus, dispatcher, instanceId: 'p', roomNodeId: 'r', roomSystemKey: 's3', filters: {} },
  )
  dispatcher.registerProcessor('p', { roomKey: ROOM, inputHandler: inst.onInput })
  // Wire each declared output of the processor to the spy.
  const cables = def.ports.outputs.map((p, i) => ({
    id: `c${i}`,
    source: { kind: 'jack', instanceId: 'p', portId: p.id },
    target: { kind: 'jack', instanceId: 'spy', portId: 'in' },
  }))
  dispatcher.setCables({ [ROOM]: cables })
  inst.start()
  return {
    inst, out,
    feed: (text) => inst.onInput({ signal: createSignal('narrative', { text }, {}) }),
    feedMessage: (message) => inst.onInput({ signal: createSignal('event', { message }, {}) }),
  }
}

describe('sentiment', () => {
  it('scores positive text positive', () => {
    const { feed, out } = spawn('sentiment')
    feed('The deploy went great, fantastic work, success all around')
    expect(out).toHaveLength(1)
    expect(out[0].content.polarityTag).toBe('positive')
    expect(out[0].content.polarity).toBeGreaterThan(0.05)
    expect(out[0].tags).toContain('positive')
  })

  it('scores negative text negative', () => {
    const { feed, out } = spawn('sentiment')
    feed('the build is broken, critical outage, urgent fix needed')
    expect(out).toHaveLength(1)
    expect(out[0].content.polarityTag).toBe('negative')
    expect(out[0].content.polarity).toBeLessThan(-0.05)
    expect(out[0].tags).toContain('negative')
  })

  it('scores neutral text neutral when no lexicon hits', () => {
    const { feed, out } = spawn('sentiment')
    feed('the meeting is scheduled for next tuesday at three')
    expect(out).toHaveLength(1)
    expect(out[0].content.polarityTag).toBe('neutral')
    expect(out[0].content.hits).toBe(0)
  })

  it('reads text from content.message too', () => {
    const { feedMessage, out } = spawn('sentiment')
    feedMessage('total disaster, terrible')
    expect(out[0].content.polarityTag).toBe('negative')
  })

  it('threshold knob can shift the neutral band', () => {
    const { feed, out } = spawn('sentiment', { threshold: 0.5 })
    // "good" alone scores +2 / many tokens — won't clear 0.5 → neutral
    feed('the result was good honestly')
    expect(out[0].content.polarityTag).toBe('neutral')
  })
})

describe('keyword-extractor (RAKE)', () => {
  it('extracts multi-word phrases skipping stopwords', () => {
    const { feed, out } = spawn('keyword-extractor', { topK: 5 })
    feed('Compatibility of systems of linear constraints over the set of natural numbers. Criteria of compatibility of a system of linear Diophantine equations.')
    expect(out).toHaveLength(1)
    const phrases = out[0].content.phrases.map(p => p.phrase)
    // RAKE on this canonical example surfaces "linear diophantine equations"
    expect(phrases).toContain('linear diophantine equations')
  })

  it('emits phrases sorted by descending score', () => {
    const { feed, out } = spawn('keyword-extractor')
    feed('the deployment failed because the database connection pool was exhausted during the morning peak traffic. database connection pool tuning is the priority.')
    expect(out).toHaveLength(1)
    const scores = out[0].content.phrases.map(p => p.score)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1]).toBeGreaterThanOrEqual(scores[i])
    }
  })

  it('emits nothing when input has no extractable phrases', () => {
    const { feed, out } = spawn('keyword-extractor')
    feed('the a and or')   // pure stopwords
    expect(out).toHaveLength(0)
  })
})

describe('entity-extractor', () => {
  it('extracts URLs', () => {
    const { feed, out } = spawn('entity-extractor')
    feed('see the docs at https://example.com/path?q=1 and https://other.example')
    const urls = out.find(s => s.content.entityKind === 'url')
    expect(urls).toBeDefined()
    expect(urls.content.values).toHaveLength(2)
    expect(urls.tags).toEqual(expect.arrayContaining(['entity', 'url']))
  })

  it('extracts mentions and hashtags separately', () => {
    const { feed, out } = spawn('entity-extractor')
    feed('@alice please review #incident-401 with @bob')
    const mentions = out.find(s => s.content.entityKind === 'mention')
    const hashtags = out.find(s => s.content.entityKind === 'hashtag')
    expect(mentions.content.values.sort()).toEqual(['@alice', '@bob'])
    expect(hashtags.content.values).toEqual(['#incident-401'])
  })

  it('extracts $ amounts and ISO dates', () => {
    const { feed, out } = spawn('entity-extractor')
    feed('approved $1,500 on 2026-04-30 and $200.00 on 2026-05-01')
    const amts = out.find(s => s.content.entityKind === 'amount')
    const dates = out.find(s => s.content.entityKind === 'date')
    expect(amts.content.values).toEqual(['$1,500', '$200.00'])
    expect(dates.content.values).toEqual(['2026-04-30', '2026-05-01'])
  })

  it('emits nothing when no patterns match', () => {
    const { feed, out } = spawn('entity-extractor')
    feed('plain prose with no entities at all')
    expect(out).toHaveLength(0)
  })
})
