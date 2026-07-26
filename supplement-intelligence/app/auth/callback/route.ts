import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectTarget } from '@/lib/safe-redirect'

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const code = searchParams.get('code')
  // Home duplication fix (2026-07-26): default post-confirm landing is
  // /app, same as every other post-auth path. Also closes the same
  // open-redirect class the security review found in middleware.ts: the
  // prior `${origin}${next}` concatenation let a crafted next like
  // "@evil.com" produce "https://host@evil.com" (userinfo trick) — the
  // shared, security-reviewed safeRedirectTarget helper (lib/safe-
  // redirect.ts) validates the parsed result's origin instead.
  const next = safeRedirectTarget(searchParams.get('next'), origin, '/app')

  if (!code) return NextResponse.redirect(`${origin}/login?error=no_code`)

  const jar = cookies()
  const sb  = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll:  () => jar.getAll(),
        setAll: (list: { name: string; value: string; options: Record<string, unknown> }[]) =>
          list.forEach(({ name, value, options }) => jar.set(name, value, options)),
      },
    }
  )

  const { error } = await sb.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(`${origin}/login?error=auth_failed`)

  return NextResponse.redirect(new URL(next, origin))
}
