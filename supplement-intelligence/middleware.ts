import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectTarget } from '@/lib/safe-redirect'

// Pre-beta audit fix: /pipeline, /watchlist, /alerts, /settings were never
// added here — each of their own API routes independently checks auth (so
// nothing was ever exploitable), but an unauthenticated visit rendered an
// empty page shell instead of redirecting to /login like every other real
// page does. Added for consistent behavior, not because of a real leak.
// UIv2-M3 Home rebuild: /pipeline removed (route deleted — merged into
// /dashboard); a deleted route 404s regardless of this list.
// V4 Phase 1 (2026-07-24): '/app' added — the new V4 surface (Stream/Brief).
// Its pages already redirect('/login') themselves; this is the same
// defense-in-depth consistency every other authenticated route gets.
const GUARDED = ['/dashboard', '/memo', '/leaderboard', '/research', '/analyze', '/thesis', '/watchlist', '/alerts', '/settings', '/app']

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: ()     => req.cookies.getAll(),
        setAll: (list: { name: string; value: string; options: Record<string, unknown> }[]) => {
          list.forEach(({ name, value }) => req.cookies.set(name, value))
          res = NextResponse.next({ request: req })
          list.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = req.nextUrl.pathname

  if (!user && GUARDED.some(p => path.startsWith(p))) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('next', path)
    return NextResponse.redirect(url)
  }

  if (user && path === '/login') {
    // An already-authenticated visitor hitting /login (e.g. clicking a
    // Landing "Enter" link) never reaches app/login/page.tsx's own
    // redirect logic at all — this server-side redirect fires first — so
    // it needs the same /app default + real ?next= handling, via the
    // same shared, security-reviewed helper (lib/safe-redirect.ts).
    const requestedNext = req.nextUrl.searchParams.get('next')
    const target = safeRedirectTarget(requestedNext, req.nextUrl.origin, '/app')
    return NextResponse.redirect(new URL(target, req.nextUrl.origin))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|\\.(?:svg|png|jpg|webp)$).*)'],
}
