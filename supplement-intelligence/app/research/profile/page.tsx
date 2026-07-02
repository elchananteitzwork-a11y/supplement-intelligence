'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FounderProfileForm } from '@/components/research/FounderProfileForm'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

function FounderProfileContent() {
  const router     = useRouter()
  const params     = useSearchParams()
  const returnTo   = params.get('return_to')

  const [existing, setExisting] = useState<Partial<FounderProfile> | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/research/founder-profile')
      .then(r => r.json())
      .then(data => setExisting(data ?? null))
      .catch(() => setExisting(null))
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

      if (returnTo) {
        router.push(returnTo)
      } else {
        router.push('/research')
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
      <div className="space-y-2 mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Founder Profile</h1>
        <p className="text-sm text-gray-400">
          Your profile is used exclusively to generate deterministic fit scores for each
          investment thesis. No AI interprets your answers — the fit layer is arithmetic.
        </p>
        {existing && (
          <p className="text-xs text-indigo-400 bg-indigo-950/30 border border-indigo-800 rounded px-3 py-1.5">
            You have a saved profile. Submitting this form will replace it.
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-950/30 border border-red-800 rounded px-3 py-2">
          {error}
        </div>
      )}

      <FounderProfileForm
        initial={existing ?? undefined}
        onSave={handleSave}
        saving={saving}
      />
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
