'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode,     setMode]     = useState<Mode>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [awaitingConfirm, setAwaitingConfirm] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return
    setLoading(true)
    setError('')

    const sb = createClient()

    if (mode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({
        email:    email.trim().toLowerCase(),
        password,
      })
      setLoading(false)
      if (error) {
        setError(error.message)
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else {
      const { data, error } = await sb.auth.signUp({
        email:    email.trim().toLowerCase(),
        password,
      })
      setLoading(false)
      if (error) {
        setError(error.message)
      } else if (data.session) {
        // Email confirmation disabled — signed in immediately
        router.push('/dashboard')
        router.refresh()
      } else {
        // Supabase sent a confirmation email
        setAwaitingConfirm(true)
      }
    }
  }

  if (awaitingConfirm) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <Link href="/" className="font-semibold text-lg">
              Supplement<span className="text-emerald-400">Intelligence</span>
            </Link>
          </div>
          <div className="card p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-emerald-400/10 border border-emerald-400/20 grid place-items-center mx-auto">
              <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-lg">Confirm your email</p>
              <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                We sent a confirmation link to <span className="text-white">{email}</span>.
                <br />Click it to activate your account.
              </p>
            </div>
            <button
              onClick={() => { setAwaitingConfirm(false); switchMode('signin') }}
              className="btn-ghost text-xs"
            >
              Back to sign in
            </button>
          </div>
          <p className="text-center">
            <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">← Back to home</Link>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        <div className="text-center">
          <Link href="/" className="font-semibold text-lg">
            Supplement<span className="text-emerald-400">Intelligence</span>
          </Link>
        </div>

        <div className="card p-8">
          <form onSubmit={submit} className="space-y-5">
            <div>
              <p className="text-lg font-semibold mb-1">
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </p>
              <p className="text-sm text-zinc-400">
                {mode === 'signin'
                  ? 'Enter your credentials to continue.'
                  : 'Sign up for beta access.'}
              </p>
            </div>

            <div>
              <label htmlFor="email" className="block text-sm text-zinc-400 mb-1.5">
                Email address
              </label>
              <input
                id="email" type="email" required autoFocus autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="field"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-zinc-400 mb-1.5">
                Password
              </label>
              <input
                id="password" type="password" required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signin' ? '••••••••' : 'Min. 6 characters'}
                className="field"
              />
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim() || password.length < 6}
              className="btn-white w-full py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                </span>
              ) : mode === 'signin' ? 'Sign in →' : 'Create account →'}
            </button>

            <p className="text-xs text-zinc-500 text-center">
              {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
              <button
                type="button"
                onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
                className="text-zinc-300 hover:text-white transition-colors underline"
              >
                {mode === 'signin' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </form>
        </div>

        <p className="text-center">
          <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">← Back to home</Link>
        </p>

      </div>
    </div>
  )
}
