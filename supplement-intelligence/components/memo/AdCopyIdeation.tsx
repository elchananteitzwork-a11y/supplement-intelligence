// ═══════════════════════════════════════════════════════════════════════
// AI Creative & Ad-Copy Ideation — AI-synthesized customer archetype +
// quote pinboard from MemoData.customer_language. Renamed and relocated
// out of the "Differentiation Brief" section (previously
// components/memo/DifferentiationBrief.tsx): Stitch's real Differentiation
// Brief section (Investor Report §6) shows clustered REAL customer quotes
// with unserved-claim callouts — that's the new components/memo/DifferentiationBrief.tsx's
// job, using real review-derived themes. This component's content is
// AI-invented ad-copy/persona material with no real review backing —
// putting it under the same name as the real section was a naming
// collision, not just cosmetic. Now lives inside the Launch Strategy
// extension (go-to-market ideation), explicitly disclosed as synthesized.
// ═══════════════════════════════════════════════════════════════════════

import type { MemoData } from '@/types/index'
import { HardCard } from '@/components/ui'
import { STATIC_PROVENANCE } from '@/lib/provenance'
import { ProvenanceBadge } from './shared'
import { IconArrowRight } from '@/components/icons'

function ConsumerArchetype({ m }: { m: MemoData }) {
  const cl = m.customer_language
  const fields = ([
    ['Core Frustration', cl.frustrations?.[0]],
    ['What They Want',   cl.desires?.[0]],
    ['What They Fear',   cl.fears?.[0]],
    ['Where This Lands', cl.ad_phrases?.[0]?.use_in_copy],
  ] as [string, string | undefined][]).filter(([, v]) => !!v)

  if (fields.length === 0) return null

  return (
    <HardCard>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] text-outline uppercase tracking-wider">Customer Archetype</p>
        <ProvenanceBadge p={STATIC_PROVENANCE.customerLanguage} />
      </div>
      <dl className="grid sm:grid-cols-2 gap-x-5 gap-y-3.5">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[9px] text-outline uppercase tracking-wider mb-1">{label}</dt>
            <dd className="text-[13px] text-black leading-snug">{value}</dd>
          </div>
        ))}
      </dl>
    </HardCard>
  )
}

type Kind = 'voice' | 'desire' | 'fear' | 'ad'
const KIND_CFG: Record<Kind, { label: string; cls: string }> = {
  voice:  { label: 'Voice of Customer', cls: 'border-l-outline' },
  desire: { label: 'Desire',            cls: 'border-l-black' },
  fear:   { label: 'Fear / Risk',       cls: 'border-l-verdict-negative' },
  ad:     { label: 'Ad-Ready',          cls: 'border-l-verdict-positive' },
}

export default function AdCopyIdeation({ m }: { m: MemoData }) {
  const cl = m.customer_language

  const cards: { id: string; kind: Kind; node: React.ReactNode }[] = [
    ...cl.frustrations.map((q, i) => ({
      id: `fr-${i}`, kind: 'voice' as const,
      node: <p className="italic text-[14px] text-ink-variant leading-relaxed">&ldquo;{q}&rdquo;</p>,
    })),
    ...cl.ad_phrases.map((ap, i) => ({
      id: `ad-${i}`, kind: 'ad' as const,
      node: (
        <div className="space-y-2">
          <p className="text-[11px] text-outline italic leading-relaxed">&ldquo;{ap.they_say}&rdquo;</p>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-verdict-positive">
            <IconArrowRight className="w-3 h-3" />Use in copy
          </div>
          <p className="text-[13px] text-black font-medium leading-relaxed">{ap.use_in_copy}</p>
        </div>
      ),
    })),
    ...cl.desires.map((d, i) => ({ id: `de-${i}`, kind: 'desire' as const, node: <p className="text-[13px] text-black leading-relaxed">{d}</p> })),
    ...cl.fears.map((f, i) => ({ id: `fe-${i}`, kind: 'fear' as const, node: <p className="text-[13px] text-black leading-relaxed">{f}</p> })),
  ]

  return (
    <div className="space-y-6">
      <ConsumerArchetype m={m} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-outline italic leading-relaxed max-w-2xl">
          Every card below is AI-synthesized customer language, not a real review or survey quote. Useful for ideation and ad-copy testing, not as evidence of documented sentiment — see the Differentiation Brief section above for the real review-derived themes.
        </p>
        <ProvenanceBadge p={STATIC_PROVENANCE.customerLanguage} />
      </div>

      {cards.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-3">
          {cards.map(card => {
            const cfg = KIND_CFG[card.kind]
            return (
              <div key={card.id} className={`bg-white border border-black border-l-[3px] ${cfg.cls} p-4`}>
                <span className="text-[9px] font-semibold uppercase tracking-wider block mb-2 text-outline">{cfg.label}</span>
                {card.node}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
