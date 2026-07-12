'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/shell/AppShell'
import { FounderProfileBanner } from '@/components/research/FounderProfileBanner'
import { HardCard, HardCardInteractive, HardShadowSearchInput, PrimaryButton, SecondaryLinkButton } from '@/components/ui'
import type { FounderProfile } from '@/lib/stage25/fit-layer'

interface PastSignal {
  id: string
  query: string
  quality_grade: 'sufficient' | 'thin' | 'insufficient'
  pipeline_blocked: boolean
  created_at: string
}

const QUALITY_COLOR: Record<string, string> = {
  sufficient:   'text-verdict-positive',
  thin:         'text-verdict-caution-text',
  insufficient: 'text-verdict-negative',
}

export default function ResearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [past, setPast] = useState<PastSignal[]>([])
  const [profile, setProfile] = useState<FounderProfile | null | undefined>(undefined) // undefined = not yet loaded

  // Pre-fill query from ?q= param (used by Duplicate action in history page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get('q')
    if (q) setQuery(q)
  }, [])

  useEffect(() => {
    fetch('/api/research/market-signal')
      .then(r => r.json())
      .then((data: PastSignal[]) => { if (Array.isArray(data)) setPast(data) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/research/founder-profile')
      .then(r => r.json())
      .then((data: FounderProfile | null) => setProfile(data ?? null))
      .catch(() => setProfile(null))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/research/market-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }

      router.push(`/research/${data.signal_id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AppShell active="research">
      <div className="max-w-2xl space-y-8">
        <div className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div className="space-y-2">
            <h1 className="text-headline-md text-black">Market Intelligence Engine</h1>
            <p className="text-sm text-ink-variant leading-relaxed">
              Stage 1: Provider data collection — no AI synthesis. All signals
              are labeled by source type and evidence quality before any
              interpretation occurs.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SecondaryLinkButton href="/research/compare">Compare →</SecondaryLinkButton>
            <SecondaryLinkButton href="/research/history">History →</SecondaryLinkButton>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <HardShadowSearchInput
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. magnesium glycinate, collagen peptides…"
              disabled={loading}
              className="flex-1"
            />
            <PrimaryButton type="submit" disabled={loading || !query.trim()}>
              {loading ? 'Running…' : 'Analyze'}
            </PrimaryButton>
          </div>

          {loading && (
            <p className="text-xs font-mono text-ink-variant animate-pulse">
              Collecting provider signals — Keepa, Apify, Google Trends, TikTok, openFDA, PubMed…
            </p>
          )}

          {error && (
            <p className="text-xs text-verdict-negative bg-white border border-verdict-negative px-3 py-2">
              {error}
            </p>
          )}
        </form>

        {/* Founder profile status — only shown once loaded */}
        {profile !== undefined && (
          <FounderProfileBanner profile={profile} returnTo="/research" />
        )}

        <HardCard className="text-xs text-ink-variant space-y-1">
          <p className="font-bold text-ink">What Stage 1 collects:</p>
          <ul className="list-disc list-inside space-y-1 ml-1">
            <li>Demand signals — Keepa BSR, monthly units sold, Google Trends</li>
            <li>Competition map — Apify Amazon search, review concentration</li>
            <li>Price distribution — Keepa avg90/avg365 with compression signal</li>
            <li>Growth momentum — 90-day and YoY BSR trend</li>
            <li>Social demand — TikTok hashtag views</li>
            <li>Safety signals — openFDA recalls, PubMed adverse events</li>
          </ul>
          <p className="pt-1 text-outline">
            No AI synthesis in Stage 1. Data Quality Gate runs before Stage 2.
          </p>
        </HardCard>

        {past.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-mono font-semibold text-outline uppercase tracking-wider">Recent</p>
              <SecondaryLinkButton href="/research/history" className="text-xs px-3 py-1.5">
                View all {past.length} →
              </SecondaryLinkButton>
            </div>
            <div className="border border-black divide-y divide-black">
              {past.slice(0, 3).map(s => (
                <HardCardInteractive key={s.id} href={`/research/${s.id}`} className="border-0">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm text-ink truncate">{s.query}</span>
                      <span className={`text-[10px] font-mono shrink-0 ${QUALITY_COLOR[s.quality_grade]}`}>
                        {s.quality_grade.toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-outline shrink-0 ml-4">
                      {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </HardCardInteractive>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
