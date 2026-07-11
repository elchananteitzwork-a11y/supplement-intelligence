// ═══════════════════════════════════════════════════════════════════════
// Badges & evidence indicators — reskinned to the neo-brutalist system.
// Two families: filled Verdict badges, outline Provenance badges.
// Plus the Evidence Strength meter — a direct, honest visualization
// of lib/scoring.ts's real evidenceBreadth output. No data computed here;
// every prop is read from an existing real value.
// ═══════════════════════════════════════════════════════════════════════

import type { BuildDecision } from '@/types/index'
import type { Provenance, ProvenanceLevel } from '@/lib/provenance'

type EvidenceType = ProvenanceLevel

const EVIDENCE_CFG: Record<EvidenceType, { label: string; cls: string; dot: string }> = {
  verified:    { label: 'Verified Data',                    cls: 'text-black border-black',           dot: 'bg-black' },
  estimated:   { label: 'AI Interpretation',                cls: 'text-[#a67c00] border-[#a67c00]',    dot: 'bg-[#a67c00]' },
  synthesized: { label: 'AI Interpretation',                cls: 'text-[#4c4546] border-black',        dot: 'bg-[#4c4546]' },
  unknown:     { label: 'Unsupported / Needs Verification', cls: 'text-[#d32f2f] border-[#d32f2f]',    dot: 'bg-[#d32f2f]' },
  unsupported: { label: 'Unsupported / Needs Verification', cls: 'text-[#d32f2f] border-[#d32f2f]',    dot: 'bg-[#d32f2f]' },
}

/** Provenance badge — outline-weight, used profusely throughout
 * evidence panels. Deliberately lower visual weight than VerdictBadge. */
export function EvidenceBadge({ type, detail, source }: { type: EvidenceType; detail?: string; source?: string }) {
  const { label, cls, dot } = EVIDENCE_CFG[type]
  const title = detail ? (source ? `${source} — ${detail}` : detail) : undefined
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold border px-2 py-0.5 uppercase tracking-wide shrink-0 cursor-default bg-white ${cls}`}
      title={title}
    >
      <span className={`w-1 h-1 rounded-full ${dot} shrink-0`} />
      {label}
    </span>
  )
}

export function ProvenanceBadge({ p }: { p: Provenance }) {
  return <EvidenceBadge type={p.level} source={p.source} detail={p.detail} />
}

/** Same evidence levels, but the detail renders as visible text — for
 * first-read content where "hover to find out if this is real" is
 * exactly the failure mode being avoided. */
export function ProvenanceCaption({ p }: { p: Provenance }) {
  const { label, cls } = EVIDENCE_CFG[p.level]
  return (
    <div className={`flex items-start gap-2 text-[11px] border px-2.5 py-2 bg-white ${cls}`}>
      <span className="font-semibold shrink-0 whitespace-nowrap">{label}:</span>
      <span className="opacity-90">{p.detail}</span>
    </div>
  )
}

const VERDICT_CFG: Record<BuildDecision, { label: string; cls: string; dot: string }> = {
  BUILD_NOW:        { label: 'Entry Supported',     cls: 'text-white bg-[#008a00] border-[#008a00]', dot: 'bg-white' },
  VALIDATE_FURTHER: { label: 'Validation Required', cls: 'text-black bg-[#fbc02d] border-[#fbc02d]',  dot: 'bg-black' },
  SKIP:             { label: 'Not Supported',       cls: 'text-white bg-[#d32f2f] border-[#d32f2f]',  dot: 'bg-white' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation', cls: 'text-white bg-black border-black', dot: 'bg-white' },
}

/** Verdict badge — filled, the one decisive call-out per analysis. */
export function VerdictBadge({
  d, insufficientEvidence,
}: { d: BuildDecision; insufficientEvidence?: boolean; withGlow?: boolean }) {
  const cfg = insufficientEvidence
    ? { label: 'Insufficient Data', cls: 'text-[#4c4546] bg-white border-black', dot: 'bg-[#4c4546]' }
    : VERDICT_CFG[d]
  return (
    <span className={`inline-flex items-center gap-2 font-black text-[11px] tracking-[0.16em] px-3 py-1.5 border uppercase ${cfg.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function ConfidencePill({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High'
    ? 'text-[#008a00] border-[#008a00] bg-white'
    : level === 'Medium'
      ? 'text-[#a67c00] border-[#a67c00] bg-white'
      : 'text-[#7e7576] border-black bg-white'
  const dot = level === 'High' ? 'bg-[#008a00]' : level === 'Medium' ? 'bg-[#a67c00]' : 'bg-[#7e7576]'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {note}
    </span>
  )
}

/** Evidence Strength meter — visualizes evidenceBreadth.
 * contributingProviders / totalScoreEligibleProviders. Purely
 * presentational; computes nothing, reads two already-real numbers. */
export function EvidenceMeter({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="flex gap-1" role="img" aria-label={`${filled} of ${total} providers contributed real evidence`}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full border border-black ${i < filled ? 'bg-black' : 'bg-white'}`}
        />
      ))}
    </div>
  )
}
