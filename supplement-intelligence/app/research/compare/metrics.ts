// Pure comparison-metric definitions and ranking logic for the compare page.
//
// Split out of page.tsx (2026-07-18 audit) so these functions are directly
// unit-testable — Next.js page.tsx files may only export the recognized
// page symbols (default/metadata/config/generateStaticParams/etc.);
// exporting plain helper functions/consts directly from page.tsx fails
// Next's generated page-type check (`tsc --noEmit` error: "Property
// 'trendRank' is incompatible with index signature... not assignable to
// type 'never'"). Colocating them here keeps them unit-testable without
// violating that constraint.
//
// Rewired (2026-07-2x) onto AnalysisComparisonItem (real `analyses` pipeline)
// — METRICS pruned to only the fields that survive that rewrite (score,
// verdict, market revenue, price, momentum, trend, tiktok, competitors,
// review concentration, kill-criteria-clear). Fit/thresholds/complexity/
// capital/cogs/year1/margin/capfit/tlfit are gone — no equivalent exists in
// AnalysisComparisonItem (see app/api/research/compare/route.ts's own
// header comment). getNumericRank/findWinner/trendRank/rank maps below are
// generic infrastructure, untouched by the field pruning.
import type { AnalysisComparisonItem } from '@/app/api/research/compare/route'
import type { MarketVerdict } from '@/lib/verdict-matrix'

export type Direction = 'higher' | 'lower' | 'bool_true' | 'verdict' | 'trend'

export interface MetricDef {
  id:        string
  label:     string
  section:   string
  dir:       Direction
  getValue:  (item: AnalysisComparisonItem) => number | string | boolean | null
  format:    (v: number | string | boolean | null) => string
}

// Rank order matches lib/verdict-matrix.ts's own MarketVerdict union
// declaration order verbatim (BUILD_NOW > BUILD_IF_DIFFERENTIATED >
// WATCH_CLOSELY > WATCH > INVESTIGATE > AVOID > PASS) — the same order
// components/memo/CurrentSignal.tsx's V2_VERDICT_CFG lists them in. A
// display-ranking judgment call for winner detection only; it does not
// change what any verdict means.
export const VERDICT_RANK: Record<MarketVerdict, number> = {
  BUILD_NOW:               7,
  BUILD_IF_DIFFERENTIATED: 6,
  WATCH_CLOSELY:           5,
  WATCH:                   4,
  INVESTIGATE:             3,
  AVOID:                   2,
  PASS:                    1,
}
// Reuses the exact label/color vocabulary already established for this real
// MarketVerdict type by components/memo/CurrentSignal.tsx's V2_VERDICT_CFG —
// copied verbatim (same "the two always say the same thing" convention
// already used elsewhere in this codebase) rather than inventing a second
// palette for the same verdict values.
export const VERDICT_META: Record<MarketVerdict, { label: string; cls: string }> = {
  BUILD_NOW:               { label: 'Build Now',              cls: 'text-pi-build border-pi-build/40 bg-pi-build/10' },
  BUILD_IF_DIFFERENTIATED: { label: 'Build If Differentiated', cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH_CLOSELY:           { label: 'Watch Closely',           cls: 'text-pi-gold-bright border-pi-gold/40 bg-pi-gold/10' },
  WATCH:                   { label: 'Watch',                   cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  INVESTIGATE:             { label: 'Investigate',              cls: 'text-pi-sub border-pi-hairline bg-pi-card' },
  AVOID:                   { label: 'Avoid',                    cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
  PASS:                    { label: 'Pass',                     cls: 'text-pi-risk border-pi-risk/40 bg-pi-risk/10' },
}

function fmtK(n: number | string | boolean | null): string {
  if (n === null || n === undefined || n === '') return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000)     return `$${(num / 1_000).toFixed(0)}k`
  return `$${num.toFixed(0)}`
}
function fmtN(n: number | string | boolean | null, suffix = ''): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  if (isNaN(num)) return String(n)
  return `${num.toLocaleString()}${suffix}`
}
function fmtPct(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : `${num > 0 ? '+' : ''}${num.toFixed(1)}%`
}
function fmtStr(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'boolean') return n ? 'Yes' : 'No'
  return String(n).replace(/_/g, ' ')
}

export const METRICS: MetricDef[] = [
  // Summary
  { id: 'score',       label: 'Opportunity Score',      section: 'Summary',    dir: 'higher',     getValue: i => i.score,                format: v => v === null ? '—' : `${v}/100` },
  { id: 'verdict',     label: 'Market Verdict',         section: 'Summary',    dir: 'verdict',    getValue: i => i.verdict,              format: v => v === null ? '—' : (VERDICT_META[v as MarketVerdict]?.label ?? fmtStr(v)) },
  // Market signals
  { id: 'revenue',     label: 'Market Revenue /mo',     section: 'Market',     dir: 'higher',     getValue: i => i.market_revenue_mo,    format: fmtK },
  // Fix (2026-07-18 audit, Finding 2): fmtN never returns an empty string
  // (it returns '—' for null/undefined, which is truthy), so the old
  // `v => fmtN(v, '') ? ... : '—'` ternary's '—' branch was dead code and a
  // missing median_price rendered as a fabricated "$0".
  { id: 'price',       label: 'Median Price',           section: 'Market',     dir: 'higher',     getValue: i => i.median_price,         format: v => v === null || v === undefined ? '—' : `$${Number(v).toFixed(0)}` },
  { id: 'momentum',    label: '90-day Momentum',        section: 'Market',     dir: 'higher',     getValue: i => i.momentum_90d_pct,    format: fmtPct },
  // Fix (2026-07-18 audit, Finding 6): was `dir: 'higher'`, but
  // getNumericRank's 'higher' case only handles `typeof val === 'number'`,
  // so this string field could never produce a "best in class" badge. Now
  // uses its own 'trend' direction case (see trendRank below).
  { id: 'trend',       label: 'Trend Direction',        section: 'Market',     dir: 'trend',      getValue: i => i.trend_direction,      format: fmtStr },
  { id: 'tiktok',      label: 'TikTok Views',           section: 'Market',     dir: 'higher',     getValue: i => i.tiktok_view_count,   format: fmtN },
  // Competition
  { id: 'competitors', label: 'Competitor Count',       section: 'Competition', dir: 'lower',     getValue: i => i.competitor_count,    format: fmtN },
  { id: 'revconc',     label: 'Review Concentration',  section: 'Competition', dir: 'lower',      getValue: i => i.review_concentration, format: v => (v === null || v === undefined) ? '—' : `${Math.round(Number(v) * 100)}%` },
  // Gates
  { id: 'killsw',      label: 'Kill Criteria Clear',    section: 'Gates',      dir: 'bool_true',  getValue: i => i.kill_criteria_clear, format: v => v === null ? '—' : v ? 'Clear' : 'Flagged' },
]

// Fix (2026-07-18 audit, Finding 6): trend_direction is a real free-text
// string produced by the underlying providers (e.g. "+12% (recent trend)",
// "-8% YoY", "Stable" — see lib/signal-engine/providers/google-trends.ts's
// growthToTrendStr and keepa.ts's bsrDeltaYoY), not a clean
// increasing/stable/declining enum. Parse the real formats instead of
// inventing a fake string-equality enum match: a leading sign gives a real
// direction and magnitude, "Stable" is neutral (0), and anything
// unrecognized stays unranked (null) rather than guessing.
export function trendRank(val: string): number | null {
  const trimmed = val.trim()
  if (/^stable$/i.test(trimmed)) return 0
  const match = trimmed.match(/^([+-])\s*(\d+(?:\.\d+)?)/)
  if (match) return (match[1] === '-' ? -1 : 1) * parseFloat(match[2])
  return null
}

// Determine numeric rank for comparison (winner detection)
export function getNumericRank(dir: Direction, val: number | string | boolean | null): number | null {
  if (val === null || val === undefined) return null
  switch (dir) {
    case 'higher':     return typeof val === 'number' ? val : null
    case 'lower':      return typeof val === 'number' ? -val : null
    case 'bool_true':  return val === true ? 1 : val === false ? 0 : null
    case 'verdict':    return VERDICT_RANK[val as MarketVerdict] ?? null
    case 'trend':      return typeof val === 'string' ? trendRank(val) : null
  }
}

export function findWinner(dir: Direction, values: (number | string | boolean | null)[]): Set<number> {
  const ranks = values.map(v => getNumericRank(dir, v))
  const validRanks = ranks.filter(r => r !== null) as number[]
  if (validRanks.length < 2) return new Set()  // no winner when only one has data
  const best = Math.max(...validRanks)
  const winners = new Set<number>()
  ranks.forEach((r, i) => { if (r === best) winners.add(i) })
  // No winner if all tied
  if (winners.size === values.length) return new Set()
  return winners
}

export const SECTION_ORDER = ['Summary', 'Market', 'Competition', 'Gates']
