// Watchlist recheck tests — Roadmap M2.8.
//
// Acceptance criterion under test (verbatim): "Watched niche re-checks on
// schedule; a fixture-forced stage transition produces an alert."

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeKillCriteria } from '@/lib/kill-criteria'
import type { AggregatedSignals } from '@/lib/signal-engine/types'
import type { WatchlistEntry } from '../types'

const listActiveWatches     = vi.fn()
const updateWatchAfterCheck = vi.fn().mockResolvedValue(undefined)
const writeAlert            = vi.fn().mockResolvedValue(undefined)
vi.mock('../service-store', () => ({
  listActiveWatches:     (...args: unknown[]) => listActiveWatches(...args),
  updateWatchAfterCheck: (...args: unknown[]) => updateWatchAfterCheck(...args),
  writeAlert:            (...args: unknown[]) => writeAlert(...args),
}))

const engineFetch = vi.fn()
vi.mock('@/lib/signal-engine/engine', () => ({
  SignalEngine: function SignalEngine(this: { fetch: (...args: unknown[]) => unknown }) {
    this.fetch = (...args: unknown[]) => engineFetch(...args)
  },
}))

import { computeFreshLifecycleFromSignals, evaluateWatch, runWatchlistRecheck } from '../recheck'

function watchEntry(overrides: Partial<WatchlistEntry> = {}): WatchlistEntry {
  return {
    id: 'w1', created_at: '2026-07-01T00:00:00Z', user_id: 'u1', analysis_id: 'a1',
    category_name: 'Berberine', category_id: 'supplements', active: true,
    lifecycle_stage_at_watch: 'Window Open', kill_criteria: [],
    last_checked_at: null, last_lifecycle_stage: null,
    ...overrides,
  }
}

// Signals that computeLifecycle's own signature table classifies as
// Saturated: high real demand (growth score 9), nothing accelerating,
// no new-entrant surge.
function saturatedSignals(): AggregatedSignals {
  return {
    growth: { value: { score: 9, confidence: 0.7, momentum: 'Stable', momentum_90d_pct: 1 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
    supply_velocity: { value: { score: 2, confidence: 0.75, young_listing_pct_12m: 0.05, young_listing_pct_24m: 0.1, entry_velocity_ratio: 0.5, entry_velocity: 'Stable', sample_size: 30 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.75 },
    providers_used: ['keepa'], overall_confidence: 0.7,
  } as unknown as AggregatedSignals
}

describe('computeFreshLifecycleFromSignals', () => {
  it('derives a real fresh lifecycle classification from real fresh signals, reusing computeDemand\'s existing growth fallback', () => {
    const { classification, gapVelocity } = computeFreshLifecycleFromSignals(saturatedSignals())
    expect(classification.stage).toBe('Saturated')
    expect(classification.inputs.amazon_demand_level).toBe('High')
    expect(gapVelocity.demand_acceleration_pct).toBe(1)
  })
})

describe('evaluateWatch', () => {
  it('detects a real stage transition against the watch\'s prior recorded stage', () => {
    const entry = watchEntry({ lifecycle_stage_at_watch: 'Window Open', last_lifecycle_stage: null })
    const fresh = computeFreshLifecycleFromSignals(saturatedSignals())
    const result = evaluateWatch(entry, fresh)
    expect(result.stageTransition).toEqual({ from: 'Window Open', to: 'Saturated' })
  })

  it('reports no transition (never a fabricated one) when the fresh stage matches the prior stage', () => {
    const entry = watchEntry({ lifecycle_stage_at_watch: 'Saturated', last_lifecycle_stage: null })
    const fresh = computeFreshLifecycleFromSignals(saturatedSignals())
    expect(evaluateWatch(entry, fresh).stageTransition).toBeNull()
  })

  it('prefers last_lifecycle_stage (the most recent real observation) over lifecycle_stage_at_watch', () => {
    const entry = watchEntry({ lifecycle_stage_at_watch: 'Latent', last_lifecycle_stage: 'Saturated' })
    const fresh = computeFreshLifecycleFromSignals(saturatedSignals())
    expect(evaluateWatch(entry, fresh).stageTransition).toBeNull()
  })

  it('flags real kill-criteria triggers evaluated against fresh values', () => {
    const criteria = computeKillCriteria(
      { stage: 'Window Open', version: 'heuristic-v1', inputs: {
        search_momentum: 'Accelerating', amazon_demand_momentum: 'Accelerating', amazon_demand_level: 'Medium',
        social_level: 'Medium', supply_entry_velocity: 'Stable', supply_young_listing_pct_24m: 0.1,
      }, unmeasured_dimensions: ['science'] },
      { value: 20, demand_acceleration_pct: 20, supply_acceleration_normalized_pct: 0, version: 'heuristic-v1' },
    )
    const entry = watchEntry({ kill_criteria: criteria, lifecycle_stage_at_watch: 'Window Open' })
    const fresh = computeFreshLifecycleFromSignals(saturatedSignals())   // Saturated -> triggers the lifecycle_stage_advanced criterion... but Saturated isn't in ['Saturated','Declining']? it is.
    const result = evaluateWatch(entry, fresh)
    expect(result.triggeredCriteria.map(c => c.key)).toContain('lifecycle_stage_advanced')
  })
})

describe('runWatchlistRecheck — the roadmap\'s own fixture-forced acceptance test', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('a fixture-forced stage transition produces a real stage_transition alert', async () => {
    listActiveWatches.mockResolvedValue([
      watchEntry({ id: 'w1', user_id: 'u1', lifecycle_stage_at_watch: 'Window Open', last_lifecycle_stage: null }),
    ])
    engineFetch.mockResolvedValue(saturatedSignals())

    const summary = await runWatchlistRecheck()

    expect(summary.watchesChecked).toBe(1)
    expect(summary.stageTransitions).toBe(1)
    expect(writeAlert).toHaveBeenCalledWith(expect.objectContaining({
      watchlistId: 'w1', userId: 'u1', alertType: 'stage_transition',
      previousStage: 'Window Open', newStage: 'Saturated',
    }))
    expect(updateWatchAfterCheck).toHaveBeenCalledWith('w1', 'Saturated')
  })

  it('produces a kill_criteria_triggered alert when a real threshold is breached', async () => {
    const criteria = computeKillCriteria(
      { stage: 'Window Open', version: 'heuristic-v1', inputs: {
        search_momentum: 'Accelerating', amazon_demand_momentum: 'Accelerating', amazon_demand_level: 'Medium',
        social_level: 'Medium', supply_entry_velocity: 'Stable', supply_young_listing_pct_24m: 0.1,
      }, unmeasured_dimensions: ['science'] },
      { value: 20, demand_acceleration_pct: 20, supply_acceleration_normalized_pct: 0, version: 'heuristic-v1' },
    )
    listActiveWatches.mockResolvedValue([
      watchEntry({ id: 'w2', user_id: 'u2', kill_criteria: criteria, lifecycle_stage_at_watch: 'Saturated' }),
    ])
    engineFetch.mockResolvedValue(saturatedSignals())

    const summary = await runWatchlistRecheck()
    expect(summary.killCriteriaAlerts).toBeGreaterThan(0)
    expect(writeAlert).toHaveBeenCalledWith(expect.objectContaining({
      watchlistId: 'w2', userId: 'u2', alertType: 'kill_criteria_triggered', killCriterionKey: 'lifecycle_stage_advanced',
    }))
  })

  it('counts a watch as failed (never fabricates a re-check) when the fast tier returns no real signals', async () => {
    listActiveWatches.mockResolvedValue([watchEntry()])
    engineFetch.mockResolvedValue(null)

    const summary = await runWatchlistRecheck()
    expect(summary.watchesFailed).toBe(1)
    expect(summary.watchesChecked).toBe(0)
    expect(writeAlert).not.toHaveBeenCalled()
    expect(updateWatchAfterCheck).not.toHaveBeenCalled()
  })
})
