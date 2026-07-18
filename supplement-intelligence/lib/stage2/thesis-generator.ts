import Anthropic from '@anthropic-ai/sdk'
import type { Stage1Evidence } from '../evidence/adapter'
import type { InvestmentThesis, ThesisGenerationResult } from './types'
import type { MarketReport } from '../competitive-review-engine/types'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'
const THESIS_COUNT = 3

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)
    ),
  ])
}

// ── Prompt construction ────────────────────────────────────────────────────
// The prompt provides all Stage 1 evidence verbatim. Every thesis must cite
// specific evidence from the data — no invented market facts.

// Exported (additive, no behavior change) so the regulatory-intelligence
// display-string fix (2026-07-18 audit, Finding 3) is directly unit
// testable without mocking the Anthropic SDK this file's exported
// generateTheses() calls.
export function buildEvidenceSummary(evidence: Stage1Evidence, query: string): string {
  const lines: string[] = [`Market signal data for: "${query}"`, '']

  // Demand
  if (evidence.est_monthly_revenue?.value) {
    lines.push(`Revenue: ~$${Math.round(evidence.est_monthly_revenue.value / 1000)}k/mo avg seller [${evidence.est_monthly_revenue.source_type}]`)
  }
  if (evidence.top_seller_revenue?.value) {
    lines.push(`Top seller revenue: ~$${Math.round(evidence.top_seller_revenue.value / 1000)}k/mo (best performer in category) [Keepa]`)
  }
  if (evidence.est_monthly_units_sold?.value) {
    lines.push(`Monthly units sold (avg top sellers): ${evidence.est_monthly_units_sold.value.toLocaleString()} units/mo [Keepa]`)
  }
  if (evidence.avg_market_rating?.value) {
    lines.push(`Avg market rating (Keepa bestsellers): ★${evidence.avg_market_rating.value.toFixed(1)}`)
  }
  if (evidence.trend_direction?.value) {
    lines.push(`Trend: ${evidence.trend_direction.value} [${evidence.trend_direction.source}]`)
  }
  if (evidence.momentum_90d_pct?.value !== undefined) {
    lines.push(`90d momentum: ${evidence.momentum_90d_pct.value}% [Keepa deltaPercent90_monthlySold]`)
  }
  if (evidence.yoy_change?.value) {
    lines.push(`YoY: ${evidence.yoy_change.value} [${evidence.yoy_change.source}]`)
  }
  if (evidence.top_regions?.value?.length) {
    lines.push(`Top regions: ${evidence.top_regions.value.slice(0, 5).join(', ')} [Google Trends]`)
  }

  // Competition
  if (evidence.competitor_count?.value !== undefined) {
    lines.push(`Meaningful competitors (≥20 reviews): ${evidence.competitor_count.value} [Apify Amazon]`)
  }
  if (evidence.avg_competitor_reviews?.value !== undefined) {
    lines.push(`Avg competitor reviews: ${evidence.avg_competitor_reviews.value.toLocaleString()}`)
  }
  if (evidence.review_concentration?.value !== undefined) {
    lines.push(`Review concentration (top 3): ${Math.round(evidence.review_concentration.value * 100)}%`)
  }

  // Pricing
  if (evidence.median_price?.value) {
    lines.push(`Median price (avg90): $${evidence.median_price.value}`)
  }
  if (evidence.price_range?.value) {
    lines.push(`Price range: $${evidence.price_range.value.min}–$${evidence.price_range.value.max}`)
  }
  if (evidence.price_compression_pct?.value !== undefined) {
    lines.push(`Price compression (90d vs 12mo): ${evidence.price_compression_pct.value}% — ${evidence.price_compression_pct.methodology}`)
  }

  // Fees
  if (evidence.avg_fba_fee?.value) {
    lines.push(`Avg FBA fee: $${evidence.avg_fba_fee.value.toFixed(2)} [Amazon, primary_measurement]`)
  }
  if (evidence.avg_referral_fee_pct?.value) {
    lines.push(`Avg referral fee: ${evidence.avg_referral_fee_pct.value}% [Amazon, primary_measurement]`)
  }

  // Social
  if (evidence.tiktok_view_count?.value) {
    const views = evidence.tiktok_view_count.value
    lines.push(`TikTok views: ${views >= 1e6 ? `${(views / 1e6).toFixed(1)}M` : `${(views / 1e3).toFixed(0)}K`} [${evidence.tiktok_view_count.scope_note}]`)
  }
  if (evidence.seasonality_pattern?.value) {
    lines.push(`Seasonality: ${evidence.seasonality_pattern.value}`)
    if (evidence.peak_months?.value?.length) {
      lines.push(`Peak months: ${evidence.peak_months.value.join(', ')}`)
    }
  }

  // Ranking difficulty
  const rd = evidence.ranking_difficulty?.value
  if (rd) {
    lines.push(`Ranking difficulty: ${rd.page1_difficulty} (median top-5 reviews: ${rd.median_reviews_top5.toLocaleString()}, reviews to compete: ${rd.reviews_to_compete.toLocaleString()})`)
    if (rd.is_review_protected) lines.push(`Review protection: YES — median competitor has ≥1,000 reviews (high barrier to organic ranking)`)
  }

  // PPC economics
  const ppc = evidence.ppc_economics?.value
  if (ppc) {
    lines.push(`PPC risk: ${ppc.ppc_risk_level} — ${ppc.risk_reason}`)
    if (ppc.est_acos_pct !== null) lines.push(`Est. ACOS at launch: ${ppc.est_acos_pct}% (Google CPC proxy, NOT real Amazon Ads)`)
    if (ppc.est_tacos_pct_high !== null) lines.push(`Est. TACoS range: ${ppc.est_tacos_pct_low}–${ppc.est_tacos_pct_high}% (launch phase, all-paid scenario)`)
    if (ppc.headroom_after_ads !== null) {
      const headroomLabel = ppc.headroom_after_ads > 0
        ? `$${ppc.headroom_after_ads.toFixed(2)}/unit remaining before COGS (viable)`
        : `$${Math.abs(ppc.headroom_after_ads).toFixed(2)}/unit shortfall before COGS (paid launch destroys margin)`
      lines.push(`Net revenue after ads: ${headroomLabel}`)
    }
    lines.push(`Paid launch viable: ${ppc.paid_viable ? 'YES' : 'NO'}`)
  }

  // Regulatory intelligence
  const reg = evidence.regulatory_intelligence?.value
  if (reg) {
    lines.push(`Regulatory risk (OpenFDA): ${reg.risk_level} — ${reg.risk_summary}`)
    if (reg.warning_flags.length) {
      reg.warning_flags.forEach(f => lines.push(`  ⚑ ${f}`))
    }
    if (reg.adverse_events) {
      const ae = reg.adverse_events
      lines.push(`  CAERS: ${ae.implicated_reports} implicated of ${ae.total_reports.toLocaleString()} total reports · ${ae.serious_reports} serious · ${ae.hospitalization_count} hospitalizations · ${ae.death_count} deaths`)
      if (ae.top_reactions.length) lines.push(`  Top reactions: ${ae.top_reactions.slice(0, 4).join(', ')}`)
    }
    if (reg.recalls && reg.recalls.total_recalls > 0) {
      lines.push(`  Recalls: ${reg.recalls.implicated_recalls} implicated of ${reg.recalls.total_recalls} total (Class I: ${reg.recalls.class_i_recalls}, Class II: ${reg.recalls.class_ii_recalls})`)
    }
  }

  // Top competitors
  const competitors = evidence.top_competitors?.value
  if (competitors?.length) {
    lines.push('')
    lines.push('Top competitors (real Amazon data):')
    competitors.slice(0, 6).forEach((c, i) => {
      const ingredients = c.ingredients_label ? ` | Ingredients: ${c.ingredients_label.slice(0, 80)}` : ''
      lines.push(`  ${i + 1}. ${c.brand} | ${c.reviewCount.toLocaleString()} reviews | ★${c.rating} | $${c.price}${ingredients}`)
      if (c.bullets?.length) {
        lines.push(`     Key claims: ${c.bullets.slice(0, 2).join(' · ')}`)
      }
    })
  }

  return lines.join('\n')
}

function buildReviewSummary(report: MarketReport): string {
  const lines: string[] = []

  lines.push(
    `Analysis: ${report.products_analyzed} competitor products · ` +
    `${report.total_reviews_analyzed.toLocaleString()} reviews analyzed · ` +
    `Confidence: ${Math.round(report.market_confidence * 100)}%`
  )
  lines.push(
    `Market pain score: ${report.market_pain_score}/10 · ` +
    `Opportunity score: ${report.market_opportunity_score}/10`
  )
  lines.push('')

  if (report.top_market_gaps.length) {
    lines.push('Top market gaps (curated from real customer reviews):')
    report.top_market_gaps.forEach((gap, i) => lines.push(`  ${i + 1}. ${gap}`))
    lines.push('')
  }

  if (report.universal_gaps.length) {
    lines.push('Universal gaps (≥70% of competing products share this complaint):')
    report.universal_gaps.slice(0, 5).forEach(g =>
      lines.push(`  • [${g.severity}] ${g.description} — ${Math.round(g.prevalence * 100)}% of products`)
    )
    lines.push('')
  }

  if (report.common_gaps.length) {
    lines.push('Common gaps (40–69% prevalence):')
    report.common_gaps.slice(0, 4).forEach(g =>
      lines.push(`  • [${g.severity}] ${g.description} — ${Math.round(g.prevalence * 100)}%`)
    )
    lines.push('')
  }

  if (report.winner_features.length) {
    lines.push('What top-rated products do that reviewers praise:')
    report.winner_features.slice(0, 5).forEach(f => lines.push(`  • ${f}`))
    lines.push('')
  }

  const topProducts = [...report.products]
    .sort((a, b) => b.opportunity_score - a.opportunity_score)
    .slice(0, 4)

  if (topProducts.length) {
    lines.push('Per-competitor customer voice (highest-opportunity products):')
    topProducts.forEach(p => {
      const id = p.brand ? `${p.brand} (${p.asin})` : p.asin
      if (p.top_complaints.length)
        lines.push(`  ${id} — complaints: ${p.top_complaints.slice(0, 2).join(' · ')}`)
      if (p.top_requested_features.length)
        lines.push(`  ${id} — requests: ${p.top_requested_features.slice(0, 2).join(' · ')}`)
    })
    lines.push('')
  }

  if (report.ai_product_brief) {
    lines.push('AI product brief (synthesized from review data):')
    lines.push(report.ai_product_brief)
  }

  return lines.join('\n')
}

function buildThesisPrompt(query: string, evidence: Stage1Evidence, marketReport?: MarketReport): string {
  const evidenceSummary = buildEvidenceSummary(evidence, query)
  const hasReviews = !!marketReport && marketReport.products_analyzed > 0

  const reviewSection = hasReviews
    ? `\n## Real Customer Voice (Review Engine — ${marketReport!.total_reviews_analyzed.toLocaleString()} Amazon reviews analyzed)\n\n${buildReviewSummary(marketReport!)}\n`
    : ''

  return `You are a product strategist generating ${THESIS_COUNT} investment theses for a supplement entrepreneur evaluating: "${query}"

## Real Market Data (Stage 1 — no AI synthesis, all from live providers)

${evidenceSummary}
${reviewSection}
## Your task

Generate exactly ${THESIS_COUNT} distinct investment theses. Each thesis must:
1. Propose a SPECIFIC product angle (not the generic category — a concrete differentiated product)
2. Cite the actual evidence above to justify the opportunity
3. Identify a SPECIFIC target customer (persona, not demographic bucket)
4. State ONE clear differentiation that incumbents have not captured (must be supported by the evidence)
5. Flag the #1 risk honestly
${hasReviews ? '6. Ground customer_pain.problem in the real review data above — use specific complaints and requests, not generic assumptions\n7. When citing customer pain evidence_source, reference the Review Engine data if it supports the claim' : ''}

Each thesis must be a JSON object with this exact shape:
{
  "thesis_index": 1,
  "product_angle": "string — specific product concept",
  "target_customer": "string — specific persona",
  "differentiation": "string — what incumbents have missed",
  "differentiation_source": "string — which data point in the evidence above supports this",
  "customer_pain": {
    "problem": "string — the problem being solved",
    "evidence_source": "string — where this pain was observed in the data",
    "pain_intensity": "mild | moderate | severe",
    "frequency": "occasional | recurring | constant"
  },
  "supporting_evidence": [
    { "value": "string — cited fact", "source": "string — provider", "source_type": "primary_measurement | provider_model | computed", "freshness_date": "YYYY-MM-DD", "methodology": "optional" }
  ],
  "quick_economics_check": {
    "price_point_estimate": "string — e.g. $28–$38",
    "min_capital_required": number_in_USD,
    "margin_viable": true | false,
    "margin_note": "string — one sentence",
    "launch_complexity": "low | medium | high",
    "complexity_drivers": ["array", "of", "strings"]
  }
}

Return a JSON object: { "theses": [...], "generation_note": "string — any caveats about data quality or confidence" }

${hasReviews ? 'When real customer voice data is available (Review Engine section above), use it to ground pain points, differentiation, and feature claims. Prefer specific review evidence over generic market assumptions.' : ''}
Do NOT invent market facts not present in the evidence above.
Do NOT propose the exact same product positioning twice — make the theses meaningfully distinct.
If the data is thin, say so in generation_note and reduce confidence in your economics estimates.`
}

// ── AI call with structured output extraction ──────────────────────────────

function parseThesisResponse(raw: string): ThesisGenerationResult {
  // Strip markdown fences
  let s = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)

  const parsed = JSON.parse(s)
  if (!Array.isArray(parsed?.theses)) throw new Error('Response missing theses array')

  const theses: InvestmentThesis[] = parsed.theses.map((t: Record<string, unknown>, i: number) => ({
    thesis_index:          i + 1,
    product_angle:         String(t.product_angle ?? ''),
    target_customer:       String(t.target_customer ?? ''),
    differentiation:       String(t.differentiation ?? ''),
    differentiation_source: String(t.differentiation_source ?? ''),
    customer_pain:         t.customer_pain as InvestmentThesis['customer_pain'],
    supporting_evidence:   (t.supporting_evidence as InvestmentThesis['supporting_evidence']) ?? [],
    quick_economics_check: t.quick_economics_check as InvestmentThesis['quick_economics_check'],
  }))

  return {
    theses,
    generation_note: String(parsed.generation_note ?? ''),
    ai_model_version: MODEL,
  }
}

export async function generateTheses(
  query: string,
  evidence: Stage1Evidence,
  marketReport?: MarketReport
): Promise<ThesisGenerationResult> {
  const prompt = buildThesisPrompt(query, evidence, marketReport)

  async function attempt(maxTokens: number): Promise<ThesisGenerationResult> {
    const msg = await withTimeout(ai.messages.create({
      model:       MODEL,
      max_tokens:  maxTokens,
      temperature: 0.4,
      messages:    [{ role: 'user', content: prompt }],
    }), 90_000)
    const content = msg.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from AI')
    return parseThesisResponse(content.text)
  }

  try {
    return await attempt(4096)
  } catch (err) {
    if (err instanceof SyntaxError || (err instanceof Error && err.message.includes('theses array'))) {
      return await attempt(6144)
    }
    throw err
  }
}
