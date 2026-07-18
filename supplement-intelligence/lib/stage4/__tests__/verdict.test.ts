// Regression tests for the 2026-07-18 audit Findings 1 & 5
// (lib/stage4/verdict.ts determineFounderVerdict).
//
// Finding 1: STRONG_FIT's headline claims "capital, channel, and timeline
// all confirmed" but was gated only on the composite fit_rank score plus
// requirements.length === 0 — channel_fit.level was never checked, so a
// 'weak' channel (a real negative signal) could still reach STRONG_FIT via
// other positive factors. Fix: gate on the three underlying levels directly.
//
// Finding 5: middle/borderline fit states (capital 'tight', channel
// 'partial'/'weak', timeline 'stretched') were neither pushed to rationale
// (which only fires on the BEST level per dimension) nor to requirements
// (which only fires on the WORST capital/timeline level) — they silently
// vanished from founder-facing output. Fix: a new `caveats` array surfaces
// them explicitly.

import { describe, it, expect } from 'vitest'
import { determineFounderVerdict } from '../verdict'
import type { MarketVerdict } from '../verdict'
import type { FounderFitAnnotation } from '../../stage2/types'

const MARKET_VERDICT_PURSUE: MarketVerdict = {
  code: 'PURSUE',
  headline: 'test',
  rationale: [],
  blockers: [],
  conditions: [],
  data_confidence: 'high',
}

function baseFit(overrides: Partial<FounderFitAnnotation> = {}): FounderFitAnnotation {
  return {
    thesis_id: 't1',
    founder_profile_id: 'p1',
    fit_rank: 4,
    capital_fit: { level: 'sufficient', capital_required: 10000, capital_available: 20000, buffer_pct: 100, note: '$20k available vs $10k required — 100% buffer' },
    experience_gaps: [],
    channel_fit: { level: 'strong', note: 'Social audience of 50k aligns with target customer profile' },
    timeline_fit: { level: 'feasible', note: '4mo minimum fits within 18mo horizon with 14mo slack' },
    advantages: [],
    gaps: [],
    ...overrides,
  }
}

describe('determineFounderVerdict — Finding 1 (STRONG_FIT gated on real underlying levels)', () => {
  it('does NOT return STRONG_FIT when channel_fit is weak, even if fit_rank >= 4 and there are no requirements', () => {
    const fit = baseFit({
      fit_rank: 4, // previously sufficient alone to trigger STRONG_FIT
      channel_fit: { level: 'weak', note: 'No existing channel — cold launch requires paid acquisition budget' },
      advantages: ['Long runway allows iterative product development without capital pressure'],
    })

    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.code).not.toBe('STRONG_FIT')
    expect(verdict.headline).not.toMatch(/capital, channel, and timeline all confirmed/)
  })

  it('DOES return STRONG_FIT when capital sufficient, channel strong, timeline feasible, and no requirements', () => {
    const fit = baseFit()
    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.code).toBe('STRONG_FIT')
    expect(verdict.headline).toMatch(/capital, channel, and timeline all confirmed/)
  })

  it('does NOT return STRONG_FIT when an experience gap exists, even with all three levels ideal', () => {
    const fit = baseFit({ experience_gaps: ['FDA labeling and supplement regulatory compliance experience missing'] })
    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.code).not.toBe('STRONG_FIT')
    expect(verdict.requirements).toContain('FDA labeling and supplement regulatory compliance experience missing')
  })
})

describe('determineFounderVerdict — Finding 5 (middle/borderline states surfaced as caveats, not dropped)', () => {
  it('surfaces a capital_fit "tight" note as a caveat, not silently omitted', () => {
    const fit = baseFit({
      capital_fit: { level: 'tight', capital_required: 10000, capital_available: 10500, buffer_pct: 5, note: '$10k available vs $10k required — thin buffer; no contingency room' },
    })

    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.caveats.some(c => c.includes('thin buffer; no contingency room'))).toBe(true)
    // Must NOT be misrepresented as a confirmed strength...
    expect(verdict.rationale.some(r => r.includes('Capital fit'))).toBe(false)
    // ...nor as a hard blocker.
    expect(verdict.requirements.some(r => r.includes('thin buffer'))).toBe(false)
  })

  it('surfaces a timeline_fit "stretched" note as a caveat, not silently omitted', () => {
    const fit = baseFit({
      timeline_fit: { level: 'stretched', note: '8mo minimum for medium-complexity launch — only 2mo buffer in 18mo horizon' },
    })

    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.caveats.some(c => c.includes('only 2mo buffer'))).toBe(true)
    expect(verdict.rationale.some(r => r.includes('Timeline fit'))).toBe(false)
    expect(verdict.requirements.some(r => r.includes('only 2mo buffer'))).toBe(false)
  })

  it('surfaces a channel_fit "partial" note as a caveat, not silently omitted', () => {
    const fit = baseFit({
      channel_fit: { level: 'partial', note: 'Social audience of 6k — moderate launch leverage' },
    })

    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.caveats.some(c => c.includes('moderate launch leverage'))).toBe(true)
    expect(verdict.rationale.some(r => r.includes('Channel fit'))).toBe(false)
  })

  it('returns caveats: [] (not undefined) when market verdict is DO_NOT_PURSUE (early-return path)', () => {
    const blockedVerdict: MarketVerdict = { ...MARKET_VERDICT_PURSUE, code: 'DO_NOT_PURSUE', blockers: ['Economics structurally broken'] }
    const verdict = determineFounderVerdict(blockedVerdict, baseFit())

    expect(verdict.caveats).toEqual([])
  })

  it('does not duplicate a capital "insufficient" note into caveats (requirements still owns hard blockers)', () => {
    const fit = baseFit({
      capital_fit: { level: 'insufficient', capital_required: 20000, capital_available: 5000, buffer_pct: -75, note: 'Capital shortfall: need $20k, effective available $5k' },
    })

    const verdict = determineFounderVerdict(MARKET_VERDICT_PURSUE, fit)

    expect(verdict.requirements.some(r => r.includes('Capital shortfall'))).toBe(true)
    expect(verdict.caveats.some(c => c.includes('Capital shortfall'))).toBe(false)
  })
})
