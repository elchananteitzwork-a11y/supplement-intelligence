import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import Anthropic              from '@anthropic-ai/sdk'
import { DISCOVERY_PROMPT }   from '@/lib/prompts/discovery'
import type { OpportunityCard } from '@/types/index'

export const maxDuration = 60

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function supabaseFromCookies() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (items: { name: string; value: string; options: Record<string, unknown> }[]) =>
          items.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
}

function parseOpportunities(raw: string): OpportunityCard[] {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('[')
  if (start < 0) throw new Error('No JSON array in response')
  if (start > 0) s = s.slice(start)
  // Fast path
  try { return JSON.parse(s) as OpportunityCard[] } catch { /* fall through */ }
  // String-aware bracket scanner
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '[') depth++
    else if (c === ']') { if (--depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error('No complete JSON array found')
  return JSON.parse(s.slice(0, end + 1)) as OpportunityCard[]
}

function err(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

export async function POST(req: Request) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return err('Unauthorized', 401)

  let body: { input?: string }
  try { body = await req.json() } catch { return err('Invalid JSON body') }

  const { input } = body
  if (!input?.trim())              return err('input is required')
  if (input.trim().length > 200)   return err('Input too long — max 200 characters', 400)

  const controller = new AbortController()
  const abortTimer = setTimeout(() => controller.abort(), 50_000)
  let rawText = ''

  try {
    const msg = await ai.messages.create(
      {
        model:      'claude-sonnet-4-6',
        max_tokens: 3000,
        system:     DISCOVERY_PROMPT,
        messages:   [{ role: 'user', content: `Supplement category: "${input.trim()}"` }],
      },
      { signal: controller.signal },
    )
    clearTimeout(abortTimer)
    rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch (e: unknown) {
    clearTimeout(abortTimer)
    const isAbort = e instanceof Error &&
      (e.name === 'APIUserAbortError' || e.name === 'AbortError')
    if (isAbort) {
      console.error('Discovery timeout after 50 s', { category: input.trim() })
      return err('Discovery timed out — please try again.', 504)
    }
    if (e instanceof Anthropic.APIError) {
      console.error('Anthropic API error (discover)', { status: e.status, message: e.message })
    } else {
      console.error('Discovery error', e)
    }
    return err('AI service error — please try again.', 500)
  }

  let opportunities: OpportunityCard[]
  try {
    const parsed = parseOpportunities(rawText)
    opportunities = parsed
      .filter(o =>
        typeof o.name === 'string' && o.name.trim() &&
        typeof o.score === 'number' &&
        typeof o.rationale === 'string' &&
        o.scores &&
        typeof o.scores.demand?.score === 'number'
      )
      .slice(0, 25)
      .sort((a, b) => b.score - a.score)
  } catch (e) {
    console.error('Discovery parse error', {
      category: input.trim(),
      raw_length: rawText.length,
      snippet: rawText.slice(0, 400),
    })
    return err('Failed to parse opportunities — please try again.', 500)
  }

  console.log('Discovery complete', {
    category:    input.trim(),
    count:       opportunities.length,
    top_score:   opportunities[0]?.score,
    top_name:    opportunities[0]?.name,
  })

  return NextResponse.json({ opportunities, category: input.trim() })
}
