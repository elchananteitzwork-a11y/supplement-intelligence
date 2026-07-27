import Link from 'next/link'
import { positionVerdictLabel, VERDICT_TONE, INSUFFICIENT_EVIDENCE_TONE } from '@/lib/partner-copy'
import type { BuildDecision } from '@/types/index'

// Recent hunts — the Stream's chronological log of the user's latest
// analyses, all verdicts (2026-07-26 analyses-gap fix: after the one-home
// change, /dashboard left primary navigation and the Stream had no way to
// reach a non-positive verdict again — Opportunities is positive-only by
// design). Each row opens the V4 Brief; "All analyses" links to the full
// legacy list, which remains the only complete view.
//
// `insufficientEvidence` is computed server-side per row from the real
// memo_data (computeGroundedScore), never inferred from the raw persisted
// decision — a stored 'SKIP' can be an internal insufficient-evidence
// artifact, not a real "Not Supported" judgment (same honesty rule as
// PositionsStrip / lib/positions.ts's own field comment).
export interface RecentHuntVM {
  id:                   string
  categoryName:         string
  decision:             BuildDecision
  insufficientEvidence: boolean
  createdAt:            string
}

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function RecentHunts({ items }: { items: RecentHuntVM[] }) {
  if (items.length === 0) return null

  return (
    <section className="mt-8">
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Recent hunts</p>
      <ul className="space-y-2">
        {items.map(item => {
          const tone = item.insufficientEvidence ? INSUFFICIENT_EVIDENCE_TONE : VERDICT_TONE[item.decision]
          return (
            <li key={item.id}>
              <Link
                href={`/app/brief/${item.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)]"
              >
                <span className="min-w-0 flex items-baseline gap-2.5">
                  <span className="truncate text-sm text-pi-ink">{item.categoryName}</span>
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-pi-faint">{whenLabel(item.createdAt)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-pi-sub">
                  <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {positionVerdictLabel(item.decision, item.insufficientEvidence)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 text-right">
        <Link href="/dashboard" className="text-[13px] text-pi-gold hover:underline">
          All analyses →
        </Link>
      </div>
    </section>
  )
}
