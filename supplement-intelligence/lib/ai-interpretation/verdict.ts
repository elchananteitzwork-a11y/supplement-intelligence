// ── Verdict display utilities (spec §6.2, §6.3, §6.4) ────────────────────────
// All functions are deterministic and template-based — no AI involvement.
// Covers: verdict display text (AT-VERDICT-003), confidence qualifier
// (AT-VERDICT-004), and verdict_confidence computation.

import type { VerdictLabel, ConfidenceTier } from './types'
import type { BuildDecision } from '@/types/index'

// §6.2 — approved display strings, verbatim. Never AI-generated.
export const VERDICT_DISPLAY_TEXT: Record<VerdictLabel, string> = {
  ENTRY_SUPPORTED:      'The evidence supports market entry',
  VALIDATION_REQUIRED:  'The evidence requires validation before entry',
  ENTRY_NOT_SUPPORTED:  'The evidence does not support market entry',
}

export function verdictDisplayText(label: VerdictLabel): string {
  return VERDICT_DISPLAY_TEXT[label]
}

// §6.1 — derive VerdictLabel from overall score using spec thresholds.
export function verdictLabelFromScore(score: number): VerdictLabel {
  if (score >= 65) return 'ENTRY_SUPPORTED'
  if (score >= 40) return 'VALIDATION_REQUIRED'
  return 'ENTRY_NOT_SUPPORTED'
}

// Maps BuildDecision (existing system) to VerdictLabel (spec §6 system).
// CATEGORY_CREATION_CANDIDATE maps to VALIDATION_REQUIRED — both require
// validation before any capital commitment.
export function verdictLabelFromDecision(decision: BuildDecision): VerdictLabel {
  if (decision === 'BUILD_NOW')             return 'ENTRY_SUPPORTED'
  if (decision === 'VALIDATE_FURTHER')      return 'VALIDATION_REQUIRED'
  if (decision === 'CATEGORY_CREATION_CANDIDATE') return 'VALIDATION_REQUIRED'
  return 'ENTRY_NOT_SUPPORTED'
}

// §6.3 — verdict_confidence from expandable card tiers.
// Cards use ConfidenceTier: HIGH = CONFIRMED, MODERATE = INDICATED, LOW = LIMITED.
export function computeVerdictConfidence(
  cards: Record<string, { confidence: ConfidenceTier }>,
): ConfidenceTier {
  // thin_corpus = true (consumer_pain not CONFIRMED) → LOW
  // consumer_pain excluded (no card) → LOW
  const cpCard = cards['consumer_pain']
  if (!cpCard || cpCard.confidence !== 'HIGH') return 'LOW'

  // All demand providers returned LIMITED → LOW
  if (cards['demand']?.confidence === 'LOW') return 'LOW'

  const tiers = Object.values(cards).map(c => c.confidence)
  const confirmed = tiers.filter(t => t === 'HIGH' || t === 'MODERATE').length
  const limited   = tiers.filter(t => t === 'LOW').length

  if (confirmed >= 4 && limited === 0) return 'HIGH'
  if (confirmed >= 2 && limited <= 1)  return 'MODERATE'
  return 'LOW'
}

// §6.4 — static template qualifier shown when verdict_confidence ≠ HIGH.
// Returns null when qualifier must not be shown (HIGH confidence).
export function buildConfidenceQualifier(
  cards: Record<string, { confidence: ConfidenceTier }>,
): string | null {
  const confidence = computeVerdictConfidence(cards)
  if (confidence === 'HIGH') return null

  const confirmedCount = Object.values(cards).filter(c => c.confidence === 'HIGH').length
  const n   = confirmedCount
  const noun = n === 1 ? 'signal' : 'signals'
  let qualifier = `Based on ${n} confirmed ${noun}.`

  // Consumer pain excluded (no card) — name the specific exclusion.
  if (!cards['consumer_pain']) {
    qualifier += ' Consumer pain assessment was not possible with available data.'
  }

  return qualifier
}
