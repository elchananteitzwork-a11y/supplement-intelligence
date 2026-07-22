// Home rebuild (UIv2-M3) — pure presentational bucket over the *already*
// computed `computeAvgConfidence` percentage (components/dashboard/
// aggregates.ts). No new scoring/derivation: this only maps a real 0-100
// number to a word + dot-count for the pulse row so confidence is never
// shown as a raw, falsely-precise percentage.
//
// Thirds split (<34 / 34-66 / >=67) is an invented display convention, not
// sourced from an existing tiering system — flagged in RD-UIv2-M3-home-
// rebuild.md §4 Risks for owner review; a one-line change if adjusted later.
//
// Deliberately a NEW three-word vocabulary (Limited/Moderate/High) rather
// than reusing components/memo/InvestmentThesis.tsx's HIGH/MODERATE/LOW
// CONFIDENCE_LABEL — that label feeds a different real number
// (computeVerdictConfidence, a source-agreement count), and reusing its
// words would silently conflate two unrelated confidence concepts.
export interface ConfidenceTier {
  label: 'Limited' | 'Moderate' | 'High'
  dotsFilled: 1 | 2 | 3
}

export function confidenceTier(pct: number): ConfidenceTier {
  if (pct < 34) return { label: 'Limited', dotsFilled: 1 }
  if (pct < 67) return { label: 'Moderate', dotsFilled: 2 }
  return { label: 'High', dotsFilled: 3 }
}
