import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const jar = cookies()
  const sb  = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (list) => list.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )

  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  return NextResponse.redirect(`${origin}${next}`)
}
