'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { fetchPositions, type Position } from '@/lib/positions'
import { positionVerdictLabel } from '@/lib/partner-copy'

// ── Positions strip (V4_PRODUCT_ARCHITECTURE.md §4: "Positions live in a
// strip that grows into a desk only when the portfolio does") — "hidden
// entirely at zero positions" per the Phase-1 spec. A client fetch (not a
// server-component read) because app/api/positions/route.ts is owned by
// the parallel data-database-agent and may not exist yet (or the
// migration may not be applied) — see lib/positions.ts's own honest
// no-retry, no-silent-swallow contract. A read failure here degrades to
// the same "nothing to show" state as genuinely zero positions: this is a
// discovery surface, not a form submission, so there is no user action to
// retry — the Pull flow (components/partner/brief/PullSheet.tsx) is where
// a write failure gets its own visible, retriable honest-failure line.
export function PositionsStrip() {
  const [positions, setPositions] = useState<Position[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchPositions()
      .then(res => { if (!cancelled) setPositions(res.positions) })
      .catch(() => { if (!cancelled) setPositions([]) })
    return () => { cancelled = true }
  }, [])

  if (!positions || positions.length === 0) return null

  return (
    <section aria-label="Your positions" className="mb-8">
      <p className="mb-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">
        Your positions
      </p>
      <ul className="flex gap-2.5 overflow-x-auto pb-1">
        {positions.map(p => (
          <li key={p.analysisId} className="shrink-0">
            <Link
              href={`/app/brief/${p.analysisId}`}
              className="flex min-w-[180px] flex-col gap-1 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3 transition-colors hover:border-pi-ink/30"
            >
              <span className="truncate text-sm font-semibold text-pi-ink">{p.categoryName}</span>
              <span className="font-mono text-[10px] uppercase tracking-wide text-pi-sub">
                {p.state === 'validating' ? 'Validating' : p.state === 'watching' ? 'Watching' : 'Killed'}
                {' · '}{positionVerdictLabel(p.decision, p.insufficientEvidence)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
