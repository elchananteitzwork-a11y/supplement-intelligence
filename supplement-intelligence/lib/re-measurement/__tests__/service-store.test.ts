import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const lte = vi.fn()
const selectCandidates = vi.fn(() => ({ lte }))

const eqOutcomes = vi.fn()
const selectOutcomes = vi.fn(() => ({ eq: eqOutcomes }))

const maybeSingle = vi.fn()
const eqAnalyses = vi.fn(() => ({ maybeSingle }))
const selectAnalyses = vi.fn(() => ({ eq: eqAnalyses }))

const upsert = vi.fn()

const from = vi.fn((table: string) => {
  if (table === 'verdict_ledger') return { select: selectCandidates }
  if (table === 'verdict_ledger_outcomes') return { select: selectOutcomes, upsert }
  if (table === 'analyses') return { select: selectAnalyses }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from })) }))

const ORIGINAL_ENV = { ...process.env }

describe('lib/re-measurement/service-store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
  })
  afterEach(() => { process.env = { ...ORIGINAL_ENV } })

  it('listCandidateLedgerRows filters to rows old enough for the shortest (3-month) checkpoint', async () => {
    lte.mockResolvedValue({ data: [{ id: 'v1' }], error: null })
    const { listCandidateLedgerRows } = await import('../service-store')
    const rows = await listCandidateLedgerRows(new Date('2026-07-13T00:00:00Z'))
    expect(rows).toEqual([{ id: 'v1' }])
    expect(lte).toHaveBeenCalledWith('created_at', expect.any(String))
  })

  it('getRecordedCheckpoints returns the real checkpoint_months already written', async () => {
    eqOutcomes.mockResolvedValue({ data: [{ checkpoint_months: 3 }, { checkpoint_months: 6 }], error: null })
    const { getRecordedCheckpoints } = await import('../service-store')
    expect(await getRecordedCheckpoints('v1')).toEqual([3, 6])
  })

  it('getFrozenVerdictContext parses the real frozen price/review-count from analyses.memo_data', async () => {
    maybeSingle.mockResolvedValue({
      data: { memo_data: { signal_evidence: { pricing: { value: { avg_price: '$28.50' } }, revenue: { value: { avg_review_count: 12 } } } } },
      error: null,
    })
    const { getFrozenVerdictContext } = await import('../service-store')
    const ctx = await getFrozenVerdictContext('a1')
    expect(ctx.avgPriceAtVerdict).toBeCloseTo(28.5, 5)
    expect(ctx.avgReviewCountAtVerdict).toBe(12)
  })

  it('getFrozenVerdictContext returns nulls (never fabricated) when the frozen memo has no real pricing/revenue signal', async () => {
    maybeSingle.mockResolvedValue({ data: { memo_data: {} }, error: null })
    const { getFrozenVerdictContext } = await import('../service-store')
    expect(await getFrozenVerdictContext('a1')).toEqual({ avgPriceAtVerdict: null, avgReviewCountAtVerdict: null })
  })

  it('writeOutcome upserts on (verdict_ledger_id, checkpoint_months) for idempotent retries', async () => {
    upsert.mockResolvedValue({ error: null })
    const { writeOutcome } = await import('../service-store')
    await writeOutcome({
      verdictLedgerId: 'v1', checkpointMonths: 3, daysSinceVerdict: 91,
      entryVelocity: 'Accelerating', youngListingPct24m: 0.5,
      avgReviewCountAtMeasurement: 40, avgReviewCountAtVerdict: 5,
      avgPriceAtMeasurement: 33, avgPriceAtVerdict: 30, priceMovementPct: 10,
      outcomeLabel: 'meaningful_traction', keepaTokensUsedEstimate: 50,
    })
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ verdict_ledger_id: 'v1', checkpoint_months: 3, outcome_label: 'meaningful_traction' }),
      { onConflict: 'verdict_ledger_id,checkpoint_months' },
    )
  })
})
