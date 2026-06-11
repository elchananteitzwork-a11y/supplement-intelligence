'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [sent,    setSent]    = useState(false)
  const [error,   setError]   = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true); setError('')

    const sb = createClient()
    const { error } = await sb.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">

        {/* logo */}
        <div className="text-center">
          <Link href="/" className="font-semibold text-lg">
            Supplement<span className="text-emerald-400">Intelligence</span>
          </Link>
        </div>

        <div className="card p-8">
          {sent ? (
            <div className="text-center animate-in space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-400/10 border border-emerald-400/20 grid place-items-center mx-auto">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-lg">Check your email</p>
                <p className="text-sm text-zinc-400 mt-1 leading-relaxed">
                  Magic link sent to <span className="text-white">{email}</span>.
                  <br />Click it to sign in — no password needed.
                </p>
              </div>
              <button onClick={() => { setSent(false); setEmail('') }} className="btn-ghost text-xs">
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-5">
              <div>
                <p className="text-lg font-semibold mb-1">Sign in</p>
                <p className="text-sm text-zinc-400">Enter your email to receive a magic link.</p>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm text-zinc-400 mb-1.5">Email address</label>
                <input
                  id="email" type="email" required autoFocus autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="field"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>
              )}

              <button type="submit" disabled={loading || !email.trim()} className="btn-white w-full py-3">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Sending...
                  </span>
                ) : 'Send magic link →'}
              </button>

              <p className="text-xs text-zinc-600 text-center">Beta access only. First-come, first-served.</p>
            </form>
          )}
        </div>

        <p className="text-center">
          <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
