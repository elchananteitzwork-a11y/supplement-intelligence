'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'forgot'

// Pre-beta redesign (2026-07-21): re-skinned onto the pi-* warm-cream system
// — this was the last legacy neo-brutalist screen left, and the first thing
// every beta user sees. Approved mockup: see conversation history. Auth
// logic (mode/email/password/loading/error/awaitingConfirm/resetSent state,
// the three real Supabase calls, the ?signup=1 deep link) is unchanged from
// the previous version — only markup/classNames changed.
const RotorMark = ({ className }: { className?: string }) => (
  <svg viewBox="-65 -65 330 330" role="img" aria-label="Product Intelligence" className={className}>
    <path d="M 132.45 86.89 L 133.47 110.23 L 172.75 142.00 L 182.97 86.86 Z" fill="#D4A94A" opacity="1" />
    <path d="M 127.58 121.55 L 107.87 134.10 L 100.00 184.00 L 152.86 165.28 Z" fill="#D4A94A" opacity="0.86" />
    <path d="M 95.13 134.66 L 74.40 123.87 L 27.25 142.00 L 69.90 178.42 Z" fill="#D4A94A" opacity="0.72" />
    <path d="M 67.55 113.11 L 66.53 89.77 L 27.25 58.00 L 17.03 113.14 Z" fill="#D4A94A" opacity="0.58" />
    <path d="M 72.42 78.45 L 92.13 65.90 L 100.00 16.00 L 47.14 34.72 Z" fill="#D4A94A" opacity="0.72" />
    <path d="M 104.87 65.34 L 125.60 76.13 L 172.75 58.00 L 130.10 21.58 Z" fill="#D4A94A" opacity="0.86" />
    <circle cx="100" cy="100" r="30" fill="#16171C" />
    <circle cx="100" cy="100" r="30" fill="none" stroke="#D4A94A" strokeWidth="0.8" strokeOpacity="0.5" />
    <circle cx="100" cy="100" r="12.6" fill="none" stroke="#D4A94A" strokeWidth="1.3" />
  </svg>
)

function EvidenceStage() {
  return (
    <div className="relative hidden flex-col justify-between overflow-hidden bg-[#14130f] px-14 py-12 lg:flex">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 620px 420px at 26% 22%, rgba(212,169,74,.14) 0%, transparent 65%), radial-gradient(ellipse 520px 380px at 78% 82%, rgba(201,151,31,.08) 0%, transparent 62%)',
        }}
      />
      <span className="relative z-10 font-mono text-xs font-bold uppercase tracking-[0.16em] text-pi-cream/80">
        Product Intelligence
      </span>
      <div className="relative z-10 flex flex-1 items-center justify-center">
        <div className="w-[min(320px,70%)] [animation:coreBreath_8s_ease-in-out_infinite] motion-reduce:animate-none">
          <RotorMark className="h-auto w-full drop-shadow-[0_10px_24px_rgba(0,0,0,0.35)]" />
        </div>
      </div>
      <div className="relative z-10 max-w-[400px]">
        <h2 className="mb-2.5 font-serif text-[22px] font-semibold leading-[1.3] tracking-tight text-[#F7F2E6]">
          Know before you build.
        </h2>
        <p className="text-[13.5px] leading-relaxed text-pi-cream/60">
          Investor-grade product intelligence in 60 seconds — market gaps, formula, financials, and a grounded verdict, from real provider data.
        </p>
        <div className="mt-6 flex gap-6 font-mono text-[11px] text-pi-cream/50">
          <div><b className="mb-0.5 block text-[15px] font-bold text-pi-gold-deep">60s</b>per analysis</div>
          <div><b className="mb-0.5 block text-[15px] font-bold text-pi-gold-deep">Real</b>provider data only</div>
          <div><b className="mb-0.5 block text-[15px] font-bold text-pi-gold-deep">Honest</b>nulls over guesses</div>
        </div>
      </div>
      <style>{'@keyframes coreBreath{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}'}</style>
    </div>
  )
}

function MailIcon() {
  return (
    <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-pi-hairline bg-pi-sand">
      <svg className="h-[19px] w-[19px] text-pi-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </div>
  )
}

const inputCls =
  'w-full rounded-[10px] border border-pi-hairline bg-white px-3.5 py-[11px] text-[14.5px] text-pi-ink placeholder:text-pi-faint outline-none transition-[border-color,box-shadow] duration-150 focus:border-pi-gold-deep focus:shadow-[0_0_0_3px_rgba(212,169,74,0.16)]'
const labelCls = 'font-mono text-[10.5px] font-bold uppercase tracking-wider text-pi-faint'
const submitCls =
  'mt-1 w-full rounded-[10px] bg-pi-ink px-[18px] py-[13px] text-[14.5px] font-semibold text-pi-cream shadow-[0_1px_3px_rgba(22,23,26,0.15)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_4px_10px_rgba(22,23,26,0.18)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:bg-pi-ink disabled:hover:shadow-[0_1px_3px_rgba(22,23,26,0.15)]'

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
      else { router.push('/dashboard'); router.refresh() }
    } else {
      const { data, error } = await sb.auth.signUp({ email: email.trim().toLowerCase(), password })
      setLoading(false)
      if (error) setError(error.message)
      else if (data.session) { router.push('/dashboard'); router.refresh() }
      else setAwaitingConfirm(true)
    }
  }

  const ConfirmScreen = ({ title, body }: { title: string; body: React.ReactNode }) => (
    <div className="grid min-h-screen grid-cols-1 bg-pi-cream lg:grid-cols-[46%_54%]">
      <EvidenceStage />
      <div className="flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[378px] text-center">
          <MailIcon />
          <h1 className="mb-2 font-serif text-[26px] font-semibold leading-tight tracking-tight text-pi-ink">{title}</h1>
          <p className="mb-7 text-[13.5px] leading-relaxed text-pi-sub">{body}</p>
          <button
            onClick={() => { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }}
            className="text-[13px] text-pi-sub underline decoration-pi-hairline underline-offset-2 hover:text-pi-ink"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  )

  if (resetSent) return (
    <ConfirmScreen
      title="Check your email"
      body={<>Reset link sent to <span className="font-semibold text-pi-ink">{email}</span>. Click it to choose a new password.</>}
    />
  )

  if (awaitingConfirm) return (
    <ConfirmScreen
      title="Confirm your email"
      body={<>Confirmation link sent to <span className="font-semibold text-pi-ink">{email}</span>. Click it to activate your account.</>}
    />
  )

  return (
    <div className="grid min-h-screen grid-cols-1 bg-pi-cream lg:grid-cols-[46%_54%]">
      <EvidenceStage />

      <div className="flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-[378px]">
          <div className="mb-9 flex items-center gap-2.5 lg:hidden">
            <RotorMark className="h-7 w-7" />
            <span className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-pi-ink">Product Intelligence</span>
          </div>

          <h1 className="mb-2 font-serif text-[26px] font-semibold leading-tight tracking-tight text-pi-ink">
            {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Save your analyses and watch markets' : 'Reset your password'}
          </h1>
          <p className="mb-7 text-[13.5px] leading-relaxed text-pi-sub">
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
                id="email" type="email" required autoFocus autoComplete="email"
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
                    <button type="button" onClick={() => switchMode('forgot')} className="font-mono text-[10.5px] font-bold uppercase tracking-wide text-pi-gold hover:text-pi-ink transition-colors">
                      Forgot?
                    </button>
                  )}
                </div>
                <input
                  id="password" type="password" required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signin' ? '••••••••' : 'Min. 6 characters'}
                  className={inputCls}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-[10px] border border-pi-risk/25 bg-pi-risk/[0.08] px-3 py-2.5 text-[13px] text-[#7A2E20]">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)} className={submitCls}>
              {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
            </button>

            <p className="text-center text-[13px] text-pi-sub">
              {mode === 'forgot' ? (
                <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-pi-ink underline decoration-pi-hairline underline-offset-2">Sign in</button></>
              ) : mode === 'signin' ? (
                <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="text-pi-ink underline decoration-pi-hairline underline-offset-2">Sign up</button></>
              ) : (
                <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-pi-ink underline decoration-pi-hairline underline-offset-2">Sign in</button></>
              )}
            </p>
          </form>

          <div className="mt-12 flex items-center justify-between border-t border-pi-hairline pt-5">
            <Link href="/" className="font-mono text-[11px] tracking-wide text-pi-faint hover:text-pi-ink transition-colors">← Back to home</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
