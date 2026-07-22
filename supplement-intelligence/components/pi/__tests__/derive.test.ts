// UIv2-M3 Home rebuild, independent-review follow-up. Covers the
// `precomputed` map wiring introduced to stop derivePipelineViewModel from
// paying for a second computeGroundedScore/computeConfidenceAssessment pass
// per analysis when the caller (app/dashboard/page.tsx) already ran one via
// computeCardIntelligence. Mocks the scoring/confidence modules so this
// asserts the WIRING (right entry used for the right id, real fallback path
// still works when no entry is provided) rather than re-testing scoring
// internals, which are already covered elsewhere.

import { describe, it, expect, vi } from 'vitest'
import type { Analysis } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'
import { computeGroundedScore } from '@/lib/scoring'
import { computeConfidenceAssessment } from '@/lib/confidence'
import { derivePipelineViewModel } from '../derive'

vi.mock('@/lib/scoring', () => ({ computeGroundedScore: vi.fn() }))
vi.mock('@/lib/confidence', () => ({ computeConfidenceAssessment: vi.fn() }))

function grounded(score: number): GroundedScore {
  return {
    score,
    decision: 'VALIDATE_FURTHER',
    dimensions: [],
    groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth: { channelsCovered: 0, totalChannels: 0 },
  } as unknown as GroundedScore
}

function analysis(id: string): Analysis {
  return { id, category_name: `Analysis ${id}`, created_at: new Date().toISOString() } as unknown as Analysis
}

describe('derivePipelineViewModel precomputed wiring', () => {
  it('uses the precomputed entry for a matched id and never calls the scoring functions for it', () => {
    vi.mocked(computeGroundedScore).mockClear()
    vi.mocked(computeConfidenceAssessment).mockClear()

    const a = analysis('real-1')
    const pre = new Map([['real-1', { grounded: grounded(71), confidencePct: 55 }]])

    const vm = derivePipelineViewModel([a], new Set(), pre)

    expect(vi.mocked(computeGroundedScore)).not.toHaveBeenCalled()
    expect(vi.mocked(computeConfidenceAssessment)).not.toHaveBeenCalled()
    expect(vm.candidates).toHaveLength(1)
    expect(vm.candidates[0]).toMatchObject({ id: 'real-1', score: 71, confidencePct: 55 })
  })

  it('falls back to computing internally for an id with no precomputed entry (real for Compare, which passes no map at all)', () => {
    vi.mocked(computeGroundedScore).mockClear()
    vi.mocked(computeConfidenceAssessment).mockClear()
    vi.mocked(computeGroundedScore).mockReturnValue(grounded(42))
    vi.mocked(computeConfidenceAssessment).mockReturnValue({ overallConfidence: 0.33 } as ReturnType<typeof computeConfidenceAssessment>)

    const a = analysis('no-precompute')
    const vm = derivePipelineViewModel([a], new Set())

    expect(vi.mocked(computeGroundedScore)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(computeConfidenceAssessment)).toHaveBeenCalledTimes(1)
    expect(vm.candidates[0]).toMatchObject({ id: 'no-precompute', score: 42, confidencePct: 33 })
  })

  it('mixed batch: only the analyses missing a precomputed entry trigger a live computation', () => {
    vi.mocked(computeGroundedScore).mockClear()
    vi.mocked(computeConfidenceAssessment).mockClear()
    vi.mocked(computeGroundedScore).mockReturnValue(grounded(10))
    vi.mocked(computeConfidenceAssessment).mockReturnValue({ overallConfidence: 0.5 } as ReturnType<typeof computeConfidenceAssessment>)

    const pre = new Map([['has-precompute', { grounded: grounded(90), confidencePct: 80 }]])
    const vm = derivePipelineViewModel([analysis('has-precompute'), analysis('missing')], new Set(), pre)

    expect(vi.mocked(computeGroundedScore)).toHaveBeenCalledTimes(1) // only for 'missing'
    const byId = new Map(vm.candidates.map(c => [c.id, c]))
    expect(byId.get('has-precompute')).toMatchObject({ score: 90, confidencePct: 80 })
    expect(byId.get('missing')).toMatchObject({ score: 10, confidencePct: 50 })
  })
})
