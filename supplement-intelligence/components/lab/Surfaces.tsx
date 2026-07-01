'use client'

// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — surface primitives
// Card tiers, glass panels, loading skeleton, empty state. See
// design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md §4, §8, §14, §15.
// ═══════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react'

type ProvenanceTier = 'verified' | 'estimated' | 'synthesized' | 'unsupported' | 'unknown'

const PROVENANCE_BORDER: Record<ProvenanceTier, string> = {
  verified: 'border-l-lab-photon',
  estimated: 'border-l-lab-amber',
  synthesized: 'border-l-lab-spectrum',
  unsupported: 'border-l-lab-ember',
  unknown: 'border-l-lab-text-tertiary',
}

/** Surface tier (§8) — flat container, no hover affordance. */
export function LabCard({
  children, className = '', as: As = 'div',
}: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const Comp = As as 'div'
  return (
    <Comp className={`bg-lab-void-2 border border-lab-border-soft rounded-lab-md shadow-lab-xs ${className}`}>
      {children}
    </Comp>
  )
}

/** Evidence tier (§8, §16) — a card carrying a real claim, with a left
 * accent bar colored by provenance tier. The single most-reused card in
 * the report: every evidence-backed metric panel uses this. */
export function LabEvidenceCard({
  children, tier, className = '',
}: { children: ReactNode; tier: ProvenanceTier; className?: string }) {
  return (
    <div className={`bg-lab-void-2 border border-lab-border-soft ${PROVENANCE_BORDER[tier]} border-l-[3px] rounded-lab-md shadow-lab-sm ${className}`}>
      {children}
    </div>
  )
}

/** Interactive tier (§8) — lifts and brightens on hover. */
export function LabCardInteractive({
  children, className = '', onClick,
}: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-lab-void-2 border border-lab-border-soft rounded-lab-md shadow-lab-xs transition-[border-color,box-shadow,transform] duration-lab-base ease-lab-standard hover:border-lab-photon/30 hover:shadow-lab-md hover:-translate-y-0.5 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Glass tier (§4) — premium hero/dossier panels. tier controls blur depth. */
export function LabGlass({
  children, className = '', tier = 'regular', glow,
}: {
  children: ReactNode; className?: string
  tier?: 'thin' | 'regular' | 'heavy'
  glow?: 'photon' | 'spectrum' | 'verdant' | 'amber' | 'ember'
}) {
  const blur = tier === 'thin' ? 12 : tier === 'heavy' ? 32 : 20
  const glowShadow = glow ? `shadow-lab-glow-${glow}` : ''
  return (
    <div
      className={`relative rounded-lab-lg border border-[rgba(255,255,255,.08)] ${glowShadow} ${className}`}
      style={{
        background: 'rgba(255,255,255,.045)',
        backdropFilter: `blur(${blur}px)`,
        WebkitBackdropFilter: `blur(${blur}px)`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.06)',
      }}
    >
      {children}
    </div>
  )
}

/** "Scan sweep" loading skeleton (§14) — the signature loading motif.
 * `lines` renders a stack of skeleton bars of decreasing width; pass
 * `children` instead for a custom shape (e.g. a circular gauge skeleton). */
export function LabSkeleton({
  className = '', height = 16,
}: { className?: string; height?: number }) {
  return <div className={`lab-skeleton ${className}`} style={{ height }} />
}

export function LabSkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, i) => (
        <LabSkeleton key={i} height={12} className={i === count - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  )
}

/** Empty state (§15) — never blank. One icon, one sentence, one action. */
export function LabEmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-lab-void-3 border border-lab-border-soft flex items-center justify-center mb-4 text-lab-text-tertiary">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-lab-text-secondary">{title}</p>
      {description && <p className="text-xs text-lab-text-tertiary mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Inline, low-weight empty state for an evidence row/cell — frequent and
 * expected (a dimension with no real data), so it stays visually quiet
 * rather than reusing the louder LabEmptyState. See §15's "exception". */
export function LabNoData({ label = 'No data available' }: { label?: string }) {
  return <span className="lab-text-data text-sm text-lab-text-tertiary italic">{label}</span>
}
