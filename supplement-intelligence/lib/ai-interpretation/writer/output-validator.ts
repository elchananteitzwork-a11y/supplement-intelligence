// ── Output Validation Pipeline Steps 2–4 ────────────────────────────────
// Spec §12 Steps 2, 3, 4. Called independently for each of the three AI calls.
// Step 1 (schema) and Step 6 (final) are in generate.ts.

import type { SynthesisInput } from '../types'
import type { ValidationStepResult, CallCOutput } from './types'

// ── Word count helper ─────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

// ── Step 2: Format validation ─────────────────────────────────────────────
// Spec §12 Step 2 ranges:
//   Causal paragraph:    60–160 words
//   Risk sentence:       10–35 words
//   Thesis headline:     8–25 words
//   Full thesis:         80–200 words

export function validateFormatCausalParagraph(output: string): ValidationStepResult {
  if (!output || output.trim().length === 0) return { passed: false, error: 'Output is empty' }
  const wc = wordCount(output)
  if (wc < 60)  return { passed: false, error: `Too short: ${wc} words (min 60)` }
  if (wc > 160) return { passed: false, error: `Too long: ${wc} words (max 160)` }
  if (!/[.!?]$/.test(output.trim())) return { passed: false, error: 'Output does not end with sentence terminator' }
  return { passed: true }
}

export function validateFormatRiskSentence(output: string): ValidationStepResult {
  if (!output || output.trim().length === 0) return { passed: false, error: 'Output is empty' }
  const wc = wordCount(output)
  if (wc < 10)  return { passed: false, error: `Too short: ${wc} words (min 10)` }
  if (wc > 35)  return { passed: false, error: `Too long: ${wc} words (max 35)` }
  if (!/\.$/.test(output.trim())) return { passed: false, error: 'Risk sentence must end with a period' }
  return { passed: true }
}

export function validateFormatProductThesis(parsed: CallCOutput): ValidationStepResult {
  if (!parsed.headline || parsed.headline.trim().length === 0) return { passed: false, error: 'headline field is empty' }
  if (!parsed.full_thesis || parsed.full_thesis.trim().length === 0) return { passed: false, error: 'full_thesis field is empty' }

  const headlineWc = wordCount(parsed.headline)
  if (headlineWc < 8)  return { passed: false, error: `headline too short: ${headlineWc} words (min 8)` }
  if (headlineWc > 25) return { passed: false, error: `headline too long: ${headlineWc} words (max 25)` }

  const thesisWc = wordCount(parsed.full_thesis)
  if (thesisWc < 80)  return { passed: false, error: `full_thesis too short: ${thesisWc} words (min 80)` }
  if (thesisWc > 200) return { passed: false, error: `full_thesis too long: ${thesisWc} words (max 200)` }

  if (!/[.!?]$/.test(parsed.full_thesis.trim())) return { passed: false, error: 'full_thesis does not end with sentence terminator' }
  return { passed: true }
}

// ── Step 3: Hallucination pattern detection ───────────────────────────────
// Patterns from Spec §12 Step 3 and §8.2.
// Each pattern is tested independently so the caller knows which fired.

interface PatternCheck {
  name:    string
  test:    (text: string, input: SynthesisInput) => boolean
}

const PATTERNS: PatternCheck[] = [
  {
    // AT-HALL-001, AT-REV-001: Revenue / income figures (NOT price references)
    // Fires only when a $ amount is followed by a scale suffix (M, B, million, etc.)
    // Plain prices like "$29" or "$34.99" are allowed — they are price data, not revenue claims.
    name: 'revenue_figure',
    test: (text) => /\$[\d,]+\.?\d*\s*(million|billion|M\b|B\b|k\b|thousand)/i.test(text),
  },
  {
    // AT-HALL-005: Year references not present in analysis_date
    name: 'year_reference',
    test: (text, input) => {
      const matches = text.match(/\b20\d{2}\b/g) ?? []
      const analysisYear = input.analysis_date.slice(0, 4)
      return matches.some(year => year !== analysisYear)
    },
  },
  {
    // AT-HALL-004: Probability language
    // Spec §8.1 constraint 4, AT-HALL-004 pattern
    name: 'probability_language',
    test: (text) =>
      /\b(likely to succeed|high chance of|will probably|expected to|projected to|probability of success)\b/i.test(text),
  },
  {
    // Spec §8.1 constraint 5: Personal directive language
    name: 'personal_directive',
    test: (text) =>
      /\b(you should|we recommend|the founder\s+(needs|must|should))\b/i.test(text),
  },
  {
    // Spec §8.1 constraint 7: Provider names
    name: 'provider_name',
    test: (text) =>
      /\b(DataForSEO|Apify|Axesso|Keepa|junglee|Amazon crawler)\b/i.test(text),
  },
  {
    // Spec §8.2: Growth claims without data
    name: 'unsupported_growth',
    test: (text, input) => {
      const growthKeywords = /\b(growing rapidly|explosive growth|massive growth)\b/i
      if (!growthKeywords.test(text)) return false
      return input.keyword_summary?.trend_direction !== 'UP'
    },
  },
  {
    // Spec §8.2: Unsupported superlatives
    name: 'superlative',
    test: (text) =>
      /\b(massive opportunity|huge market|enormous potential|blue ocean|first mover advantage|unique opportunity)\b/i.test(text),
  },
  {
    // Spec §8.2: Personal possessives
    name: 'personal_possessive',
    test: (text) =>
      /\b(your business|your product|your target customers|your brand)\b/i.test(text),
  },
  {
    // Spec §8.2: Regulatory hallucination
    name: 'regulatory_hallucination',
    test: (text) =>
      /\b(FDA is cracking down|regulatory concerns are mounting|facing regulatory)\b/i.test(text),
  },
  {
    // Spec §8.2: Non-answers
    name: 'non_answer',
    test: (text) =>
      /\b(it depends|could go either way|hard to say)\b/i.test(text),
  },
]

export function detectHallucinationPatterns(
  text: string,
  input: SynthesisInput,
): ValidationStepResult {
  const matched: string[] = []

  for (const check of PATTERNS) {
    if (check.test(text, input)) {
      matched.push(check.name)
    }
  }

  if (matched.length === 0) return { passed: true }

  return {
    passed:  false,
    error:   `Forbidden pattern(s) detected: ${matched.join(', ')}`,
    pattern: matched.join(', '),
  }
}

// ── Step 4: Evidence grounding ────────────────────────────────────────────
// Spec §12 Step 4.

// Returns all numeric values from SynthesisInput that could appear in AI output
function extractInputNumbers(input: SynthesisInput): number[] {
  const nums: number[] = []
  if (input.demand_calibration?.monthly_search_volume) nums.push(input.demand_calibration.monthly_search_volume)
  if (input.demand_calibration?.keepa_monthly_units) nums.push(input.demand_calibration.keepa_monthly_units)
  if (input.demand_calibration?.price_range) {
    nums.push(input.demand_calibration.price_range.median, input.demand_calibration.price_range.p25, input.demand_calibration.price_range.p75)
  }
  if (input.competitor_context) {
    nums.push(input.competitor_context.meaningful_competitor_count, input.competitor_context.avg_review_count)
    input.competitor_context.top_competitors.forEach(c => { nums.push(c.price, c.review_count) })
  }
  input.consumer_clusters.forEach(c => { nums.push(c.frequency, c.frequency_pct) })
  input.signals.forEach(s => nums.push(s.score))
  if (input.keyword_summary) {
    nums.push(input.keyword_summary.total_monthly_volume)
    input.keyword_summary.top_3_keywords.forEach(k => nums.push(k.volume))
  }
  if (input.corpus_size) nums.push(input.corpus_size)
  return nums.filter(n => n > 0)
}

// Check if a number from SynthesisInput appears verbatim in the text
// Accepts: raw number, comma-formatted, with/without decimal
function numberAppearsInText(n: number, text: string): boolean {
  const plain  = String(Math.round(n))
  const commas = Math.round(n).toLocaleString('en-US')
  return text.includes(plain) || text.includes(commas)
}

export function checkCausalParagraphGrounding(
  output: string,
  input: SynthesisInput,
): ValidationStepResult {
  const nums = extractInputNumbers(input)
  if (nums.length === 0) return { passed: true }  // no numbers in input → can't check

  const hasNumber = nums.some(n => numberAppearsInText(n, output))
  if (hasNumber) return { passed: true }

  return {
    passed: false,
    error:  'No numeric value from SynthesisInput appears verbatim in the causal paragraph',
  }
}

export function checkRiskSentenceGrounding(
  output: string,
  input: SynthesisInput,
): ValidationStepResult {
  // At least one value from primary_risk.evidence must appear in output
  const ev = input.primary_risk.evidence
  const nums: number[] = [
    ev.review_moat_score, ev.meaningful_competitor_count, ev.avg_review_count,
    ev.review_concentration_ratio, ev.cogs_ratio, ev.corpus_size,
    ev.top_keyword_pct, ev.moq_min, ev.unit_cost_min, ev.demand_signal_count,
    ev.market_accessibility_score, ev.competitor_formula_similarity,
  ].filter((n): n is number => n !== undefined && n !== null)

  if (nums.length === 0) {
    // No numeric evidence — check for text evidence (keyword name)
    if (ev.top_keyword && output.toLowerCase().includes(ev.top_keyword.toLowerCase())) {
      return { passed: true }
    }
    // If no evidence at all, grounding check passes vacuously
    return { passed: true }
  }

  const hasNum = nums.some(n => numberAppearsInText(n, output))
  if (hasNum) return { passed: true }

  return {
    passed: false,
    error:  'Risk sentence does not reference any numeric value from primary_risk.evidence',
  }
}

export function checkProductThesisGrounding(
  output: CallCOutput,
  input: SynthesisInput,
): ValidationStepResult {
  if (input.consumer_clusters.length === 0) return { passed: true }  // nothing to check

  const combinedText = `${output.headline} ${output.full_thesis}`.toLowerCase()
  const hasLabel = input.consumer_clusters.some(c =>
    combinedText.includes(c.label.toLowerCase()),
  )

  if (hasLabel) return { passed: true }

  return {
    passed: false,
    error:  'Product thesis does not contain any consumer_cluster.label from SynthesisInput',
  }
}

// ── Convenience: parse Call C JSON output ────────────────────────────────

export function parseCallCJson(raw: string): CallCOutput | null {
  try {
    // Strip markdown code fences if the model wraps in ```json
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned) as Record<string, unknown>
    if (typeof parsed.headline === 'string' && typeof parsed.full_thesis === 'string') {
      return { headline: parsed.headline, full_thesis: parsed.full_thesis }
    }
    return null
  } catch {
    return null
  }
}
