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
//
// `cls` is the combined text+background pill treatment (chip consumers);
// `textCls` is just the text-color token, for consumers that want the
// verdict color WITHOUT a chip background (e.g. CandidateCoreHero.tsx's
// large verdict word) — a named field, not a string-parse of `cls`
// (simplify-pass fix: `cls.split(' ')[0]` was fragile against token order).
export const DECISION_CHIP: Record<PipelineCandidate['decision'], { label: string; cls: string; textCls: string; glyph: string }> = {
  BUILD_NOW:                    { label: 'Build now',        cls: 'text-pi-build bg-pi-build/10',   textCls: 'text-pi-build',  glyph: '▲' },
  VALIDATE_FURTHER:             { label: 'Validate further', cls: 'text-pi-invest bg-pi-invest/10', textCls: 'text-pi-invest', glyph: '◆' },
  SKIP:                         { label: 'Skip',             cls: 'text-pi-pass bg-pi-pass/10',     textCls: 'text-pi-pass',   glyph: '—' },
  CATEGORY_CREATION_CANDIDATE:  { label: 'Category play',    cls: 'text-pi-gold bg-pi-gold/10',     textCls: 'text-pi-gold',   glyph: '✦' },
}
