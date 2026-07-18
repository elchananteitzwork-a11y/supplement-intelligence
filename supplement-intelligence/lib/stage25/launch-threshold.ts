import type { Stage1Evidence } from '../evidence/adapter'

// ── Minimum Viable Launch Thresholds ──────────────────────────────────────
// Deterministic rules that evaluate whether market data supports a viable
// launch for a given thesis. These run after thesis generation and before
// fit scoring. AI cannot override these thresholds.

export type ThresholdResult = 'pass' | 'warn' | 'fail'

export interface ThresholdCheck {
  result:  ThresholdResult
  metric:  string
  value:   string
  reason:  string
}

export interface LaunchThresholdAssessment {
  overall:    ThresholdResult
  checks:     ThresholdCheck[]
  pass_count: number
  warn_count: number
  fail_count: number
}

// Minimum market size: monthly revenue across top sellers must be detectable
function checkMarketSize(evidence: Stage1Evidence): ThresholdCheck {
  const rev = evidence.est_monthly_revenue?.value ?? 0
  if (rev >= 50_000) {
    return { result: 'pass', metric: 'Market Size', value: `$${Math.round(rev / 1000)}k/mo`, reason: 'Market revenue signal above minimum viable threshold' }
  }
  if (rev >= 15_000) {
    return { result: 'warn', metric: 'Market Size', value: `$${Math.round(rev / 1000)}k/mo`, reason: 'Revenue signal present but below $50k/mo — small market or thin data' }
  }
  return { result: 'fail', metric: 'Market Size', value: rev > 0 ? `$${Math.round(rev / 1000)}k/mo` : 'no data', reason: 'Insufficient market revenue signal — market may be too niche or data too thin' }
}

// Price floor: must be $15+ to achieve 50% GM after FBA fees
//
// Honesty fix (2026-07-18 audit — same "hard blocker must never fire on an
// invented fee assumption" fix already applied to KS3's
// checkEconomicsStructurallyBroken in lib/stage3/kill-switches.ts): this
// check can return 'fail', and assessLaunchThresholds/determineMarketVerdict
// (lib/stage4/verdict.ts, thresholdsBlock) treats 2+ fails as a real
// contributor to DO_NOT_PURSUE. It must never pass OR fail on a guessed
// referral%/FBA-fee default. When real Keepa fee data isn't available for
// this query, report insufficient data instead of silently substituting
// 15%/$0 (the prior, discredited default).
function checkPriceFloor(evidence: Stage1Evidence): ThresholdCheck {
  const price = evidence.median_price?.value ?? 0

  if (price === 0) {
    return { result: 'warn', metric: 'Price Floor', value: 'no data', reason: 'No price data available — cannot validate margin floor' }
  }

  const fba = evidence.avg_fba_fee?.value
  const ref = evidence.avg_referral_fee_pct?.value

  if (typeof fba !== 'number' || typeof ref !== 'number') {
    return {
      result: 'warn',
      metric: 'Price Floor',
      value:  `$${price.toFixed(0)}`,
      reason: 'Real Amazon referral fee / FBA fee data unavailable for this query — margin floor not evaluated (never estimated from a default)',
    }
  }

  const netRevenue = price * (1 - ref / 100) - fba
  const impliedGM  = price > 0 ? netRevenue / price : 0

  if (impliedGM >= 0.45) {
    return { result: 'pass', metric: 'Price Floor', value: `$${price.toFixed(0)}`, reason: `Net revenue after fees ~${Math.round(impliedGM * 100)}% of price — margin headroom confirmed` }
  }
  if (impliedGM >= 0.30) {
    return { result: 'warn', metric: 'Price Floor', value: `$${price.toFixed(0)}`, reason: `Net revenue after fees ~${Math.round(impliedGM * 100)}% of price — COGS budget is tight` }
  }
  return { result: 'fail', metric: 'Price Floor', value: `$${price.toFixed(0)}`, reason: `Net revenue after fees only ~${Math.round(impliedGM * 100)}% of price — insufficient COGS budget for viable margin` }
}

// Competition density: some competition validates the market; too much signals lock-out
function checkCompetitionDensity(evidence: Stage1Evidence): ThresholdCheck {
  const count = evidence.competitor_count?.value ?? 0
  const concentration = evidence.review_concentration?.value ?? 0

  if (count < 5) {
    return { result: 'warn', metric: 'Competition Density', value: `${count} competitors`, reason: 'Fewer than 5 meaningful competitors — market may be nascent or niche' }
  }
  if (concentration > 0.85 && count >= 5) {
    return { result: 'warn', metric: 'Competition Density', value: `${count} competitors, ${Math.round(concentration * 100)}% top-3 concentration`, reason: 'High review concentration — market dominated by 1-3 entrenched brands' }
  }
  if (count >= 10) {
    return { result: 'pass', metric: 'Competition Density', value: `${count} competitors`, reason: 'Healthy competition confirms real market; concentration not extreme' }
  }
  return { result: 'pass', metric: 'Competition Density', value: `${count} competitors`, reason: 'Sufficient competition to validate market demand' }
}

// Growth signal: flat or declining markets require differentiation rationale
function checkGrowthTrend(evidence: Stage1Evidence): ThresholdCheck {
  const momentum = evidence.momentum_90d_pct?.value
  const yoy      = evidence.yoy_change?.value

  if (momentum === undefined && !yoy) {
    return { result: 'warn', metric: 'Growth Trend', value: 'no data', reason: 'No growth signal available — trend unknown' }
  }

  if (momentum !== undefined) {
    if (momentum >= 5) {
      return { result: 'pass', metric: 'Growth Trend', value: `+${momentum}% (90d)`, reason: 'Positive 90-day momentum — category growing' }
    }
    if (momentum >= -10) {
      return { result: 'warn', metric: 'Growth Trend', value: `${momentum}% (90d)`, reason: 'Flat or mildly declining 90d momentum — stable but not growing' }
    }
    return { result: 'fail', metric: 'Growth Trend', value: `${momentum}% (90d)`, reason: 'Declining 90-day momentum — category contracting; requires strong differentiation rationale' }
  }

  // Fall back to YoY string
  const increasing = yoy?.includes('+') || yoy?.toLowerCase().includes('acceler')
  const decreasing = yoy?.includes('-') || yoy?.toLowerCase().includes('deceler')
  if (increasing) return { result: 'pass',  metric: 'Growth Trend', value: yoy!, reason: 'YoY growth trend positive' }
  if (decreasing) return { result: 'warn',  metric: 'Growth Trend', value: yoy!, reason: 'YoY growth declining — market contraction signal' }
  return { result: 'pass', metric: 'Growth Trend', value: yoy ?? 'Stable', reason: 'Stable YoY trend' }
}

// Price compression: early warning for Kill Switch #4
function checkPriceCompression(evidence: Stage1Evidence): ThresholdCheck {
  const compression = evidence.price_compression_pct?.value

  if (compression === undefined) {
    return { result: 'warn', metric: 'Price Compression', value: 'no data', reason: 'No price compression data — cannot assess commoditization risk' }
  }
  if (compression > -5) {
    return { result: 'pass', metric: 'Price Compression', value: `${compression}%`, reason: 'Prices stable — low commoditization risk (12-month proxy)' }
  }
  if (compression > -15) {
    return { result: 'warn', metric: 'Price Compression', value: `${compression}%`, reason: `Prices fell ${Math.abs(compression)}% vs. 12 months ago — moderate compression signal` }
  }
  return { result: 'fail', metric: 'Price Compression', value: `${compression}%`, reason: `Prices fell ${Math.abs(compression)}% vs. 12 months ago — severe compression; Kill Switch #4 risk` }
}

export function assessLaunchThresholds(evidence: Stage1Evidence): LaunchThresholdAssessment {
  const checks = [
    checkMarketSize(evidence),
    checkPriceFloor(evidence),
    checkCompetitionDensity(evidence),
    checkGrowthTrend(evidence),
    checkPriceCompression(evidence),
  ]

  const pass_count = checks.filter(c => c.result === 'pass').length
  const warn_count = checks.filter(c => c.result === 'warn').length
  const fail_count = checks.filter(c => c.result === 'fail').length

  const overall: ThresholdResult =
    fail_count >= 2 ? 'fail'
    : fail_count === 1 || warn_count >= 3 ? 'warn'
    : 'pass'

  return { overall, checks, pass_count, warn_count, fail_count }
}
