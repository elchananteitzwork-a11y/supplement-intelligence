import Anthropic from '@anthropic-ai/sdk'
import type { InvestmentThesis } from '../stage2/types'
import type { Stage1Evidence } from '../evidence/adapter'
import type { AdversarialDebateResult } from '../stage3/adversarial'
import type { FullUnitEconomics } from './unit-economics'
import type { MarketVerdict, FounderVerdict } from './verdict'
import type { FounderFitAnnotation } from '../stage2/types'

const ai    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`AI call timed out after ${ms}ms`)), ms)
    ),
  ])
}

// ── Memo sections ─────────────────────────────────────────────────────────
// These are the 10 AI-written prose sections of the investment memo.
// The AI CANNOT generate verdicts or economic computations — those are
// injected as structured data from the deterministic engines above.

export interface MemoSections {
  executive_summary:      string
  market_opportunity:     string
  competitive_landscape:  string
  product_strategy:       string
  customer_thesis:        string
  risk_analysis:          string
  unit_economics_narrative: string
  go_to_market:           string
  key_milestones:         string
  final_considerations:   string
}

export interface InvestmentMemo {
  sections:          MemoSections
  market_verdict:    MarketVerdict
  founder_verdict:   FounderVerdict | null
  freshness_notice:  string
  ai_model_version:  string
}

// ── Prompt ────────────────────────────────────────────────────────────────

function buildMemoPrompt(
  thesis:       InvestmentThesis,
  evidence:     Stage1Evidence,
  debate:       AdversarialDebateResult,
  economics:    FullUnitEconomics,
  marketVerdict: MarketVerdict,
  founderFit?:  FounderFitAnnotation
): string {
  const evLines: string[] = []
  if (evidence.est_monthly_revenue?.value)      evLines.push(`Market avg revenue: $${Math.round(evidence.est_monthly_revenue.value / 1000)}k/mo`)
  if (evidence.top_seller_revenue?.value)       evLines.push(`Top seller revenue: $${Math.round(evidence.top_seller_revenue.value / 1000)}k/mo (category ceiling)`)
  if (evidence.est_monthly_units_sold?.value)   evLines.push(`Monthly units sold (avg top sellers): ${evidence.est_monthly_units_sold.value.toLocaleString()} units/mo`)
  if (evidence.avg_market_rating?.value)        evLines.push(`Avg market rating (Keepa bestsellers): ★${evidence.avg_market_rating.value.toFixed(1)}`)
  if (evidence.competitor_count?.value)          evLines.push(`Meaningful competitors: ${evidence.competitor_count.value}`)
  if (evidence.median_price?.value)              evLines.push(`Median price: $${evidence.median_price.value}`)
  if (evidence.momentum_90d_pct?.value !== undefined) evLines.push(`90d momentum: ${evidence.momentum_90d_pct.value}%`)
  if (evidence.price_compression_pct?.value !== undefined) evLines.push(`Price compression (12mo proxy): ${evidence.price_compression_pct.value}%`)
  if (evidence.avg_fba_fee?.value)               evLines.push(`Avg FBA fee: $${evidence.avg_fba_fee.value.toFixed(2)}`)
  if (evidence.avg_referral_fee_pct?.value)      evLines.push(`Referral fee: ${evidence.avg_referral_fee_pct.value}%`)

  // Ranking difficulty
  const rd = evidence.ranking_difficulty?.value
  if (rd) {
    evLines.push(`Ranking difficulty: ${rd.page1_difficulty} (reviews to compete: ${rd.reviews_to_compete.toLocaleString()}, median top-5: ${rd.median_reviews_top5.toLocaleString()})`)
    if (rd.is_review_protected) evLines.push('Review protection flag: YES — incumbent moat via review volume')
  }

  // PPC economics
  const ppc = evidence.ppc_economics?.value
  if (ppc) {
    evLines.push(`PPC risk: ${ppc.ppc_risk_level} — ${ppc.risk_reason}`)
    if (ppc.est_acos_pct !== null) evLines.push(`Est. ACOS at launch: ${ppc.est_acos_pct}% (Google CPC-derived; label as estimate in prose)`)
    if (ppc.headroom_after_ads !== null) evLines.push(`Net revenue after ads (before COGS): $${ppc.headroom_after_ads.toFixed(2)}/unit`)
    evLines.push(`Paid launch viable: ${ppc.paid_viable ? 'YES' : 'NO (paid acquisition not economically viable at current price point)'}`)
  }

  // Regulatory intelligence
  const reg = evidence.regulatory_intelligence?.value
  if (reg) {
    evLines.push(`Regulatory risk (OpenFDA/FAERS): ${reg.risk_level} — ${reg.risk_summary}`)
    if (reg.adverse_events) {
      const ae = reg.adverse_events
      evLines.push(`  FAERS total reports: ${ae.total_reports.toLocaleString()} · deaths: ${ae.death_count} · hospitalizations: ${ae.hospitalization_count}`)
      if (ae.top_reactions.length) evLines.push(`  Top reported reactions: ${ae.top_reactions.slice(0, 4).join(', ')}`)
    }
    if (reg.recalls && reg.recalls.total_recalls > 0) {
      evLines.push(`  Recalls on record: ${reg.recalls.total_recalls} (Class I: ${reg.recalls.class_i_recalls}, Class II: ${reg.recalls.class_ii_recalls})`)
    }
    if (reg.warning_flags.length) {
      evLines.push(`  Regulatory flags: ${reg.warning_flags.join(' | ')}`)
    }
    evLines.push(`  Note for prose: ${reg.disclaimer}`)
  }

  const econBase = economics.sensitivity.base_case
  const revEnv   = economics.revenue_envelope

  return `You are writing a structured investment memo for a supplement entrepreneur evaluating a specific opportunity. Your job is to produce clear, specific, honest prose that helps the founder make a decision.

## Thesis Being Evaluated
Product angle: ${thesis.product_angle}
Target customer: ${thesis.target_customer}
Differentiation: ${thesis.differentiation}
Customer pain: ${thesis.customer_pain.problem} (${thesis.customer_pain.pain_intensity}, ${thesis.customer_pain.frequency})

## Market Data (all from Stage 1 — real provider data, no AI synthesis)
${evLines.join('\n')}

## Adversarial Debate Summary
Bull case: ${debate.bull_case.core_argument}
Bear case: ${debate.bear_case.core_argument}
Key conflicts: ${debate.conflicts.slice(0, 3).join(' | ')}
Key unknowns: ${debate.unknowns.slice(0, 3).join(' | ')}

## Economics (computed deterministically — do NOT override these numbers)
Breakeven COGS at ${econBase.target_gm_pct}% GM target: $${econBase.breakeven_cogs.toFixed(2)}/unit
Price point: $${econBase.price}
FBA + referral costs: $${(econBase.fba_fee + econBase.price * econBase.referral_pct / 100).toFixed(2)}/unit
Conservative monthly revenue (2% share): $${(revEnv.conservative_monthly / 1000).toFixed(1)}k
Base case monthly revenue (10% share): $${(revEnv.base_monthly / 1000).toFixed(1)}k

## Market Verdict (deterministic — do NOT restate or contradict)
Verdict: ${marketVerdict.code}
Headline: ${marketVerdict.headline}
${founderFit ? `Founder fit rank: ${founderFit.fit_rank}/5` : ''}

## Your task

Write the 10-section investment memo. Each section should be 2–4 concise paragraphs. Write for a founder reading this alone — direct, specific, no filler.

Return JSON:
{
  "executive_summary": "...",
  "market_opportunity": "...",
  "competitive_landscape": "...",
  "product_strategy": "...",
  "customer_thesis": "...",
  "risk_analysis": "...",
  "unit_economics_narrative": "...",
  "go_to_market": "...",
  "key_milestones": "...",
  "final_considerations": "..."
}

Do NOT include the verdict codes or numeric verdicts in the prose — those are injected separately.
Do NOT invent market statistics not provided above.
The risk_analysis section must cite the adversarial bear case specifically.
The unit_economics_narrative must reference the $${econBase.breakeven_cogs.toFixed(2)} COGS ceiling explicitly.`
}

// ── Parse response ─────────────────────────────────────────────────────────

const REQUIRED_SECTIONS: (keyof MemoSections)[] = [
  'executive_summary', 'market_opportunity', 'competitive_landscape', 'product_strategy',
  'customer_thesis', 'risk_analysis', 'unit_economics_narrative', 'go_to_market',
  'key_milestones', 'final_considerations',
]

function parseMemoResponse(raw: string): MemoSections {
  let s = raw.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/m, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)
  const parsed = JSON.parse(s) as Record<string, unknown>
  for (const key of REQUIRED_SECTIONS) {
    if (typeof parsed[key] !== 'string' || !parsed[key]) {
      parsed[key] = '[Section unavailable — AI response was incomplete]'
    }
  }
  return parsed as unknown as MemoSections
}

// ── Main entry point ───────────────────────────────────────────────────────

export async function generateInvestmentMemo(
  thesis:        InvestmentThesis,
  evidence:      Stage1Evidence,
  debate:        AdversarialDebateResult,
  economics:     FullUnitEconomics,
  marketVerdict: MarketVerdict,
  founderVerdict: FounderVerdict | null,
  founderFit?:   FounderFitAnnotation
): Promise<InvestmentMemo> {
  const prompt = buildMemoPrompt(thesis, evidence, debate, economics, marketVerdict, founderFit)

  const msg = await withTimeout(ai.messages.create({
    model:       MODEL,
    max_tokens:  4096,
    temperature: 0.3,
    messages:    [{ role: 'user', content: prompt }],
  }), 90_000)

  const content = msg.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from memo AI call')

  const sections = parseMemoResponse(content.text)

  const freshness_notice =
    `Market data collected: ${evidence.providers_used?.value?.join(', ') ?? 'unknown providers'}. ` +
    `Signal data expires after 30 days. Prices, competition, and market conditions may have changed. ` +
    `Verify all figures before making capital commitments.`

  return {
    sections,
    market_verdict:  marketVerdict,
    founder_verdict: founderVerdict,
    freshness_notice,
    ai_model_version: MODEL,
  }
}
