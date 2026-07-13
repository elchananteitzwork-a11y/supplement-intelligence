import { describe, it, expect } from 'vitest'
import { enrichAlert, groupAlertsByDay, describeComparator, type EnrichedAlert } from '../alerts-display'
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

function baseAlert(overrides: Partial<WatchlistAlert> = {}): WatchlistAlert {
  return {
    id: 'alert-1',
    created_at: '2026-07-13T09:00:00.000Z',
    watchlist_id: 'watch-1',
    user_id: 'user-1',
    alert_type: 'stage_transition',
    previous_stage: 'Window Open',
    new_stage: 'Contested',
    kill_criterion_key: null,
    kill_criterion_label: null,
    acknowledged: false,
    ...overrides,
  }
}

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

describe('describeComparator', () => {
  it('maps every real comparator code to a readable phrase', () => {
    expect(describeComparator('lt')).toBe('falls below')
    expect(describeComparator('gt')).toBe('exceeds')
    expect(describeComparator('eq')).toBe('equals')
    expect(describeComparator('in')).toBe('is one of')
  })
})

describe('enrichAlert — severity', () => {
  it('classifies stage_transition as informational', () => {
    const result = enrichAlert(baseAlert({ alert_type: 'stage_transition' }), baseEntry(), null)
    expect(result.severity).toBe('informational')
    expect(result.severityLabel).toBe('Lifecycle Transition')
  })

  it('classifies kill_criteria_triggered as critical', () => {
    const result = enrichAlert(baseAlert({ alert_type: 'kill_criteria_triggered', kill_criterion_label: 'Gap velocity turns negative' }), baseEntry(), null)
    expect(result.severity).toBe('critical')
    expect(result.severityLabel).toBe('Kill Criterion Breach')
  })
})

describe('enrichAlert — headline', () => {
  it('builds a real stage-transition headline from previous/new stage', () => {
    const result = enrichAlert(baseAlert({ previous_stage: 'Emerging', new_stage: 'Window Open' }), baseEntry({ category_name: 'Beef Tallow Moisturizer' }), null)
    expect(result.headline).toBe('Beef Tallow Moisturizer moved Emerging → Window Open')
  })

  it('builds a real kill-criterion headline from the criterion label', () => {
    const result = enrichAlert(
      baseAlert({ alert_type: 'kill_criteria_triggered', kill_criterion_label: '19 listings under 6 months old' }),
      baseEntry({ category_name: 'Berberine' }),
      null,
    )
    expect(result.headline).toBe('Berberine crossed kill criterion: 19 listings under 6 months old')
  })

  it('falls back honestly when a real field is missing rather than fabricating one', () => {
    const result = enrichAlert(baseAlert({ previous_stage: null }), baseEntry(), null)
    expect(result.headline).toContain('an unrecorded stage')
  })
})

describe('enrichAlert — kill-criterion detail line', () => {
  const criteria = [
    { key: 'gap_velocity_negative', label: 'Gap velocity turns negative', metric: 'gap_velocity', comparator: 'lt', threshold: 0, valueAtGeneration: 3.2 },
  ] as WatchlistEntry['kill_criteria']

  it('is null for stage_transition alerts', () => {
    const result = enrichAlert(baseAlert({ alert_type: 'stage_transition' }), baseEntry({ kill_criteria: criteria }), null)
    expect(result.detail).toBeNull()
  })

  it('builds a real detail line from the matching persisted criterion', () => {
    const result = enrichAlert(
      baseAlert({ alert_type: 'kill_criteria_triggered', kill_criterion_key: 'gap_velocity_negative', kill_criterion_label: 'Gap velocity turns negative' }),
      baseEntry({ kill_criteria: criteria }),
      null,
    )
    expect(result.detail).toBe('gap_velocity falls below 0 (was 3.2 when this watch was created)')
  })

  it('is null when no matching criterion is found on the watch snapshot', () => {
    const result = enrichAlert(
      baseAlert({ alert_type: 'kill_criteria_triggered', kill_criterion_key: 'unknown_key' }),
      baseEntry({ kill_criteria: criteria }),
      null,
    )
    expect(result.detail).toBeNull()
  })
})

describe('enrichAlert — current verdict/confidence context', () => {
  it('is null when there is no memo', () => {
    const result = enrichAlert(baseAlert(), baseEntry(), null)
    expect(result.currentVerdict).toBeNull()
    expect(result.currentConfidencePct).toBeNull()
  })

  it('reuses the real enrichWatch derivation when a memo has M2.4 fields', () => {
    const memo = baseMemo({
      opportunity_quality: { score: 78, tier: 'High' } as unknown as MemoData['opportunity_quality'],
      market_verdict: { verdict: 'WATCH_CLOSELY', qualityTier: 'High', lifecycleStage: 'Contested' } as unknown as MemoData['market_verdict'],
    })
    const result = enrichAlert(baseAlert(), baseEntry(), memo)
    expect(result.currentVerdict).toBe('WATCH_CLOSELY')
  })
})

describe('groupAlertsByDay', () => {
  function item(overrides: Partial<WatchlistAlert> = {}): EnrichedAlert {
    return enrichAlert(baseAlert(overrides), baseEntry(), null)
  }

  it('groups today\'s alerts under "Today"', () => {
    const now = new Date('2026-07-13T15:00:00.000Z')
    const groups = groupAlertsByDay([item({ created_at: '2026-07-13T09:00:00.000Z' })], now)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Today')
    expect(groups[0].items).toHaveLength(1)
  })

  it('labels the prior calendar day "Yesterday"', () => {
    const now = new Date('2026-07-13T15:00:00.000Z')
    const groups = groupAlertsByDay([item({ created_at: '2026-07-12T22:00:00.000Z' })], now)
    expect(groups[0].label).toBe('Yesterday')
  })

  it('labels older days with a real formatted date', () => {
    const now = new Date('2026-07-13T15:00:00.000Z')
    const groups = groupAlertsByDay([item({ created_at: '2026-07-03T09:00:00.000Z' })], now)
    expect(groups[0].label).toBe('Jul 3')
  })

  it('preserves newest-first group order and real per-day counts', () => {
    const now = new Date('2026-07-13T15:00:00.000Z')
    const groups = groupAlertsByDay([
      item({ id: 'a', created_at: '2026-07-13T09:00:00.000Z' }),
      item({ id: 'b', created_at: '2026-07-13T08:00:00.000Z' }),
      item({ id: 'c', created_at: '2026-07-03T09:00:00.000Z' }),
    ], now)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Jul 3'])
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].items).toHaveLength(1)
  })

  it('returns an empty array for no alerts', () => {
    expect(groupAlertsByDay([])).toEqual([])
  })
})
