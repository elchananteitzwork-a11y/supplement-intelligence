// ── Scoped AI Prompts ─────────────────────────────────────────────────────
// Spec §8.1 hard constraints embedded in every system prompt.
// Each function returns { system, user } ready for the Anthropic messages API.

import type { SynthesisInput } from '../types'
import type { CallBInput, CallCInput } from './types'

// ── Shared system prompt preamble (§8.1 hard constraints) ─────────────────

const SHARED_CONSTRAINTS = `
HARD CONSTRAINTS — violating any of these is grounds for automatic rejection:
1. Every numeric claim must reference a value supplied in the data payload. Do not invent numbers.
2. Do not reference years other than the analysis_date year.
3. Do not use revenue figures, income claims, or profit projections (e.g., "$2M market").
4. Do not use probability language: "likely to succeed", "high chance of", "will probably", "projected to", "probability of success".
5. Do not use personal directives: "you should", "we recommend", "the founder needs/must/should".
6. Do not name data providers (DataForSEO, Keepa, Apify, Axesso, etc.).
7. Do not use unsupported superlatives: "massive opportunity", "huge market", "enormous potential", "blue ocean", "first mover advantage".
8. Do not use personal possessives: "your business", "your product", "your brand".
9. Do not use non-answer phrases: "it depends", "could go either way", "hard to say".
10. Do not use regulatory speculation: "FDA is cracking down", "regulatory concerns are mounting".
`.trim()

// ── Call A: Causal Paragraph ──────────────────────────────────────────────
// Input: full SynthesisInput
// Output: plain text, 60–160 words

export function buildCallAPrompts(input: SynthesisInput): { system: string; user: string } {
  const system = `You are a market analysis engine writing a factual causal paragraph for a product intelligence report.

${SHARED_CONSTRAINTS}

Output format:
- Plain prose, NO markdown, NO headers, NO bullet points
- 3–4 sentences, 60–160 words total
- End with a punctuation mark (period, exclamation point, or question mark)
- Write in the third person (about the market and category, not to the reader)
- Explain WHY the market score is what it is — causal reasoning, not just descriptions
- Reference specific numeric values from the data: search volume, review counts, competitor counts, or price ranges
- State signal strengths factually; do not editorialize`

  const user = buildCallAUserMessage(input)
  return { system, user }
}

function buildCallAUserMessage(input: SynthesisInput): string {
  const score = input.overall_score
  const verdict = input.verdict.replace(/_/g, ' ').toLowerCase()

  const lines: string[] = [
    `ANALYSIS: ${input.query} (${input.category}) — Score ${score}/100 — Verdict: ${verdict}`,
    `Analysis date: ${input.analysis_date}`,
    '',
    'SIGNAL SCORES:',
  ]

  input.signals.forEach(s => {
    lines.push(`  ${s.id}: ${s.score}/10 [${s.confidence}] — ${s.headline}`)
  })

  if (input.demand_calibration?.monthly_search_volume) {
    lines.push(`\nSEARCH DEMAND: ${input.demand_calibration.monthly_search_volume.toLocaleString()} monthly searches`)
  }
  if (input.demand_calibration?.keepa_monthly_units) {
    lines.push(`SALES VOLUME: ~${input.demand_calibration.keepa_monthly_units.toLocaleString()} units/month (marketplace estimate)`)
  }
  if (input.demand_calibration?.price_range) {
    const pr = input.demand_calibration.price_range
    lines.push(`PRICE RANGE: $${pr.p25}–$${pr.p75}, median $${pr.median}`)
  }

  if (input.competitor_context) {
    const cc = input.competitor_context
    lines.push(`\nCOMPETITOR LANDSCAPE: ${cc.meaningful_competitor_count} established competitors`)
    lines.push(`  Average review count: ${cc.avg_review_count.toLocaleString()}`)
    lines.push(`  Review concentration ratio: ${cc.review_concentration_ratio.toFixed(2)}`)
    if (cc.top_competitors.length > 0) {
      lines.push('  Top competitors (brand, price, review count):')
      cc.top_competitors.forEach(c => {
        lines.push(`    ${c.brand} — $${c.price} — ${c.review_count.toLocaleString()} reviews`)
      })
    }
  }

  if (input.keyword_summary) {
    const ks = input.keyword_summary
    lines.push(`\nKEYWORD INTELLIGENCE: ${ks.total_monthly_volume.toLocaleString()} total monthly searches — trend: ${ks.trend_direction}`)
    if (ks.top_3_keywords.length) {
      lines.push('  Top keywords:')
      ks.top_3_keywords.forEach(k => lines.push(`    "${k.keyword}": ${k.volume.toLocaleString()}/mo`))
    }
  }

  if (input.consumer_clusters.length) {
    lines.push('\nCONSUMER COMPLAINTS:')
    input.consumer_clusters.forEach(c => {
      lines.push(`  ${c.label}: ${c.frequency_pct}% of ${input.corpus_size} reviews [${c.sentiment}]`)
    })
  } else if (input.thin_corpus) {
    lines.push(`\nCONSUMER DATA: thin corpus (${input.corpus_size} reviews — insufficient for pattern detection)`)
  }

  if (input.primary_risk) {
    const r = input.primary_risk
    lines.push(`\nPRIMARY RISK: ${r.type} [${r.severity}]`)
  }

  if (input.confidence_flags.length) {
    lines.push(`\nCONFIDENCE FLAGS: ${input.confidence_flags.map(f => f.code).join(', ')}`)
  }

  lines.push('\nWrite the causal paragraph now.')
  return lines.join('\n')
}

// ── Call B: Risk Sentence ──────────────────────────────────────────────────
// Input: minimal risk context
// Output: one sentence, 10–35 words, ending with period

export function buildCallBPrompts(input: CallBInput): { system: string; user: string } {
  const system = `You are a market risk analyst writing a single sentence for a product intelligence report.

${SHARED_CONSTRAINTS}

Output format:
- EXACTLY one sentence
- 10–35 words
- Must end with a period
- Plain prose — NO markdown, NO lists
- State the primary risk, its severity evidence, and why it matters to market entry
- Reference at least one specific numeric value from the evidence provided`

  const user = buildCallBUserMessage(input)
  return { system, user }
}

function buildCallBUserMessage(input: CallBInput): string {
  const { query, primary_risk, meaningful_competitor_count, thin_corpus } = input
  const { type, severity, evidence } = primary_risk

  const lines: string[] = [
    `PRODUCT CATEGORY: ${query}`,
    `PRIMARY RISK: ${type} [${severity}]`,
    `Competitor count: ${meaningful_competitor_count ?? 'unknown'}`,
    `Thin consumer data: ${thin_corpus}`,
    '',
    'RISK EVIDENCE:',
  ]

  const ev = evidence as Record<string, unknown>
  Object.entries(ev).forEach(([k, v]) => {
    if (v !== undefined && v !== null) {
      lines.push(`  ${k}: ${v}`)
    }
  })

  lines.push('\nWrite the risk sentence now.')
  return lines.join('\n')
}

// ── Call C: Product Thesis ─────────────────────────────────────────────────
// Input: consumer + competitor + manufacturing + demand context
// Output: JSON { headline: string, full_thesis: string }
// headline: 8–25 words; full_thesis: 80–200 words

export function buildCallCPrompts(input: CallCInput): { system: string; user: string } {
  const system = `You are a product strategist writing a concise product opportunity thesis for a product intelligence report.

${SHARED_CONSTRAINTS}

Output format:
- JSON object with exactly two keys: "headline" and "full_thesis"
- headline: 8–25 words, a sharply stated product opportunity
- full_thesis: 80–200 words, 4–5 sentences, ending with a punctuation mark
- full_thesis must mention at least one consumer cluster label from the data
- Do NOT wrap in markdown code fences
- Reference specific numbers: review counts, prices, costs, complaint frequencies
- Focus on WHAT to build and WHY — rooted entirely in the evidence provided`

  const user = buildCallCUserMessage(input)
  return { system, user }
}

function buildCallCUserMessage(input: CallCInput): string {
  const { query, consumer_clusters, competitor_context, manufacturing_context, demand_calibration } = input

  const lines: string[] = [`PRODUCT CATEGORY: ${query}`, '']

  if (consumer_clusters.length) {
    lines.push('CONSUMER COMPLAINT CLUSTERS:')
    consumer_clusters.forEach(c => {
      lines.push(`  "${c.label}": ${c.frequency_pct}% of reviews [${c.sentiment}]`)
    })
    lines.push('')
  }

  if (competitor_context) {
    const cc = competitor_context
    lines.push(`COMPETITIVE LANDSCAPE: ${cc.meaningful_competitor_count} competitors`)
    lines.push(`  Review concentration ratio: ${cc.review_concentration_ratio.toFixed(2)}`)
    cc.top_competitors.forEach(c => {
      lines.push(`  ${c.brand}: $${c.price}, ${c.review_count.toLocaleString()} reviews`)
    })
    lines.push('')
  }

  if (manufacturing_context) {
    const m = manufacturing_context
    lines.push('MANUFACTURING:')
    if (m.moq_range) lines.push(`  MOQ: ${m.moq_range.min}–${m.moq_range.max} units`)
    if (m.unit_cost_range) lines.push(`  Unit cost: $${m.unit_cost_range.min}–$${m.unit_cost_range.max}`)
    lines.push(`  Feasibility: ${m.feasibility}`)
    lines.push('')
  }

  if (demand_calibration) {
    const dc = demand_calibration
    if (dc.monthly_search_volume) lines.push(`SEARCH DEMAND: ${dc.monthly_search_volume.toLocaleString()} monthly searches`)
    if (dc.price_range) lines.push(`PRICE RANGE: $${dc.price_range.p25}–$${dc.price_range.p75}, median $${dc.price_range.median}`)
    lines.push('')
  }

  lines.push('Respond with JSON only. Write the product thesis now.')
  return lines.join('\n')
}

// ── Retry augmentation ────────────────────────────────────────────────────
// Called when the first attempt fails validation.
// Appends specific guidance about what failed to avoid on retry.

export function augmentUserMessageForRetry(
  originalUser: string,
  failureReason: string,
): string {
  return `${originalUser}\n\nPREVIOUS ATTEMPT FAILED: ${failureReason}\nFix the specific issue above. All constraints still apply.`
}
