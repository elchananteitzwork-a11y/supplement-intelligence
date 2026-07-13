// ── Science signal provider — Roadmap M2.5 ───────────────────────────────────
//
// Deliberately NOT a live PubMed/ClinicalTrials.gov caller. This provider
// only reads the cache entry the nightly batch (lib/science-engine/pipeline.ts,
// triggered by app/api/cron/science-pipeline) already wrote — a single
// indexed Supabase read, well inside the fast tier's <500ms budget. Making
// the real API calls live, here, would mean 6+ sequential PubMed requests
// plus a ClinicalTrials.gov request on every analysis — seconds, not
// milliseconds, and a request-time load NCBI's rate limit was never
// designed for.
//
// One provider, not two (PubMed + ClinicalTrials.gov are both named as
// distinct providers in Blueprint §5, but this is deliberate): the engine's
// aggregateDimension() only keeps ONE contributing provider's non-numeric
// fields when a dimension has multiple contributors (see engine.ts) — if
// PubMed and ClinicalTrials.gov's real facts were split across two separate
// `science`-populating providers, whichever one wasn't the highest-
// confidence "primary" would have its own real fields silently dropped on
// aggregation. Both facts are written together by the same nightly batch
// run for the same ingredient, so serving them as one coherent, uncontested
// signal (same reasoning as ReviewVelocitySignal's own header comment)
// avoids that real information-loss risk entirely.
import type { SignalProvider, SignalContext, ProviderSignals, ScienceSignal } from '../types'
import { cacheGet } from '@/lib/provider-cache'
import { matchTrackedIngredient } from '@/lib/science-engine/tracked-ingredients'

export class ScienceProvider implements SignalProvider {
  readonly name    = 'science'
  readonly enabled = true   // no API key needed at request time — pure cache read

  async fetch(ctx: SignalContext): Promise<ProviderSignals | null> {
    const ingredient = matchTrackedIngredient(ctx.query)
    if (!ingredient) return null   // honest: this query isn't a tracked ingredient (yet)

    const science = await cacheGet<ScienceSignal>(`science:v1:${ingredient}`)
    if (!science) return null   // honest: nightly batch hasn't populated this ingredient yet

    return {
      science,
      provider:   this.name,
      fetched_at: new Date().toISOString(),
      confidence: science.confidence,
    }
  }
}
