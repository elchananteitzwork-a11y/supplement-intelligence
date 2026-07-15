import { TRACKED_INGREDIENTS } from '@/lib/science-engine/tracked-ingredients'
import type { TrackedIngredient } from '@/lib/science-engine/tracked-ingredients'

// ── Ingredient canonicalization registry — Roadmap M2.15 ─────────────────────
//
// docs/MASTER_EXECUTION_PLAN.md's Evidence Depth Cluster. Foundation
// infrastructure for M2.16+: a small, real, hand-authored profile per
// currently-tracked ingredient (still just the 3-item TRACKED_INGREDIENTS
// set — this milestone does not expand that universe).
//
// Deliberately NOT built here (see the M2.15 R&D document for full
// reasoning): demand aggregation across product-name variants (no real
// consumer exists anywhere in this codebase — every signal provider is
// still single-query-scoped) and wiring `aliases` into
// lib/science-engine/tracked-ingredients.ts's matchTrackedIngredient()
// (its existing whole-word substring match already handles all 3 tracked
// ingredients correctly — confirmed via its own test suite matching
// "Magnesium Glycinate Sleep" → 'magnesium' — so there is no real case
// today where an alias list would change that outcome).
//
// `aliases` here exists as real, disclosed documentation of known
// commercial/chemical name variants (cross-referenced against the same
// real salt-form vocabulary already used by lib/keyword-engine/
// relevance-guard.ts's STRONG_INGREDIENT_WORDS — glycinate, citrate,
// malate, bisglycinate, threonate, acetate — not a disconnected list) —
// available for a future milestone to consume, not consumed by anything
// yet itself. `canonicalSearchTerm` IS wired into a real consumer this
// milestone: lib/science-engine/pipeline.ts's PubMed/ClinicalTrials.gov
// calls. It is identical to the bare TRACKED_INGREDIENTS string for all 3
// entries today (zero behavior change) — this field exists so a future
// ingredient whose common name and external-database search term diverge
// has a real place to do that, rather than pipeline.ts needing to change
// again when that day comes.

export interface IngredientProfile {
  key:                 TrackedIngredient
  displayName:         string
  // Real, known commercial/chemical name variants — documentation only,
  // not consumed by any matching logic yet (see header comment).
  aliases:             string[]
  // The literal term passed to PubMed/ClinicalTrials.gov — see
  // lib/science-engine/pubmed.ts / clinicaltrials.ts, both of which take
  // this as their real search term directly.
  canonicalSearchTerm: string
}

export const INGREDIENT_REGISTRY: Record<TrackedIngredient, IngredientProfile> = {
  berberine: {
    key:         'berberine',
    displayName: 'Berberine',
    aliases: [
      'berberine hcl',
      'berberine hydrochloride',
      'berberine phytosome',
      'berberine sulfate',
    ],
    canonicalSearchTerm: 'berberine',
  },
  creatine: {
    key:         'creatine',
    displayName: 'Creatine',
    aliases: [
      'creatine monohydrate',
      'creatine hcl',
      'creatine hydrochloride',
      'creatine ethyl ester',
      'micronized creatine',
    ],
    canonicalSearchTerm: 'creatine',
  },
  magnesium: {
    key:         'magnesium',
    displayName: 'Magnesium',
    aliases: [
      'magnesium glycinate',
      'magnesium bisglycinate',
      'magnesium citrate',
      'magnesium oxide',
      'magnesium malate',
      'magnesium threonate',
      'magnesium l-threonate',
      'chelated magnesium',
    ],
    canonicalSearchTerm: 'magnesium',
  },
}

// Real entries only — a key outside TRACKED_INGREDIENTS returns undefined,
// never a fabricated profile.
export function getIngredientProfile(key: string): IngredientProfile | undefined {
  return INGREDIENT_REGISTRY[key as TrackedIngredient]
}

// Exported so tests (and any future consumer) can assert completeness
// against the real tracked-ingredient universe without hardcoding it twice.
export const REGISTERED_INGREDIENTS = TRACKED_INGREDIENTS
