import { createServerClient } from '@supabase/ssr'
import { cookies }            from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(req: NextRequest) {
  const jar = cookies()
  const sb  = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (l: { name: string; value: string; options: Record<string, unknown> }[]) =>
          l.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )
  await sb.auth.signOut()
  return NextResponse.redirect(new URL('/login', req.url))
}
