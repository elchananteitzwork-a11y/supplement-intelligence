import type { AggregatedSignals } from '@/lib/signal-engine/types'
import type { ConsumerIntelligenceReport } from '@/lib/consumer-intelligence'

// ── Signal context formatter ───────────────────────────────────────
// Converts AggregatedSignals into a structured text block that is injected
// into the discovery prompt. Claude uses these verified values in place of
// estimates wherever they apply. Dimensions missing from the signals are
// omitted from the block so Claude fills them in with its own reasoning.

// Real, review-derived themes (lib/consumer-intelligence) — when available,
// cited explicitly so market_gaps/customer_language/biggest_competitor.gap
// can be grounded inferences from real customer feedback instead of
// invented from training-knowledge pattern completion. Each line includes
// the real review count behind it so the model can cite it directly.
function buildConsumerIntelligenceContext(ci: ConsumerIntelligenceReport): string {
  const lines: string[] = [
    'REAL CUSTOMER FEEDBACK (verified, from actual Amazon reviews on the top competitor products):',
    `Source: ${ci.totalReviewsCollected} real reviews across ${ci.productsAnalyzed.map(p => p.brand).join(', ')}.`,
    '',
  ]

  if (ci.negativeThemes.length) {
    lines.push('Real documented complaints (cite these for market_gaps and biggest_competitor.gap — do not invent a different gap if one of these applies):')
    for (const t of ci.negativeThemes.slice(0, 8)) {
      lines.push(`  - "${t.label}" — mentioned by ${t.mentionedBy}/${t.outOf} reviews. Example: "${t.exampleQuote}"`)
    }
    lines.push('')
  }

  if (ci.featureRequests.length) {
    lines.push('Real feature requests (cite these for market_gaps/brand_opportunities):')
    for (const t of ci.featureRequests.slice(0, 5)) {
      lines.push(`  - "${t.label}" — mentioned by ${t.mentionedBy}/${t.outOf} reviews. Example: "${t.exampleQuote}"`)
    }
    lines.push('')
  }

  if (ci.positiveThemes.length) {
    lines.push('Real positive themes (cite these for customer_language.desires and ad_phrases instead of inventing quotes):')
    for (const t of ci.positiveThemes.slice(0, 5)) {
      lines.push(`  - "${t.label}" — mentioned by ${t.mentionedBy}/${t.outOf} reviews. Example: "${t.exampleQuote}"`)
    }
    lines.push('')
  }

  lines.push('Instruction: when a market_gaps item, a customer_language entry, or biggest_competitor.gap is directly supported by one of the real items above, use that real item (you may lightly rephrase, but keep the same substance) rather than inventing a different one. Only fall back to your own reasoning for items with no real coverage above.')
  lines.push('')

  return lines.join('\n')
}

export function buildSignalContext(
  category: string,
  signals: AggregatedSignals,
  consumerIntelligence?: ConsumerIntelligenceReport | null,
): string {
  if (signals.overall_confidence < 0.2) return ''

  const confPct = Math.round(signals.overall_confidence * 100)
  const sourceList = signals.providers_used.join(', ')
  const lines: string[] = [
    `VERIFIED MARKET DATA for category: "${category}"`,
    `Sources: ${sourceList} | Overall confidence: ${confPct}%`,
    `Use these values where they apply. Do not override verified data with estimates.`,
    `For dimensions not listed here, continue to reason and estimate as normal.`,
    '',
  ]

  if (signals.demand) {
    const d = signals.demand.value
    lines.push('DEMAND (verified):')
    if (d.search_volume) lines.push(`  - Amazon sales volume (proxy): ${d.search_volume}`)
    if (d.trend)         lines.push(`  - Trend direction: ${d.trend}`)
    if (d.signal)        lines.push(`  - Signal strength: ${d.signal}`)
    lines.push(`  - Confidence: ${Math.round(signals.demand.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.competition) {
    const c = signals.competition.value
    lines.push('MARKET SATURATION (verified from Amazon seller data):')
    if (c.competing_brands) lines.push(`  - Competing sellers per listing: ${c.competing_brands}`)
    if (c.saturation)       lines.push(`  - Saturation level: ${c.saturation}`)
    if (c.barrier)          lines.push(`  - Entry barrier: ${c.barrier}`)
    lines.push(`  - Confidence: ${Math.round(signals.competition.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.growth) {
    const g = signals.growth.value
    lines.push('GROWTH (verified):')
    if (g.yoy_change) lines.push(`  - Year-over-year BSR trend: ${g.yoy_change}`)
    if (g.momentum)   lines.push(`  - Momentum: ${g.momentum}`)
    lines.push(`  - Confidence: ${Math.round(signals.growth.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.pricing) {
    const p = signals.pricing.value
    lines.push('PRICING (verified):')
    if (p.avg_price)      lines.push(`  - Category average price: ${p.avg_price}`)
    if (p.price_range)    lines.push(`  - Price range: ${p.price_range}`)
    if (p.premium_viable !== undefined) {
      lines.push(`  - Premium brand viable (20%+ above avg): ${p.premium_viable ? 'Yes' : 'No'}`)
    }
    lines.push(`  - Confidence: ${Math.round(signals.pricing.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.review_velocity) {
    const r = signals.review_velocity.value
    lines.push('REVIEW VELOCITY / MARKET ACCESSIBILITY (verified):')
    if (r.monthly_reviews) lines.push(`  - Monthly new reviews: ${r.monthly_reviews}`)
    if (r.avg_rating)      lines.push(`  - Average customer rating: ${r.avg_rating}★`)
    if (r.sentiment)       lines.push(`  - Overall sentiment: ${r.sentiment}`)
    if (r.meaningful_competitor_count !== undefined) lines.push(`  - Meaningful competitors (real Amazon search results, established brands only): ${r.meaningful_competitor_count}`)
    if (r.avg_review_count !== undefined)            lines.push(`  - Average review count across top results: ${r.avg_review_count}`)
    if (r.review_concentration_ratio !== undefined)  lines.push(`  - Review concentration in #1 result: ${Math.round(r.review_concentration_ratio * 100)}%`)
    lines.push(`  - Confidence: ${Math.round(signals.review_velocity.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.revenue) {
    const rv = signals.revenue.value
    lines.push('REVENUE (verified, derived from real Keepa price × units-sold data):')
    if (rv.est_monthly_revenue)    lines.push(`  - Estimated monthly revenue (category average): ${rv.est_monthly_revenue}`)
    if (rv.top_seller_revenue)     lines.push(`  - Top seller monthly revenue: ${rv.top_seller_revenue}`)
    if (rv.avg_seller_revenue)     lines.push(`  - Average seller monthly revenue: ${rv.avg_seller_revenue}`)
    if (rv.est_monthly_units_sold) lines.push(`  - Estimated monthly units sold (category average): ${rv.est_monthly_units_sold}`)
    lines.push(`  - Confidence: ${Math.round(signals.revenue.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.virality) {
    const v = signals.virality.value
    lines.push('VIRALITY (verified):')
    if (v.tiktok)            lines.push(`  - TikTok signal: ${v.tiktok}`)
    if (v.content_potential) lines.push(`  - Content potential: ${v.content_potential}`)
    if (v.ugc)               lines.push(`  - UGC signal: ${v.ugc}`)
    lines.push(`  - Confidence: ${Math.round(signals.virality.confidence * 100)}%`)
    lines.push('')
  }

  if (signals.seasonality) {
    const s = signals.seasonality.value
    lines.push('SEASONALITY (verified):')
    if (s.pattern)     lines.push(`  - Pattern: ${s.pattern}`)
    if (s.peak_months?.length) lines.push(`  - Peak months: ${s.peak_months.join(', ')}`)
    lines.push(`  - Confidence: ${Math.round(signals.seasonality.confidence * 100)}%`)
    lines.push('')
  }

  if (consumerIntelligence) {
    lines.push(buildConsumerIntelligenceContext(consumerIntelligence))
  }

  return lines.join('\n')
}

// ── Base discovery prompt ─────────────────────────────────────────

// PERMANENT RULE (2026-06-26): no numeric score anywhere in this schema —
// see SHARED_OPPORTUNITY_SCHEMA in lib/categories/shared-prompts.ts for the
// full rationale. This is the one category (supplements) with its own
// discovery prompt instead of the shared one, so it needs the identical
// treatment applied by hand.
export const DISCOVERY_PROMPT = `You are a supplement market analyst specializing in consumer brand opportunity identification.

Given a broad supplement category, generate exactly 20 specific supplement product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific problem, mechanism, or audience — not just a rephrasing of the category name.

DIMENSION JUDGMENT — qualitative only (High | Medium | Low), never a number. Every dimension must include its evidence fields.

DEMAND:
- signal: "Strong" (clear consumer awareness + growth), "Moderate" (some awareness, flat/mixed trend), or "Weak" (niche, declining, or speculative)

MARKET SATURATION (qualitative):
- level: "Low" (<20 established brands, white space exists), "Medium" (20–60 brands, niches available), "High" (60–120 brands, strong incumbents), "Very High" (120+ brands, dominated)
- barrier: "Low" (white-label friendly), "Medium" (some R&D or positioning moat needed), "High" (clinical claims, patents, or dominant incumbents)
- note: one sentence on who dominates and where the real opportunity sits

VIRALITY:
- tiktok: "High" (strong content angle, active creator ecosystem), "Medium" (some content but not viral), "Low" (boring/clinical category)
- content_potential: "High" (before/after, transformation, taste), "Medium", "Low"
- ugc: "High" (users naturally share results), "Medium", "Low"

SUBSCRIPTION:
- retention: "High" (symptom returns on stopping, daily habit), "Medium" (occasional use), "Low" (one-time or seasonal)

MANUFACTURING:
- complexity: "Low" (commodity ingredients, capsules/powder), "Medium" (custom blend, moderate stability), "High" (novel ingredients, specialized form, cold-chain)

PROMISE — your overall qualitative read across all dimensions (High | Medium | Low). Be skeptical — most opportunities should land Medium, not High.

STARTUP COST TIER — directional capital-intensity judgment, not a dollar estimate:
- Lean: commodity formula, low MOQ
- Moderate: moderate formulation complexity or higher MOQ
- Capital-Intensive: complex formula, clinical ingredients, specialty packaging, high regulatory burden, or extensive R&D

DIFFICULTY — overall operator difficulty (Easy / Medium / Hard):
- Easy: commodity ingredients, white-label friendly, low regulatory risk
- Medium: some R&D, moderate marketing complexity, or niche audience
- Hard: novel ingredients, clinical claims, high competition, or complex ops

LAUNCH SPEED — directional time-to-market judgment, not a day-count estimate:
- Fast: easy / white-label
- Moderate: custom formula
- Slow: complex or regulated requirements

Return ONLY a valid JSON array — no markdown, no code fences, no explanation, no preamble.
Start with [ and end with ].

[
  {
    "name": "2–5 word specific opportunity name",
    "rationale": "one sentence on the biggest opportunity or risk",
    "promise": "High | Medium | Low",
    "startup_cost_tier": "Lean | Moderate | Capital-Intensive",
    "difficulty": "Easy | Medium | Hard",
    "launch_speed": "Fast | Moderate | Slow",
    "scores": {
      "demand": {
        "signal": "Strong | Moderate | Weak"
      },
      "market_saturation": {
        "level": "Low | Medium | High | Very High",
        "barrier": "Low | Medium | High",
        "note": "one sentence on competitive dynamics"
      },
      "virality": {
        "tiktok": "High | Medium | Low",
        "content_potential": "High | Medium | Low",
        "ugc": "High | Medium | Low"
      },
      "subscription": {
        "retention": "High | Medium | Low"
      },
      "manufacturing": {
        "complexity": "Low | Medium | High"
      }
    }
  }
]

Rules:
- Generate exactly 20 opportunities
- Be specific: "Women's Bloating Relief", "Post-Antibiotic Recovery", "GLP-1 Digestive Support" — not "Gut Supplement"
- Vary opportunities across different audiences, mechanisms, and product angles
- Order the array by your own promise judgment, strongest first — this ordering IS the ranking; do not also invent a numeric score to justify it
- Be analytically skeptical — most opportunities should land Medium, not High
- Do not put any number into any field anywhere in this schema, including inside free-text fields like rationale or the market_saturation note — qualitative language only`

// Builds a weekly-refresh system prompt that layers continuity instructions
// on top of the base DISCOVERY_PROMPT. Claude uses the previous list as
// context but still applies all evidence + scoring rules from above.
export function buildRefreshPrompt(
  previous: Array<{ name: string; promise: string }>,
): string {
  const list = previous
    .map((o, i) => `${i + 1}. ${o.name} (promise: ${o.promise})`)
    .join('\n')

  return `${DISCOVERY_PROMPT}

---
WEEKLY REFRESH CONTEXT

Last week's opportunities (reference only — do not copy blindly):
${list}

Refresh rules (apply after all rules above):
- Keep opportunities that remain strong and relevant; use their EXACT same name if retaining them
- Retained opportunities' promise tier may shift one step (e.g. Medium→High) based on current perspective — never invent a numeric score
- Replace 4–6 of the weakest or most stale entries with completely new ideas not in the list above
- New ideas must follow the same specificity and evidence standards as the main prompt
- Return exactly 20 total, sorted by your own promise judgment (best first)`
}

// Augments any system prompt (base or refresh) with Signal Engine data.
// If signals are null or below the minimum confidence threshold the original
// prompt is returned unchanged — the route behaves exactly as before.
export function buildSignalAugmentedSystemPrompt(
  baseSystemPrompt:     string,
  category:             string,
  signals:              AggregatedSignals | null,
  consumerIntelligence?: ConsumerIntelligenceReport | null,
): string {
  if (!signals || signals.overall_confidence < 0.2) return baseSystemPrompt

  const ctx = buildSignalContext(category, signals, consumerIntelligence)
  if (!ctx) return baseSystemPrompt

  return `${baseSystemPrompt}

---
${ctx}---`
}
