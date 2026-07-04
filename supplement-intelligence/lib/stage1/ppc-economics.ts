// ── PPC Economics (Estimated) ─────────────────────────────────────────────
// Derived from DataForSEO Google CPC data + market price inputs.
// CPC values are Google Ads data, NOT Amazon Ads.
// Amazon PPC estimates are derived approximations — never real Amazon Ads data.

import type { KeywordIntelligence, KeywordMetric } from '../keyword-engine/types'

export type PpcRiskLevel = 'Low' | 'Medium' | 'High' | 'Extreme'

export interface PpcEconomics {
  // CPC inputs — real from DataForSEO, labeled as Google source
  google_cpc_p50:  number | null   // median Google CPC across buying-intent keywords
  // Derived Amazon PPC band — either from keyword engine estimate or Google × factor
  amazon_ppc_low:  number | null   // optimistic Amazon PPC per click
  amazon_ppc_high: number | null   // pessimistic Amazon PPC per click

  // Market inputs (real from Stage 1)
  price:                number
  net_revenue_per_unit: number     // price − (price × referralPct/100) − fbaFee

  // Economics estimates
  est_conversion_rate_pct: number  // supplement category: 6% (range 4–10%)
  est_acos_pct:            number | null  // CPC / (conv_rate × price) × 100
  est_tacos_pct_low:       number | null  // ACOS × 0.6 (50% organic dilution)
  est_tacos_pct_high:      number | null  // ACOS × 1.0 (all-paid launch day 1)
  est_cac:                 number | null  // amazon_ppc_high / conv_rate

  // Margin sanity check (before COGS — founder must subtract their actual COGS)
  headroom_after_ads: number | null  // net_revenue_per_unit − est_cac

  // Risk
  paid_viable:   boolean
  ppc_risk_level: PpcRiskLevel
  risk_reason:   string

  // Provenance
  data_quality: 'real_google_cpc' | 'estimated_only'
  keywords_with_cpc: number   // how many buying keywords had real CPC data
  assumptions: string[]
}

function p50(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number' && v > 0)
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 !== 0 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function computePpcEconomics(
  keywordIntel: KeywordIntelligence | null,
  price: number,
  fbaFee: number,
  referralPct: number,
): PpcEconomics | null {
  if (!price || price <= 0) return null

  const netRevPerUnit = round2(price * (1 - referralPct / 100) - fbaFee)

  // ── CPC extraction ────────────────────────────────────────────────────
  let googleCpcP50: number | null = null
  let amazonPpcLow: number | null = null
  let amazonPpcHigh: number | null = null
  let dataQuality: PpcEconomics['data_quality'] = 'estimated_only'
  let keywordsWithCpc = 0

  if (keywordIntel) {
    const buyingKeywords: KeywordMetric[] = [
      ...keywordIntel.top_buying,
      ...keywordIntel.opportunity,
    ]

    keywordsWithCpc = buyingKeywords.filter(k => k.cpc != null && k.cpc > 0).length
    googleCpcP50 = p50(buyingKeywords.map(k => k.cpc))

    if (googleCpcP50 !== null) dataQuality = 'real_google_cpc'

    // Prefer keyword engine's amazon_ppc_estimate when available; else derive
    const withAmazonEst = buyingKeywords.filter(k => k.amazon_ppc_estimate != null)
    if (withAmazonEst.length) {
      amazonPpcLow  = p50(withAmazonEst.map(k => k.amazon_ppc_estimate!.low))
      amazonPpcHigh = p50(withAmazonEst.map(k => k.amazon_ppc_estimate!.high))
    } else if (googleCpcP50 !== null) {
      // Amazon CPCs run 20–60% above Google for supplements
      amazonPpcLow  = round2(googleCpcP50 * 1.20)
      amazonPpcHigh = round2(googleCpcP50 * 1.60)
    }
  }

  // ── Economics estimation ──────────────────────────────────────────────
  const convRatePct = 6         // supplement category midpoint
  const convRate    = convRatePct / 100

  // ACOS = CPC / (conversion_rate × price) × 100
  const cpcForAcos = amazonPpcHigh ?? amazonPpcLow ?? null
  const estAcosPct = cpcForAcos !== null
    ? round2((cpcForAcos / (convRate * price)) * 100)
    : null

  // TACoS range: ACOS × paid_sales_fraction
  //   Low: 60% of sales paid (organic starts contributing after week 2)
  //   High: 100% paid (launch day 1, no organic yet)
  const estTacosLow  = estAcosPct !== null ? round2(estAcosPct * 0.60) : null
  const estTacosHigh = estAcosPct   // at 100% paid = same as ACOS

  // CAC (using high-end CPC for worst case)
  const estCac = amazonPpcHigh !== null ? round2(amazonPpcHigh / convRate) : null

  // Headroom after ads = net_revenue_per_unit − CAC (before COGS)
  const headroomAfterAds = estCac !== null ? round2(netRevPerUnit - estCac) : null

  // ── Risk assessment ───────────────────────────────────────────────────
  let ppcRiskLevel: PpcRiskLevel = 'Low'
  let riskReason = 'PPC economics within normal range'

  if (estAcosPct !== null) {
    if (estAcosPct > 60) {
      ppcRiskLevel = 'Extreme'
      riskReason = `Est. ACOS ~${estAcosPct}% — price point too low relative to CPC; paid launch structurally unprofitable`
    } else if (estAcosPct > 40) {
      ppcRiskLevel = 'High'
      riskReason = `Est. ACOS ~${estAcosPct}% — narrow margin after ads; needs strong organic velocity within 60 days`
    } else if (estAcosPct > 25) {
      ppcRiskLevel = 'Medium'
      riskReason = `Est. ACOS ~${estAcosPct}% — manageable at launch; plan to drive organic share to lower blended TACoS`
    } else {
      ppcRiskLevel = 'Low'
      riskReason = `Est. ACOS ~${estAcosPct}% — favorable; price point supports paid acquisition economics`
    }
  } else if (!keywordIntel) {
    ppcRiskLevel = 'High'
    riskReason = 'No CPC data available from DataForSEO — PPC economics unknown; treat as high risk at launch'
  }

  const paidViable = ppcRiskLevel === 'Low' || ppcRiskLevel === 'Medium'

  const assumptions: string[] = [
    `CPC source: DataForSEO Google Ads data — NOT Amazon Ads (no Amazon Ads provider in this codebase)`,
    dataQuality === 'real_google_cpc'
      ? `Google CPC p50: $${googleCpcP50} across ${keywordsWithCpc} buying-intent keywords`
      : 'No real CPC data available; Amazon PPC estimates are not computable',
    googleCpcP50 !== null
      ? (keywordIntel?.top_buying.some(k => k.amazon_ppc_estimate != null)
          ? 'Amazon PPC band from keyword engine derived estimate (Google CPC + competition density)'
          : 'Amazon PPC band derived as Google CPC × 1.2–1.6 (supplement category adjustment; not from Amazon Ads)')
      : 'Amazon PPC band unavailable — no CPC data',
    `Conversion rate: ${convRatePct}% (supplement category estimate; industry range 4–10%)`,
    'ACOS formula: CPC_high / (conv_rate × price) × 100 — uses pessimistic CPC for conservative estimate',
    'TACoS range: ACOS × 60–100% (60% = organic dilution after week 2; 100% = all-paid day 1)',
    'Headroom = price − FBA fee − referral fee − CAC (before COGS; founder must subtract their actual COGS)',
    'All estimates are approximations. Verify with real Amazon Ads data before launch.',
  ]

  return {
    google_cpc_p50:          googleCpcP50,
    amazon_ppc_low:          amazonPpcLow,
    amazon_ppc_high:         amazonPpcHigh,
    price,
    net_revenue_per_unit:    netRevPerUnit,
    est_conversion_rate_pct: convRatePct,
    est_acos_pct:            estAcosPct,
    est_tacos_pct_low:       estTacosLow,
    est_tacos_pct_high:      estTacosHigh,
    est_cac:                 estCac,
    headroom_after_ads:      headroomAfterAds,
    paid_viable:             paidViable,
    ppc_risk_level:          ppcRiskLevel,
    risk_reason:             riskReason,
    data_quality:            dataQuality,
    keywords_with_cpc:       keywordsWithCpc,
    assumptions,
  }
}
