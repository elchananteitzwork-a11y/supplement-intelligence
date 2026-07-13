import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { removeWatch } from '@/lib/watchlist/store'

// DELETE /api/watchlist/:id → one-click Unwatch (soft — sets active=false,
// preserving the row and its alert history; see lib/watchlist/store.ts).

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

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = supabaseFromCookies()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ok = await removeWatch(sb, user.id, params.id)
  if (!ok) return NextResponse.json({ error: 'Failed to remove watch' }, { status: 500 })
  return NextResponse.json({ success: true })
}
