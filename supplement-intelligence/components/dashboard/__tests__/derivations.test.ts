import { describe, it, expect } from 'vitest'
import { deriveKillCriteriaCount } from '../derivations'
import type { MemoData } from '@/types/index'
import type { KillCriterion } from '@/lib/kill-criteria'

function memo(overrides: Partial<MemoData> = {}): MemoData {
  return { ...overrides } as MemoData
}

describe('deriveKillCriteriaCount', () => {
  it('returns 0 (never fabricated) when the analysis predates the kill-criteria feature', () => {
    expect(deriveKillCriteriaCount(memo())).toBe(0)
  })

  it('returns the real count of machine-evaluable kill criteria', () => {
    const criteria: KillCriterion[] = [
      { key: 'a', label: 'A', metric: 'gap_velocity', comparator: 'lt', threshold: 0, valueAtGeneration: 1 },
      { key: 'b', label: 'B', metric: 'lifecycle_stage', comparator: 'in', threshold: ['Saturated'], valueAtGeneration: 'Window Open' },
    ]
    expect(deriveKillCriteriaCount(memo({ kill_criteria: criteria }))).toBe(2)
  })
})
