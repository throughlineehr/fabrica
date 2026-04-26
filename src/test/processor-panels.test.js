import { describe, it, expect } from 'vitest'
import { PROCESSOR_LIBRARY } from '../signals/library'
import { validatePanel } from '../components/rack/panelSchema'

describe('processor panel manifests', () => {
  for (const proc of PROCESSOR_LIBRARY) {
    it(`${proc.id} declares a panel that validates`, () => {
      expect(proc.panel, `${proc.id} should declare a panel`).toBeDefined()
      const r = validatePanel(proc.panel, proc)
      if (!r.ok) {
        const issues = r.issues.map(i => `  - ${i.type}: ${i.message}`).join('\n')
        throw new Error(`${proc.id} panel invalid:\n${issues}`)
      }
      expect(r.ok).toBe(true)
    })
  }
})
