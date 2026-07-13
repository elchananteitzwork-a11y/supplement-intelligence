import { describe, it, expect } from 'vitest'
import { enrichWatch } from '../enrich'
import type { WatchlistEntry, WatchlistAlert } from '../types'
import type { MemoData } from '@/types/index'

function baseEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: 'watch-1',
    created_at: '2026-06-01T00:00:00.000Z',
    user_id: 'user-1',
    analysis_id: 'analysis-1',
    category_name: 'Magnesium Glycinate',
    category_id: 'supplements',
    active: true,
    lifecycle_stage_at_watch: 'Window Open',
    kill_criteria: [],
    last_checked_at: null,
    last_lifecycle_stage: null,
    ...overrides,
  }
}

// Minimal-but-complete MemoData fixture (mirrors the established stub shape
// used in lib/ai-interpretation/__tests__/confidence.test.ts) — needed
// because computeGroundedScore() reads m.scores.* unconditionally.
function baseMemo(overrides: Partial<MemoData> = {}): MemoData {
  return {
    category_name:      'Magnesium Glycinate',
    executive_summary:  '',
    build_decision:     'VALIDATE_FURTHER',
    build_explanation:  '',
    opportunity_score:  54,
    scores: {
      demand:        { level: 'Medium', notes: '' },
      virality:      { level: 'Medium', notes: '' },
      subscription:  { level: 'Medium', notes: '' },
      manufacturing: { level: 'Medium', notes: '' },
    },
    biggest_competitor: { name: '', revenue: '', gap: '' },
    market_size:        '',
    gross_margin:       '',
    market_gaps:        [],
    brand_opportunities: [],
    customer_language:  { frustrations: [], desires: [], fears: [], ad_phrases: [] },
    product_recommendation: {
      format: '', dosing: '', formula: [], avoid: [], cogs_estimate: '', retail_price: '', gross_margin: '',
    },
    financial_projections: { gross_margin: '', net_margin_at_scale: '', path_to_10m: '' },
    ...overrides,
  } as MemoData
}

function alert(overrides: Partial<WatchlistAlert> = {}): WatchlistAlert {
  return {
    id: 'alert-1',
    created_at: '2026-06-10T00:00:00.000Z',
    watchlist_id: 'watch-1',
    user_id: 'user-1',
    alert_type: 'kill_criteria_triggered',
    previous_stage: null,
    new_stage: null,
    kill_criterion_key: null,
    kill_criterion_label: null,
    acknowledged: false,
    ...overrides,
  }
}

describe('enrichWatch — stage history', () => {
  it('uses lifecycle_stage_at_watch as currentStage when no recheck has happened yet', () => {
    const result = enrichWatch(baseEntry(), null, [])
    expect(result.currentStage).toBe('Window Open')
    expect(result.previousStage).toBeNull()
  })

  it('uses last_lifecycle_stage as currentStage once a recheck has recorded one', () => {
    const result = enrichWatch(baseEntry({ last_lifecycle_stage: 'Contested' }), null, [])
    expect(result.currentStage).toBe('Contested')
  })

  it('surfaces previousStage only when the recorded stage actually differs from watch-time stage', () => {
    const changed = enrichWatch(baseEntry({ last_lifecycle_stage: 'Contested' }), null, [])
    expect(changed.previousStage).toBe('Window Open')

    const unchanged = enrichWatch(baseEntry({ last_lifecycle_stage: 'Window Open' }), null, [])
    expect(unchanged.previousStage).toBeNull()
  })
})

describe('enrichWatch — verdict, quality, gap velocity, confidence', () => {
  it('returns all nulls when there is no memo', () => {
    const result = enrichWatch(baseEntry(), null, [])
    expect(result.marketVerdict).toBeNull()
    expect(result.qualityScore).toBeNull()
    expect(result.qualityTier).toBeNull()
    expect(result.gapVelocityDisplay).toBeNull()
    expect(result.confidencePct).toBeNull()
  })

  it('returns all nulls when the memo predates M2.4 (no opportunity_quality/market_verdict)', () => {
    const result = enrichWatch(baseEntry(), baseMemo(), [])
    expect(result.marketVerdict).toBeNull()
    expect(result.qualityScore).toBeNull()
    expect(result.qualityTier).toBeNull()
  })

  it('extracts real verdict/quality/gap-velocity when the memo has M2.4 fields', () => {
    const memo = baseMemo({
      opportunity_quality: { score: 78, tier: 'High' } as unknown as MemoData['opportunity_quality'],
      market_verdict: { verdict: 'Emerging Growth', qualityTier: 'High', lifecycleStage: 'Window Open' } as unknown as MemoData['market_verdict'],
      gap_velocity: { value: 4.2, demand_acceleration_pct: 12, supply_acceleration_normalized_pct: 3, version: 'heuristic-v1' },
    })
    const result = enrichWatch(baseEntry(), memo, [])
    expect(result.marketVerdict).toBe('Emerging Growth')
    expect(result.qualityScore).toBe(78)
    expect(result.qualityTier).toBe('High')
    expect(result.gapVelocityDisplay).toBe('+4.2 pts')
  })

  it('omits gapVelocityDisplay when gap_velocity.value is null', () => {
    const memo = baseMemo({ gap_velocity: { value: null, demand_acceleration_pct: null, supply_acceleration_normalized_pct: null, version: 'heuristic-v1' } })
    const result = enrichWatch(baseEntry(), memo, [])
    expect(result.gapVelocityDisplay).toBeNull()
  })
})

describe('enrichWatch — triggered kill criteria', () => {
  const criteria = [
    { key: 'gap_velocity_negative', label: 'Gap velocity turns negative', metric: 'gap_velocity', comparator: 'lt', threshold: 0, valueAtGeneration: 3 },
    { key: 'supply_flood', label: 'Young-listing share exceeds 40%', metric: 'supply_young_listing_pct_24m', comparator: 'gt', threshold: 0.4, valueAtGeneration: 0.1 },
  ] as WatchlistEntry['kill_criteria']

  it('returns an empty array when no kill criteria are defined', () => {
    const result = enrichWatch(baseEntry({ kill_criteria: [] }), null, [])
    expect(result.triggeredKillCriteria).toEqual([])
  })

  it('returns an empty array when criteria are defined but none have a persisted alert', () => {
    const result = enrichWatch(baseEntry({ kill_criteria: criteria }), null, [])
    expect(result.triggeredKillCriteria).toEqual([])
  })

  it('surfaces only criteria with a matching persisted kill_criteria_triggered alert', () => {
    const alerts = [alert({ kill_criterion_key: 'gap_velocity_negative' })]
    const result = enrichWatch(baseEntry({ kill_criteria: criteria }), null, alerts)
    expect(result.triggeredKillCriteria).toEqual(['Gap velocity turns negative'])
  })

  it('ignores stage_transition alerts even if a kill_criterion_key happens to be present', () => {
    const alerts = [alert({ alert_type: 'stage_transition', kill_criterion_key: 'gap_velocity_negative' })]
    const result = enrichWatch(baseEntry({ kill_criteria: criteria }), null, alerts)
    expect(result.triggeredKillCriteria).toEqual([])
  })

  it('only considers alerts for this exact watch (caller is expected to pre-filter, but a stray non-matching key is still ignored)', () => {
    const alerts = [alert({ kill_criterion_key: 'unrelated_key' })]
    const result = enrichWatch(baseEntry({ kill_criteria: criteria }), null, alerts)
    expect(result.triggeredKillCriteria).toEqual([])
  })
})
