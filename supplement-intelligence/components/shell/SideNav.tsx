'use client'

import Link from 'next/link'
import { useState } from 'react'

// Real nav destinations only — trimmed from Stitch's fictional 7-item
// SideNavFull to what this app actually has a backend for (see migration
// plan §"New canonical architecture / Navigation").
const NAV = [
  { href: '/dashboard',        label: 'Home',         id: 'home'     as const },
  { href: '/research',         label: 'Research',     id: 'research' as const },
  { href: '/research/compare', label: 'Compare',      id: 'compare'  as const },
  { href: '/research/history', label: 'History',      id: 'history'  as const },
  { href: '/leaderboard',      label: 'Track Record', id: 'track'    as const },
  { href: '/thesis',           label: 'Thesis',       id: 'thesis'   as const },
  { href: '/research/profile', label: 'Settings',     id: 'settings' as const },
]

export type NavId = typeof NAV[number]['id']

export function SideNav({ active, canAnalyze = true }: { active: NavId | null; canAnalyze?: boolean }) {
  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-[240px] lg:shrink-0 lg:border-r lg:border-black lg:px-5 lg:py-8 lg:sticky lg:top-0 lg:h-screen bg-surface">
      <Link href="/dashboard" className="mb-10">
        <span className="text-sm font-black uppercase tracking-tight text-black">Product Intelligence</span>
      </Link>

      <nav className="space-y-0.5 mb-8">
        {NAV.map(n => (
          <Link
            key={n.id}
            href={n.href}
            className={`block text-sm px-3 py-2 font-mono uppercase tracking-wide transition-colors ${
              active === n.id ? 'bg-black text-white font-bold' : 'text-ink-variant hover:text-black hover:bg-surface-container'
            }`}
          >
            {n.label}
          </Link>
        ))}
      </nav>

      {canAnalyze ? (
        <Link
          href="/analyze"
          className="flex items-center justify-center gap-2 w-full text-sm font-black uppercase tracking-wide text-white bg-black hover:bg-white hover:text-black border-2 border-black py-2.5 mb-8 transition-colors duration-150 active:scale-[0.98]"
        >
          + New Analysis
        </Link>
      ) : (
        <div className="text-xs font-mono uppercase tracking-wide text-outline border border-black px-3 py-2.5 text-center mb-8">
          No analyses left
        </div>
      )}

      <form action="/auth/signout" method="post" className="mt-auto">
        <button className="text-xs font-mono uppercase tracking-wide text-ink-variant hover:text-black transition-colors px-3 py-1">
          Sign out
        </button>
      </form>
    </aside>
  )
}

export function MobileNav({ active, canAnalyze = true }: { active: NavId | null; canAnalyze?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="lg:hidden sticky top-0 z-40 bg-surface">
      <div className="border-b-2 border-black px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(o => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="flex flex-col justify-center gap-[3px] w-6 h-6 shrink-0"
          >
            <span className={`block h-[2px] bg-black transition-transform ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
            <span className={`block h-[2px] bg-black transition-opacity ${open ? 'opacity-0' : ''}`} />
            <span className={`block h-[2px] bg-black transition-transform ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
          </button>
          <Link href="/dashboard" className="text-sm font-black uppercase tracking-tight text-black">
            Product Intelligence
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {canAnalyze && (
            <Link href="/analyze" className="text-xs font-black uppercase text-white bg-black px-3 py-2 border-2 border-black">
              + New
            </Link>
          )}
        </div>
      </div>

      {open && (
        <nav className="border-b-2 border-black bg-surface">
          {NAV.map(n => (
            <Link
              key={n.id}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block text-sm px-4 py-3 font-mono uppercase tracking-wide border-t border-black first:border-t-0 ${
                active === n.id ? 'bg-black text-white font-bold' : 'text-ink-variant'
              }`}
            >
              {n.label}
            </Link>
          ))}
          <form action="/auth/signout" method="post" className="border-t border-black">
            <button className="w-full text-left text-sm px-4 py-3 font-mono uppercase tracking-wide text-ink-variant">
              Sign out
            </button>
          </form>
        </nav>
      )}
    </div>
  )
}

export { NAV }
