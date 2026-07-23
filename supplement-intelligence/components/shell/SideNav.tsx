'use client'

import Link from 'next/link'
import { useState } from 'react'

// Real nav destinations only — trimmed from Stitch's fictional 7-item
// SideNavFull to what this app actually has a backend for (see migration
// plan §"New canonical architecture / Navigation").
//
// UIv2-M2 architecture fix (pre-beta, 2026-07-21): "Thesis" and the old
// "Settings" link (→ /research/profile, the Founder Fit profile editor)
// removed from primary nav. Both are real, working pages, but neither is
// actually part of the current beta flow (/analyze → analyses):
//   - /thesis is a third, disconnected synthesis pipeline (lib/thesis-
//     engine) that consumes the SAME limited beta analysis-slot quota as
//     /analyze but persists its result nowhere reachable again — a beta
//     user clicking it from primary nav would burn a real slot on an
//     orphaned result. The underlying route/page is untouched (it may
//     still serve whatever purpose it had standalone) — only removed
//     from the always-visible sidebar every beta user sees.
//   - /research/profile (Founder Fit) is read exclusively by the old
//     Stage 1-4 research pipeline (lib/stage25/fit-layer.ts et al.) —
//     zero real analyses created via /analyze ever read founder_profiles.
//     Filling it out currently changes nothing about a beta user's real
//     Pipeline/Candidate Detail/Dashboard experience. Left in place for
//     whatever the old pipeline's own internal navigation still needs;
//     just no longer presented as the beta's "Settings" destination.
// "Settings" now points at the one settings surface that's actually real
// and connected for every user regardless of pipeline: billing.
//
// Production readiness audit follow-up (same day): "Research" (→ /research,
// the old Stage 1-4 pipeline's own entry point) removed from primary nav
// for the identical reason as Thesis — an independent UX audit found it's
// the exact same class of quota-burning, disconnected dead end (its own
// generation flow shares no data with Pipeline/Candidate Detail/Dashboard),
// just one step further upstream than Thesis was. The route itself is
// untouched. "History" (/research/history) is a read-only list against the
// same old pipeline — it doesn't burn quota, so it stays linked for now;
// tracked separately as known follow-up debt, not an active beta risk.
const NAV = [
  { href: '/dashboard',        label: 'Home',         id: 'home'     as const },
  { href: '/research/compare', label: 'Compare',      id: 'compare'  as const },
  { href: '/research/history', label: 'History',      id: 'history'  as const },
  { href: '/leaderboard',      label: 'Track Record', id: 'track'    as const },
  { href: '/settings/billing', label: 'Settings',     id: 'settings' as const },
]

export type NavId = typeof NAV[number]['id']
export type ShellVariant = 'legacy' | 'pi'

// `variant="pi"` (UIv2-M2, 2026-07-21): additive opt-in restyle. Default
// ('legacy') stays byte-identical to before for any route that hasn't
// passed variant="pi" yet. (Corrected 2026-07-21 audit: by now this covers
// /analyze, /memo/[id], /dashboard, /research/compare, /watchlist,
// /alerts, /leaderboard, and /settings/billing — only /research/history
// and the old /research/* Stage 1-4 tree are still genuinely 'legacy'.
// Check each route's own AppShell call for its current truth rather than
// trusting this list as it keeps growing.)
// Zero behavior change either way: same NAV data, same active/canAnalyze
// logic, same sign-out form, same mobile open/close state.
export function SideNav({ active, canAnalyze = true, variant = 'legacy' }: { active: NavId | null; canAnalyze?: boolean; variant?: ShellVariant }) {
  const pi = variant === 'pi'
  return (
    <aside className={`hidden lg:flex lg:flex-col lg:w-[240px] lg:shrink-0 lg:px-5 lg:py-8 lg:sticky lg:top-0 lg:h-screen ${
      pi ? 'lg:border-r lg:border-pi-hairline bg-pi-cream' : 'lg:border-r lg:border-black bg-surface'
    }`}>
      <Link href="/dashboard" className="mb-10">
        <span className={`text-sm font-black uppercase tracking-tight ${pi ? 'text-pi-ink' : 'text-black'}`}>Product Intelligence</span>
      </Link>

      <nav className="space-y-0.5 mb-8">
        {NAV.map(n => (
          <Link
            key={n.id}
            href={n.href}
            className={`block text-sm px-3 py-2 font-mono uppercase tracking-wide transition-colors ${
              pi
                ? active === n.id ? 'bg-pi-ink text-pi-cream font-bold rounded-lg' : 'text-pi-sub hover:text-pi-ink hover:bg-pi-sand rounded-lg'
                : active === n.id ? 'bg-black text-white font-bold' : 'text-ink-variant hover:text-black hover:bg-surface-container'
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>

      {canAnalyze ? (
        <Link
          href="/analyze"
          className={`flex items-center justify-center gap-2 w-full text-sm font-black uppercase tracking-wide py-2.5 mb-8 transition-colors duration-150 active:scale-[0.98] ${
            pi
              ? 'rounded-lg text-pi-cream bg-pi-ink hover:bg-[#24262B]'
              : 'text-white bg-black hover:bg-white hover:text-black border-2 border-black'
          }`}
        >
          + New Analysis
        </Link>
      ) : (
        <div className={`text-xs font-mono uppercase tracking-wide px-3 py-2.5 text-center mb-8 ${
          pi ? 'text-pi-faint border border-pi-hairline rounded-lg' : 'text-outline border border-black'
        }`}>
          No analyses left
        </div>
      )}

      <form action="/auth/signout" method="post" className="mt-auto">
        <button className={`text-xs font-mono uppercase tracking-wide transition-colors px-3 py-1 ${pi ? 'text-pi-sub hover:text-pi-ink' : 'text-ink-variant hover:text-black'}`}>
          Sign out
        </button>
      </form>
    </aside>
  )
}

export function MobileNav({ active, canAnalyze = true, variant = 'legacy' }: { active: NavId | null; canAnalyze?: boolean; variant?: ShellVariant }) {
  const [open, setOpen] = useState(false)
  const pi = variant === 'pi'

  return (
    <div className={`lg:hidden sticky top-0 z-40 ${pi ? 'bg-pi-cream' : 'bg-surface'}`}>
      <div className={`px-4 py-3 flex items-center justify-between ${pi ? 'border-b border-pi-hairline' : 'border-b-2 border-black'}`}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex flex-col justify-center gap-[3px] w-6 h-6 shrink-0"
          >
            <span className={`block h-[2px] transition-transform ${pi ? 'bg-pi-ink' : 'bg-black'} ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
            <span className={`block h-[2px] transition-opacity ${pi ? 'bg-pi-ink' : 'bg-black'} ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-[2px] transition-transform ${pi ? 'bg-pi-ink' : 'bg-black'} ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
          </button>
          <Link href="/dashboard" className={`text-sm font-black uppercase tracking-tight ${pi ? 'text-pi-ink' : 'text-black'}`}>
            Product Intelligence
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {canAnalyze && (
            <Link
              href="/analyze"
              className={`text-xs font-black uppercase px-3 py-2 ${pi ? 'rounded-lg text-pi-cream bg-pi-ink' : 'text-white bg-black border-2 border-black'}`}
            >
              + New
            </Link>
          )}
        </div>
      </div>

      {open && (
        <nav className={pi ? 'border-b border-pi-hairline bg-pi-cream' : 'border-b-2 border-black bg-surface'}>
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block text-sm px-4 py-3 font-mono uppercase tracking-wide ${
                pi
                  ? `border-t border-pi-hairline first:border-t-0 ${active === n.id ? 'bg-pi-ink text-pi-cream font-bold' : 'text-pi-sub'}`
                  : `border-t border-black first:border-t-0 ${active === n.id ? 'bg-black text-white font-bold' : 'text-ink-variant'}`
              }`}
            >
              {n.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post" className={pi ? 'border-t border-pi-hairline' : 'border-t border-black'}>
            <button className={`w-full text-left text-sm px-4 py-3 font-mono uppercase tracking-wide ${pi ? 'text-pi-sub' : 'text-ink-variant'}`}>
              Sign out
            </button>
          </form>
        </nav>
      )}
    </div>
  )
}

export { NAV }
