'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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

  const inputCls = "w-full bg-white border-2 border-black px-4 py-3 text-sm font-sans text-black placeholder-[#7e7576] focus:outline-none transition-transform duration-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] focus:shadow-none focus:translate-x-[2px] focus:translate-y-[2px]"
  const labelCls = "block text-[11px] font-mono text-[#4c4546] mb-1.5 uppercase tracking-wider"

  const EmailConfirm = ({ title, body }: { title: string; body: React.ReactNode }) => (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 font-sans" style={{ background: '#f9f9f9' }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center mb-2">
          <Link href="/" className="font-sans text-sm font-black uppercase tracking-tight text-black">
            Intelligence Lab
          </Link>
        </div>
        <div className="border border-black bg-white p-8 text-center space-y-5">
          <div className="w-12 h-12 border-2 border-black flex items-center justify-center mx-auto">
            <svg className="w-5 h-5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <p className="font-sans font-black text-black text-lg uppercase tracking-tight">{title}</p>
            <p className="text-sm text-[#4c4546] mt-1.5 leading-relaxed">{body}</p>
          </div>
          <button
            onClick={() => { setResetSent(false); setAwaitingConfirm(false); switchMode('signin') }}
            className="text-xs font-mono uppercase tracking-wider text-[#4c4546] hover:text-black transition-colors border-b border-black"
          >
            ← Back to sign in
          </button>
        </div>
        <p className="text-center">
          <Link href="/" className="text-xs font-mono uppercase tracking-wider text-[#4c4546] hover:text-black transition-colors">← Back to home</Link>
        </p>
      </div>
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
    <div className="min-h-screen flex flex-col items-center justify-center px-4 font-sans" style={{ background: '#f9f9f9', color: '#1a1c1c' }}>
      <div className="relative w-full max-w-sm space-y-6">
        {/* Brand */}
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2 group">
            <span className="font-sans text-sm font-black uppercase tracking-tight text-black">
              Intelligence Lab
            </span>
          </Link>
        </div>

        {/* Card */}
        <div className="border border-black bg-white p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="font-sans font-black text-lg text-black mb-1 uppercase tracking-tight">
                {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
              </p>
              <p className="text-sm text-[#4c4546]">
                {mode === 'signin' ? 'Enter your credentials to continue.' : mode === 'signup' ? 'Sign up for beta access.' : "Enter your email and we'll send a reset link."}
              </p>
            </div>

            <div>
              <label htmlFor="email" className={labelCls}>Email address</label>
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
                  <label htmlFor="password" className="text-[11px] font-mono text-[#4c4546] uppercase tracking-wider">Password</label>
                  {mode === 'signin' && (
                    <button type="button" onClick={() => switchMode('forgot')} className="text-[11px] font-mono uppercase tracking-wider text-[#4c4546] hover:text-black transition-colors">
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
              <div className="text-sm text-[#93000a] bg-[#ffdad6] border border-[#ba1a1a] px-3 py-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || (mode !== 'forgot' && password.length < 6)}
              className="w-full py-3.5 text-sm font-black uppercase tracking-widest text-white bg-black border-2 border-black hover:bg-white hover:text-black transition-colors duration-200 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
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

            <p className="text-xs font-mono text-[#4c4546] text-center uppercase tracking-wide">
              {mode === 'forgot' ? (
                <>Remember your password?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-black underline">Sign in</button></>
              ) : mode === 'signin' ? (
                <>Don&apos;t have an account?{' '}<button type="button" onClick={() => switchMode('signup')} className="text-black underline">Sign up</button></>
              ) : (
                <>Already have an account?{' '}<button type="button" onClick={() => switchMode('signin')} className="text-black underline">Sign in</button></>
              )}
            </p>
          </form>
        </div>

        <p className="text-center">
          <Link href="/" className="text-xs font-mono uppercase tracking-wider text-[#4c4546] hover:text-black transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
