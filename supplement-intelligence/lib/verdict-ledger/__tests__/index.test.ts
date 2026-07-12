// Verdict Ledger write-path tests — V2 Blueprint §11 / Roadmap M1.1.
//
// Acceptance criteria under test here:
//   - writes go through upsert with onConflict: analysis_id + ignoreDuplicates
//     (retrying the same execution never creates duplicates)
//   - a DB error is logged and swallowed, never thrown (non-fatal write)
//   - an extraction-time exception is also swallowed, never thrown

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { writeVerdictLedgerEntry } from '../index'
import type { ExtractLedgerEntryContext } from '../extract'
import type { MemoData } from '@/types/index'
import type { GroundedScore } from '@/lib/scoring'

function makeCtx(overrides: Partial<ExtractLedgerEntryContext> = {}): ExtractLedgerEntryContext {
  const grounded: GroundedScore = {
    score: 55,
    decision: 'VALIDATE_FURTHER',
    dimensions: [
      { key: 'demand', label: 'Demand', weight: 0.22, rawScore: 5.5, source: 'verified', sourceLabel: 'DataForSEO' },
    ],
    groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth: {
      contributingProviders: ['dataforseo'],
      totalScoreEligibleProviders: 8,
      pct: 12,
      channelBreakdown: [
        { channel: 'search_intent', label: 'Search / SEO', contributed: true, providers: ['dataforseo'] },
      ],
      distinctChannelTypes: 1,
      crossChannelCorroborated: false,
    },
  }
  const memo = { category_name: 'Magnesium Glycinate', scoring_version: '2.7.0' } as MemoData

  return {
    memo,
    grounded,
    userQuery: 'magnesium glycinate',
    normalizedMarket: 'magnesium glycinate',
    categoryId: 'supplements',
    engineVersion: '2.7.0',
    userId: 'user-1',
    analysisId: 'analysis-1',
    ...overrides,
  }
}

// Minimal Supabase client mock: sb.from('verdict_ledger').upsert(payload, opts)
function mockSupabase(upsertResult: { error: { message: string } | null }) {
  const upsert = vi.fn().mockResolvedValue(upsertResult)
  const from = vi.fn().mockReturnValue({ upsert })
  return { from, upsert } as unknown as { from: typeof from; upsert: typeof upsert }
}

describe('writeVerdictLedgerEntry — idempotency', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('upserts on analysis_id with ignoreDuplicates — retries never create a second row', async () => {
    const { from, upsert } = mockSupabase({ error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeVerdictLedgerEntry({ from } as any, makeCtx())

    expect(from).toHaveBeenCalledWith('verdict_ledger')
    expect(upsert).toHaveBeenCalledTimes(1)
    const [, opts] = upsert.mock.calls[0]
    expect(opts).toEqual({ onConflict: 'analysis_id', ignoreDuplicates: true })
  })

  it('sends the analysis_id and user_id from context in the payload', async () => {
    const { from, upsert } = mockSupabase({ error: null })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await writeVerdictLedgerEntry({ from } as any, makeCtx({ analysisId: 'abc-999', userId: 'user-42' }))

    const [payload] = upsert.mock.calls[0]
    expect(payload.analysis_id).toBe('abc-999')
    expect(payload.user_id).toBe('user-42')
  })
})

describe('writeVerdictLedgerEntry — non-fatal failure handling', () => {
  it('never throws when the upsert returns a DB error', async () => {
    const { from } = mockSupabase({ error: { message: 'unique constraint violation' } })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(writeVerdictLedgerEntry({ from } as any, makeCtx())).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('never throws when extraction itself fails (malformed context)', async () => {
    const from = vi.fn()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const brokenCtx = makeCtx({ grounded: null as unknown as GroundedScore })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(writeVerdictLedgerEntry({ from } as any, brokenCtx)).resolves.toBeUndefined()
    expect(from).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
