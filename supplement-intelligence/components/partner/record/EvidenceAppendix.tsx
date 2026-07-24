import type { EvidenceAppendixVM } from '@/lib/partner-copy-record'

// The Evidence appendix (V4 Phase 2, RD_V4_PHASE2.md Milestone B) — the
// deepest, plainest layer: read-only, single column, no interaction beyond
// scrolling. Scope note: see lib/partner-copy-record.ts's header comment —
// the full competitor table is a disclosed fast-follow, not silently
// missing.
export function EvidenceAppendix({
  categoryName, verdictWord, freshness, vm,
}: {
  categoryName: string
  verdictWord: string
  freshness: string
  vm: EvidenceAppendixVM
}) {
  return (
    <div className="min-h-screen bg-pi-cream pb-16 text-pi-ink">
      <div className="mx-auto max-w-[640px] px-6 pt-10">
        <p className="mb-6 font-mono text-[11px] uppercase tracking-[0.08em] text-pi-faint">
          {categoryName} — Evidence appendix
        </p>
        <p className="mb-1 text-[13px] font-semibold text-pi-ink">{verdictWord}</p>
        <p className="mb-8 text-[12px] text-pi-faint">{freshness}</p>

        {vm.keywords.length > 0 && (
          <section className="mb-10">
            <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Every keyword checked</p>
            <p className="mb-3 text-[13px] text-pi-sub">Real monthly volume for each keyword I checked, with growth where I had enough history to compute it.</p>
            <div className="divide-y divide-pi-hairline rounded-2xl border border-pi-hairline bg-pi-card px-4 shadow-[0_1px_2px_rgba(22,23,26,0.04)]">
              {vm.keywords.map((k, i) => (
                <div key={i} className="flex items-baseline justify-between gap-3 py-2.5 text-[13px]">
                  <span className="min-w-0 max-w-[50%] truncate text-pi-ink">{k.term}</span>
                  <span className="flex gap-3 whitespace-nowrap font-mono tabular-nums text-pi-ink">
                    {k.growthLabel && (
                      <span className={k.growthLabel.startsWith('-') ? 'text-pi-risk' : k.growthLabel.startsWith('+') ? 'text-pi-build' : 'text-pi-faint'}>
                        {k.growthLabel}
                      </span>
                    )}
                    <span className="font-semibold">{k.volume.toLocaleString()}/mo</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {vm.sources.length > 0 && (
          <section className="mb-10">
            <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-pi-gold">Sources consulted</p>
            <ul className="space-y-1.5 text-[13px] text-pi-ink">
              {vm.sources.map((s, i) => <li key={i}>{s.name}</li>)}
            </ul>
            {vm.overallConfidence !== null && (
              <p className="mt-3 text-[12px] text-pi-faint">Overall confidence across sources: {Math.round(vm.overallConfidence * 100)}%.</p>
            )}
          </section>
        )}

        <p className="mb-6 text-[12px] italic text-pi-faint">{vm.competitorsNote}</p>

        {vm.coverageLine && (
          <p className="border-t border-pi-hairline pt-6 text-[12px] leading-relaxed text-pi-faint">{vm.coverageLine}</p>
        )}
      </div>
    </div>
  )
}
