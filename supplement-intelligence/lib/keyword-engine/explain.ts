import Anthropic from '@anthropic-ai/sdk'
import type { KeywordIntelligence, KeywordAIInsights } from './types'

// ── Keyword AI Insights pass — the ONLY LLM step in this whole module ──
//
// Mirrors lib/news-engine/explain.ts exactly: a small, separate Claude
// Haiku call, never merged into the main memo-generation prompt/schema.
// Fired in app/api/generate/route.ts after the deterministic enrichment
// (build.ts) completes, in parallel with the main Sonnet call — adds no
// latency to the critical path and no tokens to the expensive prompt.
//
// Input is exactly the real/computed numbers already produced by
// derive.ts and cluster.ts (cluster names + sizes, top opportunity-score
// keywords, real volumes/growth/CPC) — never the full keyword list, to
// keep tokens bounded. The model's job is to describe and prioritize
// these already-real numbers in prose; it cannot introduce a new metric,
// because none of its output is read back into any numeric field.

const SYSTEM_PROMPT = `You are a keyword/SEO strategy analyst. You will be given REAL, already-computed keyword data (search volumes, growth, competition, difficulty, CPC, and deterministic opportunity scores) for a product idea — not your own knowledge of the category.

Your job is to write a concise strategic narrative interpreting this real data. You do not have access to any data beyond what's given below — do not state a specific number that isn't already in the input.

Hard rules:
- Every number you reference must come from the input. Do not invent a search volume, growth %, or score.
- If the input is sparse, say so plainly rather than padding with generic claims.
- Keep each field to 2-4 sentences.

Return ONLY valid JSON, no markdown:
{
  "summary":           "2-3 sentence overview of what this keyword data shows about the opportunity",
  "top_opportunities":  "the best real opportunities and why, citing real keywords/numbers from the input",
  "biggest_risks":      "the biggest keyword-driven risks (e.g. high difficulty, high CPC, low volume) citing real numbers",
  "hidden_demand":      "any real demand signal that isn't obvious at a glance (e.g. a fast-growing low-volume keyword)",
  "keyword_strategy":   "which clusters/keywords to prioritize first and why",
  "seo_strategy":       "organic/content strategy implied by the real difficulty and intent data",
  "amazon_strategy":    "Amazon-specific strategy implied by the real competition/PPC data — note clearly if the PPC figures are estimates, not Amazon Ads data",
  "google_strategy":    "Google/paid-search strategy implied by the real CPC and competition data"
}`

interface ExplainResponse {
  summary?:           string
  top_opportunities?: string
  biggest_risks?:     string
  hidden_demand?:      string
  keyword_strategy?:   string
  seo_strategy?:        string
  amazon_strategy?:     string
  google_strategy?:     string
}

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Bounded summary of the real/computed data — not the full keyword list —
// so this call stays small and fast regardless of how many keywords DataForSEO returned.
function summarizeForPrompt(ki: KeywordIntelligence) {
  const topByOpportunity = [...(ki.top_buying ?? [])]
    .concat(ki.opportunity ?? [])
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0))
    .slice(0, 8)
    .map(m => ({
      keyword: m.keyword, monthly_searches: m.monthly_searches, growth_pct: m.growth_pct,
      competition: m.competition, difficulty: m.difficulty, cpc: m.cpc,
      opportunity_score: m.opportunity_score, search_intent: m.search_intent,
    }))

  return {
    seed_keyword:  ki.seed_keyword,
    confidence:    ki.confidence,
    clusters:      (ki.clusters ?? []).map(c => ({ label: c.label, count: c.keywords.length })),
    seasonality:   ki.seasonality,
    top_by_opportunity_score: topByOpportunity,
    white_space_count:        ki.opportunities?.white_space.length ?? 0,
    fastest_growing:           (ki.opportunities?.fastest_growing ?? []).slice(0, 5).map(m => ({ keyword: m.keyword, growth_pct: m.growth_pct })),
  }
}

export async function explainKeywordIntelligence(
  ki:           KeywordIntelligence,
  query:        string,
  categoryName: string,
): Promise<KeywordAIInsights | null> {
  if (!ki.top_buying.length && !ki.opportunity.length) return null
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const msg = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Product idea: "${query}" (category: ${categoryName})\n\nReal keyword data:\n${JSON.stringify(summarizeForPrompt(ki), null, 1)}`,
      }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed: ExplainResponse = JSON.parse(cleaned)

    if (!parsed.summary) return null

    return {
      summary:           parsed.summary,
      top_opportunities: parsed.top_opportunities ?? '',
      biggest_risks:     parsed.biggest_risks ?? '',
      hidden_demand:     parsed.hidden_demand ?? '',
      keyword_strategy:  parsed.keyword_strategy ?? '',
      seo_strategy:      parsed.seo_strategy ?? '',
      amazon_strategy:   parsed.amazon_strategy ?? '',
      google_strategy:   parsed.google_strategy ?? '',
      generated_at:      new Date().toISOString(),
    }
  } catch (e: unknown) {
    console.error('[KeywordExplain] failed', { error: e instanceof Error ? e.message : e })
    return null
  }
}
