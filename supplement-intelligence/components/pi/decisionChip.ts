// Shared decision->label/style mapping — deliberately a plain module (NOT
// 'use client', unlike CandidateRow.tsx) so it can be imported and dotted
// into from BOTH the client CandidateRow row-renderer and the server
// app/dashboard/page.tsx (composing AttentionCard's real verdict sentence).
// A 'use client' module's named exports can only be passed through by a
// server component, not read from directly (RSC boundary rule) — this
// file exists so there's still exactly one decision->label table, not two.
import type { PipelineCandidate } from './types'

// Verdict chips are semantic color + icon + word — never color alone
// (WCAG: information may not be conveyed by color only).
export const DECISION_CHIP: Record<PipelineCandidate['decision'], { label: string; cls: string; glyph: string }> = {
  BUILD_NOW:                    { label: 'Build now',        cls: 'text-pi-build bg-pi-build/10',   glyph: '▲' },
  VALIDATE_FURTHER:             { label: 'Validate further', cls: 'text-pi-invest bg-pi-invest/10', glyph: '◆' },
  SKIP:                         { label: 'Skip',             cls: 'text-pi-pass bg-pi-pass/10',     glyph: '—' },
  CATEGORY_CREATION_CANDIDATE:  { label: 'Category play',    cls: 'text-pi-gold bg-pi-gold/10',     glyph: '✦' },
}
