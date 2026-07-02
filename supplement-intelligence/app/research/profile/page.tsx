'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FounderProfileForm } from '@/components/research/FounderProfileForm'
import { FounderProfileBanner } from '@/components/research/FounderProfileBanner'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

function FounderProfileContent() {
  const router   = useRouter()
  const params   = useSearchParams()
  const returnTo = params.get('return_to')

  const [existing, setExisting] = useState<FounderProfile | null>(null)
  const [loading, setLoading]   = useState(true)
  const [editing, setEditing]   = useState(false)  // true = show form, false = show summary
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/research/founder-profile')
      .then(r => r.json())
      .then((data: FounderProfile | null) => {
        setExisting(data ?? null)
        // If no profile exists, go straight to the form
        setEditing(!data)
      })
      .catch(() => { setExisting(null); setEditing(true) })
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(profile: FounderProfile) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/research/founder-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Save failed'); return }

      setExisting(data)
      setEditing(false)

      if (returnTo) {
        router.push(returnTo)
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 text-xs text-gray-500 mb-8">
        <Link href="/research" className="hover:text-gray-300 transition-colors">Research</Link>
        <span className="text-gray-700">/</span>
        <span className="text-gray-400">Founder Profile</span>
      </div>

      <div className="space-y-2 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {existing ? 'Founder Profile' : 'Set Up Founder Profile'}
        </h1>
        <p className="text-sm text-gray-400">
          Your profile drives deterministic fit scoring for every investment thesis — capital adequacy,
          channel alignment, timeline viability, and execution gap analysis. No AI interprets your answers.
        </p>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Summary view — shown when profile exists and not editing */}
      {existing && !editing && (
        <div className="space-y-4">
          <FounderProfileBanner profile={existing} />

          {/* What this profile affects */}
          <div className="rounded-lg border border-gray-800 bg-gray-900/30 p-4 space-y-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              This profile personalizes
            </p>
            <ul className="text-xs text-gray-400 space-y-1">
              <li className="flex gap-2"><span className="text-indigo-400">→</span> Capital adequacy check on every thesis</li>
              <li className="flex gap-2"><span className="text-indigo-400">→</span> Fit rank (1–5) based on channel, timeline, and execution</li>
              <li className="flex gap-2"><span className="text-indigo-400">→</span> Execution gap identification before you commit capital</li>
              <li className="flex gap-2"><span className="text-indigo-400">→</span> Founder Verdict in Investment Memos (separate from market verdict)</li>
              <li className="flex gap-2"><span className="text-indigo-400">→</span> Unit economics breakeven adjusted to your actual capital position</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:border-gray-500 hover:text-gray-100 transition-colors"
            >
              Edit profile
            </button>
            {returnTo && (
              <Link
                href={returnTo}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                ← Back
              </Link>
            )}
            {!returnTo && (
              <Link
                href="/research"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-500 transition-colors"
              >
                Continue to Research →
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Form — shown when editing or no profile */}
      {editing && (
        <div className="space-y-4">
          {existing && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-indigo-400 bg-indigo-950/30 border border-indigo-800 rounded px-3 py-1.5">
                Editing existing profile — changes take effect immediately across all future analyses
              </p>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors ml-3"
              >
                Cancel
              </button>
            </div>
          )}
          <FounderProfileForm
            initial={existing ?? undefined}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </main>
  )
}

export default function FounderProfilePage() {
  return (
    <Suspense fallback={
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500 text-sm animate-pulse">Loading…</p>
      </main>
    }>
      <FounderProfileContent />
    </Suspense>
  )
}
