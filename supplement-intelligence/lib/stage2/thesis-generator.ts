import Anthropic from '@anthropic-ai/sdk'
import type { Stage1Evidence } from '../evidence/adapter'
import type { InvestmentThesis, ThesisGenerationResult } from './types'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'
const THESIS_COUNT = 3

// ── Prompt construction ────────────────────────────────────────────────────
// The prompt provides all Stage 1 evidence verbatim. Every thesis must cite
// specific evidence from the data — no invented market facts.

function buildEvidenceSummary(evidence: Stage1Evidence, query: string): string {
  const lines: string[] = [`Market signal data for: "${query}"`, '']

  // Demand
  if (evidence.est_monthly_revenue?.value) {
    lines.push(`Revenue: ~$${Math.round(evidence.est_monthly_revenue.value / 1000)}k/mo avg seller [${evidence.est_monthly_revenue.source_type}]`)
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

function buildThesisPrompt(query: string, evidence: Stage1Evidence): string {
  const evidenceSummary = buildEvidenceSummary(evidence, query)

  return `You are a product strategist generating ${THESIS_COUNT} investment theses for a supplement entrepreneur evaluating: "${query}"

## Real Market Data (Stage 1 — no AI synthesis, all from live providers)

${evidenceSummary}

## Your task

Generate exactly ${THESIS_COUNT} distinct investment theses. Each thesis must:
1. Propose a SPECIFIC product angle (not the generic category — a concrete differentiated product)
2. Cite the actual evidence above to justify the opportunity
3. Identify a SPECIFIC target customer (persona, not demographic bucket)
4. State ONE clear differentiation that incumbents have not captured (must be supported by the evidence)
5. Flag the #1 risk honestly

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

Do NOT invent market facts. Every claim must trace to the evidence above.
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
  evidence: Stage1Evidence
): Promise<ThesisGenerationResult> {
  const prompt = buildThesisPrompt(query, evidence)

  const msg = await ai.messages.create({
    model:       MODEL,
    max_tokens:  4096,
    temperature: 0.4,
    messages:    [{ role: 'user', content: prompt }],
  })

  const content = msg.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from AI')

  return parseThesisResponse(content.text)
}
