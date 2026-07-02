import Anthropic from '@anthropic-ai/sdk'
import type { InvestmentThesis } from '../stage2/types'
import type { Stage1Evidence } from '../evidence/adapter'
import type { KillSwitchEvaluation } from './kill-switches'
import { runAllKillSwitches } from './kill-switches'

const ai    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

// ── Adversarial debate types ───────────────────────────────────────────────

export interface InvestmentCase {
  core_argument:       string        // The 1-paragraph thesis for or against
  strongest_points:    string[]      // 3–5 specific points
  evidence_citations:  string[]      // Which Stage 1 data points support each claim
  key_assumptions:     string[]      // Assumptions the case depends on
  confidence:          number        // 0–1
  confidence_note:     string
}

export interface AdversarialDebateResult {
  bull_case:          InvestmentCase
  bear_case:          InvestmentCase
  conflicts:          string[]       // Where bull and bear directly contradict each other
  unknowns:           string[]       // Key uncertainties neither side can resolve
  kill_switch_flags: {
    patent_blocking:        boolean
    patent_claim_text?:     string
    fda_clearance_required: boolean
    fda_claim_type?:        string
  }
  kill_switches:      KillSwitchEvaluation
  ai_model_version:   string
}

// ── Bull case prompt ──────────────────────────────────────────────────────

function buildBullPrompt(thesis: InvestmentThesis, evidence: Stage1Evidence): string {
  return `You are a venture investor preparing to champion an investment opportunity in a partner meeting.
Your job is to make the STRONGEST POSSIBLE case FOR this product opportunity.
Be specific. Cite real numbers from the market data. Do not hedge.

## Thesis
Product angle: ${thesis.product_angle}
Target customer: ${thesis.target_customer}
Differentiation: ${thesis.differentiation}
Customer pain: ${thesis.customer_pain.problem} (${thesis.customer_pain.pain_intensity} intensity, ${thesis.customer_pain.frequency})

## Market Data (Stage 1 evidence)
${formatEvidenceForPrompt(evidence)}

## Your task

Return a JSON object with this shape:
{
  "core_argument": "1-paragraph bull case — why this is a compelling opportunity",
  "strongest_points": ["specific evidence-backed point 1", "point 2", "point 3", "point 4", "point 5"],
  "evidence_citations": ["which data point from the market data supports strongest_points[0]", ...],
  "key_assumptions": ["the bull case depends on X being true", "..."],
  "confidence": 0.0–1.0,
  "confidence_note": "1 sentence on what would change your view",
  "patent_risk": false or true,
  "patent_claim_text": "describe the risk if true, else null",
  "fda_risk": false or true,
  "fda_claim_type": "describe the regulatory issue if true, else null"
}

Make the strongest honest case you can. Do not invent market facts not in the data above.

Respond with ONLY the JSON object. No preamble. No explanation. Start with { and end with }.`
}

// ── Bear case prompt ──────────────────────────────────────────────────────

function buildBearPrompt(thesis: InvestmentThesis, evidence: Stage1Evidence): string {
  return `You are a skeptical investment committee member stress-testing an investment thesis.
Your job is to find every reason this opportunity could fail — and make those reasons devastating.
Be ruthless. The goal is to surface risks the founder might be too optimistic to see.
You have NOT seen the bull case. Analyze the evidence independently.

## Thesis being evaluated
Product angle: ${thesis.product_angle}
Target customer: ${thesis.target_customer}
Differentiation: ${thesis.differentiation}
Customer pain: ${thesis.customer_pain.problem}

## Market Data (Stage 1 evidence)
${formatEvidenceForPrompt(evidence)}

## Your task

Return a JSON object with this shape:
{
  "core_argument": "1-paragraph bear case — why this is likely to fail",
  "strongest_points": ["specific risk or weakness 1", "risk 2", "risk 3", "risk 4", "risk 5"],
  "evidence_citations": ["which data point from above supports or reveals the risk", ...],
  "key_assumptions": ["the bear case depends on X being true", "..."],
  "confidence": 0.0–1.0,
  "confidence_note": "1 sentence on what would change your view"
}

Do not manufacture risks not supported by the evidence. If the evidence is positive, say so and find structural risks instead.

Respond with ONLY the JSON object. No preamble. No explanation. Start with { and end with }.`
}

// ── Synthesis prompt ──────────────────────────────────────────────────────

function buildSynthesisPrompt(
  bull: InvestmentCase,
  bear: InvestmentCase,
  thesis: InvestmentThesis
): string {
  return `You have two independent investment analyses of the same opportunity. Your job is to identify:
1. Where they directly conflict (one says a fact is a strength, the other says it's a weakness)
2. What neither side can answer — the true unknowns

Thesis: ${thesis.product_angle}

Bull case summary: ${bull.core_argument}
Bull key points: ${bull.strongest_points.join(' | ')}

Bear case summary: ${bear.core_argument}
Bear key points: ${bear.strongest_points.join(' | ')}

Return JSON:
{
  "conflicts": ["Direct conflict 1: bull says X, bear says Y", "Conflict 2: ...", "..."],
  "unknowns": ["Unknown 1: neither side can resolve X without real data", "Unknown 2: ...", "..."]
}

List 3–5 conflicts and 3–5 unknowns. Be specific.`
}

// ── Evidence formatter ────────────────────────────────────────────────────

function formatEvidenceForPrompt(evidence: Stage1Evidence): string {
  const lines: string[] = []
  if (evidence.est_monthly_revenue?.value) lines.push(`Revenue: ~$${Math.round(evidence.est_monthly_revenue.value / 1000)}k/mo avg seller`)
  if (evidence.competitor_count?.value) lines.push(`Meaningful competitors: ${evidence.competitor_count.value}`)
  if (evidence.avg_competitor_reviews?.value) lines.push(`Avg competitor reviews: ${evidence.avg_competitor_reviews.value.toLocaleString()}`)
  if (evidence.review_concentration?.value) lines.push(`Review concentration (top-3): ${Math.round(evidence.review_concentration.value * 100)}%`)
  if (evidence.median_price?.value) lines.push(`Median price: $${evidence.median_price.value}`)
  if (evidence.price_range?.value) lines.push(`Price range: $${evidence.price_range.value.min}–$${evidence.price_range.value.max}`)
  if (evidence.momentum_90d_pct?.value !== undefined) lines.push(`90d momentum: ${evidence.momentum_90d_pct.value}%`)
  if (evidence.trend_direction?.value) lines.push(`Trend: ${evidence.trend_direction.value}`)
  if (evidence.price_compression_pct?.value !== undefined) lines.push(`Price compression (12mo proxy): ${evidence.price_compression_pct.value}%`)
  if (evidence.avg_fba_fee?.value) lines.push(`FBA fee: $${evidence.avg_fba_fee.value.toFixed(2)}`)
  if (evidence.avg_referral_fee_pct?.value) lines.push(`Referral fee: ${evidence.avg_referral_fee_pct.value}%`)
  if (evidence.tiktok_view_count?.value) {
    const v = evidence.tiktok_view_count.value
    lines.push(`TikTok views: ${v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`}`)
  }
  if (evidence.seasonality_pattern?.value) lines.push(`Seasonality: ${evidence.seasonality_pattern.value}`)

  const competitors = evidence.top_competitors?.value?.slice(0, 5)
  if (competitors?.length) {
    lines.push('Top competitors:')
    competitors.forEach((c, i) => {
      lines.push(`  ${i + 1}. ${c.brand} (${c.reviewCount.toLocaleString()} reviews, ★${c.rating}, $${c.price})`)
    })
  }

  return lines.join('\n')
}

// ── Parse helpers ─────────────────────────────────────────────────────────

function extractJSON(text: string): Record<string, unknown> {
  let s = text.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)
  // Strip any trailing fence the model may have appended after the closing }
  const fenceEnd = s.lastIndexOf('```')
  if (fenceEnd > 0) s = s.slice(0, fenceEnd).trim()
  try {
    return JSON.parse(s)
  } catch {
    // Response was truncated mid-token. Close the minimum structure needed.
    let r = s
    // /"[^"]*$/ matches a " followed by non-quote chars to end-of-string,
    // meaning the last string value was opened but never closed.
    if (r.match(/"[^"]*$/)) r += '"'
    // Count and close unclosed arrays and objects (computed on repaired string
    // so the added closing " is factored into the brace/bracket counts).
    const openBrackets = (r.match(/\[/g) ?? []).length - (r.match(/\]/g) ?? []).length
    const openBraces   = (r.match(/\{/g) ?? []).length - (r.match(/\}/g) ?? []).length
    for (let i = 0; i < openBrackets; i++) r += ']'
    for (let i = 0; i < openBraces; i++) r += '}'
    return JSON.parse(r)
  }
}

function parseCase(raw: unknown): InvestmentCase {
  const r = raw as Record<string, unknown>
  return {
    core_argument:      String(r.core_argument ?? ''),
    strongest_points:   (r.strongest_points as string[]) ?? [],
    evidence_citations: (r.evidence_citations as string[]) ?? [],
    key_assumptions:    (r.key_assumptions as string[]) ?? [],
    confidence:         typeof r.confidence === 'number' ? r.confidence : 0.5,
    confidence_note:    String(r.confidence_note ?? ''),
  }
}

// ── Main adversarial function ─────────────────────────────────────────────

export async function runAdversarialDebate(
  thesis:   InvestmentThesis,
  evidence: Stage1Evidence
): Promise<AdversarialDebateResult> {
  // Call 1 (Bull, temp 0.5) and Call 2 (Bear, temp 0.8) run in PARALLEL
  // with NO shared context — they never see each other's output.
  const [bullRaw, bearRaw] = await Promise.all([
    ai.messages.create({
      model:       MODEL,
      max_tokens:  8192,
      temperature: 0.5,
      messages:    [{ role: 'user', content: buildBullPrompt(thesis, evidence) }],
    }),
    ai.messages.create({
      model:       MODEL,
      max_tokens:  8192,
      temperature: 0.8,
      messages:    [{ role: 'user', content: buildBearPrompt(thesis, evidence) }],
    }),
  ])

  const bullContent = bullRaw.content[0]
  const bearContent = bearRaw.content[0]
  if (bullContent.type !== 'text' || bearContent.type !== 'text') {
    throw new Error('Unexpected response type from adversarial AI calls')
  }

  const bullJSON = extractJSON(bullContent.text)
  const bearJSON = extractJSON(bearContent.text)

  const bull = parseCase(bullJSON)
  const bear = parseCase(bearJSON)

  // Extract AI-flagged kill switch signals from bull analysis
  const aiFlags = {
    patent_blocking:        !!(bullJSON.patent_risk),
    patent_claim_text:      bullJSON.patent_claim_text ? String(bullJSON.patent_claim_text) : undefined,
    fda_clearance_required: !!(bullJSON.fda_risk),
    fda_claim_type:         bullJSON.fda_claim_type ? String(bullJSON.fda_claim_type) : undefined,
  }

  // Call 3 (Synthesis, temp 0.3) — receives both outputs, finds conflicts/unknowns
  const synthesisRaw = await ai.messages.create({
    model:       MODEL,
    max_tokens:  1024,
    temperature: 0.3,
    messages:    [{ role: 'user', content: buildSynthesisPrompt(bull, bear, thesis) }],
  })

  const synthesisContent = synthesisRaw.content[0]
  if (synthesisContent.type !== 'text') throw new Error('Unexpected synthesis response type')

  const synthesisJSON = extractJSON(synthesisContent.text) as { conflicts: string[]; unknowns: string[] }

  // Kill switches run AFTER all 3 AI calls — deterministic, cannot be overridden
  const killSwitches = runAllKillSwitches(evidence, thesis, aiFlags)

  return {
    bull_case:          bull,
    bear_case:          bear,
    conflicts:          synthesisJSON.conflicts ?? [],
    unknowns:           synthesisJSON.unknowns ?? [],
    kill_switch_flags:  aiFlags,
    kill_switches:      killSwitches,
    ai_model_version:   MODEL,
  }
}
