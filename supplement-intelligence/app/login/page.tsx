'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AmbientWorld } from '@/components/cine/AmbientWorld'
import { GlassPanel } from '@/components/cine/GlassPanel'
import { RotorMark } from '@/components/cine/RotorMark'

type Mode = 'signin' | 'signup' | 'forgot'

// "One World" redesign (2026-07-21+): no more split-screen — a single
// glass instrument floating in the exact same AmbientWorld as Landing, so
// arriving here never feels like a different application. Auth logic
// (mode/email/password/loading/error/awaitingConfirm/resetSent state, the
// three real Supabase calls, the ?signup=1 deep link) is byte-identical to
// the prior version — only markup/classNames changed.

function MailIcon() {
  return (
    <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08]">
      <svg className="h-[19px] w-[19px] text-pi-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    </div>
  )
}

const inputCls =
  'w-full rounded-[11px] border border-white/15 bg-white/[0.06] px-3.5 py-3 text-[14.5px] text-white placeholder:text-pi-cream/35 outline-none transition-[border-color,box-shadow] duration-cine-fast ease-cine focus:border-pi-gold-deep/55 focus:shadow-[0_0_0_3px_rgba(212,169,74,0.14)]'
const labelCls = 'font-mono text-[10px] font-bold uppercase tracking-wider text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]'
const submitCls =
  'mt-1.5 w-full rounded-xl bg-gradient-to-br from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright px-[18px] py-[13px] text-[14.5px] font-semibold text-[#16130a] shadow-[0_10px_22px_-8px_rgba(212,169,74,0.55)] transition-transform duration-cine-fast ease-cine hover:-translate-y-px active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'

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

  function Shell({ children }: { children: React.ReactNode }) {
    return (
      <AmbientWorld
        image="/ambient/landing-cathedral-of-palms.jpg"
        video="/ambient/video/landing-hero-bamboo.mp4"
        intensity="full"
        className="min-h-screen"
      >
        <nav className="relative z-10 flex items-center px-6 py-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold text-pi-cream">
            <RotorMark className="h-5 w-5" />
            Product Intelligence
          </Link>
        </nav>
        <div className="relative z-10 flex min-h-[calc(100vh-76px)] items-center justify-center px-6 py-10">
          <GlassPanel className="w-full max-w-[420px] px-9 pb-8 pt-10">{children}</GlassPanel>
        </div>
      </AmbientWorld>
    )
  }

  const ConfirmScreen = ({ title, body }: { title: string; body: React.ReactNode }) => (
    <Shell>
      <div className="text-center">
        <MailIcon />
        <h1 className="mb-2 font-serif text-[24px] font-semibold leading-tight tracking-tight text-pi-cream [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">{title}</h1>
        <p className="mb-7 text-[13.5px] leading-relaxed text-pi-cream/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">{body}</p>
        <button
          onClick={() => { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }}
          className="font-mono text-[11px] text-pi-cream/60 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] hover:text-pi-cream"
        >
          ← Back to sign in
        </button>
      </div>
    </Shell>
  )

  if (resetSent) return (
    <ConfirmScreen
      title="Check your email"
      body={<>Reset link sent to <span className="font-semibold text-pi-cream">{email}</span>. Click it to choose a new password.</>}
    />
  )

  if (awaitingConfirm) return (
    <ConfirmScreen
      title="Confirm your email"
      body={<>Confirmation link sent to <span className="font-semibold text-pi-cream">{email}</span>. Click it to activate your account.</>}
    />
  )

  return (
    <Shell>
      <h1 className="mb-2 text-center font-serif text-[24px] font-semibold leading-tight tracking-tight text-pi-cream [text-shadow:0_1px_8px_rgba(0,0,0,0.35)]">
        {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Save your analyses' : 'Reset your password'}
      </h1>
      <p className="mb-7 text-center text-[13.5px] leading-relaxed text-pi-cream/80 [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">
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
                <button type="button" onClick={() => switchMode('forgot')} className="font-mono text-[10px] font-bold uppercase tracking-wide text-pi-gold-deep hover:text-pi-cream transition-colors">
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
          <div className="flex items-start gap-2 rounded-[10px] border border-[#C9573F]/35 bg-[#C9573F]/[0.14] px-3 py-2.5 text-[13px] text-[#eab3a5]">
            {error}
          </div>
        )}

        <button type="submit" disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)} className={submitCls}>
          {loading ? 'Working…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a reset link'}
        </button>

        <p className="text-center text-[13px] text-pi-cream/70 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)]">
          {mode === 'forgot' ? (
            <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-[#F6E7B8] underline decoration-white/25 underline-offset-2">Sign in</button></>
          ) : mode === 'signin' ? (
            <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="text-[#F6E7B8] underline decoration-white/25 underline-offset-2">Sign up</button></>
          ) : (
            <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-[#F6E7B8] underline decoration-white/25 underline-offset-2">Sign in</button></>
          )}
        </p>
      </form>

      <div className="mt-10 flex items-center justify-center border-t border-white/[0.1] pt-5">
        <Link href="/" className="font-mono text-[11px] tracking-wide text-pi-cream/55 [text-shadow:0_1px_3px_rgba(0,0,0,0.4)] hover:text-pi-cream transition-colors">← Back to home</Link>
      </div>
    </Shell>
  )
}
