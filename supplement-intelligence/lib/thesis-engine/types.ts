// ═══════════════════════════════════════════════════════════════════════════
// THESIS ENGINE — CANONICAL TYPE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════
//
// Architecture principle: the MarketThesis is the stable output contract.
// It never changes when new intelligence sources are added.
//
// The Signal is the universal currency that crosses the boundary between
// source-specific knowledge and thesis-agnostic synthesis. Every provider
// (Amazon, Keepa, Google Trends, TikTok, Reddit, YouTube, Alibaba, future)
// maps its output to Signal[]. The thesis engine consumes Signal[] and
// produces MarketThesis. The UI renders MarketThesis and knows nothing
// about individual sources.
//
// Extensibility boundary:
//   Left  of Signal:  source-specific (changes freely as sources are added)
//   Right of Signal:  thesis-agnostic (frozen — changes here break the UI)
//
// ─── FILE STRUCTURE ────────────────────────────────────────────────────────
//   §1  Identity & Versioning
//   §2  Confidence & Attribution
//   §3  Evidence
//   §4  The Signal Layer          ← THE EXTENSIBILITY BOUNDARY
//   §5  Provider Contract
//   §6  Thesis Sections           ← FROZEN INTERFACE
//   §7  Cross-cutting Types
//   §8  The MarketThesis          ← FROZEN, CANONICAL OUTPUT
//   §9  Query & Request Types
//   §10 Constants
// ═══════════════════════════════════════════════════════════════════════════


// ── §1 Identity & Versioning ───────────────────────────────────────────────

// Known provider IDs. The `(string & {})` tail allows future provider strings
// at the type level without breaking exhaustiveness checks on the known set.
export type ProviderId =
  // Current providers
  | 'amazon_reviews'
  | 'keepa'
  | 'google_trends'
  | 'reddit'
  | 'tiktok'
  | 'meta_ads'
  | 'amazon_ads'
  // Roadmap providers — register here as they are built
  | 'youtube'
  | 'shopify'
  | 'alibaba'
  | 'etsy'
  | 'walmart'
  | 'dtc_scraper'
  // Extensible: any future provider ID is valid
  | (string & Record<never, never>)

export type ThesisId        = string
export type AnalysisVersion = string


// ── §2 Confidence & Attribution ────────────────────────────────────────────

export type ConfidenceLabel =
  | 'VERY_HIGH'     // 90%+   — multiple independent sources, large sample, consistent
  | 'HIGH'          // 75–89% — two+ sources, strong signal, minor coverage gaps
  | 'MODERATE'      // 55–74% — single strong source or noisy multi-source
  | 'LOW'           // 35–54% — thin data or conflicting signals
  | 'PRELIMINARY'   // <35%   — directional only, insufficient data for reliable read

export interface ConfidenceScore {
  value:       number            // 0–1
  label:       ConfidenceLabel
  // Plain-English explanation split into two lines — always rendered inline,
  // never in a tooltip — so users understand confidence without clicking.
  supports:    string            // "What raises this confidence"
  limits:      string            // "What limits this confidence"
  convergence: boolean           // true when 3+ independent sources agree on topic
  providers:   ProviderId[]      // which sources contributed to this score
}

// Attribution for a single source's contribution to a specific claim.
export interface SourceAttribution {
  provider:    ProviderId
  data_points: number            // volume contributed (reviews, posts, data rows)
  weight:      number            // 0–1 synthesis weight assigned by the orchestrator
  fetched_at:  string            // ISO 8601
  freshness:   'live' | 'cached' | 'stale'
}


// ── §3 Evidence ────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'customer_quote'     // verbatim or paraphrased customer language
  | 'statistical'        // a count, percentage, or aggregate measure
  | 'trend'              // a directional change over time
  | 'competitive'        // something observed about competitors
  | 'ai_synthesis'       // the platform's own inference

// A structured metric that the UI can render consistently regardless of source.
export interface SignalMetric {
  value:  number | string
  unit:   string           // "mentions" | "% YoY" | "products" | "views" | ...
  period?: string          // "last 24 months" | "last 30 days" | ...
  basis?:  string          // "of top 10 products" | "of US search volume"
}

// The atomic unit of evidence. Multiple evidence items attach to each Signal.
export interface EvidenceItem {
  type:     EvidenceType
  content:  string           // human-readable description of this evidence
  provider: ProviderId
  metric?:  SignalMetric     // structured metric for display
  sample?:  string           // representative quote or example
}


// ── §4 The Signal Layer — THE EXTENSIBILITY BOUNDARY ──────────────────────
//
// Signals are what every source produces and what the thesis engine consumes.
// The thesis engine is unaware of anything beyond Signal[].
//
// Adding a new source means:
//   1. Implement SignalProvider (§5)
//   2. Map its output to Signal[]
//   3. Add its ProviderId to the union above
//   Nothing else changes.

// What kind of finding the signal represents.
export type SignalType =
  | 'demand'          // evidence that market demand exists
  | 'pain'            // evidence that customers are suffering
  | 'gap'             // evidence that the market has an unmet need
  | 'trend'           // directional movement (growing, declining, stable)
  | 'barrier'         // something that makes market entry harder
  | 'opportunity'     // synthesized positive signal
  | 'risk'            // something that could negatively affect the opportunity
  | 'timing'          // time-specific signal (window opening/closing)
  | 'social'          // community or cultural signal
  | 'supply'          // sourcing, manufacturing, or distribution signal
  | 'channel'         // distribution or sales channel signal
  | 'regulatory'      // compliance or regulatory signal

// Which market dimension this signal measures.
// This determines which thesis section(s) the signal contributes to.
// New categories can be added here when new source types introduce
// genuinely new market dimensions. Existing categories must never be removed.
export type SignalCategory =
  // Demand dimensions (→ verdict, timing)
  | 'market_demand'          // aggregate demand size and direction
  | 'search_momentum'        // search-based demand growth
  | 'social_momentum'        // social discussion growth
  | 'purchase_intent'        // direct purchase signals

  // Pain dimensions (→ market_failures)
  | 'customer_pain'          // what customers actively suffer
  | 'competitive_gap'        // what competitors systematically miss
  | 'unmet_need'             // what customers request but cannot find
  | 'quality_failure'        // product quality / reliability problems
  | 'trust_deficit'          // credibility or trust problems

  // Timing dimensions (→ timing)
  | 'trend_phase'            // where in the adoption curve (early/growth/late)
  | 'trend_velocity'         // rate of change of the trend
  | 'creator_momentum'       // creator ecosystem adoption rate
  | 'competitor_velocity'    // how fast incumbents are moving
  | 'window_signal'          // time available before the window closes

  // Difficulty dimensions (→ difficulty)
  | 'market_saturation'      // how crowded the market is
  | 'entry_barrier'          // what makes entering hard
  | 'capital_intensity'      // how much investment is required
  | 'brand_trust_gap'        // time / effort to build brand credibility
  | 'supply_complexity'      // sourcing and manufacturing difficulty
  | 'regulatory_burden'      // compliance requirements and risk
  | 'discovery_cost'         // cost of customer acquisition and visibility

  // Product / positioning dimensions (→ product_thesis)
  | 'differentiation_angle'  // how to position vs. incumbents
  | 'pricing_signal'         // what price the market will support
  | 'viral_potential'        // likelihood of organic spread
  | 'subscription_potential' // repeat purchase / LTV signal
  | 'channel_opportunity'    // distribution channels with low competition

  // Risk dimensions (→ risks)
  | 'competition_risk'       // competitive threat assessment
  | 'timing_risk'            // risk that the window is closing
  | 'execution_risk'         // operational / launch risk
  | 'data_quality'           // meta-signal about data reliability

export type SignalDirection = 'positive' | 'negative' | 'neutral' | 'mixed'

// The universal unit of intelligence.
// Every source maps its data to Signal[]. The thesis engine knows nothing
// beyond this type. Source-specific knowledge lives in ProviderContribution.
export interface Signal {
  // Stable identifier for deduplication across runs
  id:          string

  // Classification (determines thesis routing)
  type:        SignalType
  category:    SignalCategory
  direction:   SignalDirection

  // The finding in plain language
  description: string          // "Customers cannot verify product efficacy"
  magnitude:   number          // 0–1 (signal strength within its category)
  metric?:     SignalMetric    // "847 mentions across 10 products"

  // For cross-source convergence detection.
  // Signals with the same topic_key from different providers are grouped
  // and their collective confidence is elevated when they agree.
  topic_key:   string          // normalised topic for grouping, e.g. "efficacy-verification"

  // Evidence and attribution
  evidence:    EvidenceItem[]
  confidence:  ConfidenceScore
  providers:   ProviderId[]

  // Temporal anchor (every claim is time-stamped)
  observed_at: string          // ISO 8601 — when this signal was observed
  period?:     string          // "last 24 months" — the window of observation
}

// A cluster of signals that share the same topic_key from different sources.
// Created by the convergence engine before synthesis.
export interface SignalCluster {
  topic_key:   string
  signals:     Signal[]         // always 2+ signals from different providers
  convergent:  boolean          // true when all signals point the same direction
  net_magnitude: number         // weighted average of signal magnitudes
  confidence:  ConfidenceScore  // elevated when convergent=true
  providers:   ProviderId[]
}


// ── §5 Provider Contract ───────────────────────────────────────────────────
//
// Every intelligence source implements SignalProvider.
// The provider knows everything about its data source.
// The thesis engine knows nothing about the provider.

// What dimensions a provider can contribute to, declared upfront.
// The orchestrator uses this to route queries efficiently.
export interface ProviderCapability {
  signal_types:      SignalType[]
  signal_categories: SignalCategory[]
  requires_asin?:    boolean   // true if this provider needs a product ASIN
  requires_keywords?: boolean  // true if this provider needs search terms
  typical_latency_ms: number   // for orchestration timeout planning
}

export interface ProviderContribution {
  provider:    ProviderId
  version:     string            // provider implementation version
  fetched_at:  string            // ISO 8601
  confidence:  number            // 0–1 overall quality of this batch

  signals:     Signal[]          // the universal output — all thesis engine cares about

  // The raw provider-specific data. Opaque to the thesis engine.
  // Stored alongside the thesis for power-user deep dives.
  // Schema is provider-defined and may change independently of the thesis type.
  raw?:        Record<string, unknown>

  error?:      string            // set when partially failed; signals may still be present
  scope:       ProviderScope     // what this contribution covers
}

export interface ProviderScope {
  asins?:      string[]          // if ASIN-specific
  keywords?:   string[]          // if keyword-specific
  geography?:  string            // e.g. "US", "GB"
  period?:     string            // e.g. "2024-01 to 2026-06"
  sample_size?: number           // data points in this contribution
}

export interface SignalProvider {
  readonly id:           ProviderId
  readonly version:      string
  readonly enabled:      boolean
  readonly capabilities: ProviderCapability

  contribute(request: ThesisRequest): Promise<ProviderContribution>
}


// ── §6 Thesis Sections — FROZEN INTERFACE ─────────────────────────────────
//
// These types are stable. The UI is built against them. Adding a new source
// deepens the content of these sections but never changes their shape.

// Base shape shared by all five sections.
export interface ThesisSection {
  headline:   string              // single sentence conclusion
  summary:    string              // 2–3 sentence AI explanation
  confidence: ConfidenceScore
  signals:    Signal[]            // the signals that drove this section
  sources:    SourceAttribution[] // which providers contributed
}

// ── Verdict ─────────────────────────────────────────────────────────────────

export type SignalStrength =
  | 'STRONG'         // score 80–100 — evidence is compelling and consistent
  | 'POSITIVE'       // score 65–79  — evidence leans favorable; validate key assumptions
  | 'MIXED'          // score 45–64  — opportunity present with significant caveats
  | 'WEAK'           // score 25–44  — evidence thin or contradictory
  | 'INSUFFICIENT'   // score <25    — cannot assess reliably

export interface VerdictSection extends ThesisSection {
  signal_strength:   SignalStrength
  opportunity_score: number          // 0–100 (composite of all scored dimensions)
  one_liner:         string          // "The gut health market has 3 unresolved
                                     //  problems. First brand to solve them wins."
}

// ── Timing ───────────────────────────────────────────────────────────────────

export type TimingVerdict =
  | 'ENTER_NOW'      // window is open and conditions are favorable
  | 'WATCH_CLOSELY'  // signals are building; entry in 3–6 months may be optimal
  | 'MONITOR'        // too early or too uncertain; revisit in 6+ months
  | 'LATE'           // window may be closing; elevated risk of crowding
  | 'CLOSED'         // window assessment suggests overcrowding has set in

// PERMANENT RULE (2026-06-26): estimated_months was a fabricated forecast
// with no real basis (no model exists for "this window closes in N
// months") — removed. direction/explanation are the AI's qualitative
// timing read; confidence is now computed deterministically from the real
// signals routed to this section (see computeSectionConfidence in
// orchestrator.ts), never asked of the model.
export interface WindowEstimate {
  direction:         'opening' | 'open' | 'narrowing' | 'closed'
  explanation:       string           // plain English basis for the estimate
  confidence:        ConfidenceScore
}

// TrendSignalSummary removed (2026-06-26) — it re-invented a "magnitude"
// number for what the real, routed Signal[] (see TimingSection.signals,
// inherited from ThesisSection) already carries for real. The UI renders
// `signals` directly instead of this synthesized duplicate.

export interface TimingSection extends ThesisSection {
  timing_verdict:  TimingVerdict
  window_estimate: WindowEstimate
  phase_label:     string                // "Early Growth" | "Peak" | "Declining" | ...
}

// ── Market Failures ───────────────────────────────────────────────────────────

// PERMANENT RULE (2026-06-26): `tier` is now the AI's own direct
// qualitative call instead of being derived from a fabricated `prevalence`
// fraction (there is no real measurement of "what % of the market is
// affected" — the original FAILURE_TIER_THRESHOLDS mapping dressed up a
// model guess as a percentage). Per-item `confidence` removed too — each
// failure is itself a pattern-matched AI judgment (the schema's own
// evidence.provider is literally 'ai_synthesis'), so there is no real
// per-item basis to score; the section-level `confidence` (now computed
// deterministically from the real signals routed here) is the honest
// signal of how much real data backs this section overall.
export type FailureTier =
  | 'universal'    // category-defining unsolved problem, AI's own judgment
  | 'common'       // widespread but not universal
  | 'niche'        // brand-specific or minor

export type FailureSeverity = 'High' | 'Medium' | 'Low'

// An individual market failure — a specific, named unmet need.
// The most important intelligence the platform produces.
export interface MarketFailure {
  id:             string           // stable for referencing from the UI
  title:          string           // short name, e.g. "Efficacy Verification Gap"
  description:    string           // one clear sentence
  tier:           FailureTier
  severity:       FailureSeverity
  evidence:       EvidenceItem[]
  // Representative examples from specific products (optional, from review engine)
  asin_examples?: string[]
  // The opportunity implied by this failure
  opportunity:    string           // "No brand has addressed this — first mover advantage"
}

export interface MarketFailureSection extends ThesisSection {
  failures: MarketFailure[]        // ordered by the AI's own tier × severity judgment
}

// ── Difficulty ────────────────────────────────────────────────────────────────

// PERMANENT RULE (2026-06-26): score/metric removed — both were fabricated
// (no real per-dimension data exists for "Capital Required: 4/10" or
// "$35K-75K estimated"). `label` is the AI's direct qualitative call and
// is sufficient on its own; `explanation` carries the reasoning in prose
// without dressing it up as a measurement.
export interface DifficultyDimension {
  name:         string            // "Capital Required" | "Brand Trust" | ...
  label:        string            // "EASY" | "MEDIUM" | "HARD"
  explanation:  string            // one sentence, qualitative — no invented dollar/time figures
  providers:    ProviderId[]      // which sources this comes from
}

export interface DifficultySection extends ThesisSection {
  overall_label:  string              // "Medium Difficulty"
  dimensions:     DifficultyDimension[]
  primary_challenge: string           // the single hardest thing about this market
}

// ── Product Thesis ─────────────────────────────────────────────────────────────

export interface NextStep {
  action:       string            // "Source resealable packaging samples from 2–3 suppliers"
  rationale:    string            // "Addresses the #1 market failure at low cost delta"
  priority:     'immediate' | 'short_term' | 'medium_term'
  time_frame?:  string            // "Week 1–2"
}

export interface DifferentiationAngle {
  vector:       string            // "Transparency + Proof"
  description:  string           // what specifically to do differently
  moat:         string            // why competitors won't easily copy this
  // 2026-06-26: qualitative pace description, not a specific month/day
  // count — there is no real basis for "4 months" vs "6 months" for a
  // product that doesn't exist yet. e.g. "Several months of formulation
  // and testing work" rather than "4 months".
  build_pace:   string
}

export interface ProductThesisSection extends ThesisSection {
  differentiation:   DifferentiationAngle
  // 2026-06-26: qualitative pricing position, not a specific "$38-$44" —
  // there is no real basis for a dollar figure on an unlaunched product.
  // e.g. "Premium tier, priced above commodity competitors."
  pricing_position?: string
  recommended_steps: NextStep[]
  positioning_angle: string            // "The probiotic you can actually verify"
}


// ── §7 Cross-cutting Types ────────────────────────────────────────────────────

export type RiskSeverity  = 'High' | 'Medium' | 'Low'
export type RiskCategory  =
  | 'competitive'     // someone may outcompete
  | 'timing'          // window may close
  | 'execution'       // hard to pull off operationally
  | 'data'            // analysis may be incomplete or misleading
  | 'market'          // market dynamics could shift
  | 'regulatory'      // legal / compliance risk

// confidence removed (2026-06-26) — like market_failures, each risk is a
// pattern-matched AI judgment with no real per-item data source. severity
// (qualitative) is the AI's call; nothing here pretends to be a measurement.
export interface RiskItem {
  title:       string
  category:    RiskCategory
  severity:    RiskSeverity
  description: string            // what the risk is
  trigger?:    string            // what would activate this risk
  mitigation?: string            // what would reduce this risk
}

// What this analysis does and does not cover — always surfaced in the thesis.
export interface ScopeLimitation {
  dimension:   string            // "International marketplaces" | "DTC channel"
  impact:      string            // "May affect opportunity score if demand is
                                 //  primarily international"
  verify_with: string            // "Check Amazon.co.uk / .de independently"
}


// ── §8 The MarketThesis — FROZEN, CANONICAL OUTPUT ────────────────────────────
//
// This is what the UI renders. This is what gets cached, persisted, and shared.
// Every design decision upstream exists in service of producing this object.
//
// STABILITY CONTRACT:
// The shape of MarketThesis is frozen. Fields may be added (additive, backward-
// compatible) but never removed or renamed without a major version bump and a
// migration. The UI will break otherwise.

export interface MarketThesis {
  // ── Identity ────────────────────────────────────────────────────────────
  id:                  ThesisId
  query:               string           // what the user searched
  query_normalized:    string           // resolved canonical form
  category_name?:      string           // human-readable category label
  category_node_id?:   number           // Keepa node ID when applicable

  // ── The Five Core Questions (STABLE) ─────────────────────────────────
  verdict:             VerdictSection         // Is this worth entering?
  timing:              TimingSection          // Why now?
  market_failures:     MarketFailureSection   // What is broken?
  difficulty:          DifficultySection      // How hard is it to win?
  product_thesis:      ProductThesisSection   // What should be built?

  // ── Cross-cutting (STABLE) ────────────────────────────────────────────
  risks:               RiskItem[]
  scope_limitations:   ScopeLimitation[]
  sources_used:        SourceAttribution[]
  overall_confidence:  ConfidenceScore

  // ── All signals (for deep-dive mode and advanced consumers) ──────────
  // The raw Signal[] from all providers before section synthesis.
  // The UI's Tier-3 "Deep Dive" mode renders these directly.
  all_signals:         Signal[]

  // ── Signal clusters (for the convergence visualization) ───────────────
  // Groups of signals from different providers that confirm the same topic.
  converging_signals:  SignalCluster[]

  // ── Analysis metadata ─────────────────────────────────────────────────
  analysis_depth:      ThesisDepth
  providers_attempted: ProviderId[]
  providers_succeeded: ProviderId[]
  providers_failed:    ProviderId[]    // with errors recorded in contributions

  // Per-provider raw contributions (for the Tier-3 "Raw Data" vault)
  provider_contributions: ProviderContribution[]

  // ── Freshness ──────────────────────────────────────────────────────────
  created_at:          string           // ISO 8601
  data_as_of:          string           // when the oldest data in this thesis was collected
  refresh_after:       string           // ISO 8601 — when this thesis becomes stale
  analysis_version:    AnalysisVersion  // semver of the thesis engine
}


// ── §9 Query & Request Types ──────────────────────────────────────────────────

// The intent classifier maps the user's raw input to one of these.
export type QueryIntent =
  | { type: 'asin';     asin: string;                          marketplace?: string }
  | { type: 'asins';    asins: string[];  category_name?: string; marketplace?: string }
  | { type: 'category'; node_id: number; name: string;         marketplace?: string }
  | { type: 'keyword';  terms: string[];                        marketplace?: string }
  | { type: 'problem';  description: string }

// How deep to run the analysis. Affects latency and confidence.
export type ThesisDepth =
  | 'preliminary'    // signal-engine only (<15s) — useful for quick directional reads
  | 'standard'       // signal + competitive review (60–90s) — the primary experience
  | 'deep'           // standard + extended review collection (2–5 min) — power users

// What the user sends to the thesis endpoint.
export interface ThesisRequest {
  query:          string           // raw user input
  intent?:        QueryIntent      // pre-classified (skips classifier if provided)
  depth?:         ThesisDepth      // defaults to 'standard'
  marketplace?:   string           // ISO country code, defaults to 'US'
  max_products?:  number           // for category analysis, default 10
  force_refresh?: boolean          // bypass cache
}

// Streamed event from the SSE endpoint.
// The UI consumes these to render the live intelligence-gathering display.
export type ThesisEvent =
  | { event: 'analysis:started';        query: string; depth: ThesisDepth }
  | { event: 'intent:classified';       intent: QueryIntent }
  | { event: 'cache:hit';               thesis_id: ThesisId }
  | { event: 'source:started';          provider: ProviderId }
  | { event: 'source:progress';         provider: ProviderId; message: string }
  | { event: 'source:completed';        provider: ProviderId; signal_count: number }
  | { event: 'source:failed';           provider: ProviderId; error: string }
  | { event: 'synthesis:started' }
  | { event: 'thesis:section';          section: keyof Pick<MarketThesis,
        'verdict' | 'timing' | 'market_failures' | 'difficulty' | 'product_thesis'>;
        data: ThesisSection }
  | { event: 'thesis:complete';         thesis: MarketThesis }
  | { event: 'analysis:error';          message: string; recoverable: boolean }


// ── §10 Constants ─────────────────────────────────────────────────────────────

export const THESIS_ENGINE_VERSION: AnalysisVersion = '1.0.0'

// TTL in seconds for thesis caching by depth level.
// Standard theses are valid for 24h; preliminary for 2h (data is thinner).
export const THESIS_CACHE_TTL: Record<ThesisDepth, number> = {
  preliminary: 2   * 60 * 60,    //  2 hours
  standard:    24  * 60 * 60,    // 24 hours
  deep:        48  * 60 * 60,    // 48 hours (expensive to produce, slow to stale)
}

// Confidence thresholds for convergence elevation.
// When N providers agree on the same topic, the confidence gets a boost.
export const CONVERGENCE_BOOST = {
  min_providers:  3,             // minimum providers needed to trigger convergence
  confidence_add: 0.10,          // +10% confidence when convergent
  max_value:      0.97,          // confidence never reaches 100%
} as const

// Score thresholds for SignalStrength labels.
export const SIGNAL_STRENGTH_THRESHOLDS: Record<SignalStrength, [number, number]> = {
  STRONG:       [80,  100],
  POSITIVE:     [65,   79],
  MIXED:        [45,   64],
  WEAK:         [25,   44],
  INSUFFICIENT: [ 0,   24],
}

// Maximum data ages before a source's contribution is considered stale.
// Stale contributions lower the thesis confidence.
export const SOURCE_STALENESS_THRESHOLDS_MS: Record<string, number> = {
  amazon_reviews: 48  * 60 * 60 * 1000,   // 48 hours
  keepa:           4  * 60 * 60 * 1000,   //  4 hours
  google_trends:  24  * 60 * 60 * 1000,   // 24 hours
  reddit:         12  * 60 * 60 * 1000,   // 12 hours
  tiktok:          6  * 60 * 60 * 1000,   //  6 hours
  default:        24  * 60 * 60 * 1000,   // 24 hours
}
