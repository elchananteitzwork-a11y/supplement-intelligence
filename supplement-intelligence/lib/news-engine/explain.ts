import Anthropic from '@anthropic-ai/sdk'
import type { NewsItem, NewsSummary } from './types'

// ── News explanation pass — the ONLY LLM step in this whole module ──────────
//
// Runs as a small, separate Claude Haiku call — never merged into the main
// memo-generation prompt/schema (app/api/generate/route.ts fires this in
// parallel with the main Sonnet call, so it adds no latency to the critical
// path and no tokens to the expensive prompt). Input is exactly the real
// items already fetched (headline/date/source/category only — no url, since
// the model has no use for it and it just burns tokens); output is two
// small additions: a short "why it matters" per item, matched back by id,
// and an overall summary. The system prompt is explicit and repeated:
// explain what's given, never add, remove, or alter an item.

const SYSTEM_PROMPT = `You are a market-intelligence analyst. You will be given a list of REAL news items that were already fetched from verified sources (FDA, PubMed, or live news search) — not from your own knowledge.

Your job has exactly two parts:
1. For each item, write a 2-3 sentence explanation of why it matters for someone evaluating this product opportunity.
2. Write one overall summary of what these items collectively suggest about market trajectory.

Hard rules:
- Do NOT invent, add, modify, or omit any item — you are only explaining items you were given, not researching or recalling your own.
- Do NOT state specific facts (numbers, dates, names) beyond what's in the item list. If you don't know a detail, write around it generically rather than guessing.
- new_risks / new_opportunities / key_events must each be drawn directly from the item list — one bullet per relevant item, not invented separately.
- If the item list is empty, you will not be called — never assume that case.

Return ONLY valid JSON, no markdown:
{
  "items": [{ "id": "<id from input>", "why_it_matters": "2-3 sentences" }],
  "summary": {
    "what_changed": "2-3 sentences synthesizing what these items show changed recently",
    "trajectory": "Accelerating | Stable | Slowing",
    "new_risks": ["short phrase", "..."],
    "new_opportunities": ["short phrase", "..."],
    "key_events": ["short phrase", "..."]
  }
}`

interface ExplainResponse {
  items?: { id: string; why_it_matters: string }[]
  summary?: {
    what_changed?:      string
    trajectory?:        string
    new_risks?:         string[]
    new_opportunities?: string[]
    key_events?:        string[]
  }
}

export interface ExplainResult {
  whyItMatters: Map<string, string>
  summary:      NewsSummary
}

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ITEMS_EXIST_NO_SUMMARY: NewsSummary = {
  what_changed:      'Recent items were found, but an AI summary could not be generated for this report.',
  trajectory:        'Unknown',
  new_risks:         [],
  new_opportunities: [],
  key_events:        [],
}

export async function explainNewsIntelligence(
  items:        NewsItem[],
  query:        string,
  categoryName: string,
): Promise<ExplainResult | null> {
  if (!items.length) return null
  if (!process.env.ANTHROPIC_API_KEY) return null

  const inputList = items.map(it => ({
    id: it.id, headline: it.headline, date: it.date.slice(0, 10), source: it.source, category: it.category,
  }))

  try {
    const msg = await ai.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Product idea: "${query}" (category: ${categoryName})\n\nReal items:\n${JSON.stringify(inputList, null, 1)}`,
      }],
    })
    const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    const parsed: ExplainResponse = JSON.parse(cleaned)

    const whyItMatters = new Map<string, string>()
    for (const it of parsed.items ?? []) {
      if (it.id && it.why_it_matters) whyItMatters.set(it.id, it.why_it_matters)
    }

    const trajectory = ['Accelerating', 'Stable', 'Slowing'].includes(parsed.summary?.trajectory ?? '')
      ? (parsed.summary!.trajectory as NewsSummary['trajectory'])
      : 'Unknown'

    const summary: NewsSummary = parsed.summary?.what_changed ? {
      what_changed:      parsed.summary.what_changed,
      trajectory,
      new_risks:         parsed.summary.new_risks ?? [],
      new_opportunities: parsed.summary.new_opportunities ?? [],
      key_events:        parsed.summary.key_events ?? [],
    } : ITEMS_EXIST_NO_SUMMARY

    return { whyItMatters, summary }
  } catch (e: unknown) {
    console.error('[NewsExplain] failed', { error: e instanceof Error ? e.message : e })
    return null
  }
}

export { ITEMS_EXIST_NO_SUMMARY }
