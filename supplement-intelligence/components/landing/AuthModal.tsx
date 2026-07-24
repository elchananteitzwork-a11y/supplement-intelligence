'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { RotorMark } from '@/components/cine/RotorMark'

export type AuthMode = 'login' | 'signup'
export interface AuthModalHandle { open: (mode: AuthMode) => void }

// AuthModal — real Supabase auth (sign in / sign up), hosted as a glass
// modal over the Landing world instead of its own route (RD_V4_PHASE2.md
// Milestone C). Same two real Supabase calls as app/login/page.tsx's
// LoginPage state machine (signInWithPassword / signUp) — 'Forgot
// password?' and the post-signup "confirm your email" screen deliberately
// hand off to the full /login page rather than duplicating that state
// here; this modal covers only the fast path a Landing visitor takes.
//
// URL state (?auth=login|signup, history.pushState/popstate) lives here,
// not in the parent page, so any CTA on the page can open it by ref
// without threading auth state through app/page.tsx.
const inputCls = 'w-full min-h-[44px] rounded-xl border border-white/[0.14] bg-white/[0.05] px-3.5 text-sm text-pi-cream placeholder:text-pi-cream/40 outline-none focus:border-pi-gold-deep/60'

export const AuthModal = forwardRef<AuthModalHandle>(function AuthModal(_props, ref) {
  const router = useRouter()
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  const modalRef = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  function readAuthFromUrl(): AuthMode | null {
    const auth = new URLSearchParams(window.location.search).get('auth')
    return auth === 'login' || auth === 'signup' ? auth : null
  }

  useImperativeHandle(ref, () => ({
    open: (m: AuthMode) => {
      lastFocusedRef.current = document.activeElement as HTMLElement
      const url = new URL(window.location.href)
      url.searchParams.set('auth', m)
      window.history.pushState({ auth: m }, '', url)
      setMode(m)
      setError('')
      setAwaitingConfirm(false)
      setOpen(true)
      setTimeout(() => firstFieldRef.current?.focus(), 60)
    },
  }), [])

  useEffect(() => {
    const initial = readAuthFromUrl()
    if (initial) { setMode(initial); setOpen(true) }
    const onPopState = () => {
      const m = readAuthFromUrl()
      if (m) { setMode(m); setOpen(true) } else setOpen(false)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  function close() {
    const url = new URL(window.location.href)
    url.searchParams.delete('auth')
    window.history.pushState({}, '', url)
    setOpen(false)
    lastFocusedRef.current?.focus()
  }

  function switchMode() {
    const next: AuthMode = mode === 'login' ? 'signup' : 'login'
    const url = new URL(window.location.href)
    url.searchParams.set('auth', next)
    window.history.replaceState({ auth: next }, '', url)
    setMode(next)
    setError('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || password.length < 6) return
    setLoading(true)
    setError('')
    const sb = createClient()
    if (mode === 'login') {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      setLoading(false)
      if (error) setError(error.message)
      else { router.push('/dashboard'); router.refresh() }
    } else {
      const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
      setLoading(false)
      if (error) setError(error.message)
      else if (data.session) { router.push('/dashboard'); router.refresh() }
      else setAwaitingConfirm(true)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { close(); return }
    if (e.key !== 'Tab' || !modalRef.current) return
    const focusables = modalRef.current.querySelectorAll<HTMLElement>('a[href], [role="button"], button, input, [tabindex]:not([tabindex="-1"])')
    if (!focusables.length) return
    const first = focusables[0], last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <LazyMotion features={domAnimation} strict>
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
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            />
            <m.div
              key="modal"
              ref={modalRef}
              onClick={e => e.stopPropagation()}
              onKeyDown={onKeyDown}
              role="dialog"
              aria-modal="true"
              aria-label={mode === 'signup' ? 'Create your account' : 'Log in'}
              initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
              transition={{ duration: reduce ? 0 : 0.26, ease: [0.16, 1, 0.3, 1] }}
              className="fixed left-1/2 top-1/2 z-[51] w-full max-w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-[22px] border border-white/[0.14] bg-[#161410]/[0.85] p-7 shadow-[0_24px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
            >
              <button
                onClick={close}
                aria-label="Close"
                className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-pi-cream/60 hover:bg-white/[0.08]"
              >
                <svg width="13" height="13" viewBox="0 0 13 13"><path d="M1 1L12 12M12 1L1 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
              </button>

              {awaitingConfirm ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center">
                    <RotorMark className="h-7 w-7" />
                  </div>
                  <h2 className="mb-2 font-serif text-lg font-semibold text-pi-cream">Confirm your email</h2>
                  <p className="mb-5 text-[13px] leading-relaxed text-pi-cream/70">
                    Confirmation link sent to <span className="font-semibold text-pi-cream">{email}</span>. Click it to activate your account.
                  </p>
                  <button onClick={() => { setAwaitingConfirm(false); setMode('login') }} className="font-mono text-[11px] text-pi-cream/50 hover:text-pi-cream">
                    ← Back to sign in
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-6 text-center">
                    <RotorMark className="mx-auto mb-3 h-6 w-6" />
                    <div className="font-serif text-xl font-semibold text-pi-cream">
                      {mode === 'signup' ? 'Create your account' : 'Log in'}
                    </div>
                  </div>

                  <form onSubmit={submit} className="mb-4 flex flex-col gap-3">
                    <input
                      ref={firstFieldRef}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="Email"
                      className={inputCls}
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Password"
                      className={inputCls}
                    />

                    {error && (
                      <div className="rounded-lg border border-[#A13F2E]/40 bg-[#A13F2E]/15 px-3 py-2 text-[12.5px] text-[#F3A796]">
                        {error}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={loading || !email.trim() || password.length < 6}
                      className="mt-1 min-h-[44px] w-full rounded-xl bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright text-[15px] font-semibold text-[#16130a] transition-transform duration-200 hover:-translate-y-px active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? 'Working…' : mode === 'signup' ? 'Create account' : 'Log in'}
                    </button>
                  </form>

                  <div className="mb-3 text-center">
                    <Link href="/login" className="text-[13px] text-pi-gold-deep hover:underline">Forgot password?</Link>
                  </div>
                  <div className="text-center text-[13px] text-pi-cream/50">
                    {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
                    <button onClick={switchMode} className="font-semibold text-pi-gold-deep hover:underline">
                      {mode === 'signup' ? 'Log in' : 'Create one'}
                    </button>
                  </div>
                </>
              )}
            </m.div>
          </>
        )}
      </AnimatePresence>
    </LazyMotion>
  )
})
