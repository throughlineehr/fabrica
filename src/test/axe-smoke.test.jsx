// axe-core smoke tests for default-state renders of the key new
// components. Catches regressions in ARIA shape, label-in-name,
// landmark sanity, and color-contrast (where computable in jsdom).
//
// Not exhaustive — keyboard interactions and dynamic-state issues are
// out of scope here; those are covered by component-level tests.

import { describe, it, expect, beforeAll } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import axe from 'axe-core'
import { afterEach } from 'vitest'

// jsdom doesn't ship matchMedia. AccessibilityProvider reads it for
// prefers-reduced-motion. Stub it before any provider mounts.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })
  }
})

import { I18nProvider } from '../i18n/index.jsx'
import { AccessibilityProvider } from '../accessibility'
import { Checkbox } from '../components/Checkbox'
import { SignalFeed } from '../components/room/SignalFeed'
import { ProcessorLibraryModal } from '../components/room/ProcessorLibraryModal'
import { TerminalDetail } from '../components/room/TerminalDetail'

afterEach(() => cleanup())

function withProviders(node) {
  return (
    <AccessibilityProvider>
      <I18nProvider>{node}</I18nProvider>
    </AccessibilityProvider>
  )
}

async function expectNoViolations(container) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    // jsdom doesn't compute layout so these checks are unreliable in tests:
    rules: {
      'color-contrast': { enabled: false },
    },
  })
  if (results.violations.length > 0) {
    const summary = results.violations
      .map(v => `${v.id} (${v.impact}): ${v.description}`)
      .join('\n')
    throw new Error('axe violations:\n' + summary)
  }
  expect(results.violations).toHaveLength(0)
}

describe('axe smoke — Checkbox', () => {
  it('default unchecked has no violations', async () => {
    const { container } = render(withProviders(
      <Checkbox label="Accept terms" checked={false} onChange={() => {}} />
    ))
    await expectNoViolations(container)
  })

  it('checked + colored variant has no violations', async () => {
    const { container } = render(withProviders(
      <Checkbox label="S5" checked={true} onChange={() => {}} fillColor="#9060c0" />
    ))
    await expectNoViolations(container)
  })

  it('disabled has no violations', async () => {
    const { container } = render(withProviders(
      <Checkbox label="Locked" checked={true} onChange={() => {}} disabled />
    ))
    await expectNoViolations(container)
  })
})

describe('axe smoke — SignalFeed', () => {
  it('empty state has no violations', async () => {
    const { container } = render(withProviders(
      <SignalFeed signals={[]} label="Live log" />
    ))
    await expectNoViolations(container)
  })

  it('populated with one signal of each type has no violations', async () => {
    const signals = [
      { id: '1', type: 'metric', content: { key: 'cpu', value: 42, unit: '%' }, hops: ['n1:s3'], timestamp: 1714000000000 },
      { id: '2', type: 'event', content: { kind: 'connection', status: 'connected' }, hops: ['n1:s3'], timestamp: 1714000001000 },
      { id: '3', type: 'narrative', content: { text: 'all clear' }, hops: ['n1:s3'], timestamp: 1714000002000 },
      { id: '4', type: 'alert', content: { message: 'stale' }, hops: ['n1:s3'], timestamp: 1714000003000 },
    ]
    const { container } = render(withProviders(
      <SignalFeed signals={signals} label="Live log" />
    ))
    await expectNoViolations(container)
  })
})

describe('axe smoke — ProcessorLibraryModal', () => {
  it('default has no violations', async () => {
    const { container } = render(withProviders(
      <ProcessorLibraryModal systemKey="s3" onPick={() => {}} onClose={() => {}} />
    ))
    await expectNoViolations(container)
  })
})

describe('axe smoke — TerminalDetail', () => {
  it('with one connection has no violations', async () => {
    const terminal = { id: 's3-children', wall: 'bottom', colorKey: 's3', dir: 'both', labelKey: 'systems.s3' }
    const connections = [{ id: 'node-1', name: 'Division A', systemKey: 's3', verb: 'Manages' }]
    const { container } = render(withProviders(
      <TerminalDetail terminal={terminal} connections={connections} onNavigate={() => {}} />
    ))
    await expectNoViolations(container)
  })
})
