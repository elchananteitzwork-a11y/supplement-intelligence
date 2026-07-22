'use client'

import Link from 'next/link'
import { useState } from 'react'
import { RotorMark } from '@/components/cine/RotorMark'
import { NAV } from '@/components/shell/SideNav'
import { cn } from '@/lib/cn'

// Home rebuild (UIv2-M3) — cream sticky top-nav, scoped to /dashboard ONLY.
// Deliberately a NEW, separate component rather than a rewrite of
// components/shell/SideNav.tsx / AppShell.tsx, which are shared, load-
// bearing infrastructure for the other 7 AppShell routes (Compare, History,
// Track Record, Settings, Analyze, Memo, Watchlist, Alerts) — those keep
// the sidebar unchanged until their own milestone (see RD-UIv2-M3 §3/§7).
//
// Nav destinations mirror SideNav's real, exported `NAV` list byte-for-byte
// (same hrefs/labels/order) — imported, not re-typed, so there is exactly
// one source of truth for where each link goes.
export function HomeShell({ canAnalyze, quotaLabel }: { canAnalyze: boolean; quotaLabel: string }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-pi-hairline bg-pi-cream/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-[880px] items-center justify-between gap-3 px-5 py-3.5 sm:px-7">
        <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5 text-sm font-semibold text-pi-ink">
          <RotorMark className="h-5 w-5 shrink-0" />
          <span className="hidden sm:inline">Product Intelligence</span>
        </Link>

        <div className="hidden items-center gap-0.5 md:flex">
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              aria-current={n.id === 'home' ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-full px-3.5 py-2 text-[13.5px] transition-colors duration-200',
                n.id === 'home'
                  ? 'bg-pi-gold/10 font-semibold text-pi-gold'
                  : 'text-pi-sub hover:bg-pi-ink/[0.04] hover:text-pi-ink',
              )}
            >
              {n.label}
            </Link>
          ))}
          {/* Not in the mockup (which has no account-menu affordance at all)
              — kept because SideNav.tsx's sign-out form is real, working
              functionality every authenticated route currently offers;
              dropping it here would be a silent regression, not a redesign. */}
          <span aria-hidden className="mx-1.5 h-4 w-px bg-pi-hairline" />
          <form action="/auth/signout" method="post">
            <button className="whitespace-nowrap rounded-full px-3 py-2 text-[13px] text-pi-faint transition-colors duration-200 hover:bg-pi-ink/[0.04] hover:text-pi-ink">
              Sign out
            </button>
          </form>
        </div>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3.5">
          <span className="hidden font-mono text-[10.5px] text-pi-sub lg:inline">{quotaLabel}</span>

          {canAnalyze ? (
            <Link
              href="/analyze"
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-4 py-2.5 text-[13px] font-semibold text-[#16130a] shadow-[0_8px_18px_-8px_rgba(212,169,74,0.5)] transition-transform duration-200 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-pi-ink sm:px-5 sm:text-[13.5px]"
            >
              + Log a hunch
            </Link>
          ) : (
            <span
              className="whitespace-nowrap rounded-full border border-pi-hairline px-3 py-2 text-[10.5px] font-mono uppercase tracking-wide text-pi-faint sm:px-4 sm:text-xs"
              title="No analyses left"
            >
              No analyses left
            </span>
          )}

          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex h-6 w-6 shrink-0 flex-col justify-center gap-[3px] md:hidden"
          >
            <span className={cn('block h-[1.5px] bg-pi-ink transition-transform duration-200', open && 'translate-y-[4.5px] rotate-45')} />
            <span className={cn('block h-[1.5px] bg-pi-ink transition-opacity duration-200', open && 'opacity-0')} />
            <span className={cn('block h-[1.5px] bg-pi-ink transition-transform duration-200', open && '-translate-y-[4.5px] -rotate-45')} />
          </button>
        </div>
      </nav>

      {/* Mobile nav-link reveal — the mockup itself only hides .navlinks below
          720px with no replacement; a standing requirement (graceful mobile
          fallback) means the other 4 real destinations must stay reachable
          on a 390px viewport, so this drawer is added scoped to this file only.
          Simplify-pass note: SideNav.tsx already exports a MobileNav with an
          equivalent drawer — considered reusing it here, but MobileNav owns
          its own separate top bar (different brand size, "+ New" text button,
          no quota inline, no RotorMark), not a drawer-only piece composable
          into HomeShell's single unified header. Merging them would mean
          either changing MobileNav's shape (touches SideNav.tsx, the shared
          infra this milestone deliberately doesn't touch — see RD-UIv2-M3 §3)
          or forking it anyway. Left as a real, small, acknowledged duplication
          rather than widening this milestone's scope. */}
      {open && (
        <div className="border-t border-pi-hairline bg-pi-cream md:hidden">
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setOpen(false)}
              className={cn(
                'block border-t border-pi-hairline px-6 py-3 text-sm first:border-t-0',
                n.id === 'home' ? 'font-semibold text-pi-gold' : 'text-pi-sub',
              )}
            >
              {n.label}
            </Link>
          ))}
          <div className="border-t border-pi-hairline px-6 py-3 font-mono text-[11px] text-pi-sub">{quotaLabel}</div>
          <form action="/auth/signout" method="post" className="border-t border-pi-hairline">
            <button className="block w-full px-6 py-3 text-left text-sm text-pi-sub">Sign out</button>
          </form>
        </div>
      )}
    </header>
  )
}
