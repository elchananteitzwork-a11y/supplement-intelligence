// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — badges & evidence indicators
// Two families per §10: filled Verdict badges, outline Provenance badges.
// Plus the Evidence Strength meter (§16) — a direct, honest visualization
// of lib/scoring.ts's real evidenceBreadth output. No data computed here;
// every prop is read from an existing real value.
// ═══════════════════════════════════════════════════════════════════════

import type { BuildDecision } from '@/types/index'
import type { Provenance, ProvenanceLevel } from '@/lib/provenance'

type EvidenceType = ProvenanceLevel

const EVIDENCE_CFG: Record<EvidenceType, { label: string; cls: string; dot: string }> = {
  verified:    { label: 'Verified Data',                    cls: 'text-lab-photon bg-lab-photon/10 border-lab-photon/30',     dot: 'bg-lab-photon' },
  estimated:   { label: 'AI Interpretation',                cls: 'text-lab-amber bg-lab-amber/10 border-lab-amber/30',         dot: 'bg-lab-amber' },
  synthesized: { label: 'AI Interpretation',                cls: 'text-lab-spectrum bg-lab-spectrum/10 border-lab-spectrum/30', dot: 'bg-lab-spectrum' },
  unknown:     { label: 'Unsupported / Needs Verification', cls: 'text-lab-ember bg-lab-ember/10 border-lab-ember/30',         dot: 'bg-lab-ember' },
  unsupported: { label: 'Unsupported / Needs Verification', cls: 'text-lab-ember bg-lab-ember/10 border-lab-ember/30',         dot: 'bg-lab-ember' },
}

/** Provenance badge (§10) — outline-weight, used profusely throughout
 * evidence panels. Deliberately lower visual weight than VerdictBadge. */
export function EvidenceBadge({ type, detail, source }: { type: EvidenceType; detail?: string; source?: string }) {
  const { label, cls, dot } = EVIDENCE_CFG[type]
  const title = detail ? (source ? `${source} — ${detail}` : detail) : undefined
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2 py-0.5 tracking-wide shrink-0 cursor-default ${cls}`}
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
    <div className={`flex items-start gap-2 text-[11px] rounded-lab-sm border px-2.5 py-2 ${cls}`}>
      <span className="font-semibold shrink-0 whitespace-nowrap">{label}:</span>
      <span className="opacity-90">{p.detail}</span>
    </div>
  )
}

const VERDICT_CFG: Record<BuildDecision, { label: string; cls: string; dot: string; glow: string }> = {
  BUILD_NOW:        { label: 'Build Now',       cls: 'text-lab-verdant bg-lab-verdant/10 border-lab-verdant/30', dot: 'bg-lab-verdant', glow: 'shadow-lab-glow-verdant' },
  VALIDATE_FURTHER: { label: 'Validate First',  cls: 'text-lab-amber bg-lab-amber/10 border-lab-amber/30',       dot: 'bg-lab-amber',   glow: 'shadow-lab-glow-amber' },
  SKIP:             { label: 'Pass',            cls: 'text-lab-ember bg-lab-ember/10 border-lab-ember/30',       dot: 'bg-lab-ember',   glow: 'shadow-lab-glow-ember' },
  CATEGORY_CREATION_CANDIDATE: { label: 'Category Creation', cls: 'text-lab-spectrum bg-lab-spectrum/10 border-lab-spectrum/30', dot: 'bg-lab-spectrum', glow: 'shadow-lab-glow-spectrum' },
}

/** Verdict badge (§10) — filled, the one decisive call-out per analysis. */
export function VerdictBadge({
  d, insufficientEvidence, withGlow = false,
}: { d: BuildDecision; insufficientEvidence?: boolean; withGlow?: boolean }) {
  const cfg = insufficientEvidence
    ? { label: 'Insufficient Data', cls: 'text-lab-text-secondary bg-white/[0.06] border-lab-border-default', dot: 'bg-lab-text-secondary', glow: '' }
    : VERDICT_CFG[d]
  return (
    <span className={`inline-flex items-center gap-2 font-semibold text-[11px] tracking-[0.16em] px-3 py-1.5 rounded-full border uppercase ${cfg.cls} ${withGlow ? cfg.glow : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

export function ConfidencePill({ level, note }: { level: 'High' | 'Medium' | 'Low'; note: string }) {
  const cls = level === 'High'
    ? 'text-lab-verdant border-lab-verdant/25 bg-lab-verdant/10'
    : level === 'Medium'
      ? 'text-lab-amber border-lab-amber/25 bg-lab-amber/10'
      : 'text-lab-text-tertiary border-lab-border-default bg-white/[0.03]'
  const dot = level === 'High' ? 'bg-lab-verdant' : level === 'Medium' ? 'bg-lab-amber' : 'bg-lab-text-tertiary'
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {level} confidence · {note}
    </span>
  )
}

/** Evidence Strength meter (§16) — visualizes evidenceBreadth.
 * contributingProviders / totalScoreEligibleProviders. Purely
 * presentational; computes nothing, reads two already-real numbers. */
export function EvidenceMeter({ filled, total }: { filled: number; total: number }) {
  return (
    <div className="lab-evidence-meter" role="img" aria-label={`${filled} of ${total} providers contributed real evidence`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="lab-evidence-meter-segment" data-filled={i < filled ? 'true' : 'false'} />
      ))}
    </div>
  )
}
