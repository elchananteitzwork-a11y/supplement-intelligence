import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import type { ComparisonItem } from '../route'
import { buildComparisonTable } from './format'

export const maxDuration = 60

const ai    = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODEL = 'claude-sonnet-4-6'

function supabaseAuthClient() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

// POST /api/research/compare/recommend
// Body: { items: ComparisonItem[] }
export async function POST(req: NextRequest) {
  try {
    const { data: { user }, error: authError } = await supabaseAuthClient().auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const items: ComparisonItem[] = body?.items ?? []
    if (items.length < 2) return NextResponse.json({ error: 'At least 2 items required' }, { status: 400 })

    const hasProfile = items.some(i => i.fit_rank !== null)
    const hasEstimated = items.some(i => i.fee_data_source === 'estimated')
    const table = buildComparisonTable(items)

    const prompt = `You are an investment advisor reviewing ${items.length} product opportunity comparisons for an Amazon supplement entrepreneur.

Below is a structured comparison of verified market data and computed metrics. Every number was computed deterministically from real data — do not modify, question, or recalculate any value, except where a figure is marked (est.), which reflects a disclosed assumption (industry-typical Amazon fee defaults used because real fee data was unavailable for that query), not measured data.${hasEstimated ? ' When discussing a figure marked (est.), note that it is an estimate rather than presenting it as precisely measured.' : ''}

COMPARISON DATA:
${table}

OPPORTUNITY ANGLES:
${items.map((i, idx) => `${idx + 1}. "${i.product_angle}" → Target: ${i.target_customer} | Differentiation: ${i.differentiation}`).join('\n')}

Write a concise investment recommendation (150–250 words) that:
1. Names which opportunity to prioritize FIRST and gives 2–3 data-backed reasons why.
2. Explains the key trade-off between the options (what the second-best offers that the first lacks).
3. If any opportunity has a DO_NOT_PURSUE verdict or triggered kill switches, explain why it was disqualified.
${hasProfile ? '4. Notes any founder-fit considerations that affect the ranking.' : ''}

Rules:
- Reference specific numbers from the table above (e.g. "$280k/mo market, 85 score, 5/5 fit").
- Do NOT invent new metrics or make up data.
- Do NOT use hedging language like "may", "might", "could be" — be direct.
- Write in second person ("you should pursue...").
- End with one sentence naming the single highest-priority next action.`

    const message = await ai.messages.create({
      model:      MODEL,
      max_tokens: 400,
      temperature: 0.3,
      messages: [{ role: 'user', content: prompt }],
    })

    const recommendation = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')
      .trim()

    return NextResponse.json({
      recommendation,
      ai_model_version: MODEL,
    })
  } catch (err) {
    console.error('compare/recommend POST error', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
