import type {
  SignalProvider,
  ProviderSignals,
  AggregatedSignals,
  AggregatedDimension,
  SignalScore,
} from './types'

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
  }
}

// ── Signal Engine ─────────────────────────────────────────────────

export class SignalEngine {
  private providers: SignalProvider[]

  constructor(providers: SignalProvider[]) {
    this.providers = providers
  }

  // Run all enabled providers in parallel.
  // Individual provider failures (timeout, API error, no data) are swallowed —
  // the engine returns whatever set of signals did come back.
  // If NO providers return data, returns null so the caller can fall back to
  // pure-AI discovery unchanged.
  async fetch(category: string, timeoutMs = 12_000): Promise<AggregatedSignals | null> {
    const enabled = this.providers.filter(p => p.enabled)
    if (!enabled.length) return null

    const results = await Promise.allSettled(
      enabled.map(p =>
        Promise.race([
          p.fetch(category),
          new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
        ]),
      ),
    )

    const signals: ProviderSignals[] = []
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status === 'fulfilled' && r.value !== null) {
        signals.push(r.value)
      } else if (r.status === 'rejected') {
        console.error(`SignalEngine: provider ${enabled[i].name} threw`, r.reason)
      }
    }

    if (!signals.length) return null

    return this.aggregate(signals)
  }

  // ── Private: merge ProviderSignals[] → AggregatedSignals ─────

  private aggregate(signals: ProviderSignals[]): AggregatedSignals {
    // For each dimension, collect contributions from every provider that
    // returned data for that dimension.
    type DimKey = keyof Omit<ProviderSignals, 'provider' | 'fetched_at' | 'confidence'>

    const dims: DimKey[] = [
      'demand', 'competition', 'growth', 'seasonality',
      'pricing', 'virality', 'review_velocity', 'revenue',
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
    } as AggregatedSignals
  }
}
