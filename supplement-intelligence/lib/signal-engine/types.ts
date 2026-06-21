// ── Base ──────────────────────────────────────────────────────────
// Every quantified signal dimension carries a 0–10 score (matching the
// discovery prompt scoring rubric) and a 0–1 confidence value.

export interface SignalScore {
  score:      number  // 0–10
  confidence: number  // 0–1
}

// ── Dimension types ───────────────────────────────────────────────

export interface DemandSignal extends SignalScore {
  search_volume?: string                    // e.g. "82k/month"
  trend?:         string                    // e.g. "+21% YoY" | "Stable"
  signal?:        'Strong' | 'Moderate' | 'Weak'
}

export interface CompetitionSignal extends SignalScore {
  competing_brands?: string                 // e.g. "35–60"
  saturation?:       'Low' | 'Medium' | 'Medium-High' | 'High'
  barrier?:          'Low' | 'Medium' | 'High'
}

export interface GrowthSignal extends SignalScore {
  yoy_change?: string                       // e.g. "+35%" | "-10%"
  momentum?:   'Accelerating' | 'Stable' | 'Decelerating'
}

export interface SeasonalitySignal extends SignalScore {
  // 10 = perfectly perennial (ideal for subscription), 0 = heavily seasonal
  peak_months?: string[]                    // e.g. ["Nov", "Dec"]
  pattern?:     'Perennial' | 'Seasonal' | 'Event-driven'
}

export interface PricingSignal extends SignalScore {
  avg_price?:      string                   // e.g. "$28"
  price_range?:    string                   // e.g. "$18–$45"
  premium_viable?: boolean                  // can a premium brand win at 20%+ above avg?
}

export interface ViralitySignal extends SignalScore {
  tiktok?:           'High' | 'Medium' | 'Low'
  content_potential?: 'High' | 'Medium' | 'Low'
  ugc?:              'High' | 'Medium' | 'Low'
}

export interface ReviewVelocitySignal extends SignalScore {
  monthly_reviews?: string                  // e.g. "180/product/month"
  sentiment?:       'Positive' | 'Mixed' | 'Negative'
  avg_rating?:      string                  // e.g. "4.3"
}

// ── Provider output ───────────────────────────────────────────────
// What a single provider returns for a given category.
// All dimension fields are optional — providers only populate what they can verify.

export interface ProviderSignals {
  demand?:          DemandSignal
  competition?:     CompetitionSignal
  growth?:          GrowthSignal
  seasonality?:     SeasonalitySignal
  pricing?:         PricingSignal
  virality?:        ViralitySignal
  review_velocity?: ReviewVelocitySignal

  provider:   string   // provider name, e.g. "keepa"
  fetched_at: string   // ISO timestamp
  confidence: number   // 0–1 overall confidence in this batch of signals
}

// ── Aggregated output ─────────────────────────────────────────────
// Engine output after merging all provider signals.

export interface AggregatedDimension<T extends SignalScore> {
  value:      T
  sources:    string[]   // which providers contributed data
  confidence: number     // weighted-average confidence
}

export interface AggregatedSignals {
  demand?:          AggregatedDimension<DemandSignal>
  competition?:     AggregatedDimension<CompetitionSignal>
  growth?:          AggregatedDimension<GrowthSignal>
  seasonality?:     AggregatedDimension<SeasonalitySignal>
  pricing?:         AggregatedDimension<PricingSignal>
  virality?:        AggregatedDimension<ViralitySignal>
  review_velocity?: AggregatedDimension<ReviewVelocitySignal>

  providers_used:     string[]
  overall_confidence: number   // avg across all populated dimensions
}

// ── Provider contract ─────────────────────────────────────────────
// Every provider implements exactly this interface.
// fetch() returns null when: no API key, category not found,
// network error, or data too thin to trust.

export interface SignalProvider {
  readonly name:    string
  readonly enabled: boolean
  fetch(category: string): Promise<ProviderSignals | null>
}
