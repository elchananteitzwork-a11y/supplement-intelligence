# Product Intelligence v1.0 — Technical Specification

**Document type:** Engineering design specification  
**Version:** 1.0.0  
**Status:** Approved for implementation  
**Date:** 2026-07-05  
**Supersedes:** Architectural discussion, 2026-06-26 through 2026-07-05

This document is the single source of truth for implementing the AI Interpretation Layer and the result-facing user experience. It formalizes all architectural decisions made during the design phase. Do not deviate from these specifications without updating this document.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Complete Data Flow](#2-complete-data-flow)
3. [AI Contract — SynthesisInput](#3-ai-contract--synthesisinput)
4. [Risk Taxonomy](#4-risk-taxonomy)
5. [Signal Taxonomy](#5-signal-taxonomy)
6. [Verdict Generation](#6-verdict-generation)
7. [First-Screen Specification](#7-first-screen-specification)
8. [AI Writing Rules](#8-ai-writing-rules)
9. [Evidence System](#9-evidence-system)
10. [Confidence System](#10-confidence-system)
11. [Failure Handling](#11-failure-handling)
12. [Validation Pipeline](#12-validation-pipeline)
13. [Non-Goals](#13-non-goals)
14. [Future Extensions](#14-future-extensions)

---

## 1. System Architecture

### 1.1 Layer Overview

The system has five distinct layers with strict responsibility boundaries. No layer may perform the work of another.

```
┌─────────────────────────────────────────────────────────────┐
│                     DATA PROVIDERS                          │
│  Apify (reviews, SERP, manufacturing)                       │
│  DataForSEO (keywords)                                      │
│  TikTok (virality)                                          │
│  OpenFDA / PubMed (news)                                    │
│  All results cached via provider_cache (Supabase)           │
└───────────────────────────┬─────────────────────────────────┘
                            │ raw provider outputs
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    SCORING ENGINE                           │
│  Signal computation from provider outputs                   │
│  Consumer Opportunity exclusion logic                       │
│  Review Moat (keyword specificity + log scale)              │
│  Weight redistribution for excluded signals                 │
│  Overall score → verdict candidate                          │
│  Primary risk classification (deterministic)                │
│  SynthesisInput construction                                │
│  NEVER generates prose                                      │
└───────────────────────────┬─────────────────────────────────┘
                            │ SynthesisInput (typed, bounded)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│               AI INTERPRETATION LAYER                       │
│  Receives ONLY SynthesisInput — nothing else                │
│  Three separate calls: causal paragraph, risk sentence,     │
│  product thesis                                             │
│  All outputs validated before use                           │
│  Falls back to deterministic templates on validation fail   │
│  NEVER computes scores, classifies signals, or accesses     │
│  raw provider data                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │ validated prose strings
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    EVIDENCE LAYER                           │
│  Structures raw provider outputs into human-readable cards  │
│  Operates independently of AI interpretation                │
│  Each signal maps to a structured ExpandableCard            │
│  Template-based rendering — no AI prose generation          │
│  Powers Layer 2 (inline expansion) of the UI               │
└───────────────────────────┬─────────────────────────────────┘
                            │ ExpandableCard[]
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                          UI                                 │
│  Renders verdict, first screen, progressive disclosure      │
│  Zero business logic — purely presentational                │
│  Three disclosure layers: first screen, inline, full audit  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Layer Responsibilities

| Layer | Does | Never Does |
|-------|------|------------|
| Data Providers | Fetches external data, honors cache TTLs | Interprets, scores, or generates prose |
| Scoring Engine | All deterministic computation, signal scoring, risk classification | Generates prose, calls AI, renders UI |
| AI Interpretation | Generates the three prose outputs from SynthesisInput | Computes scores, accesses raw data, decides verdict |
| Evidence Layer | Structures provider outputs into expandable cards | Generates prose, calls AI |
| UI | Renders | All of the above |

### 1.3 Strict Boundaries

**The Scoring Engine is the only layer that:**
- Has access to raw provider outputs
- Computes signal scores and applies weights
- Classifies primary risk deterministically
- Constructs SynthesisInput

**The AI Interpretation Layer is the only layer that:**
- Calls Anthropic models
- Generates natural language prose
- Sees SynthesisInput

**The Evidence Layer is the only layer that:**
- Accesses raw provider data for display purposes
- Renders specific numeric data points with context labels
- Constructs ExpandableCard objects

These boundaries are enforced by module architecture. The AI Interpretation Layer module must not import any provider module directly. It receives SynthesisInput and returns strings.

---

## 2. Complete Data Flow

### 2.1 Step-by-Step Flow

```
Step 1  User submits query
        Input: product keyword (string) + optional category (string)
        Validation: keyword must be non-empty, ≥ 3 characters

Step 2  Provider fetch — parallel
        Fires all enabled providers simultaneously with shared 75s race timeout:
          - Review provider (Axesso primary, junglee fallback) → CollectedReview[]
          - SERP provider (junglee amazon-crawler, MAX_ITEMS=10) → ProviderSignals
          - Keyword provider (DataForSEO) → KeywordIntelligence
          - Manufacturing provider (Apify/Alibaba, fires early) → ManufacturingEstimate
          - TikTok provider (free public API) → ViralitySignal
          - News provider (OpenFDA + PubMed) → NewsIntelligence
        Cache is checked before each live call (cacheGet → provider → cacheSet)

Step 3  Consumer Intelligence normalization — sequential after reviews
        Raw reviews → VoC clusters via Haiku 4.5 (max_tokens=800)
        Produces: ConsumerCluster[] with labels, frequencies, representative quotes

Step 4  Scoring Engine — signal computation
        Each provider output → signal score (0–10) with confidence
        Consumer Opportunity exclusion applied (thin corpus + cross-validated demand)
        Review Moat computed (keyword specificity + log scale)
        All weight redistribution computed for excluded signals

Step 5  Scoring Engine — verdict and risk
        Overall score computed from weighted signals
        Verdict candidate selected (see Section 6)
        Verdict confidence computed (see Section 10)
        Primary risk classified from signal values (see Section 4)
        SynthesisInput constructed (see Section 3)

Step 6  AI Interpretation — three calls
        Call A: causal paragraph (Sonnet 4.6, max_tokens=400)
        Call B: risk sentence (Sonnet 4.6, max_tokens=100)
        Call C: product thesis (Sonnet 4.6, max_tokens=600)
        Each call is independent. Calls A and B may fire in parallel.
        Call C may fire in parallel with A and B.

Step 7  Validation pipeline (see Section 12)
        Each AI output validated before use
        Failed outputs: retry once → fall back to deterministic template

Step 8  Evidence Layer — card construction
        Independent of Step 6–7 (can run in parallel)
        Raw provider outputs → ExpandableCard[] for each signal

Step 9  Response assembly
        verdict + verdict_confidence + causal_paragraph + signal_cards[3]
        + primary_risk_sentence + product_thesis_headline
        + full_product_thesis (stored, rendered on expand)
        + expandable_cards map keyed by signal

Step 10 UI render
        First screen renders from Step 9 assembly
        Progressive disclosure behavior activated (see Section 7)
```

### 2.2 Timeout Budget

| Stage | Timeout |
|-------|---------|
| Signal engine (shared race) | 75,000 ms |
| Manufacturing provider | 12,000 ms |
| Keyword engine | 25,000 ms |
| SERP provider client abort | 80,000 ms |
| Anthropic per-call | 100,000 ms |
| MAX_GENERATE_ATTEMPTS | 3 |

---

## 3. AI Contract — SynthesisInput

### 3.1 Type Definition

This type is the complete boundary between the Scoring Engine and the AI Interpretation Layer. The AI receives this object and nothing else.

```typescript
interface SynthesisInput {
  // ── Query context ──────────────────────────────────────────────────────
  query:          string    // original user query, passed through unchanged
  category:       string    // resolved category (may differ from query)
  analysis_date:  string    // ISO date only (YYYY-MM-DD) — no time, no timezone

  // ── Verdict ────────────────────────────────────────────────────────────
  // Deterministic output from the scoring engine. The AI explains this
  // verdict — it does not produce or modify it.
  verdict:            VerdictLabel
  verdict_confidence: ConfidenceTier  // HIGH | MODERATE | LOW
  overall_score:      number          // 0–100, integer, for AI calibration only
                                      // AI must not quote this number in output

  // ── Signals ────────────────────────────────────────────────────────────
  // Array of signals that were successfully collected and scored.
  // Excluded signals are NOT present here — see excluded_signals below.
  signals: SynthesisSignal[]

  // ── Primary risk ───────────────────────────────────────────────────────
  // Deterministically classified by the scoring engine. AI writes the
  // sentence; AI does not choose the risk type.
  primary_risk: {
    type:     RiskType
    severity: 'HIGH' | 'MODERATE' | 'LOW'
    evidence: RiskEvidence  // specific values that triggered classification
  }

  // ── Consumer intelligence ──────────────────────────────────────────────
  // Normalized VoC clusters — NOT raw review text.
  // Maximum 3 clusters passed to AI.
  consumer_clusters: ConsumerCluster[]
  thin_corpus:       boolean
  corpus_size:       number  // total reviews collected across both corpus passes

  // ── Keyword context ────────────────────────────────────────────────────
  // null if KeywordIntelligence provider failed or was excluded
  keyword_summary: {
    total_monthly_volume: number
    top_3_keywords: Array<{ keyword: string; volume: number }>
    trend_direction: 'UP' | 'STABLE' | 'DOWN' | 'SEASONAL' | 'INSUFFICIENT'
  } | null

  // ── Competition context ────────────────────────────────────────────────
  // null if SERP provider failed
  competitor_context: {
    meaningful_competitor_count: number
    avg_review_count:            number
    review_concentration_ratio:  number  // 0–1, two decimal places
    avg_rating:                  number | null
    top_competitors: Array<{
      brand:        string   // brand name only — no ASIN, no URL
      price:        number   // median observed price, USD
      review_count: number
    }>  // maximum 3 entries
  } | null

  // ── Manufacturing context ──────────────────────────────────────────────
  // null if manufacturing provider failed or was excluded
  manufacturing_context: {
    moq_range:        { min: number; max: number } | null
    unit_cost_range:  { min: number; max: number } | null
    feasibility:      'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN'
  } | null

  // ── Demand calibration ─────────────────────────────────────────────────
  // For contextualizing demand strength — not for financial projection.
  // null if no demand providers returned data.
  demand_calibration: {
    monthly_search_volume:  number | null   // DataForSEO primary volume
    keepa_monthly_units:    number | null   // Keepa estimate if available
    price_range: {
      median: number
      p25:    number
      p75:    number
    } | null
  } | null

  // ── Virality context ───────────────────────────────────────────────────
  // null if TikTok provider returned null
  virality_context: {
    signal_strength:     'STRONG' | 'MODERATE' | 'WEAK' | 'ABSENT'
    top_hashtag_volume:  number | null
    top_hashtag:         string | null
  } | null

  // ── Evidence quality ───────────────────────────────────────────────────
  excluded_signals:  ExcludedSignal[]   // signals excluded and why
  confidence_flags:  ConfidenceFlag[]   // specific quality warnings
}

// ── Supporting types ────────────────────────────────────────────────────────

type VerdictLabel =
  | 'ENTRY_SUPPORTED'
  | 'VALIDATION_REQUIRED'
  | 'ENTRY_NOT_SUPPORTED'

type ConfidenceTier = 'HIGH' | 'MODERATE' | 'LOW'

interface SynthesisSignal {
  id:               SignalId         // internal enum — see Section 5
  display_label:    string           // human-readable: "Demand", "Market Accessibility", etc.
  score:            number           // 0–10, one decimal place
  confidence:       ConfidenceTier
  headline:         string           // ≤ 8 words — template-generated, not AI
  supporting_stat:  string           // ≤ 30 chars — specific number with unit
}

interface ConsumerCluster {
  label:            string    // normalized complaint category label
  frequency:        number    // count of reviews mentioning this cluster
  frequency_pct:    number    // percentage of corpus (0–100, integer)
  sentiment:        'NEGATIVE' | 'MIXED'
}

interface RiskEvidence {
  // All fields are optional — only fields relevant to the specific RiskType
  // are populated. AI must reference only populated fields.
  review_moat_score?:             number
  meaningful_competitor_count?:   number
  avg_review_count?:              number
  review_concentration_ratio?:    number
  keyword_concentration_ratio?:   number
  top_keyword_pct?:               number
  corpus_size?:                   number
  moq_min?:                       number
  unit_cost_min?:                 number
  cogs_ratio?:                    number    // unit_cost_min / median_price
  median_price?:                  number
  seasonal_peak_ratio?:           number
  trend_direction?:               string
  demand_signal_count?:           number    // how many demand providers confirmed
  top_hashtag_volume?:            number
  market_accessibility_score?:    number
  competitor_formula_similarity?: number    // 0–1
}

interface ExcludedSignal {
  signal_id: SignalId
  reason:    'THIN_CORPUS' | 'PROVIDER_FAILURE' | 'INSUFFICIENT_DATA' | 'CONSUMER_OPPORTUNITY_EXCLUSION'
}

interface ConfidenceFlag {
  code:    string   // e.g., 'DEMAND_SINGLE_PROVIDER', 'THIN_CORPUS', 'SERP_SMALL_SAMPLE'
  message: string   // human-readable (shown in UI, not in AI prompt)
}

type SignalId =
  | 'demand'
  | 'market_accessibility'
  | 'consumer_pain'
  | 'virality'
  | 'manufacturing_feasibility'
  | 'subscription_potential'
  | 'profitability'

type RiskType =
  | 'REVIEW_MOAT'
  | 'MARKET_SATURATION'
  | 'DEMAND_UNCERTAINTY'
  | 'COST_STRUCTURE'
  | 'THIN_CONSUMER_DATA'
  | 'COMPETITOR_FORMULA_PARITY'
  | 'SEASONALITY'
  | 'DEMAND_CONCENTRATION'
  | 'VIRALITY_ABSENCE'
  | 'CATEGORY_ACCESSIBILITY'
```

### 3.2 What the AI Is Explicitly Prohibited From Accessing

The following data is collected and used by the scoring engine but must never appear in SynthesisInput:

| Prohibited data | Why |
|-----------------|-----|
| Raw review text (individual review content) | Prevents AI from hallucinating specifics from review language |
| Full keyword arrays (all DataForSEO results) | Only top_3_keywords pass through |
| Individual ASIN identifiers | Privacy / irrelevant to prose generation |
| Provider names ("DataForSEO", "Axesso", "junglee") | Never expose vendor details to founders |
| Internal signal keys ("review_velocity", "consumer_pain") | Only display_label is passed |
| Score computation steps or weight values | Prevents AI from reproducing or citing the scoring math |
| Cache metadata (TTLs, cache keys, hit/miss status) | Internal infrastructure |
| Raw Keepa data arrays | Only aggregated summary fields |
| All SERP result objects beyond top 3 competitors | Summarized in competitor_context |
| Ingredient label text from competitors | Scores are derived from it; AI gets the score, not the text |
| Full news articles or regulatory filing text | News intelligence is not exposed to the AI interpretation layer in v1 |

### 3.3 Three AI Call Specifications

Each call is a separate, independent Anthropic request. No call sees the output of another.

**Call A — Causal Paragraph**
- Model: claude-sonnet-4-6
- max_tokens: 400
- Input: full SynthesisInput
- Output: string, 3–4 sentences, 80–130 words

**Call B — Risk Sentence**
- Model: claude-sonnet-4-6
- max_tokens: 100
- Input: `{ query, primary_risk, competitor_context?.meaningful_competitor_count, thin_corpus }`
  (subset of SynthesisInput — only fields relevant to risk explanation)
- Output: string, exactly 1 sentence, 15–30 words

**Call C — Product Thesis**
- Model: claude-sonnet-4-6
- max_tokens: 600
- Input: `{ query, consumer_clusters, competitor_context, manufacturing_context, demand_calibration }`
  (subset of SynthesisInput — only fields relevant to product differentiation)
- Output: JSON with two fields: `{ headline: string, full_thesis: string }`
  - headline: 1 sentence, ≤ 22 words
  - full_thesis: 4–6 sentences, ≤ 180 words

---

## 4. Risk Taxonomy

### 4.1 Classification Rules

The scoring engine evaluates all 10 risk types for every analysis. Each applicable risk is assigned a severity (HIGH / MODERATE / LOW) and recorded. The top-ranked applicable risk becomes `primary_risk` in SynthesisInput. Remaining risks are stored but not surfaced in v1.

**Priority order** (tie-breaking when severity is equal, most critical first):

1. REVIEW_MOAT
2. MARKET_SATURATION
3. DEMAND_UNCERTAINTY
4. COST_STRUCTURE
5. THIN_CONSUMER_DATA
6. COMPETITOR_FORMULA_PARITY
7. SEASONALITY
8. DEMAND_CONCENTRATION
9. VIRALITY_ABSENCE
10. CATEGORY_ACCESSIBILITY

High severity always outranks Moderate and Low regardless of position in the priority list.

A risk is only classifiable if its trigger signals are present in the analysis. If the triggering provider failed, the risk is not classified.

### 4.2 Risk Definitions

---

#### REVIEW_MOAT

**Description:** Established competitors have accumulated review counts that create an asymmetric trust disadvantage for new entrants.

**Trigger conditions:**
- `review_moat_score >= 7.5` (computed by scoring engine from keyword specificity + log scale)
- AND `meaningful_competitor_count >= 10`

**Severity:**
- HIGH: `review_moat_score >= 8.5`
- MODERATE: `review_moat_score >= 7.5`

**Required evidence fields:** `review_moat_score`, `avg_review_count`, `meaningful_competitor_count`

**Risk sentence must include:**
- The review moat score value (e.g., "Review Moat score of 8.3")
- The average review count of established competitors
- The implication for a new entrant's discoverability

---

#### MARKET_SATURATION

**Description:** High competitor count combined with low review concentration means the market is already fragmented, making organic share capture structurally difficult.

**Trigger conditions:**
- `meaningful_competitor_count >= 20`
- AND `review_concentration_ratio <= 0.40`

**Severity:**
- HIGH: `meaningful_competitor_count >= 30`
- MODERATE: `meaningful_competitor_count >= 20`

**Required evidence fields:** `meaningful_competitor_count`, `review_concentration_ratio`

**Risk sentence must include:**
- The competitor count
- The concentration ratio as a percentage

---

#### DEMAND_UNCERTAINTY

**Description:** Demand signals are insufficient to confirm market size; the verdict may not reflect actual consumer behavior at scale.

**Trigger conditions:**
- Demand signal confidence = LIMITED (all demand providers returned data below threshold)
- OR only one demand provider returned data

**Severity:**
- HIGH: No demand provider returned confirmed data
- MODERATE: Single provider, INDICATED tier only

**Required evidence fields:** `demand_signal_count`, and whichever of `monthly_search_volume` / `keepa_monthly_units` are available

**Risk sentence must include:**
- How many demand sources were available
- What this means for the reliability of the demand assessment

---

#### COST_STRUCTURE

**Description:** Manufacturing cost and minimum order quantities create capital exposure before the product proves market fit.

**Trigger conditions:**
- `moq_min >= 500`
- AND `cogs_ratio >= 0.45` (unit_cost_min / median_price >= 45%)

**Severity:**
- HIGH: `cogs_ratio >= 0.55` OR `moq_min >= 1000`
- MODERATE: `cogs_ratio >= 0.45` AND `moq_min >= 500`

**Required evidence fields:** `moq_min`, `unit_cost_min`, `cogs_ratio`, `median_price`

**Risk sentence must include:**
- Minimum order quantity
- Estimated COGS ratio as a percentage
- The capital commitment implied before proof of demand

---

#### THIN_CONSUMER_DATA

**Description:** The review corpus is too small to reliably characterize consumer pain; product differentiation cannot be grounded in validated evidence.

**Trigger conditions:**
- `thin_corpus = true` (corpus_size < 50 reviews across both passes)

**Severity:**
- HIGH: `corpus_size < 20`
- MODERATE: `corpus_size >= 20 AND < 50`

**Required evidence fields:** `corpus_size`

**Risk sentence must include:**
- The corpus size
- What this prevents the analysis from confirming

---

#### COMPETITOR_FORMULA_PARITY

**Description:** Top competitors have converged on nearly identical formulations, making ingredient-level differentiation structurally difficult in this category.

**Trigger conditions:**
- `competitor_formula_similarity >= 0.70`
  (computed by scoring engine from ingredient label overlap across top_competitors)
- Requires ingredient_label data to be present on ≥ 3 top competitors

**Severity:**
- HIGH: `competitor_formula_similarity >= 0.85`
- MODERATE: `competitor_formula_similarity >= 0.70`

**Required evidence fields:** `competitor_formula_similarity`, `meaningful_competitor_count`

**Risk sentence must include:**
- The number of competitors with matching formulations
- The specific active ingredient or class that is converged upon (taken from the shared ingredient pattern)

---

#### SEASONALITY

**Description:** Demand shows seasonal concentration; revenue and inventory requirements will be uneven across the year.

**Trigger conditions:**
- `trend_direction = 'SEASONAL'`
- AND keyword seasonality data confirms peak-to-trough ratio (computed from DataForSEO monthly data)
- `seasonal_peak_ratio >= 2.5` (peak month is 2.5× the trough month)

**Severity:**
- HIGH: `seasonal_peak_ratio >= 4.0`
- MODERATE: `seasonal_peak_ratio >= 2.5`

**Required evidence fields:** `trend_direction`, `seasonal_peak_ratio`

**Risk sentence must include:**
- The seasonal pattern (which months are peak vs. trough if determinable)
- The peak-to-trough ratio

---

#### DEMAND_CONCENTRATION

**Description:** Demand is real but concentrated in a narrow set of keywords, making organic discovery fragile and dependent on ranking for few terms.

**Trigger conditions:**
- Top keyword holds ≥ 70% of total_monthly_volume
- `top_keyword_pct >= 70`

**Severity:**
- HIGH: `top_keyword_pct >= 85`
- MODERATE: `top_keyword_pct >= 70`

**Required evidence fields:** `top_keyword_pct`, top keyword name and volume (from keyword_summary.top_3_keywords[0])

**Risk sentence must include:**
- The top keyword name
- Its share of total volume as a percentage

---

#### VIRALITY_ABSENCE

**Description:** No detectable organic social signal; the category may lack the emotional resonance that supports cost-effective community-driven customer acquisition.

**Trigger conditions:**
- `virality_context.signal_strength = 'ABSENT'`
- AND virality signal score ≤ 3 (computed by scoring engine)

**Severity:**
- LOW only (virality absence is a concern, not a disqualifier)

**Required evidence fields:** `top_hashtag_volume` (null when absent)

**Risk sentence must include:**
- The platform checked (TikTok)
- What was not found
- The acquisition implication

Note: VIRALITY_ABSENCE is never assigned HIGH severity. It can only be primary_risk if all higher-priority applicable risks are LOW severity.

---

#### CATEGORY_ACCESSIBILITY

**Description:** The combination of competitor strength and review moats makes this category structurally difficult to enter at the market accessibility signal level.

**Trigger conditions:**
- `market_accessibility_score <= 4` (on the 0–10 scoring scale)

**Severity:**
- HIGH: `market_accessibility_score <= 2`
- MODERATE: `market_accessibility_score <= 4`

**Required evidence fields:** `market_accessibility_score`, `meaningful_competitor_count`, `review_concentration_ratio`

**Risk sentence must include:**
- The market accessibility score value
- The primary driver (competitor count or concentration ratio)

---

## 5. Signal Taxonomy

### 5.1 Signal Definitions

| Signal ID | Display Label | Source | Score Range | Weight |
|-----------|---------------|--------|-------------|--------|
| `demand` | Demand | DataForSEO + Keepa | 0–10 | 22 |
| `market_accessibility` | Market Accessibility | SERP (junglee) | 0–10 | 18 |
| `profitability` | Profit Potential | Manufacturing + SERP prices | 0–10 | 20 |
| `consumer_pain` | Consumer Pain | Review corpus VoC | 0–10 | 18 |
| `virality` | Viral Potential | TikTok | 0–10 | 10 |
| `subscription_potential` | Subscription Potential | VoC + category type | 0–10 | 7 |
| `manufacturing_feasibility` | Manufacturing Feasibility | Apify/Alibaba | 0–10 | 5 |

**Total weight: 100. Excluded signals have their weight redistributed proportionally among remaining signals.**

### 5.2 Signal Confidence Tiers

Confidence is computed deterministically from provider output quality. It is not estimated or inferred.

**Demand signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | DataForSEO volume ≥ 10,000/mo AND Keepa ≥ 5,000 units/mo |
| INDICATED | DataForSEO ≥ 5,000/mo OR Keepa ≥ 5,000 units/mo (single source) |
| LIMITED | Below either threshold, or only one source available |

**Market Accessibility signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | SERP results with reviews AND brand: `withReviews.length >= 10` |
| INDICATED | `withReviews.length >= 5 AND < 10` |
| LIMITED | `withReviews.length < 5` |

**Consumer Pain signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | `corpus_size >= 50` (both corpus passes combined) |
| INDICATED | `corpus_size >= 20 AND < 50` |
| LIMITED | `corpus_size < 20` (thin_corpus = true) |

Note: thin_corpus = true when `corpus_size < 50`. The Consumer Opportunity scoring exclusion applies when `thin_corpus = true AND cross-validated demand conditions met`. Limited tier does not automatically exclude the signal — the exclusion logic is separate.

**Virality signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | Top hashtag volume ≥ 100,000,000 views |
| INDICATED | Top hashtag volume ≥ 10,000,000 views |
| LIMITED | Top hashtag volume < 10,000,000 |
| ABSENT | TikTok provider returned null |

**Manufacturing Feasibility signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | Both MOQ range and unit cost range present |
| INDICATED | One of MOQ or unit cost range present |
| LIMITED | Neither present (provider returned partial data) |

**Keyword signal:**
| Tier | Condition |
|------|-----------|
| CONFIRMED | `top_3_keywords[0].volume >= 5,000` |
| INDICATED | `top_3_keywords[0].volume >= 1,000` |
| LIMITED | `top_3_keywords[0].volume < 1,000` |

### 5.3 First-Screen Signal Selection

Exactly three signals are shown on the first screen. Selection is verdict-conditional and deterministic.

**For ENTRY_SUPPORTED verdict:**
Select the three signals with the highest scores that have CONFIRMED or INDICATED confidence. If fewer than three signals meet this threshold, fill remaining slots with the next highest scored signals regardless of confidence, and apply confidence badges.

**For VALIDATION_REQUIRED verdict:**
Select the highest-scored signal (positive anchor) + the two lowest-scored signals that are present (uncertainty anchors). This composition communicates "here is what works, here is what remains unresolved."

**For ENTRY_NOT_SUPPORTED verdict:**
Select the three lowest-scored signals. These represent the primary failure conditions.

**Tie-breaking:** when scores are equal, prefer signals by weight descending (demand > profitability > market_accessibility = consumer_pain > virality > subscription > manufacturing).

---

## 6. Verdict Generation

### 6.1 Score Thresholds

These thresholds are engineering constants. They should be reviewed after large-scale validation.

```
ENTRY_SUPPORTED:       overall_score >= 65
VALIDATION_REQUIRED:   overall_score >= 40 AND < 65
ENTRY_NOT_SUPPORTED:   overall_score < 40
```

The overall score is computed from weighted signals (Section 5.1), normalized to 0–100. Excluded signals have their weight redistributed before scoring.

### 6.2 Display Label

The verdict is displayed as a market assessment, not a personal instruction. The label names what the evidence shows about the market — not what the founder should do.

| VerdictLabel | User-facing display text |
|-------------|--------------------------|
| ENTRY_SUPPORTED | The evidence supports market entry |
| VALIDATION_REQUIRED | The evidence requires validation before entry |
| ENTRY_NOT_SUPPORTED | The evidence does not support market entry |

The display text is a static string. It is never AI-generated. It never changes based on the specific product or query.

### 6.3 Verdict Confidence Computation

Verdict confidence is computed after signal confidence tiers are assigned.

```
HIGH:     ≥ 4 signals at CONFIRMED or INDICATED tier, none at LIMITED
MODERATE: ≥ 2 signals at CONFIRMED or INDICATED, ≤ 1 at LIMITED
LOW:      any other combination
         OR thin_corpus = true
         OR consumer_pain excluded via Consumer Opportunity exclusion
         OR all demand providers returned LIMITED tier
```

### 6.4 Confidence Qualifier Display

The confidence qualifier is a static template string appended adjacent to the verdict label. It is not AI-generated.

**Trigger rule (deterministic):**
Show the confidence qualifier if `verdict_confidence = LOW OR verdict_confidence = MODERATE`.

**Template:**
```
"Based on [N] confirmed signal(s). [Specific limitation if applicable.]"
```

Where N = count of CONFIRMED tier signals. If a critical signal was excluded, append: "Consumer pain assessment was not possible with available data." or equivalent for the specific excluded signal.

Do not show the qualifier if `verdict_confidence = HIGH`.

---

## 7. First-Screen Specification

### 7.1 Information Hierarchy

The first screen contains exactly six elements in this order. Nothing else appears above the fold on the default render.

```
1.  Verdict display text
    [Confidence qualifier — shown only if verdict_confidence = LOW or MODERATE]

2.  Causal paragraph (AI-generated, validated)

3.  Signal card A
    Signal card B
    Signal card C
    [Three cards — verdict-conditional selection per Section 5.3]

4.  Primary risk sentence (AI-generated, validated)

5.  Product thesis headline (AI-generated, validated)

──── fold ────

6.  [Expandable: Conditions for Success / Failure]   (linked, not shown)
7.  [Expandable: Decision-specific next steps]        (linked, not shown)
```

### 7.2 Maximum Lengths

All length limits are enforced at render time. If an AI output exceeds the limit, it is truncated to the nearest sentence boundary. The validation pipeline (Section 12) should prevent this from being necessary.

| Element | Maximum length |
|---------|---------------|
| Verdict display text | 8 words (static template) |
| Confidence qualifier | 20 words (static template) |
| Causal paragraph | 130 words, 4 sentences |
| Each signal card headline | 8 words |
| Each signal card supporting stat | 30 characters |
| Primary risk sentence | 30 words, 1 sentence |
| Product thesis headline | 22 words, 1 sentence |
| Full product thesis (on expand) | 180 words, 6 sentences |

### 7.3 Signal Card Format

Each signal card contains three elements:

```
[Signal name]     [Confidence badge]
[Headline phrase]
[Supporting stat]
```

**Signal name:** display_label from SynthesisSignal (e.g., "Demand", "Market Accessibility")

**Confidence badge:**
- CONFIRMED: rendered as green indicator
- INDICATED: rendered as amber indicator
- LIMITED: rendered as orange indicator with tooltip: "Limited data — treat with caution"

**Headline phrase:** template-generated from the signal score range, not AI-generated. Examples:
- Demand CONFIRMED + score ≥ 7: "Strong confirmed demand"
- Demand INDICATED + score 5–7: "Moderate demand signal"
- Market Accessibility + score ≤ 4: "Competitive market barrier"

**Supporting stat:** the single most relevant number for the signal. Examples:
- Demand: "45,200/mo search volume"
- Market Accessibility: "14 meaningful competitors"
- Consumer Pain: "67% of reviews cite [top cluster label]"
- Virality: "142M TikTok views — [top hashtag]"

### 7.4 Primary Risk Display

The primary risk is displayed at the same visual level as the verdict — not below, not smaller, not subordinated. A risk that appears visually inferior to the verdict creates false confidence anchoring.

Format:
```
Primary Risk: [risk sentence]
              [expand control: "See what would change this ▼"]
```

### 7.5 Progressive Disclosure Behavior

**Signal card expansion (Layer 2):**
- Tap or click expands the card inline (no navigation, no modal)
- Expanded card shows: signal name, confidence tier with explanation, 2–4 data points with context labels, plain-English interpretation (template-based), limitation note if INDICATED or LIMITED
- Collapsing the card returns to the default state
- Only one signal card can be expanded at a time

**Primary risk expansion:**
- Tap or click expands inline
- Shows: named risk type, specific evidence values that triggered it, the condition that would downgrade or remove it
- If the risk is reducible (e.g., THIN_CONSUMER_DATA improves with more data), this is stated explicitly

**Product thesis headline expansion:**
- Tap or click expands to full product thesis (4–6 sentences)
- Full thesis covers: what to build, why it addresses the top consumer complaint, what incumbents miss
- Collapses back to headline

**Conditions for Success / Failure and Next Steps:**
- Accessed via explicit link/button, not shown by default
- Rendered as a separate panel or section below the first screen
- NOT AI-generated in v1 — deterministic templates populated from scoring engine outputs

---

## 8. AI Writing Rules

### 8.1 Hard Constraints

These constraints apply to all three AI calls (causal paragraph, risk sentence, product thesis). They are included verbatim in the system prompt for each call.

1. Every sentence must contain at least one specific quantitative reference from the provided structured data. A sentence with no numbers, signal names, or evidence references is invalid.

2. You may only write about signal types that are explicitly present in the structured data provided. If a field is null or absent, you may not make any claim about it.

3. You may not produce revenue figures, TAM estimates, market size projections, income expectations, or any financial forecast of any kind.

4. You may not use probability language: "likely to succeed," "high chance of," "will probably," "expected to," "projected to."

5. You may not use personal directive language: "you should," "we recommend," "the founder needs to," "your product must."

6. You may not quote `overall_score`. The numeric score is provided for AI calibration only and must not appear in any output.

7. You may not name data providers (DataForSEO, Apify, Axesso, Keepa, junglee). Reference the data only ("keyword research shows," "search volume data indicates").

8. You may not make claims about regulatory, legal, or compliance environments unless a specific regulatory signal is provided in the data.

9. The causal paragraph maximum is 4 sentences. The risk sentence is exactly 1 sentence. The product thesis headline is 1 sentence. These are hard limits, not guidelines.

10. Claims about competitor behavior must reference specific data from `competitor_context`. Generic statements about "market leaders" or "dominant players" are not permitted without naming the brand.

### 8.2 Forbidden Language Patterns

The validation pipeline (Section 12, Step 3) scans for these patterns and rejects outputs that contain them.

| Pattern | Why forbidden |
|---------|---------------|
| Specific year references (20XX) unless present in SynthesisInput | Temporal hallucination |
| Revenue or income figures ("$X million", "$X/year") | Financial projection |
| Percentage change claims ("grew X%", "increased X%") unless trend_direction = 'UP' and growth rate is in SynthesisInput | Fabricated growth |
| "Massive opportunity", "huge market", "explosive growth" | Unsupported superlative |
| "Unique opportunity", "first mover advantage", "blue ocean" | Founder-projection language |
| "Your business", "your product", "your target customers" | Personal directive — platform assesses markets, not founders |
| "FDA is cracking down", "regulatory concerns are mounting" | Regulatory hallucination |
| "It depends", "could go either way", "hard to say" | Non-answer |
| "Consumers want [X]" without citing consumer_clusters | Hallucinated consumer insight |
| "Rapidly growing" when trend_direction ≠ 'UP' | Fabricated trend |

### 8.3 Required Sentence Structure by Output Type

**Causal paragraph — 4-sentence structure:**

```
Sentence 1 — Demand: state demand strength, cite monthly_search_volume or keepa_monthly_units
             example shape: "[Category] shows [strength descriptor]: [volume] monthly searches
             [or Keepa equivalent], with [trend characterization]."

Sentence 2 — Competition: state market accessibility, cite meaningful_competitor_count
             or review_concentration_ratio
             example shape: "The competitive landscape has [N] established competitors
             [concentration descriptor]."

Sentence 3 — Consumer pain: state consumer insight, cite top consumer_cluster.label
             and frequency_pct
             example shape: "[X]% of reviewed customers cite [cluster.label] as the
             primary complaint, [implication for differentiation]."

Sentence 4 — Qualification (optional): state any material limitation or calibration note.
             Only include if a confidence_flag is present or if thin_corpus = true.
             Do not pad with positive framing.
```

**Risk sentence — structure:**

```
"[Risk type in plain language] is the primary concern: [specific evidence from RiskEvidence
showing the trigger condition], [consequence for a new entrant]."
```

Maximum 30 words. Must name at least one specific numeric value from RiskEvidence. The consequence must be specific to entry, not generic.

**Product thesis — headline + full thesis:**

The headline (1 sentence) states what to build and why, in terms of the market gap.

The full thesis (4–6 sentences) covers:
1. What to build — specific product architecture (form, delivery mechanism, format)
2. Why it addresses the primary consumer complaint — cite cluster.label and frequency_pct
3. What incumbents miss — cite specific data from competitor_context (brand name, price, or review pattern)
4. One sentence on the manufacturing feasibility implication, if manufacturing_context is present
5. One sentence on differentiation constraint or opportunity, grounded in signals

Product thesis must not: promise revenue, predict adoption, forecast success, give channel strategy, or make any claim about founder capability.

### 8.4 Hallucination Prevention — Structural Approach

Hallucination prevention is structural, not prompt-engineering. The structure is:

1. SynthesisInput scoping (Section 3.1): AI physically cannot see data it's not supposed to use
2. Per-call input scoping (Section 3.3): each call receives only the subset of SynthesisInput relevant to its task
3. Output validation (Section 12): scans for forbidden patterns before output is used
4. Deterministic fallback (Section 12, Step 5): when AI fails validation, a template with zero hallucination risk is used
5. Short outputs: smaller max_tokens = less room for hallucination to appear

Prompt engineering (phrasing the constraint as an instruction) is secondary. Structural constraints (limiting what the AI can see and how long its output can be) are primary.

---

## 9. Evidence System

### 9.1 Layer Architecture

**Layer 1 — First screen** (always visible)
The five elements of the first screen. No raw data. All prose from AI interpretation or static templates.

**Layer 2 — Inline expansion** (user-triggered, rendered inline)
Each first-screen element has an expansion that reveals the specific evidence behind the claim. Layer 2 is template-generated, not AI-generated.

**Layer 3 — Full evidence view** (not built in v1)
Structured view of all provider outputs by signal category. Deferred to v2.

### 9.2 Layer 2 — Inline Expansion Content

**Signal card expansion:**
- Signal display_label + confidence tier + explanation of what the tier means
- 2–4 specific data points, each with a context label (not a raw number alone)
- Plain-English interpretation (≤ 30 words) — template, not AI
- Limitation note if confidence = INDICATED or LIMITED
- Displayed data points must come from the Evidence Layer's structured ExpandableCard — not recomputed at render time

Example for Demand signal (CONFIRMED):
```
Demand — Confirmed
Search data and sales estimates agree on meaningful consumer volume.

Monthly search volume:    45,200 / month
Keepa estimated units:    81,000 / month (category-wide)
Median price:             $34.99  (p25: $24, p75: $47)
Trend:                    Stable (no significant seasonal pattern)

This demand level represents consistent, recurring purchase intent —
not a one-time search spike.
```

**Primary risk expansion:**
- Named risk type (human-readable, not enum value)
- Specific evidence values that triggered classification
- The condition that would change or remove this risk
- If reducible: explicit statement ("collecting more reviews would allow consumer pain validation")

**Product thesis expansion:**
- Full product thesis (4–6 sentences)
- No additional evidence shown here — the thesis itself contains evidence references

### 9.3 ExpandableCard Type

The Evidence Layer constructs one ExpandableCard per signal. These are passed to the UI alongside the AI outputs.

```typescript
interface ExpandableCard {
  signal_id:    SignalId
  confidence:   ConfidenceTier
  data_points:  Array<{ label: string; value: string }>  // max 4
  interpretation: string  // ≤ 30 words, template-generated
  limitation:   string | null  // shown when confidence = INDICATED or LIMITED
}
```

### 9.4 Evidence Auditability Principles

Every claim visible on the first screen must be traceable to evidence visible at Layer 2. No first-screen claim may be made without a corresponding Layer 2 card. If a signal card is shown, its ExpandableCard must exist.

The AI output for the causal paragraph contains specific numbers. Those same numbers must be findable in the Layer 2 expansion for the relevant signal. The AI does not generate evidence — it references evidence that is independently rendered by the Evidence Layer. If the two disagree, the Layer 2 data is authoritative.

---

## 10. Confidence System

### 10.1 Signal-Level Confidence Assignment

Confidence tiers are assigned by the Scoring Engine using only deterministic rules (see Section 5.2). No heuristics, no estimation, no interpolation. If the conditions for a tier are not met, the signal falls to the lower tier.

### 10.2 Verdict-Level Confidence Computation

See Section 6.3. Verdict confidence is computed after all signal confidence tiers are assigned.

### 10.3 Confidence Qualifier Display Rules

| verdict_confidence | Qualifier shown? |
|-------------------|-----------------|
| HIGH | No |
| MODERATE | Yes |
| LOW | Yes |

The qualifier is a static template — see Section 6.4.

### 10.4 Confidence Badge Display

Every signal card on the first screen shows a confidence badge. The badge is mandatory — it is not optional or conditional on the tier. A founder seeing a LIMITED confidence badge must be able to understand what it means from the badge alone, without expanding the card.

Badge tooltip text:
- CONFIRMED: "Multiple independent data sources agree."
- INDICATED: "Based on a single data source. Reasonable estimate, not confirmed."
- LIMITED: "Insufficient data to confirm this signal. Treat with caution."

### 10.5 Edge Cases

**All signals are LIMITED:**
Verdict confidence = LOW. All signal cards show LIMITED badges. Confidence qualifier shown. The causal paragraph must include a qualification sentence (Sentence 4) noting the data limitation.

**Consumer Opportunity exclusion triggered:**
`consumer_pain` is excluded from scoring. The exclusion is listed in `excluded_signals`. Verdict confidence is set to LOW regardless of other signal tiers. A confidence flag is created: `{ code: 'CONSUMER_OPPORTUNITY_EXCLUDED', message: 'Consumer pain assessment excluded — thin corpus with cross-validated demand signal.' }`

**All demand providers failed:**
Analysis cannot complete. Return error state (see Section 11.3). Do not attempt AI generation with no demand data.

**Verdict confidence would be HIGH but primary_risk is HIGH severity:**
verdict_confidence remains HIGH. The risk is real and will be shown prominently. HIGH confidence does not mean no risk — it means the signals are well-supported. Do not downgrade verdict_confidence based on risk severity.

---

## 11. Failure Handling

### 11.1 Provider Failure

Each provider failure is handled independently. Provider failure never cascades to a full analysis failure unless the failed provider is demand (see 11.3).

| Provider | Failure behavior |
|----------|-----------------|
| Review provider (all) | thin_corpus = true; consumer_pain marked LIMITED; Consumer Opportunity exclusion may apply |
| SERP provider | competitor_context = null; market_accessibility excluded; weight redistributed |
| Keyword provider | keyword_summary = null; demand falls back to Keepa only; AI cannot reference keyword data |
| Manufacturing provider | manufacturing_context = null; manufacturing_feasibility excluded; weight redistributed |
| TikTok provider | virality_context = null; virality signal excluded; weight redistributed |
| News provider | Not surfaced to AI in v1; failure has no impact on AI layer |

### 11.2 Missing Signals

When a signal is excluded (provider failure or insufficient data), its weight is redistributed proportionally to the remaining included signals. The excluded_signals array in SynthesisInput records each exclusion and its reason.

The AI may not make any claim about an excluded signal's domain. If manufacturing_context = null, the AI may not write about manufacturing. The SynthesisInput structure enforces this — the field is null, so there is no data to reference.

### 11.3 Fatal Failures

These conditions cause the analysis to fail with an error state. Do not attempt partial generation.

- All demand providers (DataForSEO AND Keepa) failed or returned no data
- SERP provider AND keyword provider both failed (market assessment impossible with no market data)
- Anthropic API unreachable after MAX_GENERATE_ATTEMPTS (3)

Error state message (static, not AI-generated):
- Demand failure: "We were unable to collect demand data for this query. Try a more specific product keyword or check back shortly."
- Market data failure: "We were unable to collect sufficient market data. Try a more specific product keyword."
- AI failure: "Report generation failed. Your data was collected successfully — please try again."

### 11.4 Conflicting Signals

When two signals point in opposite directions, the scoring engine handles the weighting — the conflict is resolved numerically. The AI interpretation layer does not receive conflicting raw signals; it receives the scored and weighted summary in SynthesisInput.

The only conflict scenario visible to the AI is when `verdict_confidence = MODERATE or LOW` due to signal quality variation. In that case, the causal paragraph's Sentence 4 (qualification) should address the limitation.

The AI is not permitted to arbitrate between conflicting signals in its prose. It should not say "some data suggests X while other data suggests Y." It characterizes the current evidence state (as reflected in the scored signals) without commentary on the conflict.

### 11.5 Empty Categories / Thin SERP Results

If SERP returns fewer than `MIN_RESULTS = 5` items, the competition provider returns null. market_accessibility is excluded from scoring. This is treated as a provider failure (Section 11.1).

If keyword search returns 0 results, keyword provider returns null. This is treated as a provider failure.

Neither condition is an error state unless combined with demand provider failure.

---

## 12. Validation Pipeline

Every AI output passes through this pipeline before it is stored or rendered. The pipeline runs independently for each of the three call outputs (causal paragraph, risk sentence, product thesis).

### Step 1 — SynthesisInput Schema Validation

**When:** Before any AI call is made.

**What:** Runtime validation of SynthesisInput against the TypeScript interface. Use zod or equivalent runtime validator.

**On failure:** Throw. Do not attempt AI generation with invalid input. Log the specific field that failed validation.

This step catches schema drift between the scoring engine output and the AI contract. It must fail loudly — silent failure here means hallucination risk downstream.

### Step 2 — AI Output Format Validation

**When:** Immediately after each AI call returns.

**What:** Check:
- Output is a non-empty string (or valid JSON for Call C)
- Output length is within expected range:
  - Causal paragraph: 60–160 words
  - Risk sentence: 10–35 words
  - Product thesis headline: 8–25 words
  - Full product thesis: 80–200 words
- Output does not end mid-sentence (detect: output does not end with `.`, `!`, or `?`)
- For Call C (JSON): both `headline` and `full_thesis` fields are present and non-empty

**On failure:** Retry the call once. If second attempt also fails format validation, proceed to Step 5 (deterministic fallback).

### Step 3 — Hallucination Pattern Detection

**When:** After Step 2 passes.

**What:** Regex scan for forbidden patterns (Section 8.2):
- Revenue/income figures: `/\$[\d,]+\s*(million|billion|M|B|k)?/i`
- Specific year references: `/\b20\d{2}\b/` (unless the year appears in SynthesisInput.analysis_date)
- Probability language: `/\b(likely to succeed|high chance|will probably|projected to|expected to achieve)\b/i`
- Personal directive: `/\b(you should|we recommend|the founder (needs|must|should))\b/i`
- Provider names: `/\b(DataForSEO|Apify|Axesso|Keepa|junglee|Amazon crawler)\b/i`
- Growth claims without data: `/\b(growing rapidly|explosive growth|massive growth)\b/i` when trend_direction ≠ 'UP'
- Superlatives without evidence: `/\b(massive opportunity|huge market|enormous potential)\b/i`

**On failure (any pattern matched):** Retry the call once with an augmented prompt that explicitly lists the detected violation. If the second attempt also fails, proceed to Step 5.

### Step 4 — Evidence Grounding Check

**When:** After Step 3 passes.

**What:**
- Causal paragraph: verify that at least one numeric value present in SynthesisInput appears verbatim in the output. (Acceptable: the exact number "45,200" appears if keyword_summary.total_monthly_volume = 45200.)
- Risk sentence: verify that the output references a value present in `primary_risk.evidence`. The risk type description (not the enum value) must match a recognized risk type from Section 4.
- Product thesis: verify that at least one consumer_cluster.label from SynthesisInput appears in the output.

**On failure:** Retry once. If second attempt also fails, proceed to Step 5.

### Step 5 — Deterministic Fallback

**When:** Any step fails after retry.

**What:** Use the pre-defined deterministic template for the specific output type that failed. Templates must be written before any AI generation code is deployed.

**Template requirements:**
- Templates produce grammatically correct, factually accurate output by directly inserting values from SynthesisInput
- Templates never generate claims not supported by the data
- Templates are always shorter and less expressive than AI output — this is acceptable
- Templates are reviewed and approved before deployment
- Fallback usage is logged for monitoring

**Example causal paragraph template (simplified):**
```
"[query] shows [strength descriptor based on demand score] consumer demand,
with [monthly_search_volume] monthly searches. The market has
[meaningful_competitor_count] established competitors. 
[If consumer_clusters[0] present: 'Customer research shows [cluster[0].frequency_pct]%
of buyers cite [cluster[0].label] as a primary concern.']"
```

### Step 6 — Final Output Validation

**When:** After Step 4 passes or after Step 5 produces a fallback.

**What:** Final check before storage:
- Output is within first-screen display length limits (Section 7.2)
- If output came from fallback: `is_fallback: true` is recorded in the stored result
- Log the full validation trace (steps passed/failed, retry count, fallback triggered) — this data is needed for monitoring AI output quality over time

---

## 13. Non-Goals

This section defines what the product intentionally does not do. These are architectural decisions, not product gaps. Do not implement these features without explicit product decision and document update.

**Founder-facing non-goals:**

1. **Probability of success** — The platform does not estimate the likelihood that a founder will succeed with this product. Success depends on variables the platform does not have access to.

2. **Revenue projections** — No revenue forecasts, income expectations, TAM estimates, SAM estimates, or addressable revenue figures of any kind.

3. **Return on investment** — No ROI calculation, payback period, or capital efficiency estimate.

4. **Execution advice requiring unknown variables** — No go-to-market strategy, pricing strategy, channel recommendations, launch sequencing, or operational planning. These require founder context the platform does not collect.

5. **Founder-market fit assessment** — The platform assesses markets. It does not assess whether a specific founder is the right person to enter a market.

6. **Team or resource requirements** — No headcount estimates, hiring guidance, or capital requirement projections.

7. **Regulatory or legal compliance guidance** — The platform does not advise on FDA compliance, labeling requirements, import regulations, or legal structure.

8. **Competitor strategy advice** — The platform does not advise on how to compete with specific competitors or how to position against named brands.

**Technical non-goals:**

9. **Cross-analysis comparison** — The platform does not compare two analyses side-by-side. Each analysis is independent.

10. **Historical tracking** — The platform does not track how a market's signals change over time or alert founders to signal changes.

11. **Interactive adaptation** — The platform does not allow founders to provide additional context that modifies the analysis output. The analysis is based on collected market data only.

12. **Investor report export** — The platform does not produce investor-grade documents, executive summaries for fundraising, or pitch deck content.

13. **Real-time data** — All provider data is cached (7–14 day TTLs). The platform does not claim to provide real-time market data.

---

## 14. Future Extensions

These features are intentionally deferred from v1. They are listed here to prevent scope creep during v1 implementation, not to discourage their eventual development.

**User experience extensions:**
- Layer 3 full evidence view — structured audit of all provider outputs by signal category
- Saved analyses with founder account — requires authentication and persistent storage
- Historical re-analysis with signal change alerts — requires stored baseline and scheduled jobs
- Cross-analysis comparison — requires stored analyses and a comparison UI

**Report extensions:**
- Investor report export format — requires different framing, different data presentation
- PDF or shareable report link — requires export infrastructure

**Data extensions:**
- Prompt caching for Anthropic API (cost reduction) — requires implementation against Anthropic's caching API
- Additional market verticals beyond supplements, beauty, pets, fitness — requires category-specific signal calibration
- Review collection reduction from 50 to 30 per corpus pass — deferred pending large-scale validation data
- Supplier contact integration from manufacturing intelligence — requires Alibaba scraper enhancement
- Extended keyword opportunity discovery beyond primary query — requires multi-query DataForSEO runs

**Cost optimization extensions:**
- Anthropic prompt caching — estimated $0.03–0.05/warm cache hit; implement after v1 baseline is established
- Selective review re-collection (only re-collect if cached reviews are > 14 days old and product page changed) — requires change detection signal

---

*End of specification. This document should be updated whenever an architectural decision is changed, a threshold is revised after validation, or a non-goal is reconsidered. The document version should increment on every substantive change.*
