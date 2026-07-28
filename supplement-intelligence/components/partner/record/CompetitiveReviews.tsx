'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCompetitiveReviewsVM, type CompetitiveReviewsVM } from '@/lib/partner-copy-record'
import type { MarketReport } from '@/lib/competitive-review-engine'
import { RecordCard } from './RecordCard'

// ── Competitive review interrogation — item ג ───────────────────────────────
// (docs/RD_V4_COMPETITIVE_REVIEWS.md; owner-approved mockup 2026-07-28 with
// the self-critique amendments: dynamic top-N copy, the closing brief is
// labeled as an ADDENDUM to the Gap chapter's spec — never a second
// standalone "what to build" answer — and a dropped connection degrades to
// polling instead of an error, since the server run keeps going.)
//
// States: offer → running (poll) → report; errors return to offer with an
// honest message. A legacy analysis with no stored competitor set renders
// nothing at all — the server page gates on that before mounting this.

type Phase =
  | { kind: 'offer'; error?: string }
  | { kind: 'running' }
  | { kind: 'report'; vm: CompetitiveReviewsVM; unsaved?: boolean }

const POLL_MS = 6000

export function CompetitiveReviews({
  analysisId, topN, initialReport, initiallyRunning,
}: {
  analysisId: string
  topN: number
  initialReport: MarketReport | null
  initiallyRunning: boolean
}) {
  const [phase, setPhase] = useState<Phase>(() =>
    initialReport ? { kind: 'report', vm: buildCompetitiveReviewsVM(initialReport) }
    : initiallyRunning ? { kind: 'running' }
    : { kind: 'offer' })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyses/${analysisId}/competitive-reviews`)
      if (res.status === 404) {
        // The in-flight run failed and released its lock — offer a retry.
        stopPolling()
        setPhase({ kind: 'offer', error: 'The last run failed before finishing. Nothing was stored — you can try again.' })
        return
      }
      if (!res.ok) return // transient — keep polling
      const data = await res.json()
      if (data.report) {
        stopPolling()
        setPhase({ kind: 'report', vm: buildCompetitiveReviewsVM(data.report as MarketReport) })
      }
    } catch { /* transient network error — keep polling */ }
  }, [analysisId, stopPolling])

  useEffect(() => {
    if (phase.kind === 'running' && !pollRef.current) {
      pollRef.current = setInterval(poll, POLL_MS)
    }
    return stopPolling
  }, [phase.kind, poll, stopPolling])

  async function run() {
    setPhase({ kind: 'running' })
    try {
      const res = await fetch(`/api/analyses/${analysisId}/competitive-reviews`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (res.ok && data?.report) {
        setPhase({ kind: 'report', vm: buildCompetitiveReviewsVM(data.report as MarketReport), unsaved: data.persisted === false })
        return
      }
      if (res.ok && data?.running) return // someone else's run — polling takes over
      setPhase({ kind: 'offer', error: data?.error ?? 'The interrogation failed — try again.' })
    } catch {
      // Connection dropped mid-run; the server keeps going — poll for the result.
    }
  }

  return (
    <section className="mt-10">
      {phase.kind === 'offer' && (
        <RecordCard className="px-5 py-5">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Go deeper</p>
          <p className="mb-3 max-w-[60ch] font-serif text-[16px] italic leading-relaxed text-pi-ink">
            I can read the actual reviews of the {topN} strongest brands in this market (by measured
            revenue) — not every seller out there, the ones actually holding it — and tell you exactly
            why their buyers are disappointed, and what the winners get right.
          </p>
          <p className="mb-4 max-w-[60ch] text-[13px] leading-relaxed text-pi-sub">
            This is a real run: it pulls live review data and takes a few minutes. It runs{' '}
            <strong className="font-semibold text-pi-ink">once</strong> for this analysis — the result is kept here permanently.
          </p>
          {phase.error && <p className="mb-3 text-[13px] text-pi-risk">{phase.error}</p>}
          <button
            type="button"
            onClick={run}
            className="rounded-[10px] bg-pi-ink px-[18px] py-[11px] text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Interrogate their reviews →
          </button>
        </RecordCard>
      )}

      {phase.kind === 'running' && (
        <RecordCard className="px-5 py-5">
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Interrogating</p>
          <p className="mb-3 max-w-[60ch] font-serif text-[16px] italic leading-relaxed text-pi-ink">
            Reading their customers&apos; own words. This takes a couple of minutes — you can leave;
            the result will be here when you come back.
          </p>
          <div className="h-[3px] overflow-hidden rounded-full bg-pi-sand">
            <div className="h-full w-2/5 animate-pulse rounded-full bg-pi-gold-deep" />
          </div>
        </RecordCard>
      )}

      {phase.kind === 'report' && <ReportView vm={phase.vm} unsaved={phase.unsaved} />}
    </section>
  )
}

function MarkerDot({ tone }: { tone: 'measured' | 'judgment' }) {
  return <span aria-hidden className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-[1px] ${tone === 'measured' ? 'bg-pi-ink' : 'bg-pi-gold-deep'}`} />
}

function ReportView({ vm, unsaved }: { vm: CompetitiveReviewsVM; unsaved?: boolean }) {
  return (
    <div className="space-y-3.5">
      <RecordCard className="px-5 py-5">
        <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">What their buyers keep saying</p>
        <p className="mb-4 font-mono text-[11px] text-pi-faint"><MarkerDot tone="measured" />{vm.statsLine}</p>
        {vm.gaps.map((g, i) => (
          <div key={i} className="border-t border-pi-hairline py-3">
            <p className="mb-1 text-sm leading-relaxed text-pi-ink"><MarkerDot tone="judgment" />{g.text}</p>
            <p className="ml-3.5 font-mono text-[11px] text-pi-ink">
              <MarkerDot tone="measured" />{g.prevalenceLabel} · severity {g.severity.toLowerCase()}
            </p>
          </div>
        ))}
      </RecordCard>

      {vm.winnerFeatures.length > 0 && (
        <RecordCard className="px-5 py-5">
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">What the winners get right</p>
          {vm.winnerFeatures.map((f, i) => (
            <p key={i} className="py-0.5 text-sm leading-relaxed text-pi-ink"><MarkerDot tone="judgment" />{f}</p>
          ))}
        </RecordCard>
      )}

      {vm.competitors.length > 0 && (
        <RecordCard className="px-5 py-5">
          <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Per brand</p>
          {vm.competitors.map((c, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 border-t border-pi-hairline py-3 first:border-t-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-pi-ink">{c.name}</p>
                {c.topComplaints.length > 0 && (
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-pi-sub">{c.topComplaints.join(' · ')}</p>
                )}
              </div>
              <span className="shrink-0 whitespace-nowrap font-mono text-xs text-pi-ink">
                <MarkerDot tone="measured" />{c.rating}★ · {c.reviews} reviews
              </span>
            </div>
          ))}
        </RecordCard>
      )}

      {vm.productBrief && (
        <RecordCard className="relative rounded-xl py-4 pl-5 pr-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
          <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-pi-gold-deep" />
          {/* Deliberately an ADDENDUM to the Gap chapter's build spec, never a
              second standalone answer (V4_PRODUCT_ARCHITECTURE.md §3: one
              answer per question) — the label subordinates it explicitly. */}
          <p className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-pi-gold">
            What their reviews add to the Gap chapter&apos;s spec
          </p>
          <p className="max-w-[65ch] break-words font-serif text-[16px] italic leading-relaxed text-pi-ink">{vm.productBrief}</p>
        </RecordCard>
      )}

      {unsaved && (
        <p className="text-[12px] italic leading-relaxed text-pi-faint">
          This report could not be saved — it will not be here on your next visit.
        </p>
      )}
    </div>
  )
}
