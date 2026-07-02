# Product Intelligence & Investment Decision Engine
## Complete Product Specification

**Version:** 1.0  
**Status:** Approved for implementation  
**Last updated:** 2026-07-01

---

## Table of Contents

1. [Founding Philosophy](#1-founding-philosophy)
2. [Product Overview](#2-product-overview)
3. [Stage Specifications](#3-stage-specifications)
   - [Stage 0 — Founder Profile](#stage-0--founder-profile)
   - [Stage 1 — Market Signal](#stage-1--market-signal)
   - [Stage 2 — Opportunity Map](#stage-2--opportunity-map)
   - [Stage 2.5 — Founder-Opportunity Fit Layer](#stage-25--founder-opportunity-fit-layer)
   - [Stage 3 — Adversarial Thesis Evaluation](#stage-3--adversarial-thesis-evaluation)
   - [Stage 4 — Investment Memo](#stage-4--investment-memo)
4. [Data Models](#4-data-models)
5. [Decision Rules](#5-decision-rules)
6. [Provider Matrix](#6-provider-matrix)
7. [AI vs. Deterministic Boundary](#7-ai-vs-deterministic-boundary)
8. [What Is Never Shown](#8-what-is-never-shown)
9. [UI States](#9-ui-states)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Founding Philosophy

Every design decision in this product flows from a single idea:

> **The platform's job is to tell a founder the truth about whether a specific opportunity gives them a realistic probability of building a profitable business — and to back every claim with traceable evidence.**

This makes the platform a **truth engine**, not a research tool. The distinction has architectural consequences throughout.

### What this product is not

- Not an Amazon research tool. Helium10, Jungle Scout, and Keepa already exist.
- Not a data dashboard. Dashboards present data. This product presents decisions.
- Not a score generator. A composite score that averages verified data with AI-guessed data is a lie about evidence quality.
- Not a market size estimator. AI-generated market size numbers are hallucinations with dollar signs. They do not appear in this product.

### What this product is

A system that takes a founder from "I want to manufacture this product" to a defensible investment decision, using objective market evidence where it exists, probabilistic estimation where it must, deterministic rules where judgment cannot be trusted, and AI synthesis where human-level pattern recognition is required.

### The unit of analysis

A **keyword** is not a business. A **market** is not a business. The unit of analysis is a **thesis**: a specific product, in a specific market segment, with a specific differentiation, for a specific customer, through a specific channel. Every report is a report on a thesis, not on a category.

### Two distinct lenses that must never be conflated

**Market intelligence** — what is objectively true about this market. This does not change based on who is asking.

**Founder-opportunity fit** — what this market opportunity means for this specific founder given their capital, experience, channels, and risk posture. This is relational, not absolute.

These are answered separately, displayed separately, and never averaged into a single personalized score.

---

## 2. Product Overview

The product has five stages that flow sequentially. The intelligence pipeline is linear. The user experience is not — founders may re-enter any stage, compare multiple theses in parallel, and update their profile at any time (which triggers re-evaluation of the fit layer and investment memo without re-running data collection).

```
Stage 0   →   Stage 1   →   Stage 2   →   Stage 2.5   →   Stage 3   →   Stage 4
Founder       Market        Opportunity    Founder-Opp     Adversarial    Investment
Profile       Signal        Map            Fit Layer       Evaluation     Memo
(one-time)    (objective)   (AI synthesis) (deterministic) (adversarial)  (full memo)
```

### Responsibility summary

| Stage | Core Responsibility | Who Does the Work |
|-------|--------------------|--------------------|
| 0 | Collect founder context | Founder (form) |
| 1 | Gather all market evidence | Data providers + deterministic parsing |
| 2 | Synthesize evidence into investable theses | AI (with evidence gate) |
| 2.5 | Annotate theses with founder-specific fit | Deterministic rules |
| 3 | Stress-test selected thesis adversarially | AI (genuinely adversarial architecture) + rule engine |
| 4 | Produce investment memo with dual verdict | AI narrative + deterministic verdict logic |

---

## 3. Stage Specifications

---

### Stage 0 — Founder Profile

**Responsibility:** Establish the founder's specific context before any market analysis begins. This context does not influence market intelligence. It influences fit annotation (Stage 2.5) and the founder-specific model in the investment memo (Stage 4).

**Trigger:** First use, or when founder chooses to update their profile.

**Inputs (founder-provided):**

| Field | Type | Options |
|-------|------|---------|
| `capital_available` | number | USD, liquid and committable — not total net worth |
| `capital_confidence` | enum | `committed` / `estimated` / `speculative` |
| `manufacturing_experience` | enum | `none` / `sourced_before` / `established_relationships` |
| `regulatory_experience` | enum | `none` / `familiar` / `certified` |
| `existing_channel_type` | enum | `none` / `social_audience` / `email_list` / `retail_relationships` / `wholesale` / `multiple` |
| `existing_channel_size` | number? | Estimated reach (optional) |
| `target_geography` | enum | `us_only` / `multi_region` / `international` |
| `time_horizon` | enum | `under_6mo` / `6_to_18mo` / `18_plus_mo` |
| `risk_posture` | enum | `capital_preservation` / `balanced` / `high_risk_tolerance` |
| `long_term_goal` | enum | `lifestyle_business` / `scale_to_exit` / `strategic_asset` |

**Outputs:**
A `FounderProfile` record, stored and versioned. Every field is labeled `FOUNDER-STATED` wherever it appears in downstream outputs.

**Rules:**
- Profile is required before a founder can enter Stage 4.
- Profile is optional for Stages 1–3 (founder may explore without personalizing).
- When profile is updated, Stage 2.5 annotations and Stage 4 founder-specific model recompute automatically. Stage 1 and Stage 2 do not re-run.
- The system displays a visible disclaimer on all founder-specific outputs: *"Founder inputs are self-reported and not verified by this platform. Calculations labeled FOUNDER-STATED depend on the accuracy of the information you provided."*

---

### Stage 1 — Market Signal

**Responsibility:** Gather everything that is objectively true about this market. No interpretation, no recommendation, no ranking. Pure evidence collection with full source labeling.

**Trigger:** Founder submits a keyword, product name, or category.

**Inputs:**
- Search query (keyword or category string)
- Founder profile is NOT an input here. Market facts do not change based on who is asking.

**Data collected:**

#### Demand Intelligence

| Signal | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| Monthly search volume | DataForSEO | `verified` | Exact monthly searches, not a range |
| Search volume trend | DataForSEO | `verified` | 24-month history required; 12-month minimum |
| 3/6/12-month volume change rates | Computed from DataForSEO | `verified` | Percentage change, period-over-period |
| Top buying-intent keywords | DataForSEO | `verified` | Filtered to commercial intent, with individual volumes |
| Geographic demand concentration | Google Trends | `verified` | US states ranked by relative interest index |
| Seasonal pattern | DataForSEO + Google Trends | `estimated` | Peak months, trough months, seasonal amplitude |
| Social demand signal | TikTok | `verified` | Hashtag volume and 90-day trajectory. Labeled separately from purchase intent. |

#### Market Structure (Amazon)

| Signal | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| Meaningful competitor count | Apify (Amazon scraper) | `verified` | Products with >50 reviews in relevant sub-category |
| Price distribution | Apify | `verified` | min / p25 / median / p75 / max across category |
| Market concentration | Computed | `estimated` | Top-3 share of estimated category unit volume. Labeled: *Amazon category only, not total market.* |
| Review count distribution | Apify | `verified` | Measures incumbency depth, not quality |
| Average rating across category | Apify | `verified` | Category-wide, not single-product |
| Estimated category units/month | Keepa (monthlySold sample) | `estimated` | Labeled: *sampled bestsellers only — not total market* |
| Amazon fee structure | Keepa | `verified` | Real referral % and FBA pick-and-pack fee for this category |

#### Customer Voice

| Signal | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| Aggregated complaint themes | Apify (reviews) | `verified` | Frequency-ranked; sourced from real review text |
| Complaint frequency (% of negative reviews) | Computed | `verified` | For each theme |
| Competitor-specific weakness patterns | AI synthesis of reviews | `synthesized` | What unhappy customers say about current solutions |
| Review sentiment trajectory | Computed | `estimated` | Is satisfaction improving or degrading? |
| Verbatim customer language | Apify (reviews) | `verified` | Representative quotes, uncleaned |

#### Risk Surface

| Signal | Source | Data Type | Notes |
|--------|--------|-----------|-------|
| FDA recalls / warnings | openFDA | `verified` | Last 24 months; classified by severity (Class I/II/III) |
| Category news events | GDELT / news APIs | `verified` | Major events last 24 months |
| Scientific support trajectory | PubMed | `verified` | Is the underlying mechanism gaining or losing research support? |
| Import tariff exposure | HTS code lookup | `verified` | Applicable tariff rate for likely product classification |

**Data Quality Assessment (deterministic — runs immediately after collection):**

Computed by rule, not AI. Each dimension gets a quality rating:

```
Dimension quality levels:
  strong    — multiple providers confirmed, >12 months history
  adequate  — single provider confirmed, sufficient sample
  thin      — data exists but below recommended sample size
  missing   — no usable data returned from any provider
```

**Pipeline gates (deterministic):**

| Condition | Gate Behavior |
|-----------|--------------|
| Fewer than 2 independent demand signals confirmed | Stage 2 BLOCKED — "Insufficient demand data to generate theses" |
| Fewer than 5 real competitor products found | Stage 2 BLOCKED — "Insufficient market data to generate theses" |
| Fewer than 12 months of demand history | Thesis generation runs with reduced confidence; labeled as such |
| Review base fewer than 50 reviews total | Customer voice synthesis does not run; labeled as absent |

If Stage 2 is blocked, the system shows exactly what is missing and what it means. Stage 2 is not attempted.

**Outputs — Market Intelligence Briefing:**

A structured document containing:
- All collected signals, each labeled with source / data type / freshness date / sample size
- Data Quality Assessment (overall grade: `sufficient` / `thin` / `insufficient`)
- A `missing_dimensions` list when providers return no data
- A channel scope declaration: *"All Amazon market structure data reflects Amazon US only. Total market including retail, DTC, and international is not represented."*
- No scores. No recommendations. No rankings.

---

### Stage 2 — Opportunity Map

**Responsibility:** Synthesize market evidence into specific, differentiated, investable investment theses. The system generates theses from evidence. The founder does not provide them.

**Trigger:** Successful Stage 1 completion with quality gate passed.

**Inputs:**
- Market Intelligence Briefing (Stage 1 output)
- Founder profile is NOT an input here. Theses are derived from market evidence, not from who might execute them.

**What the AI does:**

A single AI call reads the full market evidence and generates 2–4 investment theses. Each thesis is a specific, named claim — not a category. The AI is explicitly instructed:

- Do not generate theses that require evidence not present in the briefing
- Do not generate generic category theses ("premium magnesium supplement")
- Do not exceed 4 theses regardless of how rich the data is
- If only one defensible thesis is supported by the evidence, generate one and state why
- If no defensible thesis is supportable, return zero theses with explanation

**What makes a valid thesis:**

The differentiation must be:
1. **Observable** — a customer can identify it before purchase
2. **Verifiable** — a customer can confirm it after purchase
3. **Sourced** — it is derived from evidence in the market briefing, with citations

**Per-thesis output structure:**

Each thesis contains:

| Component | Description |
|-----------|-------------|
| `product_angle` | Specific product concept (not a category) |
| `target_customer` | Specific persona, not "health-conscious adults" |
| `differentiation` | Specific, observable, verifiable claim |
| `differentiation_source` | Where in the evidence this gap was identified |
| `customer_pain` | The specific problem in the customer's own language, with source count |
| `supporting_evidence` | Cited list: which data points support this thesis, and how |
| `quick_economics_check` | At observed price range and Amazon fees, is 50% gross margin theoretically achievable at any realistic COGS? (boolean + reasoning) |

If `quick_economics_check` is false, the thesis is retained but flagged: *"Economics may be structurally challenging at this price point — review unit economics carefully."*

**Outputs — Objective Opportunity Map:**

2–4 thesis cards with full evidence citations. Nothing is filtered. If the data supports only 1 thesis, 1 is shown. If the economics check fails on all theses, all are retained with flags.

---

### Stage 2.5 — Founder-Opportunity Fit Layer

**Responsibility:** Annotate the Opportunity Map with founder-specific fit analysis. No thesis is filtered. All are re-ordered by fit. Founder context enters the product here — nowhere earlier.

**Trigger:** Opportunity Map is produced.

**Inputs:**
- Opportunity Map (Stage 2 output)
- Founder Profile (Stage 0 output)

**What the system does (all deterministic — no AI):**

For each thesis, the rule engine evaluates:

**Capital Fit**
- Compute minimum viable launch threshold for this product type (inventory MOQ estimate × safety stock + launch marketing estimate + certification estimate)
- Compare against `founder.capital_available`
- Compute gap or surplus
- If gap: is it closeable? (co-investor path, phased launch, smaller initial SKU)

**Experience Fit**
- Does this thesis require regulatory navigation? Does founder have `regulatory_experience`?
- Does this thesis require manufacturing relationships? Does founder have `manufacturing_experience`?
- Does this thesis require DTC brand building? Does founder have `existing_channel`?
- For each gap: severity (`minor` / `significant` / `blocking`), is it closeable (learnable / hirable / partnable)?

**Channel Fit**
- What channel does this thesis primarily require to work?
- What channel does the founder have?
- Alignment score: `strong` / `partial` / `misaligned`
- If misaligned: what does the CAC differential imply for unit economics?

**Timeline Fit**
- Estimated months to first revenue for this product type
- Against founder's stated `time_horizon`
- Compatible or not, with explanation

**Thesis ordering:**
Theses are ranked 1–N by overall fit. Thesis with best founder-market match leads. All theses are shown to the founder regardless of fit rank.

**Founder advantages and gaps:**
Each thesis receives two explicit lists:
- Advantages: where the founder's profile gives a specific, named edge for this thesis
- Gaps: specific gaps, each labeled closeable or structural

**Outputs — Annotated Opportunity Map:**

Same theses as Stage 2 output, now ordered by fit rank and carrying fit annotations. All theses visible. No filtering.

**What the founder sees:**
All theses, re-ordered. For each: fit rank, advantages, gaps, capital status. They select one to evaluate further.

---

### Stage 3 — Adversarial Thesis Evaluation

**Responsibility:** Stress-test the selected thesis as aggressively as possible before the founder commits to a full investment memo. Surface kill switches. Produce the unknowns research agenda.

**Trigger:** Founder selects one thesis from the Opportunity Map.

**Inputs:**
- Single selected thesis
- Full market evidence base (Stage 1 output)
- Founder profile (Stage 0 output) — used only for kill switch capital check

**Architecture — three genuinely independent calls:**

The adversarial debate requires genuine independence between the bull and bear perspectives. This is achieved architecturally, not through prompt balancing.

**Call 1 — Bull Advocate**
- Receives: thesis + market evidence
- System role: *"You are an investment advocate. Build the strongest possible case for why this thesis will succeed as a business. Cite only evidence from the provided market data. Do not hedge. Do not acknowledge counterarguments. Find every reason this works."*
- Does NOT receive the bear case
- Temperature: moderate

**Call 2 — Bear Investor**
- Receives: thesis + market evidence
- System role: *"You are a skeptical investment committee member. Find every reason this thesis will fail. Be aggressive. Do not seek balance. Identify the kill shots — the 1–2 reasons that, if true, make everything else irrelevant. Cite evidence. Do not generate risks without data backing."*
- Does NOT receive the bull case
- Temperature: higher (forces tail risk exploration)
- Required output: at least one "kill shot" — a single risk capable of causing complete failure

**Call 3 — Synthesis**
- Receives: bull case output + bear case output + market evidence
- Role: organize the debate into final structure, identify genuine conflicts (where bull and bear actually disagree, not just emphasize differently), produce the Unknowns list
- Does NOT add new arguments — only organizes

**Kill Switch Engine (runs after Call 3 — deterministic):**

Kill switches are coded rules applied to real data. AI reasoning cannot override them. See Section 5 for complete rule definitions.

**Output structure — Adversarial Evaluation:**

```
KILL SWITCH STATUS
  [clear / triggered — shown before all other content]

THESIS UNDER EVALUATION
  Product angle / customer / differentiation / supporting evidence

BULL CASE
  Strongest arguments (specific, evidence-backed, cited)
  Best-case scenario description

BEAR CASE
  Kill shots (the 1–2 decisive failure modes)
  Significant risks (probability × impact)
  Worst-case scenario description

CONFLICTS
  Where bull and bear genuinely disagree (not just emphasis)
  Which side has stronger evidence on each conflict

UNKNOWNS — RESEARCH AGENDA
  [For each unknown:]
  Question: what is not known
  Stakes: what changes if answered differently
  Resolution: what the founder should do (specific, actionable)
  Verdict sensitivity: would this change the recommendation?

NEXT STEP
  Proceed to Investment Memo / Do not proceed (with explanation)
```

**What the founder sees:**
The complete evaluation. Both the bull and bear cases in full. The kill switch status prominently. The unknowns with a specific research agenda. The founder decides whether to proceed to Stage 4. A triggered kill switch does not block access to Stage 4 — it is shown prominently with explanation, and the founder may proceed for learning purposes. They are not blocked, but they are warned with specificity.

---

### Stage 4 — Investment Memo

**Responsibility:** Produce the definitive investment document for this specific thesis, for this specific founder. The output is a memo, not a dashboard.

**Trigger:** Founder proceeds from Stage 3.

**Inputs:**
- Selected thesis
- Full market evidence (Stage 1)
- Adversarial evaluation (Stage 3)
- Founder profile (Stage 0)
- Founder-provided inputs (collected at the start of Stage 4)

**Founder inputs collected at Stage 4 entry:**

| Field | Description | Required? |
|-------|-------------|-----------|
| `cogs_estimate` | Founder's best estimate of per-unit cost | Optional (market baseline still runs without it) |
| `cogs_confidence` | `rough_guess` / `supplier_quote` / `confirmed_po` | Required if COGS provided |
| `manufacturing_lead_time` | Weeks, if known | Optional |
| `additional_capital_sources` | Co-investor, credit line, etc. | Optional |
| `regulatory_work_completed` | Any certifications or clearances already in hand | Optional |
| `supplier_relationship` | Relevant existing relationships | Optional |

All founder Stage 4 inputs carry `FOUNDER-STATED` label throughout the memo.

**Unit Economics — two models run in parallel:**

**Model A: Market Baseline**
Uses only market-derived data. No founder inputs.
- Price: observed category median (verified, from Apify)
- Amazon fees: real fee schedule (verified, from Keepa)
- COGS low/base/high: category benchmark ranges (estimated, methodology shown)
- CAC: category average CPC × average conversion rate for this channel (estimated)
- Output: gross margin range, breakeven COGS, breakeven units, capital to breakeven

**Model B: Founder-Specific**
Same structure, but substitutes founder-stated inputs where provided.
- If founder provided COGS estimate: used as base; category benchmark used as cross-check
- If founder has existing channel: CAC adjusted for audience advantage
- If founder has manufacturing relationship: lead time and MOQ adjusted
- All substitutions labeled `FOUNDER-STATED` in the output table

**The breakeven COGS calculation (required in both models):**

Rather than estimating what margin will be, the memo answers: *"For this business to reach 50% gross margin at this price point with these Amazon fees, your COGS must be below $X.XX per unit."*

This is the number the founder validates with real manufacturer quotes. The platform tells the founder what must be true — not what it predicts to be true.

**Sensitivity analysis (deterministic):**

For every input that drives the verdict, a sensitivity table shows:
- Base assumption and output
- +15% on that assumption: what happens to gross margin? Does the verdict change?
- −15% on that assumption: same questions
- The one input that, if wrong, most changes the recommendation (prominently labeled)

**Memo structure:**

```
SECTION 1: THESIS STATEMENT
  One paragraph. Specific product, customer, differentiation, timing.
  Every factual claim is sourced. AI-generated narrative, evidence-backed.

SECTION 2: KILL SWITCH STATUS
  Displayed before any positive content.
  If switches clear: confirmed with evidence.
  If switches triggered: stated in full, evidence cited, resolution path or
    "requires external expert review" explicitly noted.
  Deterministic output — not AI narrative.

SECTION 3: MARKET REALITY
  3a. Demand
    Search volume (verified), trajectory (verified), seasonality (estimated)
    Each data point: source / type / freshness / sample size
  3b. Market Structure
    Competitor landscape (verified), price distribution (verified),
    concentration (estimated — labeled Amazon-category-scoped)
    Header note: "Amazon US market only. Total market not represented."
  3c. Customer Evidence
    Specific complaints (in customer language, sourced, with frequency count)
    Sentiment trajectory
    NOT a paraphrase. Actual customer language.
  3d. Differentiation Gap
    The specific gap this thesis addresses and where in the evidence it was found.
    Source count: how many review instances confirm this gap.

SECTION 4: UNIT ECONOMICS
  Two-column layout: Market Baseline | Founder-Specific
  Row structure:
    Price point (source labeled)
    Amazon referral fee % (verified)
    FBA pick & pack fee (verified)
    COGS: low / base / high (source labeled per column)
    Gross margin: at each COGS level
    BREAKEVEN COGS: the number the founder must verify with manufacturers
    Estimated CAC (source labeled)
    Breakeven units (at base COGS)
    Capital to breakeven
  Sensitivity table beneath both models.
  Founder-stated inputs flagged throughout.

SECTION 5: COMPETITIVE ANALYSIS
  Top 3 incumbents only.
  For each:
    Observed price and review count (verified)
    Specific weakness from review analysis (cited, with source count)
    Moat type assessment (AI reasoning from evidence)
    What it would take to win against them specifically (AI reasoning)

SECTION 6: DIFFERENTIATION STRESS-TEST
  The differentiation thesis stated as a specific claim.
  Three tests:
    Observable: can a customer identify this in 5 seconds? How?
    Verifiable: can a customer confirm this after purchase? How?
    Defensible: time-to-copy estimate. What specifically would a
      well-resourced competitor need to replicate this?
  Evidence cross-reference: does search data corroborate demand for this specific angle?

SECTION 7: EXECUTION REALITY CHECK
  (Only present if founder profile provided)
  Two columns: Founder Advantages | Founder Gaps
  For each gap: is it closeable? Time/resource estimate. Impact on recommendation if not closed.

SECTION 8: CAPITAL PLAN
  Line-item table:
    Minimum viable inventory (MOQ estimate)
    Manufacturing setup / tooling
    Regulatory / certifications required
    Launch marketing (category-benchmarked)
    Operating reserve (6-month recommendation)
    TOTAL minimum viable launch capital
  Against founder's stated capital.
  Gap or surplus.
  If gap: explicit statement of what proceeding undercapitalized implies.

SECTION 9: REGULATORY AND IP SURFACE CHECK
  What applies to this product category (disclaimer: surface check only)
  Patent flags: any potentially relevant USPTO filings found
  FDA classification and pathway if applicable
  Required certifications
  Explicit disclaimer on every item: "This flags potential issues.
    It does not constitute legal or regulatory clearance. Do not act on
    regulatory or IP questions without qualified counsel."

SECTION 10: DUAL VERDICT
  MARKET VERDICT
    Decision: BUILD NOW / VALIDATE FURTHER / AVOID
    Supporting evidence: specific, cited
    Conditions: what must remain true for this verdict to hold
    (If VALIDATE FURTHER) Upgrade path: exactly what would change this to BUILD NOW
    (If VALIDATE FURTHER) Downgrade triggers: what would change this to AVOID
    (If AVOID) The specific kill shots

  YOUR VERDICT (only present if founder profile provided)
    Decision: BUILD NOW / VALIDATE FURTHER / AVOID
    How it differs from market verdict and exactly why
    Which founder advantage or gap is driving the difference
    Conditions specific to your profile

  If verdicts differ: a dedicated "Why these differ" paragraph
    with explicit attribution to the specific profile factor

  FRESHNESS NOTICE
    "This analysis reflects market conditions as of [date].
     Competitive landscapes change. Re-evaluate before committing capital
     if more than 60 days have passed."

VALIDATION AGENDA
  (Shown when either verdict is VALIDATE FURTHER)
  For each open question from Stage 3 Unknowns:
    Specific task (not "do more research")
    What the answer changes about the verdict
    Estimated time and effort to resolve
    Priority rank
```

---

## 4. Data Models

These are the canonical data structures. Field names use snake_case. All string enums are exhaustive.

### `FounderProfile`

```typescript
interface FounderProfile {
  id: string
  created_at: string
  updated_at: string
  capital_available: number                    // USD
  capital_confidence: 'committed' | 'estimated' | 'speculative'
  manufacturing_experience: 'none' | 'sourced_before' | 'established_relationships'
  regulatory_experience: 'none' | 'familiar' | 'certified'
  existing_channel: {
    type: 'none' | 'social_audience' | 'email_list' | 'retail_relationships' | 'wholesale' | 'multiple'
    size?: number                              // estimated audience reach
    engagement_rate?: 'low' | 'medium' | 'high'
  }
  target_geography: 'us_only' | 'multi_region' | 'international'
  time_horizon: 'under_6mo' | '6_to_18mo' | '18_plus_mo'
  risk_posture: 'capital_preservation' | 'balanced' | 'high_risk_tolerance'
  long_term_goal: 'lifestyle_business' | 'scale_to_exit' | 'strategic_asset'
}
```

### `EvidencePoint`

Every data point in the system carries provenance.

```typescript
interface EvidencePoint<T> {
  value: T
  source: string                               // provider name (DataForSEO, Keepa, Apify, etc.)
  data_type: 'verified' | 'estimated' | 'synthesized'
  methodology?: string                         // required when data_type is 'estimated'
  freshness_date: string                       // ISO date
  sample_size?: number                         // when applicable
  scope_note?: string                          // e.g., "Amazon US only, not total market"
}
```

### `DataQualityAssessment`

```typescript
interface DataQualityAssessment {
  overall_grade: 'sufficient' | 'thin' | 'insufficient'
  demand_signals_confirmed: number             // independent sources with real data
  competitor_products_found: number
  review_base_size: number
  demand_history_months: number
  pipeline_blocked: boolean
  blocked_stages: ('thesis_generation' | 'full_debate')[]
  missing_dimensions: {
    dimension: string
    provider_attempted: string
    failure_reason: string
  }[]
  quality_per_dimension: {
    demand: 'strong' | 'adequate' | 'thin' | 'missing'
    market_structure: 'strong' | 'adequate' | 'thin' | 'missing'
    customer_voice: 'strong' | 'adequate' | 'thin' | 'missing'
    risk_surface: 'strong' | 'adequate' | 'thin' | 'missing'
  }
}
```

### `MarketSignal`

```typescript
interface MarketSignal {
  query: string
  generated_at: string
  channel_scope: string                        // always explicit about what is not covered
  quality: DataQualityAssessment
  demand: {
    monthly_search_volume: EvidencePoint<number>
    volume_trend_24mo: EvidencePoint<{ month: string; volume: number }[]>
    change_rate_3mo: EvidencePoint<number>     // percentage
    change_rate_12mo: EvidencePoint<number>
    top_buying_intent_keywords: EvidencePoint<{ keyword: string; volume: number }[]>
    geographic_concentration: EvidencePoint<{ region: string; index: number }[]>
    seasonal_pattern: EvidencePoint<{
      peak_months: string[]
      trough_months: string[]
      amplitude: 'low' | 'medium' | 'high'   // difference between peak and trough
    }>
    social_signal: EvidencePoint<{
      platform: string
      hashtag: string
      volume: number
      trajectory: 'rising' | 'stable' | 'declining'
    }> | null
  }
  market_structure: {
    meaningful_competitor_count: EvidencePoint<number>
    price_distribution: EvidencePoint<{
      min: number; p25: number; median: number; p75: number; max: number
    }>
    market_concentration_top3: EvidencePoint<number>  // % of estimated volume
    estimated_category_units_monthly: EvidencePoint<number>
    amazon_fees: EvidencePoint<{
      referral_pct: number
      fba_pick_pack_fee: number
    }>
  }
  customer_voice: {
    top_complaints: EvidencePoint<{
      theme: string
      frequency_pct: number                   // % of negative reviews
      example_quotes: string[]
    }[]>
    sentiment_trajectory: EvidencePoint<'improving' | 'stable' | 'degrading'>
  } | null                                    // null when review base insufficient
  risk_surface: {
    fda_recalls: EvidencePoint<{
      count: number
      most_recent: string
      severity: 'Class_I' | 'Class_II' | 'Class_III' | null
    }> | null
    tariff_exposure: EvidencePoint<number>    // HTS tariff rate
    news_events: EvidencePoint<string[]>
  }
}
```

### `InvestmentThesis`

```typescript
interface InvestmentThesis {
  thesis_id: string
  product_angle: string                        // specific product concept, not a category
  target_customer: string                      // specific persona
  differentiation: string                      // specific, observable, verifiable claim
  differentiation_source: string              // where in evidence this gap was found
  customer_pain: {
    description: string                        // in customer's own language
    example_quotes: string[]                   // verbatim, uncleaned
    frequency_in_negative_reviews: number      // percentage
    source: string
  }
  supporting_evidence: {
    evidence_type: string
    evidence_value: string
    source: string
    strength: 'strong' | 'moderate' | 'weak'
  }[]
  quick_economics_check: {
    observed_price_range: { min: number; max: number }
    amazon_fees_pct: number
    is_50pct_margin_theoretically_achievable: boolean
    reasoning: string
  }
}
```

### `FounderFitAnnotation`

```typescript
interface FounderFitAnnotation {
  thesis_id: string
  fit_rank: number                             // 1 = best fit among generated theses
  capital_fit: {
    minimum_viable_threshold: number           // USD
    founder_capital: number
    gap: number                                // positive = shortfall
    is_closeable: boolean
    closure_path?: string
  }
  experience_gaps: {
    dimension: string
    severity: 'minor' | 'significant' | 'blocking'
    is_closeable: boolean
    closure_path?: string
  }[]
  channel_fit: {
    thesis_primary_channel: string
    founder_channel: string
    alignment: 'strong' | 'partial' | 'misaligned'
    cac_implication?: string
  }
  timeline_fit: {
    estimated_months_to_first_revenue: number
    founder_horizon_months: number
    is_compatible: boolean
  }
  advantages: string[]                         // specific, named advantages for this thesis
  gaps: string[]                               // specific gaps, each closeable or not
}
```

### `KillSwitch`

```typescript
interface KillSwitch {
  id: string
  name: string
  category: 'ip' | 'regulatory' | 'economics' | 'market_structure' | 'capital'
  severity: 'avoid' | 'validate_further'       // 'avoid' overrides all positive signals
  triggered: boolean
  evidence: string                             // what triggered it, with data citation
  resolution_path?: string                     // what would lift this switch
  requires_external_expert: boolean            // e.g., patent attorney, FDA consultant
  is_liftable_by_platform: boolean            // false for IP and regulatory
}
```

### `AdversarialDebate`

```typescript
interface AdversarialDebate {
  thesis_id: string
  generated_at: string
  bull_case: {
    strongest_arguments: string[]              // specific, evidence-backed
    evidence_citations: string[]
    best_case_scenario: string
  }
  bear_case: {
    kill_shots: string[]                       // the 1–2 decisive failure modes
    significant_risks: {
      risk: string
      probability: 'low' | 'medium' | 'high'
      impact: 'moderate' | 'severe' | 'fatal'
      evidence: string
    }[]
    worst_case_scenario: string
  }
  conflicts: {
    dimension: string
    bull_position: string
    bear_position: string
    resolution: 'bull_stronger' | 'bear_stronger' | 'cannot_resolve_without_data'
  }[]
  unknowns: {
    question: string
    stakes: string                             // what changes if answered differently
    resolution_path: string                    // specific action for founder
    would_change_verdict: boolean
    priority: number                           // 1 = most important to resolve first
  }[]
  kill_switches: KillSwitch[]
  all_switches_clear: boolean
}
```

### `UnitEconomicsModel`

```typescript
interface UnitEconomicsModel {
  model_type: 'market_baseline' | 'founder_specific'
  inputs: {
    price_point: EvidencePoint<number>
    amazon_referral_pct: EvidencePoint<number>
    amazon_fba_fee: EvidencePoint<number>
    cogs_low: EvidencePoint<number>
    cogs_base: EvidencePoint<number>
    cogs_high: EvidencePoint<number>
    cac_estimate: EvidencePoint<number>
  }
  outputs: {
    gross_margin_at_cogs_low: number           // percentage
    gross_margin_at_cogs_base: number
    gross_margin_at_cogs_high: number
    breakeven_cogs: number                     // COGS at which GM = 50%
    breakeven_units_at_base_cogs: number
    capital_to_breakeven: number               // USD
  }
  sensitivity: {
    input_name: string
    base_value: number
    at_plus_15pct: { gross_margin: number; verdict_changes: boolean }
    at_minus_15pct: { gross_margin: number; verdict_changes: boolean }
  }[]
  founder_stated_inputs: string[]             // which inputs came from founder, not market
}
```

### `Verdict`

```typescript
interface Verdict {
  decision: 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'AVOID'
  verdict_type: 'market' | 'founder_specific'
  rationale: string[]                          // specific evidence-backed reasons
  conditions: string[]                         // what must remain true for this to hold
  upgrade_path?: {                             // present when VALIDATE_FURTHER
    condition: string
    what_changes: string
  }[]
  downgrade_triggers?: {                       // present when BUILD_NOW or VALIDATE_FURTHER
    trigger: string
    consequence: string
  }[]
  validation_agenda?: {                        // present when VALIDATE_FURTHER
    task: string
    resolves: string
    effort: string
    priority: number
  }[]
  active_kill_switches?: KillSwitch[]          // present when AVOID
}
```

### `InvestmentMemo`

```typescript
interface InvestmentMemo {
  memo_id: string
  thesis: InvestmentThesis
  generated_at: string
  query: string
  founder_profile_id?: string
  sections: {
    kill_switch_status: {
      all_clear: boolean
      switches: KillSwitch[]
    }
    market_reality: {
      demand_summary: string
      market_structure_summary: string
      customer_evidence: string
      differentiation_gap: string
    }
    unit_economics: {
      market_baseline: UnitEconomicsModel
      founder_specific?: UnitEconomicsModel   // absent if no founder profile
    }
    competitive_analysis: {
      top_competitors: {
        name: string
        price: EvidencePoint<string>
        review_count: EvidencePoint<number>
        specific_weakness: string
        weakness_source_count: number
        moat_type: string
        win_condition: string
      }[]
    }
    differentiation_stress_test: {
      observable: { passes: boolean; explanation: string }
      verifiable: { passes: boolean; explanation: string }
      defensible: { time_to_copy_estimate: string; what_protects_it: string }
    }
    execution_reality_check?: {               // absent if no founder profile
      advantages: string[]
      gaps: { gap: string; is_closeable: boolean; impact_if_not_closed: string }[]
    }
    capital_plan: {
      line_items: { label: string; amount: number; source: string }[]
      total_minimum: number
      founder_capital?: number
      gap_or_surplus?: number
      undercapitalization_warning?: string
    }
    regulatory_ip_summary: {
      items: {
        type: 'patent' | 'fda' | 'certification' | 'tariff'
        description: string
        severity: 'monitor' | 'review_required' | 'blocking'
        disclaimer: string
      }[]
      expert_review_required: boolean
    }
  }
  market_verdict: Verdict
  founder_verdict?: Verdict                   // absent if no founder profile
  verdict_divergence_explanation?: string     // present when verdicts differ
  freshness_notice: string
}
```

---

## 5. Decision Rules

All rules in this section are **deterministic code**. AI reasoning cannot override them. They do not soften based on positive signals elsewhere.

### Kill Switches — AVOID Triggers

Any single triggered AVOID switch makes the market verdict AVOID, regardless of all other signals.

| Switch | Trigger Condition | Resolution |
|--------|------------------|------------|
| `PATENT_BLOCKING` | USPTO search returns filing with claims that appear to cover this product's mechanism, holder is an active company, filing is granted (not pending) | Requires freedom-to-operate opinion from patent attorney. Not liftable by platform. |
| `FDA_CLEARANCE_REQUIRED` | Product falls in a category requiring 510(k) clearance or GRAS designation AND neither is confirmed | Founder must obtain clearance. Estimate typical pathway: 12–36 months, $50K–$500K. |
| `ECONOMICS_STRUCTURALLY_BROKEN` | Gross margin ceiling < 35% under **optimistic** COGS assumptions at observed price floor after Amazon fees | No founder advantage recovers this. Math cannot work. |
| `COMMODITY_PRICE_COMPRESSION` | Category price history shows >30% average price decline over 24 months | Signal of commoditization spiral; new entrant cannot recover margin. |

### VALIDATE FURTHER Overrides — Prevent BUILD NOW

Any single triggered override makes BUILD NOW impossible, regardless of all other positive signals.

| Override | Trigger Condition |
|----------|------------------|
| `INSUFFICIENT_DEMAND_SIGNAL` | Fewer than 2 independent sources confirm meaningful demand above threshold |
| `DEMAND_TOO_EARLY` | Fewer than 12 months of consistent demand signal history |
| `UNDERCAPITALIZED` | Founder capital < minimum viable launch threshold AND no closeable path identified |
| `DATA_QUALITY_BELOW_THRESHOLD` | Data Quality Assessment returns `insufficient` on any material dimension |
| `COGS_UNVALIDATED` | Founder has not provided COGS estimate AND category benchmark produces gross margin range spanning both above and below 50% (too uncertain to call) |

### BUILD NOW — All Must Be True

BUILD NOW requires every condition to be met. One failure degrades the verdict.

| Condition | Evidence Required |
|-----------|------------------|
| Verified demand | ≥2 independent sources, each above category threshold, both showing flat or positive trajectory |
| Viable economics | Gross margin ≥50% at BASE case COGS, with BASE case assumption shown |
| Market entry viable | HHI below consolidated threshold OR specific gap evidenced from customer complaints with source count |
| No kill switches | All AVOID and VALIDATE_FURTHER overrides clear |
| Differentiation passes | Observable + verifiable + defensible for ≥12 months — all three tests pass |
| Capital adequate | Founder capital ≥ minimum viable threshold OR specific closeable path identified |
| Regulatory clear | No blocking requirements without a confirmed path to resolution |
| Data quality | `sufficient` or `thin` with noted limitations (not `insufficient`) |

### Verdict Determination Logic

```
if (any AVOID kill switch triggered):
    market_verdict = AVOID
    return

if (any VALIDATE_FURTHER override triggered):
    market_verdict = VALIDATE_FURTHER
    return

if (all BUILD_NOW conditions met):
    market_verdict = BUILD_NOW
    return

// Default when some conditions met but not all
market_verdict = VALIDATE_FURTHER
```

Founder verdict applies the same logic, then adjusts:
- If founder advantage resolves a VALIDATE_FURTHER override: may upgrade to BUILD_NOW (with explicit condition)
- If founder gap creates a new override: may downgrade BUILD_NOW to VALIDATE_FURTHER

The adjustment is stated explicitly in `verdict_divergence_explanation`.

---

## 6. Provider Matrix

| Provider | What It Provides | Data Type | Used In |
|----------|-----------------|-----------|---------|
| DataForSEO | Monthly search volume, keyword trends, CPC | `verified` | Stage 1 demand |
| Google Trends | Relative interest index, geographic breakdown | `verified` | Stage 1 demand trajectory |
| Keepa | BSR, monthlySold, pricing, Amazon fees, rating/reviews | `verified` / `estimated` | Stage 1 market structure |
| Apify (Amazon scraper) | Competitor listings, prices, review text, review counts | `verified` | Stage 1 market structure + customer voice |
| TikTok (hashtag API) | Hashtag volume and trajectory | `verified` | Stage 1 social signal |
| openFDA | Recalls, warnings, enforcement | `verified` | Stage 1 risk surface |
| PubMed | Research publication volume and trajectory | `verified` | Stage 1 risk surface |
| GDELT / news APIs | Category news events | `verified` | Stage 1 risk surface |

### What is not currently available (known gaps)

| Missing Signal | Impact | Mitigation |
|----------------|--------|------------|
| Total market size (Nielsen/SPINS/Euromonitor) | Cannot show true TAM | Never show AI-estimated TAM. Show Amazon-scoped revenue with explicit scope note. |
| Manufacturer quotes / real COGS | Cannot confirm economics | Show breakeven COGS; require founder to validate with real quotes |
| Retail / DTC competitive pricing | Amazon-centric analysis | Explicit channel scope declaration on all outputs |
| Import/manufacturing data (Panjiva/ImportGenius) | Supply chain concentration unknown | Flag as missing; note as future provider |
| USPTO patent search | Incomplete IP picture | Surface what is found; require legal review; disclaim not a clearance |
| Meta Ad Library (competitor spend) | CAC estimation is rougher | Note as estimated; show sensitivity |
| Historical launch outcome data | No calibration for predictions | Never show calibrated confidence scores |

---

## 7. AI vs. Deterministic Boundary

This boundary is the most important architectural constraint in the system. Violations create false confidence.

### AI Reasoning Is Used For

- Investment thesis synthesis from market evidence (Stage 2)
- Differentiation gap identification from customer complaint aggregation (Stage 2)
- Bull case generation — advocate frame, evidence-backed (Stage 3, Call 1)
- Bear case generation — adversarial frame, evidence-backed (Stage 3, Call 2)
- Debate synthesis and conflict identification (Stage 3, Call 3)
- Unknowns identification and research agenda formulation (Stage 3)
- Competitor moat type assessment from available evidence (Stage 4)
- Narrative memo sections — all sourced (Stage 4)
- Regulatory surface identification by category pattern (Stage 4 — flagging only)

### Deterministic Logic Is Used For

- Data quality assessment and pipeline gates (Stage 1)
- Kill switch evaluation — every single one (Stage 3, after AI calls)
- Verdict determination — follows rule logic, not AI assessment (Stage 4)
- Founder-opportunity fit annotation (Stage 2.5 — entirely rule-based)
- Unit economics computation — arithmetic, not reasoning (Stage 4)
- Sensitivity analysis — arithmetic (Stage 4)
- `EvidencePoint.data_type` assignment — rule-based on source type, not AI judgment
- Minimum viable launch threshold calculation (Stage 2.5)

### The Specific Line

The AI answers: *"What does this evidence mean?"*
Deterministic rules answer: *"What is allowed to be recommended given what was found?"*

The AI cannot override a kill switch. The AI cannot declare BUILD NOW. The AI cannot assign a confidence score. The AI cannot generate a market size number. These outputs are either produced by rules or not produced at all.

---

## 8. What Is Never Shown

These items are excluded from the product regardless of data availability. Each has a specific reason.

| Item | Why It Is Never Shown |
|------|-----------------------|
| AI-generated market size (e.g., "$2B–$5B market") | LLMs have no access to real market data. This is a hallucination with a dollar sign. False precision causes founders to oversize opportunities. |
| Composite scores that blend verified and synthesized data | Averaging a verified demand signal with an AI-guessed virality score hides which inputs are real. A single number conceals the quality of its components. |
| Calibrated confidence percentages ("72% probability of success") | Calibration requires historical outcome data we do not have. An uncalibrated confidence number is false precision worse than admitted uncertainty. |
| "Market revenue" derived from bestseller samples | Revenue of the top 10 Amazon products is not market revenue. If it must appear, it is labeled: "Estimated revenue from sampled Amazon bestsellers, n=[N], methodology shown." |
| Subscription potential score from keywords | Whether customers will subscribe requires cohort data. A score derived from a product name and category is a guess. |
| Virality score from hashtag volume | Trending content about a problem is not evidence the product will be purchased or shared. |
| Review count as a quality or trust signal | Review count measures time-on-market and review solicitation aggressiveness, not product quality. |
| BSR as a standalone demand score | BSR is a relative rank that means nothing in isolation. BSR 500 in Kitchen & Dining is not comparable to BSR 500 in Vitamins. If BSR data appears, it is shown as raw data with its category context, not converted to a demand score. |
| A single verdict that collapses market and founder verdicts | These are different questions. Collapsing them hides which one is driving the output. |
| Any metric labeled "verified" that was not verified from a primary source | The `data_type` field exists for this reason. Every label must be accurate. |

---

## 9. UI States

### Stage 0 — Founder Profile

| State | What User Sees |
|-------|---------------|
| `empty` | Clean form with field explanations and why each matters |
| `partial` | Form with progress indicator; can save and return |
| `complete` | Summary card showing profile; edit link always visible |
| `outdated` | Warning when profile is >90 days old; invite to update |

### Stage 1 — Market Signal

| State | What User Sees |
|-------|---------------|
| `loading` | Provider-by-provider progress (which are running, which returned) |
| `quality_gate_sufficient` | Market Intelligence Briefing — full display |
| `quality_gate_thin` | Briefing with per-dimension quality flags; reduced-confidence notice |
| `quality_gate_insufficient` | Stop screen: what is missing, what it means, cannot proceed |
| `provider_partial_failure` | Briefing with missing dimensions explicitly labeled; no inference substituted |

### Stage 2 — Opportunity Map

| State | What User Sees |
|-------|---------------|
| `generating` | "Synthesizing investment theses from [N] data points..." |
| `map_populated` | 2–4 thesis cards, ordered by fit if profile present |
| `single_thesis` | One thesis card with note explaining why only one was supportable |
| `no_thesis` | Clear explanation of why no defensible thesis was found |
| `economics_flag` | Thesis card with visible flag on any thesis failing economics check |

### Stage 3 — Adversarial Evaluation

| State | What User Sees |
|-------|---------------|
| `generating_bull` | "Building the case for..." |
| `generating_bear` | "Stress-testing..." |
| `generating_synthesis` | "Identifying conflicts..." |
| `kill_switch_clear` | Green indicator: "No blocking issues found" |
| `kill_switch_triggered_avoid` | Red panel at top: specific switch, evidence, resolution path |
| `kill_switch_triggered_validate` | Amber panel: specific switch, evidence, what would lift it |
| `debate_complete` | Full bull / bear / conflicts / unknowns / kill switches — all visible |
| `proceed_to_memo` | CTA with explicit note if kill switch is active |

### Stage 4 — Investment Memo

| State | What User Sees |
|-------|---------------|
| `collecting_founder_inputs` | Form for COGS estimate and optional founder inputs |
| `computing` | "Computing unit economics..." |
| `memo_complete` | Full investment memo in sectioned layout |
| `market_verdict_only` | When no founder profile: market verdict only, with invite to add profile |
| `dual_verdict` | Market and founder verdicts side by side with divergence explanation |
| `founder_stated_flags` | Yellow labels on every input derived from founder-provided data |
| `sensitivity_expanded` | Sensitivity tables togglable; collapsed by default to reduce cognitive load |
| `freshness_warning` | Amber notice when memo is >60 days old |

---

## 10. Implementation Roadmap

Implementation is sequenced to deliver a working, honest product at each milestone — not a feature-complete product at the end. Each milestone produces something a founder can actually use.

### Milestone 1 — Data Foundation
**Deliverable:** A founder can search a keyword and receive an honest Market Intelligence Briefing.

- [ ] Founder Profile form and data model
- [ ] Stage 1 provider integrations: DataForSEO, Google Trends, Keepa, Apify
- [ ] Data quality assessment (deterministic)
- [ ] Pipeline gate logic
- [ ] EvidencePoint labeling system throughout
- [ ] Market Intelligence Briefing display (read-only, no scoring)
- [ ] Channel scope declaration on all market structure outputs
- [ ] openFDA recall integration
- [ ] No thesis generation yet. The briefing is the product at this milestone.

**Exit criteria:** A founder can search "magnesium glycinate" and receive a fully sourced, labeled market briefing with no AI-invented numbers.

---

### Milestone 2 — Opportunity Map
**Deliverable:** A founder can go from briefing to 2–4 investment theses, each with fit annotations.

- [ ] Stage 2 thesis generation (AI synthesis with evidence gate)
- [ ] Minimum evidence threshold before thesis generation is permitted
- [ ] Stage 2.5 fit annotation (deterministic rule engine)
- [ ] Capital threshold calculation per product type
- [ ] Thesis card display with evidence citations
- [ ] Founder-opportunity fit overlay on thesis cards
- [ ] Thesis ordering by fit rank
- [ ] Quick economics check per thesis

**Exit criteria:** A founder with a complete profile can see 2–4 specific, evidence-backed theses, ordered by fit, with advantages and gaps explicitly named.

---

### Milestone 3 — Adversarial Evaluation
**Deliverable:** A founder can stress-test a selected thesis before committing.

- [ ] Three-call adversarial architecture (independent system roles, no shared context between Call 1 and Call 2)
- [ ] Kill switch rule engine with all defined rules
- [ ] Kill switch display (prominent, before debate content)
- [ ] Bull / bear / conflicts / unknowns display
- [ ] Unknowns formatted as a research agenda (task / stakes / resolution / priority)
- [ ] Proceed-to-memo CTA with kill switch warning if active

**Exit criteria:** A founder can select a thesis, receive a genuine adversarial evaluation, see all active kill switches with resolution paths, and make an informed decision about whether to proceed.

---

### Milestone 4 — Investment Memo
**Deliverable:** The complete product. A founder can receive a full investment memo with dual verdict.

- [ ] Stage 4 founder input collection
- [ ] Unit economics: market baseline model (deterministic arithmetic)
- [ ] Unit economics: founder-specific model (deterministic arithmetic with founder inputs)
- [ ] Breakeven COGS calculation (the core output of the economics section)
- [ ] Sensitivity analysis tables
- [ ] FOUNDER-STATED input flagging throughout memo
- [ ] All memo sections generated (AI narrative, sourced)
- [ ] Verdict determination (deterministic rule logic — not AI assessment)
- [ ] Dual verdict display with divergence explanation
- [ ] Validation agenda when verdict is VALIDATE_FURTHER
- [ ] Regulatory/IP surface section with required disclaimer
- [ ] Capital plan line-item table
- [ ] Freshness notice on all memos
- [ ] Memo persistence and retrieval

**Exit criteria:** A founder can receive a complete investment memo that they could hand to an accountant, co-founder, or investor and say "this is why I am or am not building this" — with every claim sourced and every assumption labeled.

---

### Post-Launch Priorities (not in initial scope)

Listed in priority order for the first iteration post-launch:

1. **Memo comparison** — compare two theses side by side within the same market
2. **Thesis refresh** — re-run adversarial evaluation on a saved thesis when market data has changed
3. **Panjiva/ImportGenius integration** — manufacturing concentration signal
4. **Meta Ad Library integration** — competitive ad spend signal for CAC estimation
5. **Founder outcome tracking** — if founders consent, track what they built and whether it succeeded; this is the path to eventual calibration of recommendations
6. **Multi-channel demand expansion** — DTC and retail competitive data beyond Amazon
7. **Patent search improvement** — deeper USPTO integration with better relevance filtering

---

*This document is the authoritative source of truth for product architecture decisions. Implementation details (API contracts, database schema, component design) are derived from this specification but do not modify it. Changes to this specification require explicit review.*
