'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { HardShadowSearchInput, PrimaryButton, GhostButton } from '@/components/ui'

type Mode = 'signin' | 'signup' | 'forgot'

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

  const EmailConfirm = ({ title, body }: { title: string; body: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col font-sans bg-surface text-ink">
      <header className="w-full border-b-2 border-black px-gutter py-4">
        <span className="text-headline-md font-black tracking-tighter text-black">PRODUCT INTELLIGENCE</span>
      </header>
      <main className="flex-grow flex items-center justify-center px-gutter">
        <div className="w-full max-w-[400px] bg-white border border-black p-gutter text-center space-y-5">
          <div className="w-12 h-12 border-2 border-black flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="text-headline-md text-black">{title}</p>
            <p className="text-body-md text-secondary mt-1.5">{body}</p>
          </div>
          <GhostButton onClick={() => { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }}>
            ← Back to sign in
          </GhostButton>
        </div>
      </main>
    </div>
  )

  if (resetSent) return (
    <EmailConfirm
      title="Check your email"
      body={<>Reset link sent to <span className="text-black font-semibold">{email}</span>. Click it to choose a new password.</>}
    />
  )

  if (awaitingConfirm) return (
    <EmailConfirm
      title="Confirm your email"
      body={<>Confirmation link sent to <span className="text-black font-semibold">{email}</span>. Click it to activate your account.</>}
    />
  )

  return (
    <div className="min-h-screen flex flex-col font-sans bg-surface text-ink">
      <header className="w-full sticky top-0 border-b-2 border-black px-gutter py-4 flex justify-between items-center bg-surface">
        <div className="flex items-center gap-8">
          <span className="text-headline-md font-black tracking-tighter text-black">PRODUCT INTELLIGENCE</span>
          <div className="hidden md:flex gap-6">
            <Link href="/dashboard" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Dashboard</Link>
            <Link href="/analyze" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Analysis</Link>
            <Link href="/research/history" className="text-ink-variant hover:bg-surface-container-highest transition-colors py-1 px-2 text-sm">Reports</Link>
          </div>
        </div>
        <span className="text-black font-bold border-b-2 border-black py-1 text-sm">Sign In</span>
      </header>

      <main className="flex-grow flex items-center justify-center px-gutter py-section-gap">
        <div className="w-full max-w-[400px] bg-white border border-black p-gutter space-y-element-gap">
          <h1 className="text-headline-md text-black tracking-tight">
            {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Save your analyses and watch markets' : 'Reset your password'}
          </h1>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-label-mono font-mono text-secondary uppercase block" htmlFor="email">Work Email</label>
              <HardShadowSearchInput
                id="email" type="email" required autoFocus autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>

            {mode !== 'forgot' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-label-mono font-mono text-secondary uppercase block" htmlFor="password">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] font-mono uppercase text-outline hover:text-black transition-colors">
                      Forgot?
                    </button>
                  )}
                </div>
                <HardShadowSearchInput
                  id="password" type="password" required
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  minLength={6}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signin' ? '••••••••' : 'Min. 6 characters'}
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-error-on-container bg-error-container border border-error px-3 py-2.5">
                {error}
              </div>
            )}

            <PrimaryButton type="submit" disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)} className="w-full py-4">
              {loading ? 'Working…' : mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Email me a reset link'}
            </PrimaryButton>

            <p className="text-center text-body-md text-secondary">
              {mode === 'forgot' ? (
                <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="underline hover:text-black">Sign in</button></>
              ) : mode === 'signin' ? (
                <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="underline hover:text-black">Sign up</button></>
              ) : (
                <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="underline hover:text-black">Sign in</button></>
              )}
            </p>
          </form>
        </div>
      </main>

      <footer className="w-full border-t border-outline-variant bg-surface-container-low px-gutter py-section-gap flex flex-col md:flex-row justify-between items-center">
        <span className="text-label-mono font-bold text-black">PRODUCT INTELLIGENCE</span>
        <nav className="flex flex-wrap justify-center gap-8 mt-4 md:mt-0">
          <Link href="/" className="text-label-mono font-mono text-ink-variant hover:text-black transition-colors uppercase">← Back to home</Link>
        </nav>
      </footer>
    </div>
  )
}
