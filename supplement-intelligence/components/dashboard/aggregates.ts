// ═══════════════════════════════════════════════════════════════════════
// components/dashboard/aggregates.ts — real portfolio-level Phase 2 stats
// for the Dashboard's StatTile row. Every function here reduces over
// ALREADY-COMPUTED per-card intelligence (see app/dashboard/page.tsx,
// which computes lifecycle/v2 verdict/confidence exactly once per
// analysis and reuses that same result for both the per-card display and
// these aggregates) — never a second, independent calculation.
//
// Every aggregate is honest about its own real denominator: Phase 2 data
// only exists on analyses generated after each milestone shipped, so an
// aggregate computed against ALL analyses (including pre-Phase-2 ones)
// would silently understate real rates. Each function here returns null
// when zero analyses have the relevant real data, rather than a
// misleading 0%/0 — the caller renders an honest "not yet available" tile
// in that case.
// ═══════════════════════════════════════════════════════════════════════

import type { V2VerdictDisplay, LifecycleDisplay } from '@/components/memo/field-derivations'

export interface DashboardCardIntelligence {
  lifecycle:      LifecycleDisplay | null
  v2Verdict:      V2VerdictDisplay | null
  confidencePct:  number | null   // real overallConfidence * 100, or null
}

export interface V2BuildRate {
  ratePct:       number
  buildNowCount: number
  scoredCount:   number   // real denominator — how many analyses actually have M2.4 data
}

export function computeV2BuildRate(cards: DashboardCardIntelligence[]): V2BuildRate | null {
  const scored = cards.filter(c => c.v2Verdict !== null)
  if (!scored.length) return null
  const buildNowCount = scored.filter(c => c.v2Verdict!.verdict === 'BUILD_NOW').length
  return { ratePct: Math.round((buildNowCount / scored.length) * 100), buildNowCount, scoredCount: scored.length }
}

export interface AvgQuality {
  avgScore:    number
  scoredCount: number
}

export function computeAvgQuality(cards: DashboardCardIntelligence[]): AvgQuality | null {
  const scored = cards.filter(c => c.v2Verdict !== null)
  if (!scored.length) return null
  const avg = scored.reduce((s, c) => s + c.v2Verdict!.qualityScore, 0) / scored.length
  return { avgScore: Math.round(avg), scoredCount: scored.length }
}

export interface LifecycleCoverage {
  classifiedCount: number
  totalCount:      number
}

export function computeLifecycleCoverage(cards: DashboardCardIntelligence[]): LifecycleCoverage {
  return { classifiedCount: cards.filter(c => c.lifecycle !== null).length, totalCount: cards.length }
}

export interface AvgConfidence {
  avgPct:      number
  scoredCount: number
}

export function computeAvgConfidence(cards: DashboardCardIntelligence[]): AvgConfidence | null {
  const real = cards.map(c => c.confidencePct).filter((p): p is number => p !== null)
  if (!real.length) return null
  return { avgPct: Math.round(real.reduce((s, p) => s + p, 0) / real.length), scoredCount: real.length }
}
