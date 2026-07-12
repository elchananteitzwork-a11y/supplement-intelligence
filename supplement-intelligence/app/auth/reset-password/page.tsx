'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { HardShadowSearchInput, PrimaryButton } from '@/components/ui'

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
    <div className="min-h-screen flex flex-col font-sans bg-surface text-ink">
      <header className="w-full border-b-2 border-black px-gutter py-4">
        <span className="text-headline-md font-black tracking-tighter text-black">PRODUCT INTELLIGENCE</span>
      </header>

      <main className="flex-grow flex items-center justify-center px-gutter py-section-gap">
        <div className="w-full max-w-[400px] bg-white border border-black p-gutter space-y-element-gap">
          <div>
            <h1 className="text-headline-md text-black">Choose a new password</h1>
            <p className="text-body-md text-secondary mt-1">Must be at least 6 characters.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-label-mono font-mono text-secondary uppercase block">New password</label>
              <HardShadowSearchInput
                id="password" type="password" required autoFocus
                autoComplete="new-password" minLength={6}
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm" className="text-label-mono font-mono text-secondary uppercase block">Confirm new password</label>
              <HardShadowSearchInput
                id="confirm" type="password" required
                autoComplete="new-password" minLength={6}
                value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password"
              />
            </div>

            {error && (
              <div className="text-sm text-error-on-container bg-error-container border border-error px-3 py-2.5">
                {error}
              </div>
            )}

            <PrimaryButton type="submit" disabled={loading || password.length < 6 || confirm.length < 6} className="w-full py-4">
              {loading ? 'Updating…' : 'Update Password'}
            </PrimaryButton>
          </form>

          <p className="text-center pt-2">
            <Link href="/login" className="text-label-mono font-mono uppercase text-outline hover:text-black transition-colors">← Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
