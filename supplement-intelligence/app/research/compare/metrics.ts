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
import type { ComparisonItem } from '@/app/api/research/compare/route'

export type Direction = 'higher' | 'lower' | 'bool_true' | 'verdict' | 'complexity' | 'fit_level' | 'trend'

export interface MetricDef {
  id:        string
  label:     string
  section:   string
  dir:       Direction
  getValue:  (item: ComparisonItem) => number | string | boolean | null
  format:    (v: number | string | boolean | null) => string
}

export const VERDICT_RANK: Record<string, number> = {
  PURSUE: 4, PURSUE_WITH_CAUTION: 3, INVESTIGATE_FURTHER: 2, DO_NOT_PURSUE: 1,
}
export const VERDICT_COLOR: Record<string, string> = {
  PURSUE:               'text-verdict-positive',
  PURSUE_WITH_CAUTION:  'text-verdict-caution-text',
  INVESTIGATE_FURTHER:  'text-black',
  DO_NOT_PURSUE:        'text-verdict-negative',
}
const COMPLEXITY_RANK: Record<string, number> = { low: 3, medium: 2, high: 1 }
const FIT_LEVEL_RANK:  Record<string, number> = { sufficient: 3, strong: 3, feasible: 3, partial: 2, tight: 2, stretched: 2, insufficient: 1, weak: 1, infeasible: 1 }

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
function fmtUsd(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  const num = Number(n)
  return isNaN(num) ? '—' : `$${num.toFixed(2)}`
}
function fmtStr(n: number | string | boolean | null): string {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'boolean') return n ? 'Yes' : 'No'
  return String(n).replace(/_/g, ' ')
}

export const METRICS: MetricDef[] = [
  // Summary
  { id: 'score',       label: 'Opportunity Score',      section: 'Summary',    dir: 'higher',     getValue: i => i.opportunity_score,    format: v => v === null ? '—' : `${v}/100` },
  { id: 'verdict',     label: 'Market Verdict',         section: 'Summary',    dir: 'verdict',    getValue: i => i.verdict_code,         format: fmtStr },
  { id: 'fit',         label: 'Founder Fit (1–5)',      section: 'Summary',    dir: 'higher',     getValue: i => i.fit_rank,             format: v => v === null ? '—' : `${v}/5` },
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
  // Quality gates
  { id: 'thresholds',  label: 'Thresholds Passed',      section: 'Gates',      dir: 'higher',     getValue: i => i.threshold_pass_count, format: v => `${v}/5` },
  { id: 'killsw',      label: 'Kill Switches Clear',    section: 'Gates',      dir: 'bool_true',  getValue: i => i.all_switches_clear,  format: v => v === null ? '—' : v ? 'All clear' : 'Flagged' },
  // Economics
  { id: 'complexity',  label: 'Launch Complexity',      section: 'Economics',  dir: 'complexity', getValue: i => i.launch_complexity,   format: fmtStr },
  { id: 'capital',     label: 'Min Capital Required',   section: 'Economics',  dir: 'lower',      getValue: i => i.min_capital_required, format: fmtK },
  { id: 'cogs',        label: 'Max COGS /unit',         section: 'Economics',  dir: 'higher',     getValue: i => i.breakeven_cogs,      format: fmtUsd },
  { id: 'year1',       label: 'Year 1 Revenue (base)',  section: 'Economics',  dir: 'higher',     getValue: i => i.year1_base,          format: fmtK },
  { id: 'margin',      label: 'Margin Viable (50% GM)', section: 'Economics',  dir: 'bool_true',  getValue: i => i.margin_viable,       format: v => v ? 'Yes' : 'No' },
  // Founder fit detail
  { id: 'capfit',      label: 'Capital Fit',            section: 'Founder Fit', dir: 'fit_level', getValue: i => i.capital_fit_level,   format: fmtStr },
  { id: 'tlfit',       label: 'Timeline Fit',           section: 'Founder Fit', dir: 'fit_level', getValue: i => i.timeline_fit_level,  format: fmtStr },
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
    case 'verdict':    return VERDICT_RANK[String(val)] ?? null
    case 'complexity': return COMPLEXITY_RANK[String(val)] ?? null
    case 'fit_level':  return FIT_LEVEL_RANK[String(val)] ?? null
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

export const SECTION_ORDER = ['Summary', 'Market', 'Competition', 'Gates', 'Economics', 'Founder Fit']
