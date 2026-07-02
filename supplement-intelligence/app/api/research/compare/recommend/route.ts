import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import type { ComparisonItem } from '../route'

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

function fmtN(n: number | null, prefix = '', suffix = ''): string {
  if (n === null || n === undefined) return 'N/A'
  return `${prefix}${n.toLocaleString()}${suffix}`
}

function fmtK(n: number | null): string {
  if (n === null) return 'N/A'
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`
}

function buildComparisonTable(items: ComparisonItem[]): string {
  const cols = items.map(i => `"${i.product_angle.slice(0, 40)}"`).join(' | ')
  const rows: string[] = [
    `Metric                    | ${cols}`,
    `---                       | ${items.map(() => '---').join(' | ')}`,
    `Opportunity Score (0-100) | ${items.map(i => i.opportunity_score).join(' | ')}`,
    `Market Verdict            | ${items.map(i => i.verdict_code ?? 'N/A').join(' | ')}`,
    `Founder Fit (1-5)         | ${items.map(i => i.fit_rank ?? 'N/A').join(' | ')}`,
    `Market Revenue/mo         | ${items.map(i => fmtK(i.market_revenue_mo)).join(' | ')}`,
    `Median Price              | ${items.map(i => fmtN(i.median_price, '$')).join(' | ')}`,
    `Competitors               | ${items.map(i => fmtN(i.competitor_count)).join(' | ')}`,
    `Review Concentration      | ${items.map(i => fmtN(i.review_concentration, '', '%')).join(' | ')}`,
    `90-day Momentum           | ${items.map(i => fmtN(i.momentum_90d_pct, '', '%')).join(' | ')}`,
    `Trend Direction           | ${items.map(i => i.trend_direction ?? 'N/A').join(' | ')}`,
    `TikTok Views              | ${items.map(i => fmtN(i.tiktok_view_count)).join(' | ')}`,
    `Thresholds Passed (0-5)   | ${items.map(i => i.threshold_pass_count).join(' | ')}`,
    `Kill Switches Clear       | ${items.map(i => i.all_switches_clear === null ? 'N/A' : i.all_switches_clear ? 'Yes' : `No (${i.triggered_switches.join(', ')})`).join(' | ')}`,
    `Launch Complexity         | ${items.map(i => i.launch_complexity).join(' | ')}`,
    `Min Capital Required      | ${items.map(i => fmtK(i.min_capital_required)).join(' | ')}`,
    `Breakeven COGS/unit       | ${items.map(i => fmtN(i.breakeven_cogs, '$')).join(' | ')}`,
    `Year 1 Revenue (base)     | ${items.map(i => fmtK(i.year1_base)).join(' | ')}`,
    `Margin Viable             | ${items.map(i => i.margin_viable ? 'Yes' : 'No').join(' | ')}`,
    `Capital Fit               | ${items.map(i => i.capital_fit_level ?? 'N/A').join(' | ')}`,
    `Timeline Fit              | ${items.map(i => i.timeline_fit_level ?? 'N/A').join(' | ')}`,
  ]
  return rows.join('\n')
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
    const table = buildComparisonTable(items)

    const prompt = `You are an investment advisor reviewing ${items.length} product opportunity comparisons for an Amazon supplement entrepreneur.

Below is a structured comparison of verified market data and computed metrics. Every number was computed deterministically from real data — do not modify, question, or recalculate any value.

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
