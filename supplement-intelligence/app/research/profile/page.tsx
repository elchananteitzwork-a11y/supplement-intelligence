'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { FounderProfileForm } from '@/components/research/FounderProfileForm'
import { FounderProfileBanner } from '@/components/research/FounderProfileBanner'
import { HardCard, PrimaryLinkButton, SecondaryButton, GhostButton, GhostLinkButton } from '@/components/ui'
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
      <div className="flex items-center justify-center py-24">
        <p className="text-pi-faint text-sm font-mono animate-pulse">Loading…</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-8">
      <div className="space-y-2 border-b border-pi-hairline pb-4">
        <div className="flex items-start justify-between gap-4">
          <h1 className="font-serif text-[26px] font-semibold leading-snug tracking-tight text-pi-ink">
            {existing ? 'Founder Profile' : 'Set Up Founder Profile'}
          </h1>
          <GhostLinkButton variant="pi" href="/settings/billing">Billing &amp; Plans →</GhostLinkButton>
        </div>
        <p className="text-sm text-pi-sub">
          Your profile drives deterministic fit scoring for every investment thesis — capital adequacy,
          channel alignment, timeline viability, and execution gap analysis. No AI interprets your answers.
        </p>
      </div>

      {error && (
        <p className="rounded-xl text-xs text-pi-risk bg-pi-card border border-pi-risk/40 px-3 py-2">{error}</p>
      )}

      {/* Summary view — shown when profile exists and not editing */}
      {existing && !editing && (
        <div className="space-y-4">
          <FounderProfileBanner profile={existing} />

          {/* What this profile affects */}
          <HardCard variant="pi" className="space-y-2">
            <p className="text-[11px] font-mono font-semibold text-pi-faint uppercase tracking-wider">
              This profile personalizes the Research flow (/research)
            </p>
            <ul className="text-xs text-pi-sub space-y-1">
              <li className="flex gap-2"><span className="text-pi-ink">→</span> Capital adequacy check on every thesis</li>
              <li className="flex gap-2"><span className="text-pi-ink">→</span> Fit rank (1–5) based on channel, timeline, and execution</li>
              <li className="flex gap-2"><span className="text-pi-ink">→</span> Execution gap identification before you commit capital</li>
              <li className="flex gap-2"><span className="text-pi-ink">→</span> Founder Verdict in Investment Memos (separate from market verdict)</li>
              <li className="flex gap-2"><span className="text-pi-ink">→</span> Unit economics breakeven adjusted to your actual capital position</li>
            </ul>
            {/* Honesty note (pre-beta architecture fix, 2026-07-21): this
                profile is read exclusively by the older Research (Stage
                1-4) pipeline above — confirmed zero real analyses created
                via Discover/Analyze (/analyze) ever read it. Filling this
                out does not change a score, verdict, or confidence on any
                Pipeline/Candidate Detail/Dashboard analysis. */}
            <p className="text-[11px] text-pi-faint italic pt-1">
              Doesn't affect analyses created via Discover/Analyze — those use a separate, newer pipeline that doesn't read this profile.
            </p>
          </HardCard>

          <div className="flex gap-3">
            <SecondaryButton variant="pi" onClick={() => setEditing(true)}>Edit profile</SecondaryButton>
            {returnTo ? (
              <PrimaryLinkButton variant="pi" href={returnTo}>← Back</PrimaryLinkButton>
            ) : (
              <PrimaryLinkButton variant="pi" href="/research">Continue to Research →</PrimaryLinkButton>
            )}
          </div>
        </div>
      )}

      {/* Form — shown when editing or no profile */}
      {editing && (
        <div className="space-y-4">
          {existing && (
            <div className="flex items-center justify-between">
              <p className="rounded-xl text-xs text-pi-sub border border-pi-hairline bg-pi-card px-3 py-1.5">
                Editing existing profile — changes take effect immediately across all future analyses
              </p>
              <GhostButton variant="pi" onClick={() => setEditing(false)} className="ml-3">Cancel</GhostButton>
            </div>
          )}
          <FounderProfileForm
            initial={existing ?? undefined}
            onSave={handleSave}
            saving={saving}
          />
        </div>
      )}
    </div>
  )
}

export default function FounderProfilePage() {
  return (
    <AppShell active={null} variant="pi">
      <Suspense fallback={
        <div className="flex items-center justify-center py-24">
          <p className="text-pi-faint text-sm font-mono animate-pulse">Loading…</p>
        </div>
      }>
        <FounderProfileContent />
      </Suspense>
    </AppShell>
  )
}
