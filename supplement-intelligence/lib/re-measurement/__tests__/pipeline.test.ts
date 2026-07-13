// Re-measurement pipeline tests — Roadmap M2.9.
//
// The real ledger only began recording 2026-07-12 (Roadmap M1.1's backfill
// note) — as of this milestone shipping (2026-07-13), no real row has
// reached even the 3-month checkpoint. This suite verifies the worker's
// logic with a fixture-forced elapsed ledger row (created_at set far enough
// in the past that a real checkpoint is genuinely due), the same honesty
// convention used throughout this session for not-yet-live-verifiable
// integrations.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AggregatedSignals } from '@/lib/signal-engine/types'

const fetchFastTierSignals = vi.fn()
vi.mock('@/lib/watchlist/recheck', () => ({ fetchFastTierSignals: (...args: unknown[]) => fetchFastTierSignals(...args) }))

const listCandidateLedgerRows = vi.fn()
const getRecordedCheckpoints  = vi.fn()
const getFrozenVerdictContext = vi.fn()
const writeOutcome            = vi.fn().mockResolvedValue(undefined)
vi.mock('../service-store', () => ({
  listCandidateLedgerRows: (...args: unknown[]) => listCandidateLedgerRows(...args),
  getRecordedCheckpoints:  (...args: unknown[]) => getRecordedCheckpoints(...args),
  getFrozenVerdictContext: (...args: unknown[]) => getFrozenVerdictContext(...args),
  writeOutcome:            (...args: unknown[]) => writeOutcome(...args),
}))

import { runRemeasurement } from '../pipeline'

function ledgerRow(overrides: Partial<{ id: string; created_at: string; analysis_id: string; normalized_market: string; category_id: string | null }> = {}) {
  return {
    id: 'v1', created_at: '2025-01-01T00:00:00Z', analysis_id: 'a1',
    normalized_market: 'berberine', category_id: 'supplements',
    ...overrides,
  }
}

function freshSignals(): AggregatedSignals {
  return {
    supply_velocity: { value: { score: 8, confidence: 0.75, young_listing_pct_12m: 0.4, young_listing_pct_24m: 0.5, entry_velocity_ratio: 0.8, entry_velocity: 'Accelerating', sample_size: 25 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.75 },
    revenue: { value: { score: 6, confidence: 0.7, avg_review_count: 42 }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
    pricing: { value: { score: 6, confidence: 0.7, avg_price: '$33' }, sources: ['keepa'], primarySource: 'keepa', confidence: 0.7 },
    providers_used: ['keepa'], overall_confidence: 0.72,
  } as unknown as AggregatedSignals
}

describe('runRemeasurement — fixture-forced elapsed checkpoint (roadmap acceptance criterion)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('produces a real outcome row, immutably linked to its originating verdict row, once a real checkpoint is due', async () => {
    const now = new Date('2026-07-13T00:00:00Z')   // ~1.5 years after the fixture's created_at -> all 3 checkpoints due
    listCandidateLedgerRows.mockResolvedValue([ledgerRow()])
    getRecordedCheckpoints.mockResolvedValue([])
    fetchFastTierSignals.mockResolvedValue(freshSignals())
    getFrozenVerdictContext.mockResolvedValue({ avgPriceAtVerdict: 30, avgReviewCountAtVerdict: 5 })

    const result = await runRemeasurement(now)

    expect(result.ledgerRowsProcessed).toBe(1)
    expect(result.checkpointsRecorded).toBe(3)   // 3, 6, and 12 months all elapsed for this fixture
    expect(result.keepaTokensUsedEstimate).toBeGreaterThan(0)

    expect(writeOutcome).toHaveBeenCalledWith(expect.objectContaining({
      verdictLedgerId: 'v1', checkpointMonths: 3,
      entryVelocity: 'Accelerating', avgReviewCountAtMeasurement: 42, avgReviewCountAtVerdict: 5,
      avgPriceAtMeasurement: 33, avgPriceAtVerdict: 30,
      outcomeLabel: 'meaningful_traction',
    }))
    // Real price movement: (33 - 30) / 30 * 100 = 10%
    expect(writeOutcome.mock.calls[0][0].priceMovementPct).toBeCloseTo(10, 5)
  })

  it('processes only the checkpoints not already recorded (idempotent across runs)', async () => {
    listCandidateLedgerRows.mockResolvedValue([ledgerRow()])
    getRecordedCheckpoints.mockResolvedValue([3, 6])
    fetchFastTierSignals.mockResolvedValue(freshSignals())
    getFrozenVerdictContext.mockResolvedValue({ avgPriceAtVerdict: 30, avgReviewCountAtVerdict: 5 })

    const result = await runRemeasurement(new Date('2026-07-13T00:00:00Z'))
    expect(result.checkpointsRecorded).toBe(1)
    expect(writeOutcome).toHaveBeenCalledWith(expect.objectContaining({ checkpointMonths: 12 }))
  })

  it('skips a row with no real category_id (never guesses which category to re-fetch)', async () => {
    listCandidateLedgerRows.mockResolvedValue([ledgerRow({ category_id: null })])
    const result = await runRemeasurement(new Date('2026-07-13T00:00:00Z'))
    expect(result.ledgerRowsProcessed).toBe(0)
    expect(fetchFastTierSignals).not.toHaveBeenCalled()
  })

  it('correctly processes zero checkpoints for a ledger row whose real elapsed time is still under 90 days (today\'s real, honest state of this ledger)', async () => {
    listCandidateLedgerRows.mockResolvedValue([ledgerRow({ created_at: '2026-07-12T00:00:00Z' })])
    getRecordedCheckpoints.mockResolvedValue([])
    const result = await runRemeasurement(new Date('2026-07-13T00:00:00Z'))
    expect(result.ledgerRowsProcessed).toBe(0)
    expect(result.checkpointsRecorded).toBe(0)
    expect(fetchFastTierSignals).not.toHaveBeenCalled()
    expect(writeOutcome).not.toHaveBeenCalled()
  })

  it('writes too_early_to_tell (never fabricates traction) when the fast-tier re-pull returns nothing', async () => {
    listCandidateLedgerRows.mockResolvedValue([ledgerRow()])
    getRecordedCheckpoints.mockResolvedValue([])
    fetchFastTierSignals.mockResolvedValue(null)
    getFrozenVerdictContext.mockResolvedValue({ avgPriceAtVerdict: null, avgReviewCountAtVerdict: null })

    await runRemeasurement(new Date('2026-07-13T00:00:00Z'))
    expect(writeOutcome).toHaveBeenCalledWith(expect.objectContaining({ outcomeLabel: 'too_early_to_tell' }))
  })
})
