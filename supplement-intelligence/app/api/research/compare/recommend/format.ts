// Formatting + table-building helpers for the compare/recommend prompt.
//
// Split out of route.ts (2026-07-18 audit) because Next.js route.ts files
// may only export the recognized route-handler symbols (GET/POST/etc. plus
// a small allowlist of route config consts like `maxDuration`) — exporting
// plain helper functions directly from route.ts fails Next's generated
// route-type check (`tsc --noEmit` error: "Property 'fmtN' is incompatible
// with index signature... Type '...' is not assignable to type 'never'").
// Colocating them here keeps them unit-testable without violating that
// constraint.
import type { ComparisonItem } from '../route'

export function fmtN(n: number | null, prefix = '', suffix = ''): string {
  if (n === null || n === undefined) return 'N/A'
  return `${prefix}${n.toLocaleString()}${suffix}`
}

// Fix (2026-07-18 audit, Finding 9): recommend/route.ts's fmtK was missing
// the >= 1_000_000 branch that app/research/compare/page.tsx's fmtK already
// has, so e.g. a $2.4M figure rendered as "$2400.0k" here. Matches
// page.tsx's correct logic exactly.
export function fmtK(n: number | null): string {
  if (n === null || n === undefined) return 'N/A'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toFixed(0)}`
}

// Fix (2026-07-18 audit, Finding 1 — Critical): review_concentration (and
// data_confidence) are real 0–1 ratios (confirmed by
// lib/stage25/launch-threshold.ts's `Math.round(concentration * 100)` and by
// app/research/compare/page.tsx's own, correct formatter for the same
// field). The old code path formatted this fraction with fmtN's plain
// `%` suffix and never multiplied by 100, so an 85% concentration reached
// the model as the string "0.85%" — two orders of magnitude off, and the
// prompt explicitly forbids the model from questioning or recalculating any
// value, so it had no way to catch the error.
export function fmtRatioPct(n: number | null): string {
  if (n === null || n === undefined) return 'N/A'
  return `${Math.round(n * 100)}%`
}

// Fix (2026-07-18 audit, Finding 4): signal_created_at was fetched by
// route.ts but never surfaced to the model, so cross-thesis comparisons
// couldn't be caveated for wildly different data ages.
export function fmtDataAge(isoDate: string): string {
  const then = new Date(isoDate).getTime()
  if (isNaN(then)) return 'N/A'
  const days = Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
  return `${days}d`
}

export function buildComparisonTable(items: ComparisonItem[]): string {
  const cols = items.map(i => `"${i.product_angle.slice(0, 40)}"`).join(' | ')
  const rows: string[] = [
    `Metric                    | ${cols}`,
    `---                       | ${items.map(() => '---').join(' | ')}`,
    `Opportunity Score (0-100) | ${items.map(i => i.opportunity_score ?? 'N/A').join(' | ')}`,
    `Market Verdict            | ${items.map(i => i.verdict_code ?? 'N/A').join(' | ')}`,
    `Founder Fit (1-5)         | ${items.map(i => i.fit_rank ?? 'N/A').join(' | ')}`,
    // Fix (2026-07-18 audit, Finding 5): data_confidence was fetched by
    // route.ts but discarded before the AI ever saw it.
    `Data Confidence           | ${items.map(i => fmtRatioPct(i.data_confidence)).join(' | ')}`,
    `Data Age                  | ${items.map(i => fmtDataAge(i.signal_created_at)).join(' | ')}`,
    `Market Revenue/mo         | ${items.map(i => fmtK(i.market_revenue_mo)).join(' | ')}`,
    `Median Price              | ${items.map(i => fmtN(i.median_price, '$')).join(' | ')}`,
    `Competitors               | ${items.map(i => fmtN(i.competitor_count)).join(' | ')}`,
    `Review Concentration      | ${items.map(i => fmtRatioPct(i.review_concentration)).join(' | ')}`,
    `90-day Momentum           | ${items.map(i => fmtN(i.momentum_90d_pct, '', '%')).join(' | ')}`,
    `Trend Direction           | ${items.map(i => i.trend_direction ?? 'N/A').join(' | ')}`,
    `TikTok Views              | ${items.map(i => fmtN(i.tiktok_view_count)).join(' | ')}`,
    `Thresholds Passed (0-5)   | ${items.map(i => i.threshold_pass_count).join(' | ')}`,
    `Kill Switches Clear       | ${items.map(i => i.all_switches_clear === null ? 'N/A' : i.all_switches_clear ? 'Yes' : `No (${i.triggered_switches.join(', ')})`).join(' | ')}`,
    `Launch Complexity         | ${items.map(i => i.launch_complexity).join(' | ')}`,
    `Min Capital Required      | ${items.map(i => fmtK(i.min_capital_required)).join(' | ')}`,
    // Fix (2026-07-18 audit, Finding 3): fee_data_source was never read or
    // passed through, so a breakeven_cogs figure built on a guessed 15%
    // referral / $4.50 FBA default was presented identically to a fully
    // measured one — false whenever fee_data_source === 'estimated'.
    `Breakeven COGS/unit       | ${items.map(i => `${fmtN(i.breakeven_cogs, '$')}${i.fee_data_source === 'estimated' ? ' (est.)' : ''}`).join(' | ')}`,
    `Year 1 Revenue (base)     | ${items.map(i => fmtK(i.year1_base)).join(' | ')}`,
    `Margin Viable             | ${items.map(i => i.margin_viable ? 'Yes' : 'No').join(' | ')}`,
    `Capital Fit               | ${items.map(i => i.capital_fit_level ?? 'N/A').join(' | ')}`,
    `Timeline Fit              | ${items.map(i => i.timeline_fit_level ?? 'N/A').join(' | ')}`,
  ]
  return rows.join('\n')
}
