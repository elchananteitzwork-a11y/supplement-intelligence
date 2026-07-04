import type { MemoData, BuildDecision } from '@/types/index'
import { checkKeywordIntent, checkKeywordProductSignals, checkKeywordSemanticRelevance } from '@/lib/keyword-engine/relevance-guard'

// ── Grounded Opportunity Score — Decision Engine v2 (2026-06-28) ───────────
//
// PERMANENT ENGINEERING RULE (2026-06-26, unchanged): every numerical
// metric, score, probability, or confidence value must come from verified
// external data or a deterministic formula. AI may explain, summarize, and
// describe — it may never assign a number to anything.
//
// This is the frozen redesign approved across five architecture-review
// rounds: seven composites (Demand, Market Accessibility, Profitability,
// Customer Pain, Virality, Subscription, Manufacturing Feasibility), a
// Market-Accessibility gate, a Safety Gate, Evidence Breadth, Channel
// Concentration, and a Category-Creation-Candidate decision path. See the
// architecture-review conversation for the full reasoning behind every
// formula below — this file implements that design exactly, without
// reinterpretation.

export type ScoreSource = 'verified' | 'synthesized'

export interface ScoreDimension {
  key:         string
  label:       string
  weight:      number              // normalized 0-1; 0 for dimensions excluded from the score entirely
  rawScore?:   number              // 0-10 — present ONLY when backed by real data or a real-data formula
  qualitativeLevel?: 'High' | 'Medium' | 'Low'   // present instead of rawScore when no real basis exists — AI judgment, shown, never scored
  source:      ScoreSource
  sourceLabel: string              // human-readable: which provider(s), or why this is AI judgment with no real basis
}

// ── Evidence Breadth / Channel Concentration ───────────────────────────────

export type ChannelType =
  | 'amazon_marketplace'
  | 'search_seo'
  | 'social_community'
  | 'manufacturing_supply'
  | 'regulatory_safety'

export interface ChannelBreakdownEntry {
  channel:     ChannelType
  label:       string
  contributed: boolean
  providers:   string[]   // which of this channel's real providers actually contributed
}

export interface EvidenceBreadth {
  contributingProviders:       string[]
  totalScoreEligibleProviders: number
  pct:                         number   // 0-100
  channelBreakdown:            ChannelBreakdownEntry[]
  distinctChannelTypes:        number
  crossChannelCorroborated:    boolean  // distinctChannelTypes >= 2 — caps the confidence tier at "Moderate" when false
}

// Stamped onto every memo/analyses-row/leaderboard-row at generation time
// (same pattern as lib/thesis-engine/types.ts THESIS_ENGINE_VERSION) so a
// score can always be traced to the exact formula that produced it. This
// composite architecture (Demand/Market Accessibility/Profitability/
// Customer Pain/Virality/Subscription/Manufacturing Feasibility + gates) is
// "2.0.0" — bump this string any time BASE_WEIGHTS or a composite formula
// changes, so old and new scores are never silently compared as if
// equivalent (see app/api/generate/route.ts leaderboard upsert and
// app/leaderboard/page.tsx for the two places this is checked).
// 2.1.0 (2026-07-01): Consumer Pain + Subscription confidence dampening now
// gated at < 50 reviews (THIN_SAMPLE_THRESHOLD); above threshold, raw score
// is used without dampening. Demand Breadth Boost (+0 to +2) added for
// keyword portfolio coverage. Leaderboard seed data removed via migration 011.
//
// 2.2.0 (2026-07-04): Three calibration fixes — goal is accuracy, not higher scores.
// (1) Logarithmic demand scale replaces step-function: 10k→5.0 (was 7), 50k→7.7
//     (was 9), 200k+→10.0 (was 9 cap). Continuous — no artificial score cliffs.
// (2) Customer Opportunity replaces Customer Pain: pain component (richness×0.6 +
//     severity×0.4) blended 60% with opportunity component (structural gaps +
//     solution naming) 40%. prerequisiteFeatureRequests moved from pain richness
//     to opportunity: solution-naming is not complaint density. categoryGapThemes
//     contribute to pain via density (normalized) and to opportunity via existence
//     (not normalized) — genuinely different measurements of different properties.
// (3) COGS at generation time: manufacturing_estimate fetched eagerly alongside
//     signal/keyword calls; realistic_unit_cost unlocks the 45%-weight COGS Margin
//     sub-signal in Profitability when real Alibaba data is available.
// Legacy memo scores from v2.1.0 will differ by ±2–4 points — same evidence,
// more accurate decomposition. SCORING_ENGINE_VERSION guards comparisons.
export const SCORING_ENGINE_VERSION = '2.2.0'

export interface GroundedScore {
  score:       number   // 0-100
  decision:    BuildDecision
  dimensions:  ScoreDimension[]
  groundedPct: number   // 0 or 100 — see header comment; 0 only when insufficientEvidence
  insufficientEvidence: boolean
  evidenceBreadth: EvidenceBreadth
  // Present only when decision === 'CATEGORY_CREATION_CANDIDATE' — which
  // broader query the score below was actually computed from.
  categoryCreationContext?: { broadQuery: string }
}

const BASE_WEIGHTS = {
  demand:              22,
  marketAccessibility: 18,
  profitability:        20,
  consumerPain:         18,
  virality:             10,
  subscription:          7,
  manufacturing:         5,
} // sums to 100 — only the subset with weight > 0 on a given memo is ever used

// ── Provider → Channel registry ─────────────────────────────────────────────
// The single canonical map: every provider that can EVER feed a composite or
// a gate is listed here exactly once, against the channel type it belongs
// to. Evidence Breadth's denominator is Object.keys(...).length, not a
// hardcoded constant — it grows automatically if a new provider is ever
// registered here.

const CHANNEL_LABELS: Record<ChannelType, string> = {
  amazon_marketplace:   'Amazon Marketplace',
  search_seo:           'Search / SEO',
  social_community:     'Social / Community',
  manufacturing_supply: 'Manufacturing / Supply',
  regulatory_safety:    'Regulatory / Safety',
}

const PROVIDER_CHANNEL: Record<string, ChannelType> = {
  keepa:                  'amazon_marketplace',
  'apify-amazon-search':  'amazon_marketplace',
  'apify-amazon-reviews': 'amazon_marketplace',
  dataforseo:             'search_seo',
  'google-trends':        'search_seo',
  tiktok:                 'social_community',
  reddit:                 'social_community',
  'apify-alibaba':        'manufacturing_supply',
  openfda:                'regulatory_safety',
}
// HARDENING FIX (2026-06-28): kept in PROVIDER_CHANNEL above (so a future
// contribution is still correctly classified if reddit is ever enabled),
// but excluded from the denominator below — reddit has zero credentials
// configured anywhere in this codebase (lib/signal-engine/providers/
// reddit.ts: `enabled = !!(REDDIT_CLIENT_ID && REDDIT_CLIENT_SECRET)`,
// neither set). Counting a provider that can never contribute made the
// breadth percentage's own ceiling mathematically unreachable (max 8/9 ever
// achievable), which is misleading for a metric whose whole purpose is
// disclosure. Update this set if reddit credentials are ever added.
const STRUCTURALLY_DISABLED_PROVIDERS = new Set(['reddit'])
const TOTAL_SCORE_ELIGIBLE_PROVIDERS = Object.keys(PROVIDER_CHANNEL).length - STRUCTURALLY_DISABLED_PROVIDERS.size

// Fixed, structural, never query-specific — describes what a channel type
// can and cannot see by platform design, not a measurement of this result.
// Never varies, so it can never misrepresent real data — it asserts nothing
// about THIS query, only about the channel's own structural blind spots.
export const CHANNEL_COVERAGE_NOTES: Record<ChannelType, string> = {
  amazon_marketplace:   'Reflects Amazon US marketplace behavior only — retail, wholesale, and international-marketplace dynamics are not visible here.',
  search_seo:           'Reflects Google search behavior — demand that bypasses search entirely (e.g. word-of-mouth, retail discovery) is not visible here.',
  social_community:     "Reflects TikTok and Reddit's own audience composition by platform design (skews younger, US, English-speaking) — absence of signal here is not evidence of absence of demand in other demographics or channels.",
  manufacturing_supply: 'Reflects suppliers indexed by this specific scraper — sourcing regions or supplier networks outside it are not visible here.',
  regulatory_safety:    'Reflects only FDA recall and adverse-event data — does not cover non-US regulators or unreported incidents.',
}

function hasRealRecallOrAdverseEvent(m: MemoData): boolean {
  return !!m.news_intelligence?.items?.some(i => i.provider === 'openfda')
}

// Real, deterministic check per provider — "did this provider actually
// return data that reached a composite or a gate for this exact query."
// Never a guess: each line checks a real field's presence, nothing else.
function detectContributingProviders(m: MemoData): string[] {
  const se = m.signal_evidence
  const found = new Set<string>()

  const dims = [se?.demand, se?.growth, se?.pricing, se?.revenue, se?.seasonality]
  for (const dim of dims) {
    if (!dim) continue
    for (const src of dim.sources) {
      if (src === 'keepa' || src === 'google-trends' || src === 'reddit') found.add(src)
    }
  }
  if (se?.competition) found.add('keepa') // Keepa's own competition/saturation signal
  if (se?.review_velocity) {
    for (const src of se.review_velocity.sources) {
      if (src === 'apify-amazon-search' || src === 'reddit') found.add(src)
    }
  }
  if (se?.virality) {
    for (const src of se.virality.sources) {
      if (src === 'tiktok' || src === 'reddit') found.add(src)
    }
  }
  if (m.keyword_intelligence?.top_buying?.length || m.keyword_intelligence?.opportunity?.length) {
    found.add('dataforseo')
  }
  if (m.consumer_intelligence) found.add('apify-amazon-reviews')
  if (hasRealRecallOrAdverseEvent(m)) found.add('openfda')
  if (m.manufacturing_estimate) found.add('apify-alibaba')

  return Array.from(found)
}

function computeEvidenceBreadth(m: MemoData): EvidenceBreadth {
  const contributing = detectContributingProviders(m)
  const byChannel = new Map<ChannelType, string[]>()
  for (const [provider, channel] of Object.entries(PROVIDER_CHANNEL)) {
    if (contributing.includes(provider)) {
      byChannel.set(channel, [...(byChannel.get(channel) ?? []), provider])
    }
  }
  const channelBreakdown: ChannelBreakdownEntry[] = (Object.keys(CHANNEL_LABELS) as ChannelType[]).map(channel => ({
    channel,
    label:       CHANNEL_LABELS[channel],
    contributed: byChannel.has(channel),
    providers:   byChannel.get(channel) ?? [],
  }))
  const distinctChannelTypes = channelBreakdown.filter(c => c.contributed).length

  return {
    contributingProviders:       contributing,
    totalScoreEligibleProviders: TOTAL_SCORE_ELIGIBLE_PROVIDERS,
    pct:                         Math.round((contributing.length / TOTAL_SCORE_ELIGIBLE_PROVIDERS) * 100),
    channelBreakdown,
    distinctChannelTypes,
    crossChannelCorroborated:    distinctChannelTypes >= 2,
  }
}

// ── Demand ───────────────────────────────────────────────────────────────────
// DataForSEO's real absolute search volume is the most authoritative number
// available anywhere in this codebase for "how much does this market want
// this" — used as the primary signal when present, ahead of Keepa's BSR
// proxy. Keepa/Google-Trends convergence is already handled upstream by
// signal-engine's own aggregation (AggregatedDimension.sources lists every
// real provider that contributed to the blended score) — nothing to add
// here, the blend already happened before this file ever sees the value.

function searchVolumeToScore(volume: number): number {
  if (volume <= 0) return 0
  // Logarithmic scale: 500→0, 10k→5.0, 50k→7.7, 200k+→10.0.
  // Replaces the v2.1.0 step-function (≥50k→9, ≥10k→7, ≥2k→5, ≥500→3).
  // Rationale: step-functions create arbitrary score cliffs (48k→7, 50k→9)
  // and cap at 9 regardless of demand size. Log scale produces continuous,
  // proportional scores and correctly reflects the real difference between
  // a 15k and a 150k search market. Thresholds: MIN=500 (meaningful floor),
  // MAX=200k (score 10 ceiling — large markets like protein powder, melatonin).
  const MIN_VOLUME = 500
  const MAX_VOLUME = 200_000
  const raw = (Math.log10(volume) - Math.log10(MIN_VOLUME))
            / (Math.log10(MAX_VOLUME) - Math.log10(MIN_VOLUME)) * 10
  return Math.max(0, Math.min(10, Math.round(raw * 10) / 10))
}

// ── Demand Breadth Boost ──────────────────────────────────────────────────────
// Lightweight portfolio-breadth signal layered on top of the top-keyword base
// score. Does NOT replace the base score — it adds at most +2 points when the
// keyword portfolio demonstrates real breadth. Modular: set to false to disable
// without touching any other logic, and replace with a full portfolio-volume
// model once real DataForSEO distribution data is available for calibration.
//
// Thresholds (judgment-call, to be calibrated against real DataForSEO output):
//   +1 if ≥ 3 keywords have ≥ 2,000 monthly searches (substantial secondary terms)
//   +1 if ≥ 5 keywords have ≥ 500 monthly searches (broad long-tail coverage)
// Maximum boost: +2, caps at 10.

const DEMAND_BREADTH_BOOST_ENABLED = true

function computeDemandBreadthBoost(keywords: { monthly_searches?: number | null }[]): number {
  if (!DEMAND_BREADTH_BOOST_ENABLED || keywords.length <= 1) return 0
  const secondary = keywords.slice(1)   // exclude the top keyword (already scored)
  const tier1 = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 2_000).length
  const tier2 = secondary.filter(kw => (kw.monthly_searches ?? 0) >= 500).length
  return Math.min(2, (tier1 >= 3 ? 1 : 0) + (tier2 >= 5 ? 1 : 0))
}

interface RealResult { rawScore: number | null; sourceLabel: string }

export function computeDemand(m: MemoData): RealResult {
  const allKeywords = m.keyword_intelligence?.top_buying ?? []
  const se = m.signal_evidence

  // Two-stage keyword filter:
  //   Stage 1 — navigational intent (e.g. "breakfast near me"): clearly not a
  //     product purchase query regardless of volume.
  //   Stage 2 — semantic product relevance: when m.product_query is present
  //     (stored at generation time, v2.2.0+) we use the full anchor-word check
  //     (checkKeywordSemanticRelevance) — the same filter applied during keyword
  //     fetching. Legacy memos without product_query fall back to the signal-only
  //     check (checkKeywordProductSignals), which is less precise but never wrong.
  const withVolume = allKeywords.filter(kw => kw.monthly_searches)
  const navSkipped = withVolume.filter(kw => checkKeywordIntent(kw.keyword).navigational)
  const afterNav   = withVolume.filter(kw => !checkKeywordIntent(kw.keyword).navigational)

  const isSemanticValid = (keyword: string): boolean =>
    m.product_query
      ? checkKeywordSemanticRelevance(m.product_query, keyword).allowed
      : checkKeywordProductSignals(keyword).valid

  const semSkipped    = afterNav.filter(kw => !isSemanticValid(kw.keyword))
  const validKeywords = afterNav.filter(kw =>  isSemanticValid(kw.keyword))
  const topKeyword = validKeywords[0] ?? null

  if (topKeyword?.monthly_searches) {
    let score = searchVolumeToScore(topKeyword.monthly_searches)
    if (typeof topKeyword.growth_pct === 'number' && topKeyword.growth_pct > 20) score = Math.min(10, score + 1)
    if (typeof topKeyword.growth_pct === 'number' && topKeyword.growth_pct < -20) score = Math.max(0, score - 1)
    const breadthBoost = computeDemandBreadthBoost(validKeywords)
    score = Math.min(10, score + breadthBoost)
    const sourceNote = breadthBoost > 0 ? ` (+${breadthBoost} breadth boost, ${validKeywords.length} valid keywords)` : ''
    const navNote = navSkipped.length > 0
      ? ` · nav-rejected ${navSkipped.map(k => `"${k.keyword}"`).join('; ')}`
      : ''
    const semNote = semSkipped.length > 0
      ? ` · sem-rejected ${semSkipped.map(k => `"${k.keyword}"`).join('; ')}`
      : ''
    return { rawScore: score, sourceLabel: `dataforseo${sourceNote}${navNote}${semNote}` }
  }
  if (se?.demand) {
    const sub = se.demand.value.primary_signal
    return { rawScore: se.demand.value.score, sourceLabel: sub ? `${se.demand.primarySource} (${sub})` : se.demand.primarySource }
  }
  if (se?.growth) return { rawScore: se.growth.value.score, sourceLabel: se.growth.primarySource }
  return { rawScore: null, sourceLabel: '' }
}

// ── Market Accessibility — blend of 3 real sub-signals + partial gate ─────
// Apify's review-concentration accessibility (45%) + Keepa's own
// offers-based saturation signal (30% — real, computed every request by
// keepa.ts, previously discarded entirely by this file) + DataForSEO's
// keyword_difficulty (25%, inverted to an ease score) — three independent
// real measurements of "how hard to enter," not one.

function difficultyToEaseScore(difficulty: number): number {
  return Math.max(0, Math.min(10, Math.round((100 - difficulty) / 10)))
}

interface GatedResult extends RealResult { gateTier: BuildDecision | null }

function computeMarketAccessibility(m: MemoData): GatedResult {
  const se = m.signal_evidence
  const subSignals: { score: number; weight: number; source: string }[] = []

  if (se?.review_velocity) {
    subSignals.push({ score: se.review_velocity.value.score, weight: 0.45, source: se.review_velocity.primarySource })
  }
  if (se?.competition) {
    subSignals.push({ score: se.competition.value.score, weight: 0.30, source: 'keepa' })
  }
  const topKeyword = m.keyword_intelligence?.top_buying?.[0]
  if (typeof topKeyword?.difficulty === 'number') {
    subSignals.push({ score: difficultyToEaseScore(topKeyword.difficulty), weight: 0.25, source: 'dataforseo' })
  }

  if (!subSignals.length) return { rawScore: null, sourceLabel: '', gateTier: null }

  const totalW = subSignals.reduce((s, x) => s + x.weight, 0)
  const blended = subSignals.reduce((s, x) => s + x.score * (x.weight / totalW), 0)
  const rawScore = Math.round(blended * 10) / 10
  const sourceLabel = Array.from(new Set(subSignals.map(s => s.source))).join(' + ')

  // Partial gate — caps the final DECISION, never the score itself, and
  // never an additional penalty on top of the blend above. A catastrophic
  // market (raw < 2) caps at SKIP; a severe-but-not-closed one (< 3.5) caps
  // at VALIDATE_FURTHER. Thresholds are a disclosed judgment call over real
  // arithmetic, calibratable once real outcomes exist to check against.
  const gateTier: BuildDecision | null =
    rawScore < 2   ? 'SKIP' :
    rawScore < 3.5 ? 'VALIDATE_FURTHER' :
    null

  return { rawScore, sourceLabel, gateTier }
}

// ── Profitability — pure margin/ratio composite, decorrelated from Demand ─
// Revenue Magnitude deliberately excluded: it was mechanically the same
// Keepa sales-velocity data already driving Demand, just transformed
// differently — measuring it twice under two composite names is the hidden
// correlation the architecture review found and removed. Every sub-signal
// below is a RATIO, never a magnitude, and avgPrice plays only a
// normalizing/denominator role, never a magnitude signal, so nothing here
// double-counts Demand.
//
// Realistic, not incumbent, economics: price uses the 25th percentile of
// REAL observed competitor prices (a real price point at least one actual
// seller already charges), not the category average. COGS uses the
// low-MOQ-tier-filtered realistic_unit_cost (see manufacturing-engine),
// not the at-scale aggregate — both correct the incumbent-economics bias
// the architecture review identified.

function p25(nums: number[]): number | null {
  if (!nums.length) return null
  const sorted = [...nums].sort((a, b) => a - b)
  // For arrays < 4 elements, floor(n * 0.25) always returns index 0 (the min),
  // not a true 25th percentile. Use linear interpolation for small arrays.
  if (sorted.length < 4) return sorted[0]
  const pos = sorted.length * 0.25
  const lo  = Math.floor(pos)
  const frac = pos - lo
  return frac === 0 ? sorted[lo] : sorted[lo] + frac * (sorted[lo + 1] - sorted[lo])
}

function realisticPrice(m: MemoData): number | null {
  // Prefer the category average price from the Keepa pricing signal — already
  // aggregated over relevant bestsellers and stored as e.g. "$46". The
  // competitor list can include deeply-discounted entry-level products that
  // pull p25 to the cheapest outlier tier, systematically zeroing the
  // profitability score for any healthy supplement category.
  const pricingAvg = parseDollarString(m.signal_evidence?.pricing?.value.avg_price)
  if (pricingAvg !== null && pricingAvg > 0) return pricingAvg

  // Fallback: median (p50) of real competitor prices when no explicit pricing
  // signal exists. Median is less sensitive to cheap outliers than p25.
  const competitors = m.signal_evidence?.review_velocity?.value.top_competitors
  if (!competitors?.length) return null
  const prices = competitors.map(c => c.price).filter((p): p is number => typeof p === 'number' && p > 0)
  if (!prices.length) return null
  const sorted = [...prices].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function parseDollarString(s: string | undefined): number | null {
  if (!s) return null
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  return isNaN(n) ? null : n
}

// Denominator = 45%: the realistic ceiling where Amazon fees consume nearly
// half of revenue and the category is functionally unprofitable for a new
// entrant. The prior value of 30% mapped a completely normal supplement fee
// structure (referral ~15% + FBA ~12-17% = 27-32%) to a score of 0-1/10,
// making Fee Burden systematically report "terrible" for every normal product.
// 45% is the disclosed judgment-call threshold; calibrate against real
// outcomes data once available.
function feeBurdenToScore(feePctOfPrice: number): number {
  return Math.max(0, Math.min(10, Math.round((1 - feePctOfPrice / 45) * 10)))
}
function marginToScore(marginPct: number): number {
  return Math.max(0, Math.min(10, Math.round((marginPct / 50) * 10)))
}
function cacPressureToScore(cacToPriceRatio: number): number {
  return Math.max(0, Math.min(10, Math.round((1 - cacToPriceRatio / 0.20) * 10)))
}

function computeProfitability(m: MemoData): RealResult {
  const price = realisticPrice(m)
  if (price === null) return { rawScore: null, sourceLabel: '' }

  const se = m.signal_evidence
  const subSignals: { score: number; weight: number; source: string }[] = []

  // Fee Burden (30%) — real Amazon fee schedule, Keepa.
  const referralPct = se?.revenue?.value.avg_referral_fee_pct
  const fbaFee       = parseDollarString(se?.revenue?.value.avg_fba_pick_pack_fee)
  if (typeof referralPct === 'number' || fbaFee !== null) {
    const feePctOfPrice = (referralPct ?? 0) + ((fbaFee ?? 0) / price) * 100
    subSignals.push({ score: feeBurdenToScore(feePctOfPrice), weight: 0.30, source: 'keepa' })
  }

  // COGS Margin (45%) — real, realistic (low-MOQ-tier) COGS vs realistic
  // price. Dropped entirely, never backfilled from the at-scale aggregate,
  // when manufacturing data hasn't been fetched for this query (see header
  // comment on MemoData.manufacturing_estimate).
  const realisticCogs = m.manufacturing_estimate?.realistic_unit_cost
  if (realisticCogs) {
    const cogsMid   = (realisticCogs.low + realisticCogs.high) / 2
    const marginPct = ((price - cogsMid) / price) * 100
    subSignals.push({ score: marginToScore(marginPct), weight: 0.45, source: 'apify-alibaba' })
  }

  // CAC Pressure (25%) — DataForSEO CPC ÷ realistic price.
  // PROXY LIMITATION: CPC is cost-per-click, not true Customer Acquisition Cost.
  // Real CAC = CPC ÷ conversion_rate (typically 10-25% for supplements on Amazon),
  // so actual CAC is 4-10× CPC. This sub-signal correctly ranks products by
  // relative acquisition difficulty across categories but underestimates the
  // absolute cost. Calibrate the 20% denominator (cacPressureToScore) against
  // real CAC data when available.
  const cpc = m.keyword_intelligence?.top_buying?.[0]?.cpc
  const cacSourceNote = cpc != null ? ' (CPC proxy — see scoring.ts cacPressureToScore)' : ''
  if (typeof cpc === 'number' && cpc > 0) {
    subSignals.push({ score: cacPressureToScore(cpc / price), weight: 0.25, source: `dataforseo${cacSourceNote}` })
  }

  if (!subSignals.length) return { rawScore: null, sourceLabel: '' }

  const totalW = subSignals.reduce((s, x) => s + x.weight, 0)
  const blended = subSignals.reduce((s, x) => s + x.score * (x.weight / totalW), 0)
  const rawSources = Array.from(new Set(subSignals.map(s => s.source))).join(' + ')
  const cacNote = cpc != null ? ' · CAC Pressure uses CPC as proxy (actual CAC = CPC ÷ conversion rate, not measured)' : ''
  const sourceLabel = rawSources + cacNote

  return { rawScore: Math.round(blended * 10) / 10, sourceLabel }
}

// ── Customer Opportunity — pain component + opportunity component ──────────
//
// Replaces "Customer Pain / Unmet Need" (v2.1.0). Same underlying data;
// cleaner decomposition into two genuinely distinct measurements:
//
// PAIN COMPONENT (60%) — how much are customers suffering?
//   richness = density of complaint themes in the negative corpus (pool-normalized)
//   severity = negativePct from the helpful corpus (already a rate, unchanged)
//   NOTE: prerequisiteFeatureRequests deliberately EXCLUDED from effectiveThemeCount.
//   Solution-naming requests ("I wish it had X") are not complaint density signals —
//   they belong in the opportunity component, not the pain richness formula.
//
// OPPORTUNITY COMPONENT (40%) — how specifically are customers pointing at
// what to build?
//   structuralGaps  = categoryGapThemes.length × 1.5  (cross-competitor, unfixed
//                     engineering targets — existence count, NOT pool-normalized.
//                     Pain richness uses density; opportunity uses existence.
//                     These measure genuinely different properties of the same data.)
//   solutionNaming  = (prerequisiteFeatureRequests + enhancementFeatureRequests) × 0.8
//                     (explicit customer requests from both corpora — moved here
//                     from effectiveThemeCount because naming a solution is an
//                     opportunity signal, not a complaint density signal)
//   Output: categorical 0/2/4/6/8/10 — avoids precision artifacts on sparse data.
//
// LEGACY BACKWARD COMPATIBILITY:
//   No categoryGapThemes (pre-Step-3) → structuralGaps = 0
//   No prerequisiteFeatureRequests (pre-Step-4) → prereqCount falls back to
//   featureRequests.length (all-corpus mix). Score may differ ±2 from v2.1.0.
//
// CONFIDENCE DAMPENING POLICY (unchanged from 2026-07-01): applied only when
// the sample is genuinely thin (< THIN_SAMPLE_THRESHOLD reviews). Above the
// threshold, raw score is reported undampened — the signal is well-evidenced.

const THIN_SAMPLE_THRESHOLD = 50

function computeOpportunityComponent(ci: NonNullable<MemoData['consumer_intelligence']>): number {
  // Structural gaps: cross-competitor unfixed engineering targets.
  // Existence count (not density) — 3 structural gaps is 3 gaps whether
  // there are 10 or 200 negative reviews. Independent of pool size.
  const structuralGaps = (ci.categoryGapThemes?.length ?? 0) * 1.5

  // Solution naming: explicit requests from both corpora.
  // prerequisiteFeatureRequests = dissatisfied customers naming a solution they needed
  // enhancementFeatureRequests  = satisfied customers naming improvements they'd like
  // Legacy fallback: featureRequests (all-corpus mix) when Step 4 absent.
  const prereqCount  = ci.prerequisiteFeatureRequests?.length ?? ci.featureRequests.length
  const enhanceCount = ci.enhancementFeatureRequests?.length  ?? 0
  const solutionNaming = (prereqCount + enhanceCount) * 0.8

  const total = structuralGaps + solutionNaming
  if (total === 0)    return 0
  if (total < 1.5)   return 2
  if (total < 3)     return 4
  if (total < 5)     return 6
  if (total < 7.5)   return 8
  return 10
}

function consumerPainScore(m: MemoData): number | null {
  const ci = m.consumer_intelligence
  if (!ci) return null

  // Pain component — negative corpus only.
  // Step 3: weight category-gap themes 1.5× (structural, cross-competitor)
  // and product-specific themes 0.5× (one brand's execution failure).
  // prerequisiteFeatureRequests deliberately excluded — moved to opportunity
  // component. Legacy memos (pre-Step-3) fall back to negativeThemes.length.
  const effectiveThemeCount = (ci.categoryGapThemes && ci.productSpecificThemes)
    ? ci.categoryGapThemes.length * 1.5
      + ci.productSpecificThemes.length * 0.5
    : ci.negativeThemes.length

  // Calibrate density against the critical corpus (negativePoolSize), not the
  // full review pool. Falls back to totalReviewsCollected for pre-dual-corpus memos.
  const painPoolSize = ci.negativePoolSize > 0 ? ci.negativePoolSize : ci.totalReviewsCollected
  const density  = effectiveThemeCount / Math.log1p(painPoolSize)
  const richness = Math.min(10, density * (10 / 3))
  const severity = Math.min(10, (ci.sentimentBreakdown.negativePct / 30) * 10)
  const painComponent = richness * 0.6 + severity * 0.4

  // Opportunity component — structural gaps + solution naming.
  const opportunityComponent = computeOpportunityComponent(ci)

  // Weighted blend: pain 60%, opportunity 40%.
  const raw    = painComponent * 0.6 + opportunityComponent * 0.4
  const capped = Math.min(10, raw)
  return ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    ? Math.round(capped * ci.confidence)
    : Math.round(capped)
}

// KNOWN, DOCUMENTED LIMITATION (architecture review, 2026-06-28, updated
// 2026-07-04): the opportunity component measures how specifically customers
// name what they want — it cannot confirm that the named improvement is
// technically feasible or that a new entrant can actually build it. The
// pain component cannot distinguish suffering that a better product would
// fix from suffering that is structural to the category regardless of quality.
// See lib/provenance.ts consumerPainLimitationNote for disclosed text.

// ── Subscription / Retention Fit — real repurchase-language frequency ─────
// New deterministic signal over review text already collected by
// consumer-intelligence (lib/consumer-intelligence/analyze.ts
// REPURCHASE_CUES) — gives this dimension its first real-data path. Falls
// back to the existing AI-qualitative-only treatment when the sample is
// too thin to trust a rate computed from it.

const MIN_REVIEWS_FOR_REPURCHASE_SIGNAL = 15

function subscriptionScore(m: MemoData): number | null {
  const ci = m.consumer_intelligence
  const rl = ci?.repurchaseLanguage
  if (!ci || !rl || rl.outOf < MIN_REVIEWS_FOR_REPURCHASE_SIGNAL) return null
  const rate = rl.mentionedBy / rl.outOf
  const raw  = Math.max(0, Math.min(10, rate * 40))
  // Same THIN_SAMPLE_THRESHOLD policy as consumerPainScore: apply confidence
  // dampening only for thin samples; above the threshold the repurchase rate
  // is well-evidenced and should be reported undampened.
  return rl.outOf < THIN_SAMPLE_THRESHOLD
    ? Math.round(raw * ci.confidence)
    : Math.round(raw)
}

// ── Manufacturing Feasibility ─────────────────────────────────────────────
// customizable% / country-concentration / lead time — deliberately excludes
// unit_cost, which lives in Profitability, so no field is counted twice.
// manufacturing_estimate is fetched eagerly at generation time alongside the
// signal fetch (see app/api/generate/route.ts, 12s timeout in parallel with
// signalPromise). Returns null when Apify fails or returns no suppliers, in
// which case computeGroundedScore redistributes the weight to other dimensions.

function manufacturingFeasibilityScore(m: MemoData): RealResult {
  const est = m.manufacturing_estimate
  if (!est?.top_suppliers?.length) return { rawScore: null, sourceLabel: '' }

  const suppliers = est.top_suppliers
  const customizablePct = suppliers.filter(s => s.customizable).length / suppliers.length
  const customizableScore = Math.round(customizablePct * 10)

  const countries = new Set(suppliers.map(s => s.country_code).filter(Boolean))
  // Real, deterministic: more distinct sourcing countries among the named
  // suppliers = lower supply-concentration risk.
  const concentrationScore = Math.max(1, Math.min(10, countries.size * 3))

  let leadTimeScore = 5
  if (est.lead_time_days) {
    const midDays = (est.lead_time_days.low + est.lead_time_days.high) / 2
    leadTimeScore = midDays <= 45 ? 9 : midDays <= 90 ? 6 : midDays <= 150 ? 3 : 1
  }

  const blended = customizableScore * 0.4 + concentrationScore * 0.3 + leadTimeScore * 0.3
  return { rawScore: Math.round(blended * 10) / 10, sourceLabel: 'apify-alibaba' }
}

// ── Safety Gate — deterministic decision override, never additive ─────────

function computeSafetyGateTier(m: MemoData): BuildDecision | null {
  // openFDA's check failing/timing out must never read the same as "checked,
  // clean" — that would give false reassurance exactly when the safety check
  // didn't actually run. See lib/news-engine/engine.ts failedProviders.
  //
  // Also treat completely absent news_intelligence the same way: if the entire
  // news pipeline never ran we cannot confirm the product is clean, so require
  // validation rather than implicitly granting a clean bill of health.
  if (!m.news_intelligence) return 'VALIDATE_FURTHER'
  if (m.news_intelligence.failedProviders?.includes('openfda')) return 'VALIDATE_FURTHER'

  const items = m.news_intelligence?.items ?? []
  const recalls = items.filter(i => i.provider === 'openfda' && i.recall_classification)
  const adverseEvents = items.filter(i => i.provider === 'openfda' && i.adverse_event_reactions?.length)

  const hasOpenClassI = recalls.some(i =>
    i.recall_classification === 'Class I' && i.recall_status !== 'Terminated' && i.recall_status !== 'Completed',
  )
  if (hasOpenClassI) return 'SKIP'

  const hasClassII = recalls.some(i => i.recall_classification === 'Class II')
  if (hasClassII || adverseEvents.length >= 2) return 'VALIDATE_FURTHER'

  return null
}

const DECISION_RANK: Record<BuildDecision, number> = {
  SKIP: 0,
  VALIDATE_FURTHER: 1,
  CATEGORY_CREATION_CANDIDATE: 1, // never auto-promoted to BUILD_NOW by a gate
  BUILD_NOW: 2,
}

function mostConservative(decisions: (BuildDecision | null)[]): BuildDecision {
  const real = decisions.filter((d): d is BuildDecision => d !== null)
  // Must NOT pass 'SKIP' as reduce's initial value — SKIP has rank 0 (lowest),
  // so it would always beat every element in the comparator and return SKIP
  // unconditionally, regardless of what the actual decisions say.
  if (!real.length) return 'SKIP'
  return real.reduce((a, b) => (DECISION_RANK[a] <= DECISION_RANK[b] ? a : b))
}

// ── Backward compat / qualitative fallback (unchanged from prior redesign) ─

function legacyScoreToLevel(score: number | undefined): 'High' | 'Medium' | 'Low' | undefined {
  if (typeof score !== 'number') return undefined
  return score >= 7 ? 'High' : score >= 4 ? 'Medium' : 'Low'
}

function qualitative(key: string, label: string, level: 'High' | 'Medium' | 'Low' | undefined, reason: string): ScoreDimension {
  return { key, label, weight: 0, qualitativeLevel: level, source: 'synthesized', sourceLabel: reason }
}

// ── Core composite assembly (shared by the specific-query and
// Category-Creation-Candidate broad-query paths) ───────────────────────────

function assembleDimensions(m: MemoData): { candidates: ScoreDimension[]; gateTiers: (BuildDecision | null)[] } {
  const candidates: ScoreDimension[] = []
  const gateTiers: (BuildDecision | null)[] = []

  const demand = computeDemand(m)
  if (demand.rawScore !== null) {
    candidates.push({ key: 'demand', label: 'Demand', weight: BASE_WEIGHTS.demand, rawScore: demand.rawScore, source: 'verified', sourceLabel: demand.sourceLabel })
  } else {
    candidates.push(qualitative('demand', 'Demand', m.scores.demand?.level ?? legacyScoreToLevel(m.scores.demand?.score), 'AI judgment — no real demand signal was available for this query'))
  }

  const marketAccess = computeMarketAccessibility(m)
  if (marketAccess.rawScore !== null) {
    candidates.push({ key: 'marketAccessibility', label: 'Market Accessibility', weight: BASE_WEIGHTS.marketAccessibility, rawScore: marketAccess.rawScore, source: 'verified', sourceLabel: marketAccess.sourceLabel })
    gateTiers.push(marketAccess.gateTier)
  } else {
    candidates.push(qualitative('marketAccessibility', 'Market Accessibility', m.market_saturation?.entry_difficulty as 'High' | 'Medium' | 'Low' | undefined, 'AI judgment from qualitative market read — no real competitor data was available'))
  }

  const profitability = computeProfitability(m)
  if (profitability.rawScore !== null) {
    candidates.push({ key: 'profitability', label: 'Profitability', weight: BASE_WEIGHTS.profitability, rawScore: profitability.rawScore, source: 'verified', sourceLabel: profitability.sourceLabel })
  } else {
    // Profitability is excluded (0 weight, redistributed) whenever all three
    // real sub-signals fail: no Keepa fee schedule, no realistic COGS from
    // Apify/manufacturing, no DataForSEO CPC. Show as qualitative so the gap
    // is visible in the UI rather than silently inflating other dimensions.
    candidates.push(qualitative('profitability', 'Profitability', undefined, 'Insufficient pricing data — no Keepa fee schedule, Apify unit cost, or DataForSEO CPC available for this query (20% weight excluded, redistributed to other dimensions)'))
  }

  const painScore = consumerPainScore(m)
  if (painScore !== null) {
    const ci = m.consumer_intelligence!
    const dampened = ci.totalReviewsCollected < THIN_SAMPLE_THRESHOLD
    // Label updated 2026-07-04 (v2.2.0): "Customer Opportunity" reflects the
    // new formula (pain component 60% + opportunity component 40%). Key kept
    // as 'consumerPain' for backward compat with UI and stored memo references.
    candidates.push({ key: 'consumerPain', label: 'Customer Opportunity', weight: BASE_WEIGHTS.consumerPain, rawScore: painScore, source: 'verified', sourceLabel: `Apify — ${ci.totalReviewsCollected} real competitor reviews (pain: negative corpus; opportunity: both corpora)${dampened ? ' · confidence-adjusted, thin sample' : ''}` })
  }

  if (m.signal_evidence?.virality) {
    const v = m.signal_evidence.virality
    candidates.push({ key: 'virality', label: 'Virality', weight: BASE_WEIGHTS.virality, rawScore: v.value.score, source: 'verified', sourceLabel: v.primarySource })
  } else {
    candidates.push(qualitative('virality', 'Virality', m.scores.virality?.level ?? legacyScoreToLevel(m.scores.virality?.score), 'AI judgment — no real social signal was available'))
  }

  const subscription = subscriptionScore(m)
  if (subscription !== null) {
    candidates.push({ key: 'subscription', label: 'Subscription / Retention Fit', weight: BASE_WEIGHTS.subscription, rawScore: subscription, source: 'verified', sourceLabel: `Apify — repurchase-language frequency across ${m.consumer_intelligence!.repurchaseLanguage.outOf} real reviews` })
  } else {
    candidates.push(qualitative('subscription', 'Subscription / Retention Fit', m.scores.subscription?.level ?? legacyScoreToLevel(m.scores.subscription?.score), 'AI judgment — review sample too thin for a real repurchase-language rate'))
  }

  const manufacturing = manufacturingFeasibilityScore(m)
  if (manufacturing.rawScore !== null) {
    candidates.push({ key: 'manufacturing', label: 'Manufacturing Feasibility', weight: BASE_WEIGHTS.manufacturing, rawScore: manufacturing.rawScore, source: 'verified', sourceLabel: manufacturing.sourceLabel })
  } else {
    // Weight deliberately set to 0 (qualitative) — this dimension's 5% share is
    // redistributed to the remaining real dimensions. Disclosed explicitly in the
    // source label so the UI can surface this fact without reading scoring internals.
    candidates.push(qualitative('manufacturing', 'Manufacturing Feasibility', m.scores.manufacturing?.level ?? legacyScoreToLevel(m.scores.manufacturing?.score), 'Supplier data unavailable — Apify manufacturing scrape returned no results for this product (5% weight excluded, redistributed to other dimensions)'))
  }

  return { candidates, gateTiers }
}

function scoreFromCandidates(candidates: ScoreDimension[]): { score: number; weightedDecision: BuildDecision; dimensions: ScoreDimension[] } {
  const totalWeight = candidates.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) {
    return { score: 0, weightedDecision: 'SKIP', dimensions: candidates }
  }
  const dimensions = candidates.map(c => ({ ...c, weight: c.weight / totalWeight }))
  const weightedAvg = dimensions.reduce((s, d) => s + (d.rawScore ?? 0) * d.weight, 0)
  const score = Math.max(0, Math.min(100, Math.round(weightedAvg * 10)))
  const rawDecision: BuildDecision = score >= 65 ? 'BUILD_NOW' : score >= 50 ? 'VALIDATE_FURTHER' : 'SKIP'
  // Weight re-normalization inflates a single strong dimension to score ≥ 65.
  // A single verified signal (e.g. search volume alone) is insufficient basis
  // for a BUILD_NOW recommendation when 6 of 7 composites are missing.
  // Require at least 2 independent verified dimensions before BUILD_NOW fires.
  const verifiedCount = candidates.filter(c => c.source === 'verified').length
  const weightedDecision: BuildDecision =
    rawDecision === 'BUILD_NOW' && verifiedCount < 2 ? 'VALIDATE_FURTHER' : rawDecision
  return { score, weightedDecision, dimensions }
}

// ── Category-Creation-Candidate diagnostic ─────────────────────────────────
// Reuses the Demand composite's own formula on a broader query — no new
// heuristic, just the same real-data thresholds applied to a second,
// broader real fetch. The broad-query evidence itself is fetched upstream
// (app/api/generate/route.ts) and PERSISTED on the memo
// (MemoData.category_creation_broad_evidence) rather than passed as a
// function argument here — this function takes only `m`, so every caller
// (generation time and every later re-render, e.g. components/
// MemoDisplay.tsx) reads the exact same evidence and can never diverge.

const SPECIFIC_DEMAND_WEAK_THRESHOLD = 3
const BROAD_DEMAND_STRONG_THRESHOLD  = 5

export function computeGroundedScore(m: MemoData): GroundedScore {
  const { candidates, gateTiers } = assembleDimensions(m)
  const evidenceBreadth = computeEvidenceBreadth(m)
  const broadEvidence = m.category_creation_broad_evidence

  // HARDENING FIX (2026-06-28): only the Demand composite is replaced with
  // the broader query's real result — every other composite keeps using
  // the SPECIFIC product's own real evidence where it exists. The original
  // implementation replaced the whole `signal_evidence`/`keyword_intelligence`
  // object, which silently switched Market Accessibility, Profitability, and
  // Virality to the broader category's data too (they all read from the same
  // container) — mixing a different product's competitive/pricing/virality
  // picture into THIS product's result with no principled justification.
  // Operating at the composite level instead of the whole-memo level avoids
  // that: it matches the header comment's actual intent ("reuses the Demand
  // composite's own formula on a broader query," nothing else).
  const tryCategoryCreation = (): GroundedScore | null => {
    if (!broadEvidence) return null
    const broadMemoForDemand: MemoData = { ...m, signal_evidence: broadEvidence.signal_evidence, keyword_intelligence: broadEvidence.keyword_intelligence }
    const broadDemand = computeDemand(broadMemoForDemand)
    if ((broadDemand.rawScore ?? 0) < BROAD_DEMAND_STRONG_THRESHOLD) return null

    const mergedCandidates = candidates.map(c =>
      c.key === 'demand'
        ? { key: 'demand', label: 'Demand', weight: BASE_WEIGHTS.demand, rawScore: broadDemand.rawScore!, source: 'verified' as const, sourceLabel: broadDemand.sourceLabel }
        : c,
    )
    const { score, weightedDecision, dimensions } = scoreFromCandidates(mergedCandidates)
    // Gates and the safety tier still reflect the SPECIFIC product's own
    // real evidence — a broader category's accessibility/safety profile
    // doesn't answer whether THIS exact product clears those bars.
    const safetyTier = computeSafetyGateTier(m)
    const gatedDecision = mostConservative([weightedDecision, ...gateTiers, safetyTier])

    // A VALIDATE_FURTHER gate (e.g. Class II recall, adverse events) must
    // remain visible even for category creation candidates — safety validation
    // requirements do not dissolve because this is a white-space opportunity.
    // Only SKIP overrides the CCC label entirely; VALIDATE_FURTHER is preserved.
    const finalDecision: BuildDecision =
      gatedDecision === 'SKIP'             ? 'SKIP' :
      gatedDecision === 'VALIDATE_FURTHER' ? 'VALIDATE_FURTHER' :
      'CATEGORY_CREATION_CANDIDATE'

    return {
      score,
      decision: finalDecision,
      dimensions,
      groundedPct: 100,
      insufficientEvidence: false,
      evidenceBreadth,
      categoryCreationContext: { broadQuery: broadEvidence.broadQuery },
    }
  }

  // Zero real dimensions found at all — nothing to compute a score from.
  // Category-Creation-Candidate check: the specific query is empty, but
  // does a broader query show real, healthy evidence? If so, this is not
  // "insufficient evidence," it's a real, distinct pattern — see header.
  if (candidates.every(c => c.weight === 0)) {
    const candidate = tryCategoryCreation()
    if (candidate) return candidate
    return {
      score: 0,
      decision: 'SKIP',
      dimensions: candidates,
      groundedPct: 0,
      insufficientEvidence: true,
      evidenceBreadth,
    }
  }

  // Specific query has SOME real data, but Demand specifically is weak —
  // still check the Category-Creation-Candidate pattern, since a thin
  // specific signal alongside a thriving broad category is exactly the
  // white-space signature even when other dimensions found something.
  const demandResult = candidates.find(c => c.key === 'demand')
  if ((demandResult?.rawScore ?? 0) < SPECIFIC_DEMAND_WEAK_THRESHOLD) {
    const candidate = tryCategoryCreation()
    if (candidate) return candidate
  }

  const { score, weightedDecision, dimensions } = scoreFromCandidates(candidates)
  const safetyTier = computeSafetyGateTier(m)
  const decision = mostConservative([weightedDecision, ...gateTiers, safetyTier])

  return {
    score,
    decision,
    dimensions,
    groundedPct: 100,
    insufficientEvidence: false,
    evidenceBreadth,
  }
}

// ── Traction band (unchanged from prior redesign) ───────────────────────────

export type TractionBand = 'Early-stage, unproven' | 'Some comparable traction' | 'Strong comparable traction'

export function computeTractionBand(m: MemoData): TractionBand {
  const se = m.signal_evidence
  const realRevenueScore = se?.revenue?.value.score
  const realDemandScore  = se?.demand?.value.score ?? se?.growth?.value.score
  const hasStrongReal = (typeof realRevenueScore === 'number' && realRevenueScore >= 6)
                      || (typeof realDemandScore  === 'number' && realDemandScore  >= 7)
  const hasSomeReal = !!se?.revenue || !!se?.demand || !!se?.growth || !!se?.review_velocity

  if (hasStrongReal) return 'Strong comparable traction'
  if (hasSomeReal)   return 'Some comparable traction'
  return 'Early-stage, unproven'
}
