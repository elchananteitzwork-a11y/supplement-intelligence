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

export function matchTrackedIngredient(query: string): TrackedIngredient | null {
  const q = query.toLowerCase()
  for (const ingredient of TRACKED_INGREDIENTS) {
    if (new RegExp(`\\b${ingredient}\\b`).test(q)) return ingredient
  }
  return null
}
