import type { AggregatedSignals } from '@/lib/signal-engine/types'
import type { ConcordanceMatrix } from '@/lib/concordance'
import type { LifecycleClassification, GapVelocity } from '@/lib/lifecycle'
import type { OpportunityQuality, MarketVerdictResult } from '@/lib/verdict-matrix'
import type { KillCriterion } from '@/lib/kill-criteria'
import type { KeywordIntelligence } from '@/lib/keyword-engine/types'
import type { ConsumerIntelligenceReport } from '@/lib/consumer-intelligence'
import type { NewsIntelligence } from '@/lib/news-engine/types'
import type { ManufacturingEstimate } from '@/lib/manufacturing-engine/types'

// CATEGORY_CREATION_CANDIDATE added 2026-06-28 (Decision Engine redesign) —
// distinct from SKIP/insufficient-evidence: real evidence shows the broader
// category is alive, but no real evidence exists for this exact specific
// idea because it doesn't have a market footprint yet. Always server-
// assigned by lib/scoring.ts — the AI's own build_decision guess (always
// one of the other three) is discarded and overridden the same way every
// other build_decision is, so the prompt schema does not need this value.
export type BuildDecision = 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP' | 'CATEGORY_CREATION_CANDIDATE'

// Server-computed; never produced by the AI. Optional for backward compat.
export interface OpportunityMeta {
  week_added:  string   // ISO week this opp first appeared, e.g. "2026-W25"
  is_new:      boolean  // true on the week it first appeared in the cache
  // 2026-06-26 evidence-first redesign: there is no real per-opportunity
  // numeric score to diff across weeks (see PromiseTier below) — trending
  // is now a comparison of the AI's own qualitative tier, not a fabricated
  // delta. 'up'/'down' compare promise rank (High=2/Medium=1/Low=0); 'new'
  // has no previous tier to compare against.
  promise_delta: 'up' | 'down' | 'same' | 'new'
  trending:    boolean  // promise_delta === 'up'
}

export type CacheStatus = 'generated' | 'refreshed' | 'cached' | 'updated'

// AI's overall qualitative read of an opportunity, replacing the old
// fabricated 0-100 score (2026-06-26 evidence-first redesign). This is
// "prioritize opportunities" — explicitly AI-allowed — expressed as a
// tier label instead of a number dressed up as a measurement. Card order
// (the AI's own returned sequence) carries the actual ranking; this tier
// is the qualitative label shown alongside it.
export type PromiseTier = 'High' | 'Medium' | 'Low'

// Directional capital-intensity / time-to-market judgment — replaces the
// old "$Xk-$Yk" / "X-Y days" fabricated figures, which had zero real
// per-opportunity basis (no provider is ever queried per-candidate at
// discovery time, only once for the whole broad category — see
// CategorySignalPanel / buildSignalContext for the real, surfaced version
// of that one data point).
export type CapitalTier = 'Lean' | 'Moderate' | 'Capital-Intensive'
export type LaunchSpeedTier = 'Fast' | 'Moderate' | 'Slow'

export interface OpportunityCard {
  name: string
  rationale: string
  promise: PromiseTier
  startup_cost_tier: CapitalTier
  difficulty: 'Easy' | 'Medium' | 'Hard'
  launch_speed: LaunchSpeedTier
  _meta?: OpportunityMeta  // server-added after AI response, not in AI output
  scores: {
    demand: {
      signal: 'Strong' | 'Moderate' | 'Weak'
    }
    // market_saturation replaces the scored competition dimension (Phase 2 unification)
    market_saturation?: {
      level:   'Low' | 'Medium' | 'High' | 'Very High'
      barrier: 'Low' | 'Medium' | 'High'
      note:    string
    }
    virality: {
      tiktok: 'High' | 'Medium' | 'Low'
      content_potential: 'High' | 'Medium' | 'Low'
      ugc: 'High' | 'Medium' | 'Low'
    }
    subscription: {
      retention: 'High' | 'Medium' | 'Low'
    }
    manufacturing: {
      complexity: 'Low' | 'Medium' | 'High'
    }
  }
  // ── Legacy fields (pre-2026-06-26) ───────────────────────────────────
  // Cached discovery_cache rows up to ~2 weeks old may still carry the old
  // numeric shape. Never read for display or sorting in new code — present
  // only so an old cached row doesn't crash the page before it ages out.
  score?: number
  startup_cost?: string
  launch_time?: string
}
export type BuildVerdict  = 'YES' | 'MAYBE' | 'NO'

export interface DimScore {
  // Legacy only (2026-06-26 redesign): memos generated before this date have
  // a numeric `score` (the model's own invented 0-10) here. Memos generated
  // from now on populate `level` instead — AI is no longer asked for a
  // number, only a qualitative judgment. lib/scoring.ts never reads `score`
  // for anything but display-bucketing on old data; it is never written by
  // new generations and never feeds the 0-100 opportunity score either way.
  score?: number
  level?: 'High' | 'Medium' | 'Low'
  notes: string
}

// Phase 2: replaces the numeric competition score in MemoData
export interface MarketSaturation {
  maturity:              string  // "Early Growth" | "Growing" | "Mature" | "Saturated"
  dominant_brands:       string  // prose: who controls the market
  concentration:         string  // "Low" | "Moderate" | "High" | "Very High"
  entry_difficulty:      string  // "Low" | "Medium" | "High"
  competitive_intensity: string  // 2-3 sentence qualitative assessment
}

// Phase 3: which signals were verified by external data sources
export interface SignalMetadata {
  providers_used:     string[]
  overall_confidence: number    // 0–1
  demand_verified:    boolean   // Keepa returned demand data
  virality_verified:  boolean   // TikTok returned virality data
  pricing_verified:   boolean   // Keepa returned pricing data
  growth_verified:    boolean   // Keepa returned growth data
  market_verified?:   boolean   // Amazon seller-data competition signal was available (market_saturation grounding)
  // True when real competitor ASINs were found and Consumer Intelligence was
  // attempted — combined with MemoData.consumer_intelligence being absent,
  // this distinguishes "attempted but timed out/failed" from "never
  // attempted" (no competitors found), for the UI's partial-results notice.
  consumer_intelligence_attempted?: boolean
  // True when biggest_competitor.name/.revenue were overridden server-side
  // with real Apify (name) + Keepa (revenue) data instead of the model's
  // invented guess — see lib/real-competitor.ts.
  competitor_revenue_verified?: boolean
}

export interface Ingredient {
  ingredient: string
  dose:       string
  role:       string
  evidence:   string   // ★ to ★★★★★
}

export interface AdPhrase {
  they_say:    string
  use_in_copy: string
}

export interface MemoData {
  category_name:    string
  executive_summary: string
  // build_verdict removed 2026-06-26 — generated by the model but never read
  // by any UI component; build_decision (server-recomputed, deterministic)
  // is the only verdict actually shown. Kept as an optional legacy field
  // purely so old stored memos still type-check; never written by new code.
  build_verdict?:   BuildVerdict
  build_decision:   BuildDecision
  build_explanation: string
  opportunity_score: number
  // Stamped by lib/scoring.ts SCORING_ENGINE_VERSION at generation time —
  // optional only for backward compat with memos generated before this
  // existed. Lets every consumer of opportunity_score/build_decision tell
  // whether two memos were scored under the same formula before treating
  // their numbers as comparable.
  scoring_version?: string

  // ── Analyst-voice synthesis (added v2) — optional for backward compat ──
  market_thesis?:     string           // 2–4 sentence investment thesis in senior analyst voice
  why_now?:           string           // 2–3 sentences on why this timing window is open
  market_saturation?: MarketSaturation // Phase 2: qualitative replacement for competition score
  signal_metadata?:   SignalMetadata   // Phase 3: which metrics came from verified sources

  scores: {
    demand:        DimScore
    competition?:  DimScore  // kept optional for backward compat with stored analyses
    virality:      DimScore
    subscription:  DimScore
    manufacturing: DimScore
  }

  biggest_competitor: {
    name:    string
    revenue: string
    gap:     string
  }

  market_size:  string
  gross_margin: string

  market_gaps:        string[]   // 10 items
  brand_opportunities: string[]  // 10 items

  customer_language: {
    frustrations: string[]
    desires:      string[]
    fears:        string[]
    ad_phrases:   AdPhrase[]
  }

  product_recommendation: {
    format:        string
    dosing:        string
    formula:       Ingredient[]
    avoid:         string[]
    cogs_estimate: string
    retail_price:  string
    gross_margin:  string
  }

  financial_projections: {
    // Legacy only (2026-06-26 redesign): old memos have these as AI-invented
    // "XX%" strings with no real base-rate model behind them. New memos
    // never write these — see traction_band below.
    ten_k_probability?:     string
    hundred_k_probability?: string
    one_m_probability?:     string
    // Server-computed, deterministic — see lib/scoring.ts computeTractionBand.
    // Replaces the three probabilities above for memos generated from now on.
    traction_band?:         string
    gross_margin:           string  // AI-written; instructed to say "Not independently verified" when ungrounded — see lib/provenance.ts
    net_margin_at_scale:    string  // same
    path_to_10m:            string
  }

  // ── Evidence-first layer (added v3) — server-computed, captured at
  // generation time, NEVER produced or rewritten by the AI. This is the raw
  // data the UI shows before any AI interpretation. Optional for backward
  // compat with memos generated before this existed.
  signal_evidence?:      AggregatedSignals     // real demand/growth/revenue/review/virality signals — same object already used to ground the prompt, now persisted instead of discarded after generation
  // Roadmap M2.1: per-channel demand directional reads (accelerating/
  // stable/decelerating/absent) derived from signal_evidence.growth's
  // per-provider contributions — computed once at generation time
  // (lib/concordance.ts) and persisted here for the same reason
  // category_creation_broad_evidence below is persisted: a later re-render
  // from the stored memo alone must see the same matrix that was computed
  // at generation time, not silently diverge.
  concordance_matrix?: ConcordanceMatrix
  // Roadmap M2.2: heuristic-v1 lifecycle stage + gap velocity, computed
  // once at generation time (lib/lifecycle.ts) from concordance_matrix +
  // supply_velocity (M2.3) + the existing demand/virality dimension scores
  // — same persistence rationale as concordance_matrix above.
  lifecycle_classification?: LifecycleClassification
  gap_velocity?: GapVelocity
  // Roadmap M2.4: two-axis decision model (lib/verdict-matrix.ts). Additive
  // and parallel to opportunity_score/build_decision above — this does not
  // replace either; existing UI, leaderboard, and pattern-memory consumers
  // of build_decision are completely unaffected. opportunity_quality is
  // Axis 1 (four-pillar Quality, timing-independent); market_verdict is the
  // Quality x Lifecycle matrix decision (Axis 1 x Axis 2), computed once at
  // generation time from the already-final grounded score, lifecycle_
  // classification above, and the confidence assessment.
  opportunity_quality?: OpportunityQuality
  market_verdict?: MarketVerdictResult
  // Roadmap M2.8: 3-4 falsifiable, machine-evaluable kill criteria derived
  // from lifecycle_classification/gap_velocity above (lib/kill-criteria.ts)
  // — "what would change our mind" (Blueprint §13 item 8). Consumed by the
  // Watchlist re-check job (lib/watchlist/recheck.ts) to detect real
  // threshold triggers on a later re-pull; never re-derived independently
  // there, so a watched niche is always evaluated against the exact
  // criteria this analysis actually generated.
  kill_criteria?: KillCriterion[]
  keyword_intelligence?: KeywordIntelligence    // real per-keyword search volume/growth from DataForSEO
  consumer_intelligence?: ConsumerIntelligenceReport  // real review-text themes (lib/consumer-intelligence) — computed server-side, never touched by the AI, same pattern as keyword_intelligence
  // Real-Time News Intelligence (added 2026-06-25) — items come from openFDA/
  // PubMed/GDELT, never the LLM; only why_it_matters/summary inside this
  // object are LLM-written, and only as a separate parallel call (see
  // lib/news-engine/explain.ts) — completely outside the main prompt/schema.
  news_intelligence?: NewsIntelligence
  // Real manufacturing estimate (lib/manufacturing-engine), fetched eagerly at
  // generation time (app/api/generate/route.ts, 12s timeout alongside the
  // signal fetch). Populated when Apify succeeds. Profitability's COGS Margin
  // sub-signal and the Manufacturing Feasibility composite both read this;
  // both degrade gracefully to qualitative-only when it is absent.
  manufacturing_estimate?: ManufacturingEstimate
  // Category-Creation-Candidate broad-query evidence (2026-06-28 Decision
  // Engine redesign) — persisted, not ephemeral, so lib/scoring.ts's
  // no-argument computeGroundedScore(m) reads the SAME broad-query data on
  // every later call (e.g. from components/MemoDisplay.tsx) that it used
  // at generation time. Without persisting this, a re-render computed from
  // the stored memo alone would diverge from what was actually saved —
  // the exact "two different numbers in two places" class of bug this
  // codebase has fixed before. Only ever set when the specific query's own
  // demand evidence was absent and a broader version of the query had real
  // data instead.
  category_creation_broad_evidence?: {
    broadQuery: string
    signal_evidence?: AggregatedSignals
    keyword_intelligence?: KeywordIntelligence
  }
  // The exact product name/query the user entered at generation time — stored
  // so that computeDemand can use the full semantic filter (anchor-word check)
  // at scoring time, matching what was applied during keyword-engine fetch.
  // Without this, scoring-time filtering falls back to signal-only checks that
  // cannot apply anchor-word matches, potentially rejecting keywords that the
  // generation-time filter correctly accepted via product name overlap.
  product_query?: string

  // ── AI Writing Layer (spec §8) — three structured narrative fields ─────────
  // Generated by generateInterpretation() after scoring; falls back to
  // deterministic templates on AI failure. Never produced by the main Claude
  // call; never touches raw provider data. Inline shape avoids circular import
  // (lib/ai-interpretation/builder.ts already imports MemoData from here).
  writer_output?: {
    causal_paragraph:             string
    causal_paragraph_is_fallback: boolean
    risk_sentence:                string
    risk_sentence_is_fallback:    boolean
    product_thesis_headline:      string
    product_thesis_full:          string
    product_thesis_is_fallback:   boolean
    validation_trace:             object
  }

  // ── Evidence Layer (spec §9) — pre-built signal cards ─────────────────────
  // Built by buildExpandableCards() after scoring; template-based, no AI.
  // Keyed by signal_id. Inline shape avoids circular import
  // (lib/evidence/expandable-card.ts already imports MemoData from here).
  expandable_cards?: Record<string, {
    signal_id:      string
    confidence:     'HIGH' | 'MODERATE' | 'LOW'
    data_points:    Array<{ label: string; value: string }>
    interpretation: string
    limitation:     string | null
  }>

  // ── First-screen signal IDs (spec §5.3) ────────────────────────────────────
  // Exactly 3 signal IDs selected by selectFirstScreenSignals(), verdict-
  // conditional with weight-based tie-breaking. The UI renders these 3 first.
  first_screen_signal_ids?: string[]

  // ── Review Narrative (Milestone 7, memo-only enrichment) ────────────────
  // AI-synthesized customer-review commentary from lib/review-narrative
  // (wraps lib/review-engine). ARCHITECTURE CONSTRAINT: never read by
  // lib/scoring.ts, lib/confidence/**, or any Decision Engine calculation —
  // see lib/review-narrative/types.ts. Always carries an explicit
  // `source`/`disclaimer` pair identifying it as AI-synthesized. Optional;
  // absent whenever synthesis was skipped, failed, or timed out (never a
  // partial/fabricated object).
  review_narrative?: import('@/lib/review-narrative').ReviewNarrativeSynthesis
}

export interface Analysis {
  id:                 string
  user_id:            string
  created_at:         string
  raw_input:          string
  category_name:      string
  target_audience:    string | null
  price_point:        string | null
  score_demand:       number
  score_competition:  number
  score_virality:     number
  score_subscription: number
  score_manufacturing: number
  opportunity_score:  number
  build_decision:     BuildDecision
  scoring_version?:   string  // see MemoData.scoring_version
  // Which Anthropic model generated the narrative portions of this memo —
  // distinct from scoring_version (the deterministic formula version).
  // Outcome-tracking needs both: the formula can be right while the model
  // version that wrote the narrative changes, or vice versa.
  model_version?:     string
  memo_data:          MemoData
  biggest_competitor: string | null
  market_size:        string | null
  gross_margin:       string | null
  generation_ms:      number | null
}

// ── Outcome Tracking ────────────────────────────────────────────────────
// Real, user-reported, post-hoc ground truth — collected so the platform's
// central unverified claim (does a BUILD_NOW recommendation actually
// outperform a SKIP) can eventually be checked against real outcomes
// instead of taken on faith. One row per analysis (analysis_id is the
// primary key in the DB — strict 1:1, upserted as status changes over
// time, not a history log). See supabase/migrations/009_outcome_tracking.sql.

export type BuiltStatus  = 'not_started' | 'in_progress' | 'built' | 'abandoned'
export type LaunchStatus = 'not_launched' | 'launched' | 'discontinued'
// 'too_early_to_tell' is a real, distinct value — not a stand-in for "no
// report yet." A future BUILD_NOW-vs-SKIP query should be able to tell
// "user hasn't reported" apart from "user reported they don't know yet."
export type OutcomeVerdict = 'success' | 'failure' | 'too_early_to_tell'

export interface AnalysisOutcome {
  analysis_id:          string
  user_id:              string
  built_status:         BuiltStatus
  launch_status:        LaunchStatus
  // Optional, self-reported — never estimated or backfilled if absent,
  // same no-fabrication rule as every other real-data field in this app.
  monthly_revenue_usd:  number | null
  outcome_verdict:      OutcomeVerdict | null
  notes:                string | null
  created_at:           string
  updated_at:           string
}

export interface LeaderboardRow {
  id:                uuid
  category_name:     string
  opportunity_score: number
  build_decision:    BuildDecision
  scoring_version?:  string  // see MemoData.scoring_version — not comparable across versions
  biggest_competitor: string | null
  market_size:       string | null
  analysis_count:    number
  last_analyzed:     string
}

export interface Profile {
  id:              string
  email:           string
  analyses_used:   number
  analyses_limit:  number
}

// helper
type uuid = string
