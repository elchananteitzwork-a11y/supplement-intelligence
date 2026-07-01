'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup' | 'forgot'

export default function LoginPage() {
  const router = useRouter()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [email,    setEmail]    = useState('')
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

  const inputCls = "w-full bg-white/[0.04] border border-lab-border-default rounded-lab-sm px-4 py-3 text-sm text-lab-text-primary placeholder-lab-text-tertiary focus:outline-none focus:border-lab-photon/60 focus:ring-1 focus:ring-lab-photon/20 transition-all"

  const EmailConfirm = ({ title, body }: { title: string; body: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: '#050507' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center mb-2">
          <Link href="/" className="font-display text-sm font-semibold">
            Intelligence <span className="text-lab-photon">Lab</span>
          </Link>
        </div>
        <div
          className="rounded-lab-lg border border-lab-border-soft p-8 text-center space-y-5"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
            style={{ background: 'rgba(79,168,255,0.08)', border: '1px solid rgba(79,168,255,0.2)' }}
          >
            <svg className="w-5 h-5 text-lab-photon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-display font-semibold text-lab-text-primary text-lg">{title}</p>
            <p className="text-sm text-lab-text-tertiary mt-1.5 leading-relaxed">{body}</p>
          </div>
          <button
            onClick={() => { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }}
            className="text-xs text-lab-text-secondary hover:text-lab-text-primary transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
        <p className="text-center">
          <Link href="/" className="text-xs text-lab-text-tertiary hover:text-lab-text-secondary transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )

  if (resetSent) return (
    <EmailConfirm
      title="Check your email"
      body={<>Reset link sent to <span className="text-lab-text-primary">{email}</span>. Click it to choose a new password.</>}
    />
  )

  if (awaitingConfirm) return (
    <EmailConfirm
      title="Confirm your email"
      body={<>Confirmation link sent to <span className="text-lab-text-primary">{email}</span>. Click it to activate your account.</>}
    />
  )

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative" style={{ background: '#050507' }}>
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(79,168,255,0.05) 0%, transparent 70%)' }}
        aria-hidden
      />

      <div className="relative w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="w-1 h-4 rounded-full bg-lab-photon" />
            <span className="font-display text-sm font-semibold">
              Intelligence <span className="text-lab-photon">Lab</span>
            </span>
          </Link>
        </div>

        {/* Card */}
        <div
          className="rounded-lab-lg border border-lab-border-soft p-8"
          style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)' }}
        >
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="font-display font-semibold text-lg text-lab-text-primary mb-1">
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </p>
              <p className="text-sm text-lab-text-tertiary">
                {mode === 'signin' ? 'Enter your credentials to continue.' : mode === 'signup' ? 'Sign up for beta access.' : "Enter your email and we'll send a reset link."}
              </p>
            </div>

            <div>
              <label htmlFor="email" className="block text-xs text-lab-text-tertiary mb-1.5 uppercase tracking-wider">Email address</label>
              <input
                id="email" type="email" required autoFocus autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputCls}
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs text-lab-text-tertiary uppercase tracking-wider">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => switchMode('forgot')} className="text-xs text-lab-text-tertiary hover:text-lab-text-secondary transition-colors">
                      Forgot password?
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
              <div className="text-sm text-lab-ember bg-lab-ember/8 border border-lab-ember/25 rounded-lab-sm px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)}
              className="w-full py-3 text-sm font-semibold text-[#050507] bg-lab-photon hover:bg-lab-photon-bright rounded-lab-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === 'signin' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : 'Sending link…'}
                </span>
              ) : mode === 'signin' ? 'Sign in →' : mode === 'signup' ? 'Create account →' : 'Send reset link →'}
            </button>

            <p className="text-xs text-lab-text-tertiary text-center">
              {mode === 'forgot' ? (
                <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-lab-photon hover:underline">Sign in</button></>
              ) : mode === 'signin' ? (
                <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="text-lab-photon hover:underline">Sign up</button></>
              ) : (
                <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-lab-photon hover:underline">Sign in</button></>
              )}
            </p>
          </form>
        </div>

        <p className="text-center">
          <Link href="/" className="text-xs text-lab-text-tertiary hover:text-lab-text-secondary transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
