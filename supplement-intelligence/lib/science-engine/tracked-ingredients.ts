import { INGREDIENT_VOCABULARY } from './ingredient-vocabulary'
import { escapeRegex } from '@/lib/regulatory-engine/claim-risk'

// ── Tracked ingredients — Roadmap M2.5 ───────────────────────────────────────
//
// The nightly batch (app/api/cron/science-pipeline) only pulls real PubMed /
// ClinicalTrials.gov data for ingredients on this fixed list — not "every
// ingredient anyone has ever queried." A real dynamic tracking mechanism
// (a user-driven watchlist) is Roadmap M2.8 ("Watchlist, alerts, kill
// criteria"), which doesn't exist yet; inventing an ad-hoc dynamic list here
// would be exactly the kind of speculative architecture this milestone was
// told not to add. Seeded instead with the same three ingredients this
// roadmap already treats as its own canonical benchmark set (see M1.2's and
// M1.6's acceptance criteria: "re-run 3 benchmark queries (berberine,
// creatine, magnesium)") — a real, already-established list, not a new one
// invented for this milestone alone.
//
// Matching against a free-text query (SignalContext.query) is a simple,
// deterministic whole-word substring check (see providers/science.ts) —
// good enough for this fixed, small list; a fuzzier/broader match isn't
// needed until the list itself grows past a handful of entries.
export const TRACKED_INGREDIENTS = ['berberine', 'creatine', 'magnesium'] as const

export type TrackedIngredient = typeof TRACKED_INGREDIENTS[number]

// Roadmap "Dynamic Science Coverage" (docs/RD_DYNAMIC_SCIENCE_COVERAGE.md,
// owner-approved 2026-07-28): after the 3 benchmark TRACKED_INGREDIENTS
// (checked first, always winning ties — byte-identical behavior to before
// this milestone), fall through to the wider curated vocabulary
// (lib/science-engine/ingredient-vocabulary.ts). Same whole-word,
// deterministic exact-match discipline — no NLP, no fuzzy matching. When a
// query happens to name more than one vocabulary ingredient, only the
// longest matched term wins; this is a disclosed non-goal (no multi-
// ingredient/formula support, see the R&D doc's §7) rather than an attempt
// to find every ingredient a query names.
//
// Return type necessarily widens from the 3-item TrackedIngredient literal
// union to `string | null` — every real call site (lib/signal-engine/
// providers/science.ts's cache-key lookup, app/api/generate/route.ts's
// `!== null` boolean check) already handles an arbitrary string safely; see
// this milestone's own R&D doc for the full call-site audit.
export function matchTrackedIngredient(query: string): string | null {
  const q = query.toLowerCase()
  for (const ingredient of TRACKED_INGREDIENTS) {
    if (new RegExp(`\\b${ingredient}\\b`).test(q)) return ingredient
  }

  let best: { canonical: string; matchedLength: number } | null = null
  for (const entry of INGREDIENT_VOCABULARY) {
    for (const term of [entry.canonical, ...entry.aliases]) {
      if (new RegExp(`\\b${escapeRegex(term)}\\b`).test(q)) {
        if (!best || term.length > best.matchedLength) {
          best = { canonical: entry.canonical, matchedLength: term.length }
        }
      }
    }
  }
  return best?.canonical ?? null
}
