'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router  = useRouter()
  const [ready,    setReady]    = useState(false)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    // The /auth/callback route already exchanged the reset code for a session.
    // Verify the session exists before showing the form.
    createClient().auth.getUser().then(({ data }) => {
      if (!data.user) router.replace('/login')
      else setReady(true)
    })
  }, [router])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    setError('')

    const { error } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  if (!ready) return null

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
              <p className="text-lg font-semibold mb-1">Choose a new password</p>
              <p className="text-sm text-zinc-400">Must be at least 6 characters.</p>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-zinc-400 mb-1.5">
                New password
              </label>
              <input
                id="password" type="password" required autoFocus
                autoComplete="new-password" minLength={6}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="field"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm text-zinc-400 mb-1.5">
                Confirm new password
              </label>
              <input
                id="confirm" type="password" required
                autoComplete="new-password" minLength={6}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
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
              disabled={loading || password.length < 6 || confirm.length < 6}
              className="btn-white w-full py-3"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Updating…
                </span>
              ) : 'Update password →'}
            </button>
          </form>
        </div>

        <p className="text-center">
          <Link href="/login" className="text-zinc-500 text-sm hover:text-zinc-300 transition-colors">← Back to sign in</Link>
        </p>

      </div>
    </div>
  )
}
