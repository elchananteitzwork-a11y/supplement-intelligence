'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectTarget } from '@/lib/safe-redirect'
import { RotorMark } from '@/components/cine/RotorMark'

type Mode = 'signin' | 'signup' | 'forgot'

// Cream register (2026-07-22): Login no longer lives in the cinematic
// AmbientWorld — no hero photo/video, no dark glass. Simple, light, on the
// same warm-cream/gold tokens as the rest of the product (pi-cream/pi-card/
// pi-hairline/pi-gold-*). Landing keeps the cinematic video hero; this page
// is the deliberate opposite register, not a downgrade of it — see
// DESIGN_SOURCE_OF_TRUTH.md's design-registers note. Auth logic (mode/
// email/password/loading/error/awaitingConfirm/resetSent state, the three
// real Supabase calls, the ?signup=1 deep link) is byte-identical to the
// prior version — only markup/classNames changed.
//
// Full-page split layout (2026-07-24, owner feedback: "I would like the
// login to be across a whole page, not a small part of the page" — the
// prior version was a small centered card floating in mostly-empty
// viewport). Two full-height columns on wide screens: the real form (left,
// no floating card — it's the column's own content now) and a light
// editorial brand panel (right, hidden below lg — a 50/50 split doesn't
// work on a phone). The panel is a solid pi-sand fill with the rotor mark
// and a short line, not photo/video — stays in the "simple, light"
// register the 2026-07-22 decision locked in, doesn't reintroduce
// Landing's cinematic treatment.

function MailIcon() {
  return (
    <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-pi-hairline bg-pi-sand">
      <svg className="h-[19px] w-[19px] text-pi-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </div>
  )
}

const inputCls =
  'w-full rounded-[11px] border border-pi-hairline bg-white px-3.5 py-3 text-[14.5px] text-pi-ink placeholder:text-pi-faint outline-none transition-[border-color,box-shadow] duration-200 focus:border-pi-gold-deep/60 focus:shadow-[0_0_0_3px_rgba(212,169,74,0.14)]'
const labelCls = 'font-mono text-[10px] font-bold uppercase tracking-wider text-pi-sub'
const submitCls =
  'mt-1.5 w-full rounded-xl bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-[18px] py-[13px] text-[14.5px] font-semibold text-[#16130a] shadow-[0_10px_22px_-8px_rgba(212,169,74,0.45)] transition-transform duration-200 hover:-translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

// Hoisted to module scope (real bug fix, 2026-07-23): these were previously
// defined INSIDE LoginPage's function body, which means React saw a brand
// new component type on every render and tore down + rebuilt the entire
// subtree — including the email/password <input> nodes — on every single
// keystroke. That's what broke browser/password-manager autofill (it loses
// its reference to a node the instant it's replaced) and made manual typing
// feel like it lost focus after one character. Neither component closes
// over any per-render local state, so hoisting them is a pure, safe move —
// Shell takes no state at all; ConfirmScreen takes its one callback as an
// explicit prop instead of a closure.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-pi-cream">
      <div className="flex flex-1 flex-col px-6 py-6 sm:px-10 sm:py-8 lg:px-16">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-pi-ink">
          <RotorMark className="h-5 w-5" />
          Product Intelligence
        </Link>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-[400px] py-10">
            {children}
          </div>
        </div>
      </div>

      {/* Editorial brand panel — light register, no photo/video (see file
          header). Hidden below lg: a 50/50 split has no room on a phone,
          and the form column above already reads as a complete page on
          its own without it. */}
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden border-l border-pi-hairline bg-pi-sand px-16 py-16 lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] rounded-full bg-pi-gold-deep/[0.07] blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-[360px] w-[360px] rounded-full bg-pi-gold-deep/[0.05] blur-3xl" />
        <RotorMark className="relative h-8 w-8" />
        <p className="relative max-w-[26ch] text-balance font-serif text-[32px] font-medium leading-[1.2] tracking-tight text-pi-ink">
          Know it&rsquo;s worth launching — before you order the first bottle.
        </p>
        <p className="relative max-w-[36ch] text-sm leading-relaxed text-pi-sub">
          Real evidence, honestly marked. Every verdict names the conditions that would reverse it, and re-checks them weekly.
        </p>
      </div>
    </div>
  )
}

function ConfirmScreen({ title, body, onBack }: { title: string; body: React.ReactNode; onBack: () => void }) {
  return (
    <Shell>
      <div className="text-center">
        <MailIcon />
        <h1 className="mb-2 font-serif text-[24px] font-semibold leading-tight tracking-tight text-pi-ink">{title}</h1>
        <p className="mb-7 text-[13.5px] leading-relaxed text-pi-sub">{body}</p>
        <button onClick={onBack} className="font-mono text-[11px] text-pi-faint hover:text-pi-ink">
          ← Back to sign in
        </button>
      </div>
    </Shell>
  )
}

export default function LoginPage() {
  const router = useRouter()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [email,    setEmail]    = useState('')

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('signup') === '1') setMode('signup')
  }, [])
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  function switchMode(next: Mode) { setMode(next); setError('') }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const sb = createClient()
    const postLoginTarget = safeRedirectTarget(new URLSearchParams(window.location.search).get('next'), window.location.origin, '/app')

    if (mode === 'forgot') {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
      })
      setLoading(false)
      if (error) setError(error.message)
      else setResetSent(true)
      return
    }

    if (!email.trim() || !password) { setLoading(false); return }

    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      setLoading(false)
      if (error) setError(error.message)
      else { router.push(postLoginTarget); router.refresh() }
    } else {
      const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
      setLoading(false)
      if (error) setError(error.message)
      else if (data.session) { router.push(postLoginTarget); router.refresh() }
      else setAwaitingConfirm(true)
    }
  }

  function backToSignIn() { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }

  if (resetSent) return (
    <ConfirmScreen
      title="Check your email"
      body={<>Reset link sent to <span className="font-semibold text-pi-ink">{email}</span>. Click it to choose a new password.</>}
      onBack={backToSignIn}
    />
  )

  if (awaitingConfirm) return (
    <ConfirmScreen
      title="Confirm your email"
      body={<>Confirmation link sent to <span className="font-semibold text-pi-ink">{email}</span>. Click it to activate your account.</>}
      onBack={backToSignIn}
    />
  )

  return (
    <Shell>
      <h1 className="mb-2 text-center font-serif text-[24px] font-semibold leading-tight tracking-tight text-pi-ink">
        {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Save your analyses' : 'Reset your password'}
      </h1>
      <p className="mb-7 text-center text-[13.5px] leading-relaxed text-pi-sub">
        {mode === 'signin'
          ? 'Sign in to see your analyses and watched categories.'
          : mode === 'signup'
            ? 'A free account keeps your history and alerts you when a category shifts.'
            : "We'll email you a link to choose a new one."}
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className={`mb-1.5 block ${labelCls}`} htmlFor="email">Work email</label>
          <input
            id="email" name="email" type="email" required autoFocus autoComplete="email"
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="name@company.com"
            className={inputCls}
          />
        </div>

        {mode !== 'forgot' && (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className={labelCls} htmlFor="password">Password</label>
              {mode === 'signin' && (
                <button type="button" onClick={() => switchMode('forgot')} className="font-mono text-[10px] font-bold uppercase tracking-wide text-pi-gold-deep hover:text-pi-ink transition-colors">
                  Forgot?
                </button>
              )}
            </div>
            <input
              id="password" name="password" type="password" required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={6}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signin' ? '••••••••' : 'Min. 6 characters'}
              className={inputCls}
            />
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-[10px] border border-[#A13F2E]/25 bg-[#A13F2E]/[0.06] px-3 py-2.5 text-[13px] text-[#A13F2E]">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)} className={submitCls}>
          {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
        </button>

        <p className="text-center text-[13px] text-pi-sub">
          {mode === 'forgot' ? (
            <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-pi-gold-deep underline decoration-pi-gold-deep/30 underline-offset-2">Sign in</button></>
          ) : mode === 'signin' ? (
            <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="text-pi-gold-deep underline decoration-pi-gold-deep/30 underline-offset-2">Sign up</button></>
          ) : (
            <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-pi-gold-deep underline decoration-pi-gold-deep/30 underline-offset-2">Sign in</button></>
          )}
        </p>
      </form>

      <div className="mt-10 flex items-center justify-center border-t border-pi-hairline pt-5">
        <Link href="/" className="font-mono text-[11px] tracking-wide text-pi-faint hover:text-pi-ink transition-colors">← Back to home</Link>
      </div>
    </Shell>
  )
}
