import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAuthClient, fetchAnalysisComparisonItems, UUID_RE } from '../buildComparisonItems'
import { buildComparisonTable } from './format'
import { checkRateLimit, COMPARE_RECOMMEND_LIMIT } from '@/lib/rate-limit'
import { handleProviderError, classifyProviderError } from '@/lib/provider-errors'
import { sleep } from '@/lib/review-collector/retry'

export const maxDuration = 60

const ai    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'
const MAX_RECOMMEND_ATTEMPTS = 3
const ANTHROPIC_ATTEMPT_TIMEOUT_MS = 30_000

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

// POST /api/research/compare/recommend
// Body: { ids: string[] } — analyses ids, NOT a client-supplied items array.
//
// Pre-beta security audit fix (2026-07-21): this route used to accept
// `{ items: AnalysisComparisonItem[] }` straight from the request body with
// no re-fetch, no ownership check, and no rate limit — an authenticated
// caller could feed fabricated scores/verdicts or another user's real
// analysis_id into the LLM prompt, and could hit this Sonnet-tier endpoint
// at unlimited frequency with an unbounded items array. Fixed by: (1)
// taking only `ids` and re-deriving every field server-side via the exact
// same real, RLS-scoped function the GET /compare route uses
// (fetchAnalysisComparisonItems — same source of truth, not a second
// implementation), (2) checkRateLimit before any provider call, matching
// every other Anthropic-calling route in this codebase, (3) the same
// bounded transient-error retry logic added to /api/discover and
// /api/generate for the identical disclosed 529-overload incident.
export async function POST(req: NextRequest) {
  const sb = supabaseAuthClient()
  const { data: { user }, error: authError } = await sb.auth.getUser()
  if (authError || !user) return err('Unauthorized', 401)

  if (!(await checkRateLimit(user.id, COMPARE_RECOMMEND_LIMIT))) {
    return err('Too many requests — please wait a moment', 429)
  }

  let body: { ids?: string[] }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const ids = (body.ids ?? []).map(s => String(s).trim()).filter(Boolean).slice(0, 4)
  if (ids.length < 2) return err('At least 2 analysis ids required')
  if (ids.some(id => !UUID_RE.test(id))) return err('Invalid analysis id')

  const { items, error: fetchError } = await fetchAnalysisComparisonItems(sb, user.id, ids)
  if (fetchError) return err(fetchError, 500)
  if (items.length < 2) return err('At least 2 analyses ids required')

  const table = buildComparisonTable(items)

  const prompt = `You are a product-opportunity analyst reviewing ${items.length} candidate analyses for an Amazon supplement builder.

Below is a structured comparison of verified market data and computed metrics. Every number was computed deterministically from real data — do not modify, question, or recalculate any value.

COMPARISON DATA:
${table}

CANDIDATES:
${items.map((i, idx) => `${idx + 1}. "${i.category_name}"`).join('\n')}

Write a concise recommendation (150–250 words) that:
1. Names which candidate to prioritize FIRST and gives 2–3 data-backed reasons why.
2. Explains the key trade-off between the options (what the second-best offers that the first lacks).
3. If any candidate has an AVOID or PASS verdict, or an unclear/flagged kill criterion, explain why it should be deprioritized.

Rules:
- Reference specific numbers from the table above (e.g. "$280k/mo market, 85 score").
- Do NOT invent new metrics or make up data.
- Do NOT use hedging language like "may", "might", "could be" — be direct.
- Write in second person ("you should pursue...").
- End with one sentence naming the single highest-priority next action.`

  for (let attempt = 1; attempt <= MAX_RECOMMEND_ATTEMPTS; attempt++) {
    const controller = new AbortController()
    const abortTimer = setTimeout(() => controller.abort(), ANTHROPIC_ATTEMPT_TIMEOUT_MS)

    try {
      const message = await ai.messages.create(
        { model: MODEL, max_tokens: 400, temperature: 0.3, messages: [{ role: 'user', content: prompt }] },
        { signal: controller.signal },
      )
      clearTimeout(abortTimer)

      const recommendation = message.content
        .filter(b => b.type === 'text')
        .map(b => (b as { type: 'text'; text: string }).text)
        .join('')
        .trim()

      return NextResponse.json({ recommendation, ai_model_version: MODEL })
    } catch (e: unknown) {
      clearTimeout(abortTimer)
      const isAbort = controller.signal.aborted
      if (isAbort) {
        console.error(`Compare recommend timeout (attempt ${attempt}/${MAX_RECOMMEND_ATTEMPTS})`)
        if (attempt < MAX_RECOMMEND_ATTEMPTS) continue
        return err('This took longer than expected. Please try again.', 504)
      }
      // Same transient-vs-not split as /api/discover and /api/generate —
      // only retry a real, classified rate_limit/service_unavailable error.
      const classified = classifyProviderError(e)
      const isTransient = classified.category === 'rate_limit' || classified.category === 'service_unavailable'
      if (isTransient && attempt < MAX_RECOMMEND_ATTEMPTS) {
        const waitMs = Math.round(Math.min(800 * 2 ** (attempt - 1), 3000) * (1 + 0.2 * (Math.random() * 2 - 1))) // +/-20% jitter, avoids a thundering herd of simultaneous retries after a shared provider blip
        console.error(`Compare recommend provider error, retrying (attempt ${attempt}/${MAX_RECOMMEND_ATTEMPTS}, waiting ${waitMs}ms)`, {
          errorCategory: classified.category, technicalDetail: classified.technicalDetail,
        })
        await sleep(waitMs)
        continue
      }
      const message = handleProviderError(e, { route: '/api/research/compare/recommend', attempt })
      return err(message, 500)
    }
  }

  return err('Something went wrong. Please try again.', 500)
}
