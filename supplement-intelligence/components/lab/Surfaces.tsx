'use client'

// ═══════════════════════════════════════════════════════════════════════
// Surface primitives — reskinned to the neo-brutalist white/black system.
// Card tiers, glass panels, loading skeleton, empty state.
// ═══════════════════════════════════════════════════════════════════════

import type { ReactNode } from 'react'

type ProvenanceTier = 'verified' | 'estimated' | 'synthesized' | 'unsupported' | 'unknown'

const PROVENANCE_BORDER: Record<ProvenanceTier, string> = {
  verified: 'border-l-black',
  estimated: 'border-l-[#a67c00]',
  synthesized: 'border-l-black',
  unsupported: 'border-l-[#d32f2f]',
  unknown: 'border-l-[#7e7576]',
}

/** Surface tier — flat container, no hover affordance. */
export function LabCard({
  children, className = '', as: As = 'div',
}: { children: ReactNode; className?: string; as?: 'div' | 'section' }) {
  const Comp = As as 'div'
  return (
    <Comp className={`bg-white border border-black ${className}`}>
      {children}
    </Comp>
  )
}

/** Evidence tier — a card carrying a real claim, with a left
 * accent bar colored by provenance tier. The single most-reused card in
 * the report: every evidence-backed metric panel uses this. */
export function LabEvidenceCard({
  children, tier, className = '',
}: { children: ReactNode; tier: ProvenanceTier; className?: string }) {
  return (
    <div className={`bg-white border border-black ${PROVENANCE_BORDER[tier]} border-l-[3px] ${className}`}>
      {children}
    </div>
  )
}

/** Interactive tier — lifts and shows a hard shadow on hover. */
export function LabCardInteractive({
  children, className = '', onClick,
}: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-black transition-all duration-150 hover:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:-translate-x-[1px] hover:-translate-y-[1px] ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Glass tier — premium hero/dossier panels. Flat white card with a
 * heavier border in this system; no blur/glow (neo-brutalist has no
 * translucency), tier/glow props kept for API compatibility only. */
export function LabGlass({
  children, className = '',
}: {
  children: ReactNode; className?: string
  tier?: 'thin' | 'regular' | 'heavy'
  glow?: 'photon' | 'spectrum' | 'verdant' | 'amber' | 'ember'
}) {
  return (
    <div className={`relative bg-white border-2 border-black ${className}`}>
      {children}
    </div>
  )
}

/** Loading skeleton — flat gray bar, no shimmer (kept simple/flat per the
 * neo-brutalist system). */
export function LabSkeleton({
  className = '', height = 16,
}: { className?: string; height?: number }) {
  return <div className={`bg-[#e2e2e2] animate-pulse ${className}`} style={{ height }} />
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

/** Empty state — never blank. One icon, one sentence, one action. */
export function LabEmptyState({
  icon, title, description, action,
}: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-12 h-12 border border-black flex items-center justify-center mb-4 text-[#7e7576]">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-[#4c4546]">{title}</p>
      {description && <p className="text-xs text-[#7e7576] mt-1.5 max-w-sm leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Inline, low-weight empty state for an evidence row/cell — frequent and
 * expected (a dimension with no real data), so it stays visually quiet. */
export function LabNoData({ label = 'No data available' }: { label?: string }) {
  return <span className="font-mono text-sm text-[#7e7576] italic">{label}</span>
}
