// Signal-separation engine — decides which of the already-real, already-
// computed comparison metrics get visually foregrounded as "what actually
// separates them" / "where the leader is weakest" in the redesigned Compare
// view. This is new client-side derived-DISPLAY logic, the same category as
// the existing findWinner()/getNumericRank() in ./metrics.ts (comparison-
// display ranking, not decision-engine code) — built strictly ON TOP of
// those real functions, never reimplementing their switch statements. It
// computes no new score, verdict, confidence, or kill-switch state; every
// value it reads is already a real, stored field on AnalysisComparisonItem
// via MetricDef.getValue.
//
// Ports the approved mockup's separationOf()/buildEngine() 1:1 (see
// scratchpad/compare_mockup.html), swapped onto the real getNumericRank/
// findWinner instead of the mockup's parallel rankValue()/candidateWins().

import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import { VERDICT_RANK, getNumericRank, findWinner, type MetricDef, type Direction } from './metrics'

// Disclosed display constants (surfaced verbatim in the UI's honesty note —
// never hidden logic).
export const DECISIVE_THRESHOLD = 0.35
export const DECISIVE_CAP = 5
// "Clears the bar" = the leader's own real verdict is at least
// WATCH_CLOSELY (the 3rd-highest of the 7 real MarketVerdict values, same
// relative position PURSUE_WITH_CAUTION held in the old 4-value verdict
// vocabulary this replaced). Below that, the comparison has no winner to
// declare.
export const BAR_CLEAR_VERDICT_RANK = VERDICT_RANK.WATCH_CLOSELY

export interface ScoredMetric {
  metric: MetricDef
  values: (number | string | boolean | null)[]
  sep: number
  leaderWins: boolean
}

export interface SeparationEngineResult {
  sorted: ScoredMetric[]                          // every visible metric, sorted by descending separation
  forPool: ScoredMetric[]                          // what separates the leader (cap 5, threshold 0.35)
  against: ScoredMetric[]                          // single largest gap running against the leader (0 or 1)
  decisiveIds: Record<string, 'for' | 'against'>
}

// span/scale over direction-adjusted ranks — a 0..~1+ score, scale-
// normalized per metric so a $ figure and a boolean flag are comparable on
// the same axis. Identical formula to the approved mockup's separationOf(),
// now sourced from the real getNumericRank() instead of a parallel switch.
export function separationOf(dir: Direction, values: (number | string | boolean | null)[]): number {
  const ranks = values.map(v => getNumericRank(dir, v)).filter((r): r is number => r !== null)
  if (ranks.length < 2) return 0
  const span = Math.max(...ranks) - Math.min(...ranks)
  const scale = Math.max(1, ...ranks.map(Math.abs))
  return span / scale
}

export function buildSeparationEngine(
  items: AnalysisComparisonItem[],
  leaderIdx: number,
  metrics: MetricDef[]
): SeparationEngineResult {
  const scored: ScoredMetric[] = metrics.map(metric => {
    const values = items.map(i => metric.getValue(i))
    const sep = separationOf(metric.dir, values)
    const leaderWins = findWinner(metric.dir, values).has(leaderIdx)
    return { metric, values, sep, leaderWins }
  })

  const sorted = [...scored].sort((a, b) => b.sep - a.sep)

  let forPool = sorted.filter(x => x.leaderWins && x.sep >= DECISIVE_THRESHOLD).slice(0, DECISIVE_CAP)
  if (forPool.length === 0) {
    const firstWin = sorted.find(x => x.leaderWins)
    if (firstWin) forPool = [firstWin]
  }
  const againstPool = sorted.filter(x => !x.leaderWins)
  const against = againstPool.length ? [againstPool[0]] : []

  const decisiveIds: Record<string, 'for' | 'against'> = {}
  forPool.forEach(x => { decisiveIds[x.metric.id] = 'for' })
  against.forEach(x => { decisiveIds[x.metric.id] = 'against' })

  return { sorted, forPool, against, decisiveIds }
}

// Leader selection — reads real, already-computed verdict + score straight
// off AnalysisComparisonItem (the same authority the approved design's
// "Layer 1" answer sentence quotes, in place of a parallel win-count
// tally). Ties on verdict rank fall through to score. An item with no
// verdict (memo_data predates market_verdict, verdict === null) ranks below
// any item that has a real one — even an AVOID/PASS one — because a
// completed real verdict is always more decision-ready than a missing one.
// This orders already-real values; it computes no new verdict or score of
// its own.
export function pickLeaderIndex(items: AnalysisComparisonItem[]): number {
  let bestIdx = 0
  let bestVerdictRank = -1
  let bestScore = -Infinity
  items.forEach((item, i) => {
    const verdictRank = item.verdict ? (VERDICT_RANK[item.verdict] ?? -1) : -1
    const score = item.score ?? -Infinity
    if (verdictRank > bestVerdictRank || (verdictRank === bestVerdictRank && score > bestScore)) {
      bestVerdictRank = verdictRank
      bestScore = score
      bestIdx = i
    }
  })
  return bestIdx
}

// "None of these clears the bar" is only ever a real, first-class outcome —
// never inferred from missing data. True only when EVERY compared item has
// a real verdict and the leader's own verdict rank still falls short of
// WATCH_CLOSELY. A set where any item's memo_data simply predates
// market_verdict (verdict === null) is never mislabeled as "doesn't clear
// the bar."
export function isWeakSet(items: AnalysisComparisonItem[], leaderIdx: number): boolean {
  if (!items.every(i => i.verdict !== null)) return false
  const leaderVerdict = items[leaderIdx].verdict
  const rank = leaderVerdict ? (VERDICT_RANK[leaderVerdict] ?? 0) : 0
  return rank < BAR_CLEAR_VERDICT_RANK
}
