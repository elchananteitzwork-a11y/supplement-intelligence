import type {
  SignalProvider,
  ProviderSignals,
  AggregatedSignals,
  AggregatedDimension,
  SignalScore,
  SignalContext,
} from './types'

// Distinct sentinel object (not `null`) so a genuine timeout can be told
// apart from a provider's own promise legitimately resolving to `null`.
const TIMED_OUT = Symbol('signal-engine-timed-out')

// ── Aggregation helpers ───────────────────────────────────────────

// Build an AggregatedDimension from one or more provider contributions.
// When multiple providers supply the same dimension, scores are averaged
// weighted by each provider's confidence for that dimension.
// Non-numeric (string/boolean) fields are taken from the highest-confidence source.
function aggregateDimension<T extends SignalScore>(
  contributions: Array<{ value: T; source: string }>,
): AggregatedDimension<T> {
  if (contributions.length === 1) {
    return {
      value:         contributions[0].value,
      sources:       [contributions[0].source],
      primarySource: contributions[0].source,
      confidence:    contributions[0].value.confidence,
      perProviderValues: contributions,
    }
  }

  // Weighted score
  const totalWeight = contributions.reduce((s, c) => s + c.value.confidence, 0)
  const weightedScore = contributions.reduce(
    (s, c) => s + c.value.score * c.value.confidence,
    0,
  ) / totalWeight
  const avgConf = totalWeight / contributions.length

  // Non-numeric fields: use values from the provider with highest confidence.
  // Only `score`/`confidence` are actually blended across providers — every
  // string field in `value` came from this one provider, so callers citing
  // a specific number (e.g. "search_volume") must cite primarySource, not
  // the full `sources` list, or they'd imply more corroboration than exists.
  const primary = [...contributions].sort(
    (a, b) => b.value.confidence - a.value.confidence,
  )[0]

  return {
    value:         { ...primary.value, score: Math.round(weightedScore * 10) / 10, confidence: avgConf },
    sources:       contributions.map(c => c.source),
    primarySource: primary.source,
    confidence:    avgConf,
    perProviderValues: contributions,
  }
}

// ── Signal Engine ─────────────────────────────────────────────────

export class SignalEngine {
  private providers: SignalProvider[]

  constructor(providers: SignalProvider[]) {
    this.providers = providers
  }

  // Run all enabled providers in parallel.
  // Individual provider failures (timeout, API error) are swallowed — the
  // engine returns whatever set of signals did come back. If NO providers
  // return data, returns null so the caller can fall back to pure-AI
  // discovery unchanged.
  //
  // Resilience layer (2026-06-29): failed_providers uses a sentinel value
  // for the timeout race (mirroring lib/news-engine/engine.ts's TIMED_OUT
  // pattern) specifically so a provider that genuinely errored/timed out
  // can be told apart from one that ran fine and legitimately found no
  // data for this query — both used to look identical (a bare `null`),
  // which would have mislabeled "no data" as a provider failure.
  async fetch(ctx: SignalContext, timeoutMs = 12_000): Promise<AggregatedSignals | null> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return null

    const results = await Promise.allSettled(
      enabled.map(p =>
        Promise.race([
          p.fetch(ctx),
          new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), timeoutMs)),
        ]),
      ),
    )

    const signals: ProviderSignals[] = []
    const failedProviders: string[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'rejected') {
        failedProviders.push(enabled[i].name)
        console.error(`SignalEngine: provider ${enabled[i].name} threw`, r.reason)
      } else if (r.value === TIMED_OUT) {
        failedProviders.push(enabled[i].name)
        console.error(`SignalEngine: provider ${enabled[i].name} timed out`)
      } else if (r.value !== null) {
        signals.push(r.value)
      }
      // else: provider resolved cleanly to null — ran fine, legitimately
      // no data for this query. Not a failure, just not used.
    }

    if (!signals.length) return null

    return this.aggregate(signals, failedProviders)
  }

  // ── Private: merge ProviderSignals[] → AggregatedSignals ─────

  private aggregate(signals: ProviderSignals[], failedProviders: string[]): AggregatedSignals {
    // For each dimension, collect contributions from every provider that
    // returned data for that dimension.
    type DimKey = keyof Omit<ProviderSignals, 'provider' | 'fetched_at' | 'confidence'>

    const dims: DimKey[] = [
      'demand', 'competition', 'growth', 'seasonality',
      'pricing', 'virality', 'review_velocity', 'revenue', 'supply_velocity',
      'science',
    ]

    const result: Record<string, AggregatedDimension<SignalScore>> = {}
    const providersUsed: string[] = []

    for (const dim of dims) {
      const contributions = signals
        .filter(s => s[dim] !== undefined)
        .map(s => ({ value: s[dim] as SignalScore, source: s.provider }))

      if (contributions.length) {
        result[dim] = aggregateDimension(contributions)
        contributions.forEach(c => { if (!providersUsed.includes(c.source)) providersUsed.push(c.source) })
      }
    }

    // Overall confidence = average of all populated dimension confidences
    const dimValues = Object.values(result)
    const overallConf = dimValues.length
      ? dimValues.reduce((s, d) => s + d.confidence, 0) / dimValues.length
      : 0

    return {
      ...result,
      providers_used:     providersUsed,
      overall_confidence: Math.round(overallConf * 100) / 100,
      failed_providers:   failedProviders,
    } as AggregatedSignals
  }
}
