import { NextResponse }       from 'next/server'
import { cookies }            from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function sb() {
  const jar = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
      },setAll: (items: any[]) => items.forEach(({ name, value, options }) => jar.set(name, value, options)),
    }
  )
}

export async function POST(req: Request) {
  const client = sb()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  if (!body?.analysis_id || !body?.rating || !body?.category) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const { error } = await client.from('feedback').insert({
    user_id:     user.id,
    analysis_id: body.analysis_id,
    rating:      Number(body.rating),
    category:    body.category,
    comment:     body.comment?.trim() || null,
  })

  if (error) return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
