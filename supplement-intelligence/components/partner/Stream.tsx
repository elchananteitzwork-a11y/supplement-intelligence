'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DEFAULT_CATEGORY_ID } from '@/lib/categories/client-config'
import { logEvent } from '@/lib/positions'
import type { OpportunityVM } from '@/lib/opportunities'
import { Hunt } from './Hunt'
import { PositionsStrip } from './PositionsStrip'
import { Opportunities } from './Opportunities'

// ── S-Stream (V4_PRODUCT_ARCHITECTURE.md §5) ──────────────────────────────
// The home surface: partner-speaks-first opening, positions strip, then
// the input. Submitting POSTs the real /api/generate flow with the exact
// same request contract app/analyze/page.tsx's handleAnalyze already uses
// (read directly from that file this milestone) — a UI reset, not a data-
// flow change: same endpoint, same payload shape, same response handling
// (429 quota / 401 redirect / 504 timeout / network-drop honesty banner).
// The only difference from the legacy flow: success redirects to
// /app/brief/[id] (the V4 Brief) instead of /memo/[id].

const EXAMPLE_HUNCHES = [
  'A magnesium glycinate gummy for night-time recovery',
  'A creatine + collagen blend for women over 40',
  'A liver-support stack for people who drink socially',
]

export interface MovedItemVM {
  key:        string
  analysisId: string
  headline:   string
  detail:     string | null
  severity:   'critical' | 'informational'
  href:       string
}

export function Stream({ movedItems, opportunities }: { movedItems: MovedItemVM[]; opportunities: OpportunityVM[] }) {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [hunting, setHunting] = useState(false)
  const [huntDone, setHuntDone] = useState(false)
  const [error, setError] = useState('')
  const [networkFailure, setNetworkFailure] = useState(false)

  // Independent-review fix (finding 4): the Phase-1 gate metric
  // `returned_after_trip` (RD_V4_PHASE1.md §5: "≥50% of users return
  // within 7 days of a tripped-condition stream line") had zero call
  // sites — unmeasurable as shipped. Fired once per real moved/tripped
  // item actually rendered in the partner-speaks-first opening, on mount
  // only (not on every re-render), fire-and-forget with the same silent-
  // failure handling as every other event call in this namespace.
  useEffect(() => {
    for (const item of movedItems) {
      logEvent({ event: 'returned_after_trip', analysisId: item.analysisId }).catch(err => {
        console.warn('[partner-events] returned_after_trip failed to log (non-blocking):', err)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(idea: string) {
    const trimmed = idea.trim()
    if (!trimmed || hunting) return
    setError('')
    setNetworkFailure(false)
    setHunting(true)
    setHuntDone(false)

    try {
      const res = await fetch('/api/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input:          trimmed,
          targetAudience: undefined,
          pricePoint:     undefined,
          context:        undefined,
          fromDiscovery:  false,
          categoryId:     DEFAULT_CATEGORY_ID,
          discoveryQuery: undefined,
        }),
      })

      if (res.status === 429) {
        setError('You have used all your available analyses.')
        setHunting(false)
        return
      }
      if (res.status === 401) { router.push('/login'); return }
      if (res.status === 504) {
        setError('That took too long — try again.')
        setHunting(false)
        return
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || 'Something went wrong.')
      }

      const { analysisId } = await res.json()
      setHuntDone(true)
      router.push(`/app/brief/${analysisId}`)
    } catch (err: unknown) {
      if (err instanceof TypeError) {
        setNetworkFailure(true)
        setError('Lost connection while I was working on this — it may have finished anyway.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      }
      setHunting(false)
    }
  }

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-24 pt-12 sm:pt-16">
      {/* Partner speaks first — real moved items or the honest quiet line */}
      <section className="mb-10">
        {movedItems.length === 0 ? (
          <p className="text-[15px] leading-relaxed text-pi-sub">Nothing moved since your last visit.</p>
        ) : (
          <ul className="space-y-2.5">
            {movedItems.map(item => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`group relative block overflow-hidden rounded-xl border bg-pi-card py-3.5 pl-5 pr-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)] ${
                    item.severity === 'critical' ? 'border-pi-risk/30 hover:border-pi-risk/50' : 'border-pi-hairline hover:border-pi-ink/25'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-0 left-0 w-[3px] ${item.severity === 'critical' ? 'bg-pi-risk' : 'bg-pi-gold-deep'} opacity-70 transition-opacity group-hover:opacity-100`}
                  />
                  <p className="text-sm text-pi-ink">{item.headline}</p>
                  {item.detail && <p className="mt-1 text-xs text-pi-sub">{item.detail}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <PositionsStrip />

      {hunting ? (
        <Hunt done={huntDone} />
      ) : (
        <section>
          <label htmlFor="stream-input" className="mb-4 block text-balance font-serif text-[24px] font-semibold leading-snug tracking-tight text-pi-ink sm:text-[28px]">
            Tell me what you&rsquo;re thinking of building.
          </label>
          <form onSubmit={e => { e.preventDefault(); void submit(input) }} className="flex flex-col gap-3 sm:flex-row">
            <input
              id="stream-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="e.g. a magnesium gummy for sleep"
              className="flex-1 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 text-[15px] text-pi-ink shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-shadow placeholder:text-pi-faint focus:outline-none focus:ring-2 focus:ring-pi-gold-bright"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="min-h-[44px] shrink-0 rounded-xl bg-pi-ink px-5 py-3 text-sm font-semibold text-pi-cream shadow-[0_4px_14px_-4px_rgba(22,23,26,0.35)] transition-all duration-200 hover:-translate-y-px hover:bg-[#24262B] hover:shadow-[0_8px_20px_-6px_rgba(22,23,26,0.4)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:translate-y-0"
            >
              Hunt it →
            </button>
          </form>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-pi-risk bg-pi-risk/10 px-4 py-3 text-sm text-pi-risk">
              <p>{error}</p>
              {networkFailure && (
                <p className="mt-1.5 text-pi-risk/80">
                  <Link href="/dashboard" className="underline hover:text-pi-risk">Check your dashboard</Link> before trying again — if it finished, you&rsquo;ll find it there.
                </p>
              )}
            </div>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            {EXAMPLE_HUNCHES.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setInput(h)}
                className="rounded-full border border-pi-hairline bg-pi-card px-3.5 py-1.5 text-xs text-pi-sub shadow-[0_1px_2px_rgba(22,23,26,0.03)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:text-pi-ink hover:shadow-[0_3px_8px_-2px_rgba(22,23,26,0.1)]"
              >
                {h}
              </button>
            ))}
          </div>

          <div className="mt-10">
            <Opportunities items={opportunities} />
          </div>
        </section>
      )}
    </div>
  )
}
