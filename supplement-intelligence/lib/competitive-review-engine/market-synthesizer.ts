import type { AIProvider }            from '@/lib/review-engine'
import type { MarketGap, WinnerFeature, ProductInsight } from './types'
import type { MarketScores }           from './market-scorer'

// ── Output ─────────────────────────────────────────────────────────────────

export interface MarketSynthesisResult {
  top_market_gaps:          string[]   // 5 curated, highest-impact gaps
  winner_features:          string[]   // 5 features the market rewards
  ai_market_recommendation: string     // strategic positioning advice (3–4 sentences)
  ai_product_brief:         string     // concrete winning-product spec (3–4 sentences)
}

// ── Prompts ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  `You are a senior product strategist and market analyst. ` +
  `Given competitive intelligence from Amazon reviews across multiple products, ` +
  `produce a concrete, data-driven strategic brief. ` +
  `Output ONLY valid JSON — no markdown, no explanation.`

function formatGaps(gaps: MarketGap[], max: number): string {
  if (!gaps.length) return '  (none detected)'
  return gaps
    .slice(0, max)
    .map((g, i) =>
      `  ${i + 1}. [${g.category}] ${g.description} ` +
      `(${Math.round(g.prevalence * 100)}% of products, severity: ${g.severity})`
    )
    .join('\n')
}

function formatWinners(features: WinnerFeature[], max: number): string {
  if (!features.length) return '  (none detected)'
  return features
    .slice(0, max)
    .map((f, i) => `  ${i + 1}. ${f.feature} (seen in ${f.product_count} top-rated products, avg ${f.avg_rating}★)`)
    .join('\n')
}

function formatProducts(products: ProductInsight[]): string {
  return products
    .slice(0, 8)
    .map(p =>
      `  • ${p.asin}${p.title ? ` "${p.title.slice(0, 50)}"` : ''} — ` +
      `${p.avg_rating}★, pain=${p.pain_score}/10, opp=${p.opportunity_score}/10`
    )
    .join('\n')
}

function buildPrompt(
  scores:           MarketScores,
  universalGaps:    MarketGap[],
  commonGaps:       MarketGap[],
  winnerFeatures:   WinnerFeature[],
  products:         ProductInsight[],
  categoryName:     string | undefined,
  totalReviews:     number,
): string {
  const category = categoryName ?? 'this product category'

  return `COMPETITIVE MARKET INTELLIGENCE — ${category.toUpperCase()}
Analyzed ${products.length} competing products | ${totalReviews.toLocaleString()} total reviews

MARKET SCORES
  Pain Score:        ${scores.market_pain_score}/10
  Opportunity Score: ${scores.market_opportunity_score}/10
  Gap Score:         ${scores.gap_score}/10
  Competition Risk:  ${scores.competition_risk}/10
  Confidence:        ${Math.round(scores.market_confidence * 100)}%

UNIVERSAL GAPS — category-wide problems (≥70% of products):
${formatGaps(universalGaps, 10)}

COMMON GAPS — widespread but not universal (40–69% of products):
${formatGaps(commonGaps, 8)}

WHAT TOP-RATED PRODUCTS DO RIGHT — features the market rewards:
${formatWinners(winnerFeatures, 8)}

PRODUCT LANDSCAPE (top ${Math.min(products.length, 8)} by opportunity score):
${formatProducts(products)}

Based on this intelligence, return EXACTLY this JSON:
{
  "top_market_gaps": [
    "gap description — one specific, actionable sentence",
    "gap description — one specific, actionable sentence",
    "gap description — one specific, actionable sentence",
    "gap description — one specific, actionable sentence",
    "gap description — one specific, actionable sentence"
  ],
  "winner_features": [
    "feature — one specific sentence on what the market already rewards",
    "feature — one specific sentence",
    "feature — one specific sentence",
    "feature — one specific sentence",
    "feature — one specific sentence"
  ],
  "ai_market_recommendation": "3-4 sentences. What is the single biggest opportunity in ${category}? Which gap should a new entrant attack first and why? What positioning would differentiate them from all current competitors?",
  "ai_product_brief": "3-4 sentences. Describe the exact product a brand should build to win this market. Be specific: format, key features that address the universal gaps, features to retain from top-rated products, and what to avoid."
}

Rules:
- top_market_gaps: exactly 5 items; the 5 highest-impact unmet needs ranked by opportunity (frequency × severity × how fixable)
- winner_features: exactly 5 items; drawn from the winner features data above
- ai_market_recommendation: reference specific gaps and scores — never be generic
- ai_product_brief: concrete spec, not marketing language — mention specific features/materials/mechanisms`
}

// ── JSON parser ────────────────────────────────────────────────────────────

function parseResult(raw: string): MarketSynthesisResult {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)

  try { return JSON.parse(s) as MarketSynthesisResult } catch { /* fall through */ }

  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') { if (--depth === 0) { end = i; break } }
  }

  if (end !== -1) return JSON.parse(s.slice(0, end + 1)) as MarketSynthesisResult

  console.error('[MarketSynthesizer] JSON parse failed; returning fallback')
  return {
    top_market_gaps:          Array(5).fill('Insufficient data'),
    winner_features:          Array(5).fill('Insufficient data'),
    ai_market_recommendation: 'Market synthesis failed to parse. Review raw gap data manually.',
    ai_product_brief:         'Product brief unavailable due to synthesis parse error.',
  }
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function synthesizeMarket(
  ai:            AIProvider,
  scores:        MarketScores,
  universalGaps: MarketGap[],
  commonGaps:    MarketGap[],
  winnerFeatures: WinnerFeature[],
  products:      ProductInsight[],
  categoryName:  string | undefined,
  totalReviews:  number,
): Promise<MarketSynthesisResult> {
  const prompt = buildPrompt(
    scores, universalGaps, commonGaps, winnerFeatures, products, categoryName, totalReviews,
  )

  const result = await ai.complete({
    system:      SYSTEM_PROMPT,
    messages:    [{ role: 'user', content: prompt }],
    max_tokens:  1200,
    temperature: 0.2,
  })

  return parseResult(result.content)
}
