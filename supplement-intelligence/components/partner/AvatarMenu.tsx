'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { Search, User, CreditCard, LogOut, X } from 'lucide-react'

// AvatarMenu — the account/navigation panel behind the avatar button, the
// only persistent chrome on the V4 surfaces (docs/RD_V4_PHASE2.md §4 risk
// 6: no tab bar; a slide-in panel on demand is the progressive-disclosure
// resolution of that open question, adopted via owner direction
// 2026-07-24). Rendered on every V4 screen (Stream/Brief/Record/Appendix)
// so "New hunt" is reachable from deep pages.
//
// Owner decision (2026-07-24): V4 + account destinations only — the
// legacy-skinned product pages (Compare/Watchlist/History/Alerts) join
// this menu only after they're redesigned. Every row is a real existing
// destination; the usage meter shows the same real profiles.analyses_used/
// analyses_limit numbers /dashboard and /settings/billing already render
// (passed from the server component — no client fetch, no invented
// numbers; the card simply doesn't render when the profile row is
// missing). Sign-out reuses the real `<form action="/auth/signout"
// method="post">` pattern from components/pi/HomeShell.tsx — works with
// JS off, no new endpoint.
export interface AvatarMenuUsage { used: number; limit: number }

const rowCls = 'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm text-pi-ink transition-colors hover:bg-pi-card'
const groupLabelCls = 'mb-1 mt-6 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold'

export function AvatarMenu({ email, usage }: { email: string | null; usage: AvatarMenuUsage | null }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)
  const initial = (email?.trim()[0] ?? '?').toUpperCase()

  function openPanel() {
    lastFocusedRef.current = document.activeElement as HTMLElement
    setOpen(true)
  }

  function close() {
    setOpen(false)
    lastFocusedRef.current?.focus()
  }

  // Same focus-trap pattern the Landing AuthModal used (and app/login
  // keeps): Tab cycles inside the panel, Escape closes and returns focus.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab' || !panelRef.current) return
    const focusables = panelRef.current.querySelectorAll<HTMLElement>('a[href], button, [tabindex]:not([tabindex="-1"])')
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  const usagePct = usage && usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0

  return (
    <LazyMotion features={domAnimation} strict>
      <button
        type="button"
        onClick={openPanel}
        aria-label="Account menu"
        aria-haspopup="dialog"
        className="fixed right-5 top-5 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-pi-ink text-[13px] font-semibold text-pi-cream shadow-[0_1px_2px_rgba(22,23,26,0.08),0_4px_10px_-2px_rgba(22,23,26,0.18)] transition-transform duration-200 hover:-translate-y-px sm:right-8 sm:top-6"
      >
        {initial}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <m.div
              key="scrim"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
              className="fixed inset-0 z-40 bg-pi-ink/20 backdrop-blur-[1px]"
            />
            <m.div
              key="panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Account menu"
              onKeyDown={onKeyDown}
              initial={{ x: reduce ? 0 : 24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: reduce ? 0 : 24, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[320px] flex-col overflow-y-auto border-l border-pi-hairline bg-pi-cream px-5 py-6 shadow-[-8px_0_32px_-8px_rgba(22,23,26,0.16)]"
            >
              <div className="mb-5 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pi-ink text-[13px] font-semibold text-pi-cream">
                    {initial}
                  </span>
                  <span className="truncate text-sm text-pi-ink">{email ?? 'Your account'}</span>
                </div>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  autoFocus
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-pi-sub transition-colors hover:bg-pi-card"
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </div>

              {usage && (
                <div className="rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
                  <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Research runs</p>
                  <p className="mb-2 text-sm text-pi-ink">
                    <span className="font-mono font-semibold tabular-nums">{usage.used} of {usage.limit}</span> used this month
                  </p>
                  <div className="mb-2.5 h-1.5 overflow-hidden rounded-full bg-pi-sand">
                    <div className="h-full rounded-full bg-pi-gold-deep" style={{ width: `${usagePct}%` }} />
                  </div>
                  <Link href="/settings/billing" onClick={close} className="text-[13px] text-pi-gold hover:underline">
                    Manage plan →
                  </Link>
                </div>
              )}

              <p className={groupLabelCls}>Research</p>
              <nav className="flex flex-col gap-0.5">
                <Link href="/app" onClick={close} className={rowCls}>
                  <Search size={17} strokeWidth={1.75} className="shrink-0 text-pi-sub" />
                  New hunt
                </Link>
              </nav>

              <p className={groupLabelCls}>Account</p>
              <nav className="flex flex-col gap-0.5">
                <Link href="/research/profile" onClick={close} className={rowCls}>
                  <User size={17} strokeWidth={1.75} className="shrink-0 text-pi-sub" />
                  Founder profile
                </Link>
                <Link href="/settings/billing" onClick={close} className={rowCls}>
                  <CreditCard size={17} strokeWidth={1.75} className="shrink-0 text-pi-sub" />
                  Billing &amp; Plans
                </Link>
              </nav>

              <div className="mt-auto border-t border-pi-hairline pt-3">
                <form action="/auth/signout" method="post">
                  <button className={`${rowCls} w-full text-left text-pi-sub hover:text-pi-ink`}>
                    <LogOut size={17} strokeWidth={1.75} className="shrink-0" />
                    Sign out
                  </button>
                </form>
              </div>
            </m.div>
          </>
        )}
      </AnimatePresence>
    </LazyMotion>
  )
}
