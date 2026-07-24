import Link from 'next/link'
import { VERDICT_WORD, VERDICT_TONE } from '@/lib/partner-copy'
import type { OpportunityVM } from '@/lib/opportunities'

// Opportunities — "Opportunities worth a look" on the Stream (V4 Phase 2,
// docs/RD_V4_PHASE2.md Milestone D). Corpus browsing over the user's own
// past positive-verdict analyses, deduped via the real supersede rule
// (lib/opportunities.ts) — never a personalized "build this instead"
// recommendation (RD §7 Non-goals). `id="opportunities"` is a real anchor
// target: BriefView links here after a real SKIP verdict ("Not Supported"
// fallback, see components/partner/brief/BriefView.tsx).
export function Opportunities({ items }: { items: OpportunityVM[] }) {
  if (items.length === 0) return null

  return (
    <section id="opportunities" className="mb-8 scroll-mt-8">
      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Opportunities worth a look</p>
      <ul className="space-y-2">
        {items.slice(0, 5).map(item => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-pi-hairline bg-pi-card px-4 py-3.5 shadow-[0_1px_2px_rgba(22,23,26,0.04)] transition-all duration-200 hover:-translate-y-px hover:border-pi-ink/25 hover:shadow-[0_6px_16px_-4px_rgba(22,23,26,0.12)]"
            >
              <span className="text-sm text-pi-ink">{item.categoryName}</span>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-pi-sub">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${VERDICT_TONE[item.buildDecision].dot}`} />
                {VERDICT_WORD[item.buildDecision]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
