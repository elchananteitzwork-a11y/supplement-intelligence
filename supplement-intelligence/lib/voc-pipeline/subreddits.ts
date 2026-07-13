// ── Seed subreddits — Roadmap M2.7 ───────────────────────────────────────────
//
// Broadened from the existing per-query RedditProvider's 9 supplement-only
// subreddits (lib/signal-engine/providers/reddit.ts's SUPPLEMENT_SUBREDDITS)
// to match this pipeline's wider, cross-vertical scope — Blueprint's own
// framing is "productizes what VOC research proved manually," and that
// research spanned health/wellness/beauty/women's-health/pets/fitness, not
// supplements alone. Real, existing subreddit names; a curated seed list,
// not exhaustive — an explicit, disclosed starting point (same category of
// scoping decision as lib/science-engine/tracked-ingredients.ts's fixed
// ingredient list), not a claim of full category coverage.

export const VOC_SEED_SUBREDDITS = [
  'Supplements', 'nutrition', 'GutHealth', 'Nootropics', 'sleep', 'hormones',
  'PCOS', 'Fitness', 'HealthSupplements',
  'Menopause', 'PerimenopauseRage', 'xxfitness', 'SkincareAddicts',
  'AskDocs', 'dogs', 'DogAdvice', 'cats',
] as const
