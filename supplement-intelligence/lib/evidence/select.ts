// ── Evidence Layer — First-Screen Signal Selection ────────────────────────
// Spec §5.3. Selects exactly 3 signals from the scored set for the detail pane.
// Selection is verdict-conditional; ties are broken by dimension weight.

import type { VerdictLabel, SynthesisSignal } from '@/lib/ai-interpretation/types'

// ── Dimension weights (spec §5.1) ─────────────────────────────────────────
// Used only for tie-breaking when scores are equal.

export const SIGNAL_WEIGHTS: Record<string, number> = {
  demand:                   22,
  profitability:            20,
  market_accessibility:     18,
  consumer_pain:            18,
  virality:                 10,
  subscription_potential:    7,
  manufacturing_feasibility: 5,
}

// ── Sorting helpers ───────────────────────────────────────────────────────

function byScoreDesc(a: SynthesisSignal, b: SynthesisSignal): number {
  if (b.score !== a.score) return b.score - a.score
  // Tie-break by weight (higher weight = earlier)
  return (SIGNAL_WEIGHTS[b.id] ?? 0) - (SIGNAL_WEIGHTS[a.id] ?? 0)
}

function byScoreAsc(a: SynthesisSignal, b: SynthesisSignal): number {
  if (a.score !== b.score) return a.score - b.score
  // Tie-break ascending: lower weight = earlier (weakest first)
  return (SIGNAL_WEIGHTS[a.id] ?? 0) - (SIGNAL_WEIGHTS[b.id] ?? 0)
}

// ── Public API ─────────────────────────────────────────────────────────────
// Spec §5.3 first-screen selection rules:
//
//   ENTRY_SUPPORTED     → 3 highest-scored signals (CONFIRMED or INDICATED confidence)
//   VALIDATION_REQUIRED → highest-scored signal + two lowest-scored signals
//   ENTRY_NOT_SUPPORTED → 3 lowest-scored signals
//
// The function returns exactly 3 signals (or all if fewer than 3 are present).
// Signals passed in should already be filtered to those with CONFIRMED/INDICATED
// confidence by the caller; this function does not filter by confidence tier.

export function selectFirstScreenSignals(
  signals: SynthesisSignal[],
  verdict: VerdictLabel,
): SynthesisSignal[] {
  if (signals.length <= 3) return [...signals]

  switch (verdict) {
    case 'ENTRY_SUPPORTED': {
      return [...signals].sort(byScoreDesc).slice(0, 3)
    }

    case 'VALIDATION_REQUIRED': {
      const sorted = [...signals].sort(byScoreDesc)
      const highest = sorted[0]
      // Two lowest come from the end of an ascending sort
      const twoLowest = [...signals].sort(byScoreAsc).slice(0, 2)
      // Deduplicate: if highest also appears in twoLowest (edge case with ≤3), skip
      const selected: SynthesisSignal[] = [highest]
      for (const s of twoLowest) {
        if (s.id !== highest.id) selected.push(s)
        if (selected.length === 3) break
      }
      // If we still need more (e.g. all had same id somehow), fill from sorted
      if (selected.length < 3) {
        for (const s of sorted) {
          if (!selected.some(x => x.id === s.id)) selected.push(s)
          if (selected.length === 3) break
        }
      }
      return selected
    }

    case 'ENTRY_NOT_SUPPORTED': {
      return [...signals].sort(byScoreAsc).slice(0, 3)
    }
  }
}
