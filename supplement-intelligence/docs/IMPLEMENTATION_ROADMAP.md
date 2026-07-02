# Implementation Roadmap
## Product Intelligence & Investment Decision Engine

**Version:** 1.0  
**Date:** 2026-07-02  
**Based on:** PRODUCT_SPEC.md v1.0 + ARCHITECTURE_REVIEW.md + METRIC_VALIDATION_TABLE.md  
**Purpose:** Engineering execution plan. Converts the validated specification into sequenced, testable implementation steps.

---

## Current State Assessment

The existing codebase implements a **single-shot analysis pipeline**:

```
User submits keyword
→ /api/generate runs all providers in parallel
→ Claude synthesizes a structured memo in one AI call
→ Memo stored in analyses.memo_data JSONB
→ MemoDisplay.tsx renders the result
```

This works and is in production. It is not the spec's architecture. The spec requires a four-stage pipeline with deterministic gates, structured EvidencePoints, kill switches, a founder profile layer, and a three-call adversarial architecture.

### Reusable without modification

| Component | Location | Spec mapping |
|-----------|----------|--------------|
| Keepa provider | `lib/signal-engine/providers/keepa.ts` | Stage 1 market structure + revenue data |
| Apify competition provider | `lib/signal-engine/providers/competition.ts` | Stage 1 competitor count + price distribution |
| Google Trends provider | `lib/signal-engine/providers/google-trends.ts` | Stage 1 demand trend + geographic data |
| TikTok provider | `lib/signal-engine/providers/tiktok.ts` | Stage 1 social signal |
| DataForSEO provider | `lib/keyword-engine/dataforseo.ts` | Stage 1 search volume + keyword intelligence |
| openFDA provider | `lib/news-engine/providers/openfda.ts` | Stage 1 FDA recalls |
| PubMed provider | `lib/news-engine/providers/pubmed.ts` | Stage 1 research trajectory |
| GDELT provider | `lib/news-engine/providers/gdelt.ts` | Stage 1 category news |
| Review collector | `lib/review-collector/` | Stage 1 customer voice (raw text) |
| Consumer intelligence | `lib/consumer-intelligence/` | Stage 1 complaint theme extraction |
| Provider cache | `lib/provider-cache/index.ts` + migration 010 | Caching layer (all stages) |
| Auth + RLS | Supabase auth + migrations 001-014 | All stages |

### Requires modification (extend, do not rewrite)

| Component | Location | Required change |
|-----------|----------|-----------------|
| Keepa provider | `lib/signal-engine/providers/keepa.ts` | Add 24-month price history extraction for price compression metric (#63) |
| DataForSEO provider | `lib/keyword-engine/dataforseo.ts` | Extend from 12-month to 24-month history; expose raw monthly array |
| Signal engine output | `lib/signal-engine/engine.ts` | Add adapter to convert AggregatedSignals → EvidencePoint[] format |
| Thesis engine | `lib/thesis-engine/` | Replace single-call with evidence-gated Stage 2 synthesis; retain caching |
| MemoDisplay | `components/MemoDisplay.tsx` | Extensive rewrite for new sectioned investment memo layout |
| analyses table | migration 001 | Add columns for structured stage outputs; or create parallel tables |

### Missing entirely (must build new)

| Component | Spec stage | Priority |
|-----------|------------|----------|
| `founder_profiles` table + form UI | Stage 0 | High |
| EvidencePoint adapter layer | All stages | Critical |
| Data quality gate | Stage 1 | Critical |
| `market_signals` table | Stage 1 | Critical |
| `investment_theses` table | Stage 2 | High |
| Evidence gate (minimum thresholds) | Stage 2 | High |
| `founder_fit_annotations` table | Stage 2.5 | High |
| Fit layer rule engine (capital, experience, channel, timeline) | Stage 2.5 | High |
| Minimum viable launch threshold table | Stage 2.5 | High |
| `adversarial_debates` table | Stage 3 | High |
| Three-call adversarial architecture | Stage 3 | High |
| Kill switch engine (4 switches) | Stage 3 | Critical |
| `investment_memos` table | Stage 4 | High |
| Unit economics engine (deterministic arithmetic) | Stage 4 | High |
| Breakeven COGS calculation | Stage 4 | High |
| Sensitivity analysis | Stage 4 | High |
| Revenue envelope framework | Stage 4 | Medium |
| Capital plan calculator | Stage 4 | High |
| Verdict determination logic (deterministic) | Stage 4 | Critical |
| Win condition generator (AI per competitor) | Stage 4 | Medium |
| New UI pages (Market Briefing, Opportunity Map, Debate, Memo) | All stages | High |

### Implementation strategy

Build the new spec alongside the existing system. The existing `/analyze` page and `/api/generate` route continue working throughout development. New system lives under `/app/research` routes. After Milestone 4, old system is deprecated at user discretion.

This avoids breaking production while building incrementally testable milestones.

---

## Component Catalog

---

### C1. Database Schema — New Tables

**Status:** Missing  
**Purpose:** Persistent storage for all four pipeline stages with proper typing. The current `analyses` table stores everything as unstructured JSONB under `memo_data`. The new system requires typed, queryable tables per stage.

**Dependencies:**  
- Supabase (existing infrastructure)  
- Migrations 001-014 already applied  
- All stage components depend on these tables

**Implementation plan:**

Create migration `015_product_pipeline_schema.sql`:

```sql
-- Stage 0: Founder profiles
create table public.founder_profiles (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  capital_available       numeric not null,
  capital_confidence      text not null check (capital_confidence in ('committed','estimated','speculative')),
  manufacturing_experience text not null check (manufacturing_experience in ('none','sourced_before','established_relationships')),
  regulatory_experience   text not null check (regulatory_experience in ('none','familiar','certified')),
  channel_type            text not null check (channel_type in ('none','social_audience','email_list','retail_relationships','wholesale','multiple')),
  channel_size            numeric,
  target_geography        text not null check (target_geography in ('us_only','multi_region','international')),
  time_horizon            text not null check (time_horizon in ('under_6mo','6_to_18mo','18_plus_mo')),
  risk_posture            text not null check (risk_posture in ('capital_preservation','balanced','high_risk_tolerance')),
  long_term_goal          text not null check (long_term_goal in ('lifestyle_business','scale_to_exit','strategic_asset'))
);
alter table public.founder_profiles enable row level security;
create policy "owner all" on public.founder_profiles for all using (auth.uid() = user_id);
create index on public.founder_profiles (user_id);

-- Stage 1: Market signals
create table public.market_signals (
  id                      uuid primary key default uuid_generate_v4(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  query                   text not null,
  created_at              timestamptz not null default now(),
  expires_at              timestamptz not null default (now() + interval '30 days'),
  quality_grade           text not null check (quality_grade in ('sufficient','thin','insufficient')),
  quality_detail          jsonb not null default '{}',
  pipeline_blocked        boolean not null default false,
  blocked_reason          text,
  signal_data             jsonb not null default '{}',
  provider_metadata       jsonb not null default '{}',
  channel_scope_note      text not null default 'Amazon US only. Total market including retail, DTC, and international is not represented.'
);
alter table public.market_signals enable row level security;
create policy "owner all" on public.market_signals for all using (auth.uid() = user_id);
create index on public.market_signals (user_id, created_at desc);
create index on public.market_signals (query, created_at desc);

-- Stage 2: Investment theses
create table public.investment_theses (
  id                      uuid primary key default uuid_generate_v4(),
  market_signal_id        uuid not null references public.market_signals(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  thesis_index            int not null,
  product_angle           text not null,
  target_customer         text not null,
  differentiation         text not null,
  differentiation_source  text not null,
  customer_pain           jsonb not null,
  supporting_evidence     jsonb not null default '[]',
  quick_economics_check   jsonb not null,
  ai_model_version        text not null
);
alter table public.investment_theses enable row level security;
create policy "owner all" on public.investment_theses for all using (auth.uid() = user_id);
create index on public.investment_theses (market_signal_id);

-- Stage 2.5: Founder-opportunity fit annotations
create table public.founder_fit_annotations (
  id                      uuid primary key default uuid_generate_v4(),
  thesis_id               uuid not null references public.investment_theses(id) on delete cascade,
  founder_profile_id      uuid not null references public.founder_profiles(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  fit_rank                int not null,
  capital_fit             jsonb not null,
  experience_gaps         jsonb not null default '[]',
  channel_fit             jsonb not null,
  timeline_fit            jsonb not null,
  advantages              text[] not null default '{}',
  gaps                    text[] not null default '{}'
);
alter table public.founder_fit_annotations enable row level security;
create policy "owner all" on public.founder_fit_annotations for all using (auth.uid() = user_id);
create index on public.founder_fit_annotations (thesis_id, founder_profile_id);

-- Stage 3: Adversarial debates
create table public.adversarial_debates (
  id                      uuid primary key default uuid_generate_v4(),
  thesis_id               uuid not null references public.investment_theses(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  bull_case               jsonb not null,
  bear_case               jsonb not null,
  conflicts               jsonb not null default '[]',
  unknowns                jsonb not null default '[]',
  kill_switches           jsonb not null default '[]',
  all_switches_clear      boolean not null,
  ai_model_version        text not null
);
alter table public.adversarial_debates enable row level security;
create policy "owner all" on public.adversarial_debates for all using (auth.uid() = user_id);
create index on public.adversarial_debates (thesis_id);

-- Stage 4: Investment memos
create table public.investment_memos (
  id                      uuid primary key default uuid_generate_v4(),
  thesis_id               uuid not null references public.investment_theses(id) on delete cascade,
  debate_id               uuid not null references public.adversarial_debates(id) on delete cascade,
  founder_profile_id      uuid references public.founder_profiles(id) on delete set null,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  created_at              timestamptz not null default now(),
  founder_stage4_inputs   jsonb not null default '{}',
  sections                jsonb not null,
  market_verdict          jsonb not null,
  founder_verdict         jsonb,
  verdict_divergence      text,
  freshness_notice        text not null,
  ai_model_version        text not null
);
alter table public.investment_memos enable row level security;
create policy "owner all" on public.investment_memos for all using (auth.uid() = user_id);
create index on public.investment_memos (thesis_id);
create index on public.investment_memos (user_id, created_at desc);
```

**Validation:** Run `npx tsc --noEmit` after adding TypeScript types. Verify RLS with a test user that cannot read another user's rows.

**Edge cases:**
- `market_signals.expires_at` handles cache invalidation without a separate cron
- `founder_fit_annotations` must be recomputed when `founder_profile_id` row updates (handled in application layer, not DB triggers)

**Complexity:** Low (straightforward SQL)  
**Priority:** Critical — all other components depend on this

---

### C2. EvidencePoint Adapter Layer

**Status:** Missing  
**Purpose:** Every data point entering the new pipeline must carry source, type, freshness, and scope — the `EvidencePoint<T>` from the spec. Existing providers return `AggregatedSignals` (score-based). This adapter translates between the two formats without rewriting the providers.

**Dependencies:**  
- All Stage 1 providers (C5–C12)  
- New `market_signals` table (C1)

**Implementation plan:**

New file: `lib/evidence/adapter.ts`

```typescript
// Canonical source_type taxonomy (Architecture Review T1.4)
export type SourceType =
  | 'primary_measurement'  // read directly from a primary data source
  | 'provider_model'       // provider's own model/estimate (e.g. Keepa monthlySold)
  | 'ai_synthesis'         // language model synthesis
  | 'computed'             // deterministic arithmetic from other EvidencePoints

export interface EvidencePoint<T> {
  value: T
  source: string
  source_type: SourceType
  methodology?: string        // required when source_type is 'provider_model'
  freshness_date: string      // ISO date
  sample_size?: number
  scope_note?: string
}

// Adapter: wraps an AggregatedDimension value into EvidencePoint format
export function toEvidencePoint<T>(
  value: T,
  source: string,
  source_type: SourceType,
  opts?: {
    methodology?: string
    sample_size?: number
    scope_note?: string
    freshness_date?: string
  }
): EvidencePoint<T> {
  return {
    value,
    source,
    source_type,
    methodology: opts?.methodology,
    freshness_date: opts?.freshness_date ?? new Date().toISOString(),
    sample_size: opts?.sample_size,
    scope_note: opts?.scope_note,
  }
}
```

New file: `lib/evidence/signal-to-evidence.ts`  
Converts `AggregatedSignals` → typed `EvidencePoint` fields for the `MarketSignal` spec type. Each dimension is mapped with the correct `source_type` per the METRIC_VALIDATION_TABLE:
- Keepa `monthlySold` → `provider_model`
- Keepa price/fees → `primary_measurement`
- DataForSEO search volume → `primary_measurement`
- Keepa monthlySold average → `computed` (arithmetic from `provider_model` inputs)
- AI complaint theme extraction → `ai_synthesis`
- Cross-product validation → `computed`

**Validation:** Unit test: given a mock `AggregatedSignals`, the adapter produces `EvidencePoint[]` with correct `source_type` on every field. No field produces `primary_measurement` if it came from a model.

**Complexity:** Medium  
**Priority:** Critical — nothing in Stage 1's structured output works without this

---

### C3. Data Quality Gate

**Status:** Missing  
**Purpose:** Deterministic gate that runs after Stage 1 data collection. Produces an overall quality grade (`sufficient` / `thin` / `insufficient`) per dimension and blocks Stage 2 if requirements aren't met. Nothing in Stage 2 runs before this gate clears.

**Dependencies:**  
- `AggregatedSignals` from signal engine  
- Keyword engine output (DataForSEO)  
- Review collector output (consumer intelligence)

**Implementation plan:**

New file: `lib/quality-gate/gate.ts`

```typescript
export type QualityLevel = 'strong' | 'adequate' | 'thin' | 'missing'
export type OverallGrade = 'sufficient' | 'thin' | 'insufficient'

export interface DimensionQuality {
  demand: QualityLevel
  market_structure: QualityLevel
  customer_voice: QualityLevel
  risk_surface: QualityLevel
}

export interface DataQualityAssessment {
  overall_grade: OverallGrade
  demand_signals_confirmed: number
  competitor_products_found: number
  review_base_size: number
  demand_history_months: number
  pipeline_blocked: boolean
  blocked_stages: string[]
  missing_dimensions: { dimension: string; provider_attempted: string; failure_reason: string }[]
  quality_per_dimension: DimensionQuality
}

export function assessDataQuality(signals: AggregatedSignals, reviewCount: number): DataQualityAssessment {
  // Demand signals confirmed = count of providers that returned real demand data
  const demandConfirmed = [
    signals.demand?.sources.length ?? 0,        // DataForSEO + Google Trends
    signals.virality?.sources.length ?? 0,       // TikTok
  ].filter(n => n > 0).length

  const competitorCount = signals.review_velocity?.value.meaningful_competitor_count ?? 0
  const historyMonths = /* extract from DataForSEO monthly array length */ 0

  const pipelineBlocked = demandConfirmed < 2 || competitorCount < 5
  const blockedStages = pipelineBlocked ? ['thesis_generation'] : []

  // Grade each dimension
  const demandQuality: QualityLevel =
    demandConfirmed >= 2 && historyMonths >= 12 ? 'strong' :
    demandConfirmed >= 1 ? 'adequate' :
    'missing'

  const structureQuality: QualityLevel =
    competitorCount >= 10 ? 'strong' :
    competitorCount >= 5  ? 'adequate' :
    competitorCount >  0  ? 'thin' :
    'missing'

  const customerQuality: QualityLevel =
    reviewCount >= 200 ? 'strong' :
    reviewCount >= 50  ? 'adequate' :
    reviewCount >  0   ? 'thin' :
    'missing'

  const riskQuality: QualityLevel = 'adequate' // openFDA/PubMed always attempt

  const grades: QualityLevel[] = [demandQuality, structureQuality, customerQuality, riskQuality]
  const overall: OverallGrade =
    grades.includes('missing') ? 'insufficient' :
    grades.filter(g => g === 'thin').length >= 2 ? 'thin' :
    'sufficient'

  return {
    overall_grade: overall,
    demand_signals_confirmed: demandConfirmed,
    competitor_products_found: competitorCount,
    review_base_size: reviewCount,
    demand_history_months: historyMonths,
    pipeline_blocked: pipelineBlocked,
    blocked_stages: blockedStages,
    missing_dimensions: [],  // populated from failed_providers list
    quality_per_dimension: {
      demand: demandQuality,
      market_structure: structureQuality,
      customer_voice: customerQuality,
      risk_surface: riskQuality,
    }
  }
}
```

**Validation:**
- Test with zero DataForSEO data → `overall_grade: 'insufficient'`, `pipeline_blocked: true`
- Test with thin but present data → `overall_grade: 'thin'`, Stage 2 runs with reduced confidence label
- Test with full data → `overall_grade: 'sufficient'`

**Edge cases:**
- A niche category with 3 legitimate competitors (not 5) still blocks Stage 2 — must display exactly why with a recommendation to try a broader query
- `missing_dimensions` must show the provider name and failure reason, not just "data missing"

**Complexity:** Low  
**Priority:** Critical

---

### C4. Keepa Price History Extension

**Status:** Needs modification  
**Purpose:** Extract 24-month price history per product from Keepa to compute category price compression (metric #63), which feeds Kill Switch #4. Current Keepa provider already fetches `stats.avg90[]` and `stats.avg365[]` but does not pull the raw monthly price CSV or compare across time periods.

**Dependencies:**  
- Existing `lib/signal-engine/providers/keepa.ts`  
- Keepa product API (already wired)

**Implementation plan:**

In `lib/signal-engine/providers/keepa.ts`, add a new output field to the provider's return value:

```typescript
// In keepa.ts — extend the price extraction block
// Keepa's `csv` field (index 0 = Amazon price) contains timestamped price history
// when the request includes &history=1. Already fetched; extract 24-month trajectory.

interface PriceHistoryPoint {
  timestamp_ms: number
  price_cents: number
}

function extractPriceHistory(csv: number[] | null | undefined): PriceHistoryPoint[] {
  // Keepa csv format: alternating [keepa_minutes, price_cents, keepa_minutes, price_cents...]
  // keepa_minutes is minutes since epoch offset (21564000)
  if (!csv || csv.length < 2) return []
  const KEEPA_EPOCH_OFFSET_MINUTES = 21564000
  const result: PriceHistoryPoint[] = []
  for (let i = 0; i < csv.length - 1; i += 2) {
    const keepaMinutes = csv[i]
    const price = csv[i + 1]
    if (keepaMinutes === -1 || price === -1) continue
    const ts = (keepaMinutes + KEEPA_EPOCH_OFFSET_MINUTES) * 60 * 1000
    result.push({ timestamp_ms: ts, price_cents: price })
  }
  return result
}
```

Then compute the price compression signal in the engine:

```typescript
// In lib/signal-engine/providers/keepa.ts computeSignals()
// For each product in the bestseller sample, extract 24mo price history
// Group by product → compute median then vs. 24 months ago
// Only include products present in BOTH windows

// Add to existing revenue output:
price_compression_24mo: {
  sample_products: number,  // how many had 24mo continuous data
  median_price_today: number | null,
  median_price_24mo_ago: number | null,
  pct_change: number | null,  // negative = compression
  insufficient_history: boolean
}
```

**Files to modify:** `lib/signal-engine/providers/keepa.ts`, `lib/signal-engine/types.ts`

**Validation:**
- For a category like magnesium glycinate, verify that the price history array is non-empty and the 24-month comparison window is correctly aligned
- Verify the `insufficient_history` flag triggers when fewer than 5 products have continuous data

**Complexity:** Medium (Keepa CSV parsing is well-understood; the comparison logic is new)  
**Priority:** High (required for Kill Switch #4)

---

### C5. Stage 1 Market Signal API Route

**Status:** Missing (current `/api/generate` conflates all stages into one call)  
**Purpose:** Dedicated route that runs Stage 1 data collection and returns a structured `MarketSignal` with full `EvidencePoint` labeling and a `DataQualityAssessment`. Does not run AI. Stores result to `market_signals` table.

**Dependencies:**  
- C1 (database schema)  
- C2 (EvidencePoint adapter)  
- C3 (data quality gate)  
- C4 (Keepa price history extension)  
- All existing providers (C5-C12 conceptually)

**Implementation plan:**

New file: `app/api/research/market-signal/route.ts`

```typescript
// POST { query: string }
// Returns: { signal_id, quality, signal_data, blocked, blocked_reason }
// Runs ALL Stage 1 providers in parallel, applies EvidencePoint adapter,
// runs quality gate, persists to market_signals, returns structured result.

// Execution order:
// Phase 1 (parallel, no dependencies):
//   - DataForSEO keyword engine
//   - Google Trends (interestOverTime + interestByRegion)
//   - Keepa bestseller data + price history
//   - Apify Amazon search (competitor count + price distribution)
//   - TikTok hashtag signal
//   - openFDA recalls
//   - PubMed research trajectory
//   - GDELT/news events

// Phase 2 (sequential, depends on Apify results for competitor ASINs):
//   - Review collector (uses top competitor ASINs from Phase 1 Apify result)
//   - Consumer intelligence (complaint theme extraction from reviews)

// Phase 3 (deterministic, depends on all Phase 1+2):
//   - EvidencePoint adapter (wraps all outputs)
//   - Data quality gate
//   - Persist to market_signals table

// Response: market_signal_id, quality_grade, signal_data
// Blocked: returns quality_grade='insufficient' with blocked_stages populated
```

**Validation:**
- Query "magnesium glycinate" → all 8 providers return data → quality_grade='sufficient'
- Query "xyzinvalidquery12345" → providers return null/empty → quality_grade='insufficient', pipeline_blocked=true
- Verify `provider_metadata` contains timing per provider

**Edge cases:**
- Provider partial failure: if Apify returns but TikTok fails, continue with what's available; populate `failed_providers`
- Cache hit: if same query has a `market_signals` row < 30 days old, return cached result with `from_cache: true`

**Complexity:** Medium (wiring, not new logic)  
**Priority:** Critical

---

### C6. Founder Profile Form and API

**Status:** Missing  
**Purpose:** Collect and persist the founder's context (capital, experience, channel, timeline, risk posture, goal). This context is the input to Stage 2.5 and Stage 4. Not collected at Stage 1 — market facts do not change based on who is asking.

**Dependencies:**  
- C1 (founder_profiles table)  
- Supabase auth

**Implementation plan:**

New files:
- `app/research/profile/page.tsx` — founder profile form UI
- `app/api/research/founder-profile/route.ts` — GET/POST/PUT endpoints

Form fields (from spec Stage 0):
1. Capital available (USD number input)
2. Capital confidence (select: committed / estimated / speculative)
3. Manufacturing experience (select: none / sourced before / established relationships)
4. Regulatory experience (select: none / familiar / certified)
5. Existing channel type (select: none / social / email / retail / wholesale / multiple)
6. Channel size (optional number)
7. Target geography (select: US only / multi-region / international)
8. Time horizon (select: <6mo / 6-18mo / 18mo+)
9. Risk posture (select: capital preservation / balanced / high risk tolerance)
10. Long-term goal (select: lifestyle / scale to exit / strategic asset)

UI treatment: each field has a 1-sentence explanation of why it matters (from spec). Profile shows a "last updated" timestamp. Warning shown when profile is >90 days old.

**Validation:**
- Profile saved → retrieved correctly
- Profile update → `updated_at` refreshes, Stage 2.5 annotations recomputed (not re-fetched)
- Missing profile → Stage 4 returns market verdict only (no founder verdict) with invite to add profile

**Complexity:** Low  
**Priority:** High

---

### C7. Stage 2: Investment Thesis Generation

**Status:** Partially exists (`lib/thesis-engine/` implements a different format)  
**Purpose:** AI synthesis of 2–4 specific investment theses from Stage 1 evidence. Runs only after data quality gate clears. Every thesis claim must cite a specific EvidencePoint. AI is not permitted to fabricate evidence.

**Dependencies:**  
- C5 (Stage 1 market signal — must be `sufficient` or `thin`)  
- C2 (EvidencePoint adapter — provides cited evidence to AI)  
- C1 (`investment_theses` table)  
- Anthropic SDK

**Implementation plan:**

New file: `lib/stage2/thesis-generator.ts`

The system prompt explicitly lists every available EvidencePoint by ID with its value and source_type. The AI is instructed:
- Generate only theses that cite specific EvidencePoint IDs from the list provided
- Each thesis must specify `differentiation_source` (which EvidencePoint ID revealed the gap)
- Do not generate generic category theses
- Maximum 4 theses regardless of data richness
- If evidence supports only 1, generate 1 and explain why

Evidence gate (deterministic, runs before AI call):
```typescript
function checkEvidenceGate(signals: MarketSignal): { passes: boolean; reason?: string } {
  const demandsConfirmed = signals.quality.demand_signals_confirmed
  const competitorCount = signals.quality.competitor_products_found
  const reviewBase = signals.quality.review_base_size
  
  if (demandsConfirmed < 2) return { passes: false, reason: 'Fewer than 2 independent demand signals' }
  if (competitorCount < 5) return { passes: false, reason: 'Fewer than 5 established competitors found' }
  return { passes: true }
}
```

Quick economics check (deterministic, per thesis, runs after AI returns):
```typescript
function quickEconomicsCheck(thesis: RawThesis, signals: MarketSignal): QuickEconomicsResult {
  const priceFloor = signals.market_structure.price_distribution.value.p25
  const referralPct = signals.market_structure.amazon_fees.value.referral_pct / 100
  const fbaFee = signals.market_structure.amazon_fees.value.fba_pick_pack_fee
  // Check if 50% gross margin is achievable at ANY realistic COGS
  // Max achievable GM = (priceFloor - priceFloor * referralPct - fbaFee) / priceFloor
  const maxAchievableGM = (priceFloor - priceFloor * referralPct - fbaFee) / priceFloor
  return {
    observed_price_range: { min: priceFloor, max: signals.market_structure.price_distribution.value.p75 },
    amazon_fees_pct: referralPct * 100,
    is_50pct_margin_theoretically_achievable: maxAchievableGM > 0.5,
    reasoning: `At observed price floor ($${priceFloor}) after Amazon fees, maximum achievable gross margin is ${(maxAchievableGM * 100).toFixed(1)}%`
  }
}
```

**Files to create:** `lib/stage2/thesis-generator.ts`, `app/api/research/thesis/route.ts`

**Validation:**
- Quality gate blocks → thesis route returns `{ blocked: true, reason: "..." }` without calling AI
- AI returns thesis without citing a real EvidencePoint ID → validation pass rejects it
- Quick economics check: price $25, 15% referral, $4.50 FBA → max achievable GM = 50.0% → is_50pct_margin_theoretically_achievable = false (right on boundary — test this case)

**Complexity:** Medium  
**Priority:** High

---

### C8. Stage 2.5: Minimum Viable Launch Threshold Table

**Status:** Missing (prerequisite T1.2 from Architecture Review)  
**Purpose:** Deterministic lookup table that computes the minimum capital required to launch a product type on Amazon US. Used by the capital fit assessment. Must be defined before Stage 2.5 fit layer can be implemented.

**Dependencies:** None (internal table)  
**Consumed by:** C9 (fit layer)

**Implementation plan:**

New file: `lib/stage25/launch-threshold.ts`

```typescript
// Category benchmark table — values in USD
// Sources: industry surveys, Amazon seller communities, supplier catalogs
// All figures are RANGES — show as range, never point estimate
// Formula: MOQ × COGS_base + 50% safety stock buffer + launch marketing + certifications + 6-month reserve

export interface LaunchThreshold {
  product_type: string
  moq_estimate: { low: number; high: number }         // units
  cogs_per_unit: { low: number; high: number }        // USD
  launch_marketing: { low: number; high: number }     // USD total
  certifications: { low: number; high: number }       // USD
  operating_reserve_months: number                    // months of expenses
  total_minimum: { low: number; high: number }        // USD
  notes: string
}

export const LAUNCH_THRESHOLDS: Record<string, LaunchThreshold> = {
  supplement_capsule: {
    product_type: 'Dietary supplement (capsule/tablet)',
    moq_estimate:     { low: 500,   high: 2000  },
    cogs_per_unit:    { low: 3,     high: 12    },
    launch_marketing: { low: 3000,  high: 8000  },
    certifications:   { low: 1000,  high: 5000  },
    operating_reserve_months: 6,
    total_minimum:    { low: 8000,  high: 40000 },
    notes: 'GMP facility required. NSF/USP certification optional but recommended for premium positioning.'
  },
  supplement_powder: {
    product_type: 'Dietary supplement (powder)',
    moq_estimate:     { low: 250,   high: 1000  },
    cogs_per_unit:    { low: 8,     high: 25    },
    launch_marketing: { low: 3000,  high: 8000  },
    certifications:   { low: 1500,  high: 6000  },
    operating_reserve_months: 6,
    total_minimum:    { low: 12000, high: 55000 },
    notes: 'Higher COGS per unit but lower MOQ. Blending and packaging complexity varies significantly.'
  },
  supplement_gummy: {
    product_type: 'Dietary supplement (gummy)',
    moq_estimate:     { low: 2000,  high: 10000 },
    cogs_per_unit:    { low: 4,     high: 15    },
    launch_marketing: { low: 5000,  high: 12000 },
    certifications:   { low: 2000,  high: 8000  },
    operating_reserve_months: 6,
    total_minimum:    { low: 25000, high: 120000 },
    notes: 'High MOQ from contract manufacturers. Gummy format requires specialized equipment not all CMOs have.'
  },
  // Additional product types can be added as the platform expands to new categories
}

export function getThreshold(categoryId: string, productType?: string): LaunchThreshold | null {
  // Match by product type signal from thesis
  const key = productType?.toLowerCase().includes('gummy') ? 'supplement_gummy'
    : productType?.toLowerCase().includes('powder') ? 'supplement_powder'
    : 'supplement_capsule'
  return LAUNCH_THRESHOLDS[key] ?? null
}
```

**Validation:** Values reviewed against publicly available Amazon seller community data. Total minimum range must be wide enough to be honest (not false precision).

**Complexity:** Low (a data table with lookup logic)  
**Priority:** High (blocks Stage 2.5)

---

### C9. Stage 2.5: Founder-Opportunity Fit Layer

**Status:** Missing  
**Purpose:** Annotate each thesis with founder-specific fit analysis using deterministic rules only. No AI. Re-orders theses by fit rank but never filters.

**Dependencies:**  
- C1 (`founder_fit_annotations` table)  
- C6 (founder profile)  
- C7 (theses)  
- C8 (launch threshold table)

**Implementation plan:**

New file: `lib/stage25/fit-layer.ts`

Four rule functions run per thesis per founder profile:

```typescript
// 1. Capital fit
function assessCapitalFit(thesis: InvestmentThesis, profile: FounderProfile, threshold: LaunchThreshold): CapitalFit {
  const thresholdBase = (threshold.total_minimum.low + threshold.total_minimum.high) / 2
  const gap = thresholdBase - profile.capital_available
  return {
    minimum_viable_threshold: threshold.total_minimum,
    founder_capital: profile.capital_available,
    gap: gap > 0 ? gap : 0,
    surplus: gap < 0 ? Math.abs(gap) : 0,
    is_closeable: gap > 0 && gap < profile.capital_available * 0.5, // gap < 50% of available
    closure_path: gap > 0 ? 'Consider co-investor, phased launch with smaller initial SKU, or pre-sales' : undefined
  }
}

// 2. Experience gaps
function assessExperienceGaps(thesis: InvestmentThesis, profile: FounderProfile): ExperienceGap[] {
  const gaps: ExperienceGap[] = []
  
  // Regulatory gap
  if (thesis.requires_regulatory_navigation && profile.regulatory_experience === 'none') {
    gaps.push({
      dimension: 'Regulatory navigation',
      severity: 'significant',
      is_closeable: true,
      closure_path: 'Hire regulatory consultant or partner with a contract manufacturer that handles compliance'
    })
  }
  
  // Manufacturing gap
  if (profile.manufacturing_experience === 'none') {
    gaps.push({
      dimension: 'Manufacturing and sourcing',
      severity: 'significant',
      is_closeable: true,
      closure_path: 'Work with a turnkey contract manufacturer for first run; visit facility before committing'
    })
  }
  
  // Channel gap
  if (thesis.primary_channel === 'social_audience' && profile.existing_channel?.type === 'none') {
    gaps.push({
      dimension: 'Brand audience for product launch',
      severity: 'significant',
      is_closeable: true,
      closure_path: 'Budget for paid acquisition; organic Amazon SEO path takes 3-6 months minimum'
    })
  }
  
  return gaps
}

// 3. Channel fit
function assessChannelFit(thesis: InvestmentThesis, profile: FounderProfile): ChannelFit {
  const thesisChannel = thesis.primary_channel ?? 'amazon_fba'
  const founderChannel = profile.existing_channel?.type ?? 'none'
  
  const alignment: 'strong' | 'partial' | 'misaligned' =
    thesisChannel === 'amazon_fba' ? 'strong' : // Amazon FBA works for all founders
    founderChannel !== 'none' ? 'partial' :
    'misaligned'
  
  return { thesis_primary_channel: thesisChannel, founder_channel: founderChannel, alignment }
}

// 4. Timeline fit
function assessTimelineFit(thesis: InvestmentThesis, profile: FounderProfile, threshold: LaunchThreshold): TimelineFit {
  // Typical months to first revenue for supplement categories
  const LEAD_TIMES: Record<string, { min: number; max: number }> = {
    supplement_capsule: { min: 3, max: 9 },
    supplement_powder:  { min: 2, max: 7 },
    supplement_gummy:   { min: 4, max: 12 },
  }
  const estimate = LEAD_TIMES.supplement_capsule // default; refine by thesis.product_angle
  const founderMonths = profile.time_horizon === 'under_6mo' ? 6
    : profile.time_horizon === '6_to_18mo' ? 18
    : 36
  
  return {
    estimated_months_range: estimate,
    founder_horizon_months: founderMonths,
    is_compatible: estimate.min <= founderMonths,
  }
}
```

After all four assessments, rank theses 1-N by overall fit score (blocking gaps first, then capital gap magnitude, then channel alignment).

**Files to create:** `lib/stage25/fit-layer.ts`, `app/api/research/fit/route.ts`

**Validation:**
- Founder with zero capital → all theses show capital gap; fit rank based on gap magnitude
- Founder with `regulatory_experience: 'certified'` → no regulatory gap despite thesis requiring regulatory navigation
- All theses shown regardless of fit rank (never filtered)

**Complexity:** Medium  
**Priority:** High

---

### C10. Stage 3: Kill Switch Engine

**Status:** Missing  
**Purpose:** Four deterministic rules applied after the AI adversarial calls. A triggered AVOID switch makes the market verdict AVOID regardless of all other signals. No AI override is possible.

**Dependencies:**  
- Stage 1 signals (price distribution, Amazon fees, patent search result, regulatory classification)  
- C4 (price compression metric)  
- USPTO patent search (to be wired)

**Implementation plan:**

New file: `lib/stage3/kill-switches.ts`

```typescript
export type KillSwitchId =
  | 'PATENT_BLOCKING'
  | 'FDA_CLEARANCE_REQUIRED'
  | 'ECONOMICS_STRUCTURALLY_BROKEN'
  | 'COMMODITY_PRICE_COMPRESSION'

export interface KillSwitchResult {
  id: KillSwitchId
  triggered: boolean
  severity: 'AVOID' | 'VALIDATE_FURTHER'
  evidence: string
  resolution_path?: string
  requires_external_expert: boolean
  boundary_zone?: boolean // true when result is within ±5% of threshold
}

// Switch 1: Patent blocking
export function checkPatentBlocking(patentFlag: PatentSearchResult | null): KillSwitchResult {
  if (!patentFlag) return { id: 'PATENT_BLOCKING', triggered: false, ... }
  const triggered = patentFlag.has_granted_patent_with_active_holder && patentFlag.ai_relevance_flag
  return {
    id: 'PATENT_BLOCKING',
    triggered,
    severity: 'AVOID',
    evidence: triggered ? `USPTO filing ${patentFlag.filing_number} held by ${patentFlag.holder} appears to cover this product's mechanism` : 'No obviously conflicting patents found',
    resolution_path: triggered ? 'Freedom-to-operate opinion required from qualified patent attorney' : undefined,
    requires_external_expert: triggered,
  }
}

// Switch 2: FDA clearance required
export function checkFdaClearanceRequired(regulatoryClass: RegulatoryClassification): KillSwitchResult {
  const triggered = regulatoryClass.requires_premarket_clearance && !regulatoryClass.clearance_confirmed
  return {
    id: 'FDA_CLEARANCE_REQUIRED',
    triggered,
    severity: 'AVOID',
    evidence: triggered ? `${regulatoryClass.pathway_required} required for this product category. Not confirmed.` : 'No pre-market clearance required for standard DSHEA supplement',
    resolution_path: triggered ? `Typical pathway: ${regulatoryClass.pathway_duration_estimate}. Estimated cost: ${regulatoryClass.pathway_cost_estimate}` : undefined,
    requires_external_expert: triggered,
  }
}

// Switch 3: Economics structurally broken
// Trigger: (price_floor - referral_fee - fba_fee - optimistic_cogs) / price_floor < 0.35
export function checkEconomicsStructurallyBroken(
  priceFloor: number,
  referralPct: number,
  fbaFee: number,
  optimisticCogs: number
): KillSwitchResult {
  const maxGM = (priceFloor - priceFloor * (referralPct / 100) - fbaFee - optimisticCogs) / priceFloor
  const triggered = maxGM < 0.35
  const boundaryZone = Math.abs(maxGM - 0.35) < 0.05  // within 5% of threshold
  return {
    id: 'ECONOMICS_STRUCTURALLY_BROKEN',
    triggered,
    severity: 'AVOID',
    boundary_zone: boundaryZone,
    evidence: `At observed price floor ($${priceFloor}) and optimistic COGS ($${optimisticCogs}), maximum gross margin is ${(maxGM * 100).toFixed(1)}%`,
    resolution_path: triggered ? 'No founder advantage recovers structurally broken economics. Consider different product format or channel with better margin structure.' : undefined,
    requires_external_expert: false,
  }
}

// Switch 4: Commodity price compression
export function checkCommodityPriceCompression(priceCompression: PriceCompressionResult): KillSwitchResult {
  if (priceCompression.insufficient_history) {
    return {
      id: 'COMMODITY_PRICE_COMPRESSION',
      triggered: false,
      severity: 'AVOID',
      evidence: 'Insufficient price history to evaluate price compression (fewer than 5 products with continuous 24-month history)',
      requires_external_expert: false,
    }
  }
  const triggered = (priceCompression.pct_change ?? 0) < -0.30
  return {
    id: 'COMMODITY_PRICE_COMPRESSION',
    triggered,
    severity: 'AVOID',
    evidence: triggered
      ? `Category median price declined ${Math.abs(priceCompression.pct_change! * 100).toFixed(0)}% over 24 months (from $${priceCompression.median_price_24mo_ago} to $${priceCompression.median_price_today}). ${priceCompression.sample_products} products with continuous history.`
      : `Category median price change: ${(priceCompression.pct_change! * 100).toFixed(0)}% over 24 months. No commoditization signal.`,
    requires_external_expert: false,
  }
}

export function runAllKillSwitches(/* all required signals */): {
  switches: KillSwitchResult[]
  any_avoid_triggered: boolean
  any_validate_triggered: boolean
} {
  const switches = [
    checkPatentBlocking(/* patent result */),
    checkFdaClearanceRequired(/* regulatory class */),
    checkEconomicsStructurallyBroken(/* price, fees, cogs */),
    checkCommodityPriceCompression(/* price history */),
  ]
  return {
    switches,
    any_avoid_triggered: switches.some(s => s.triggered && s.severity === 'AVOID'),
    any_validate_triggered: switches.some(s => s.triggered && s.severity === 'VALIDATE_FURTHER'),
  }
}
```

**Validation:**
- Kill switch #3 boundary zone test: price $20, 15% referral, $3 FBA, optimistic COGS $9 → GM = ($20 - $3 - $3 - $9) / $20 = 25% → triggered
- Boundary zone: same but COGS = $6.90 → GM = 35.5% → not triggered but `boundary_zone: true`
- Kill switch #4: `pct_change = -0.31` → triggered; `pct_change = -0.29` → not triggered

**Complexity:** Low (arithmetic + lookup)  
**Priority:** Critical

---

### C11. Stage 3: Adversarial Three-Call Architecture

**Status:** Missing (current thesis engine uses a single AI call)  
**Purpose:** Genuine adversarial evaluation via three independent AI calls with no shared context between Call 1 and Call 2. Call 3 organizes without adding new arguments.

**Dependencies:**  
- C7 (thesis)  
- C5 (Stage 1 signals — full evidence base for all calls)  
- C1 (`adversarial_debates` table)  
- Anthropic SDK  
- Kill switch engine (C10, runs after Call 3)

**Implementation plan:**

New file: `lib/stage3/adversarial.ts`

Critical implementation rules from the spec:
1. Call 2 does NOT receive Call 1's output
2. Call 2 uses a higher temperature (0.8 vs 0.5 for Call 1)
3. Call 2 must produce at least one "kill shot" — if none are produced, the call is retried once
4. Call 3 does NOT add new arguments — only organizes Call 1 + Call 2 outputs
5. All three calls run on the same thesis + evidence base (not on each other's outputs)

```typescript
// System prompts are literal, not constructed from user data

const BULL_SYSTEM_PROMPT = `You are an investment advocate. 
Build the strongest possible case for why this thesis will succeed as a business.
Cite only evidence from the provided market data using the EvidencePoint IDs supplied.
Do not hedge. Do not acknowledge counterarguments. Find every reason this works.`

const BEAR_SYSTEM_PROMPT = `You are a skeptical investment committee member.
Find every reason this thesis will fail. Be aggressive. Do not seek balance.
Identify the kill shots — the 1-2 reasons that, if true, make everything else irrelevant.
You MUST produce at least one kill shot. If you cannot find one from evidence, name the structural risk most likely to cause complete failure.
Cite evidence. Do not generate risks without data backing from the provided EvidencePoint list.`

const SYNTHESIS_SYSTEM_PROMPT = `You are a debate moderator.
You have received a bull case and a bear case for the same investment thesis.
Your job: organize, NOT argue. Do not add new arguments that neither side made.
Identify genuine conflicts (where bull and bear actually disagree, not just emphasize differently).
Produce a research agenda: for each open question, state exactly what the founder should do to resolve it.`

export async function runAdversarialEvaluation(
  thesis: InvestmentThesis,
  signals: MarketSignal
): Promise<AdversarialDebate> {
  // Call 1 and Call 2 run in parallel — they do not share context
  const [bullRaw, bearRaw] = await Promise.all([
    ai.messages.create({ system: BULL_SYSTEM_PROMPT, /* thesis + signals */ temperature: 0.5 }),
    ai.messages.create({ system: BEAR_SYSTEM_PROMPT, /* thesis + signals */ temperature: 0.8 }),
  ])
  
  // Validate bear case has kill shots — retry once if missing
  let bearFinal = parseBearCase(bearRaw)
  if (bearFinal.kill_shots.length === 0) {
    const bearRetry = await ai.messages.create({ 
      system: BEAR_SYSTEM_PROMPT + '\nYour previous response lacked a kill shot. Try again.',
      temperature: 0.9
    })
    bearFinal = parseBearCase(bearRetry)
  }
  
  // Call 3 receives both outputs — does not see the thesis evidence directly
  // (it synthesizes what bull and bear already said, not raw market data)
  const synthesisRaw = await ai.messages.create({
    system: SYNTHESIS_SYSTEM_PROMPT,
    /* bull output + bear output — NOT signals */ 
    temperature: 0.3  // low temperature for synthesis — less creativity, more organization
  })
  
  const synthesis = parseSynthesis(synthesisRaw)
  
  // Kill switches run after AI calls complete (deterministic, cannot be overridden by AI)
  const killSwitchResult = runAllKillSwitches(/* signals, thesis */)
  
  return {
    thesis_id: thesis.id,
    generated_at: new Date().toISOString(),
    bull_case: parseBullCase(bullRaw),
    bear_case: bearFinal,
    conflicts: synthesis.conflicts,
    unknowns: synthesis.unknowns,
    kill_switches: killSwitchResult.switches,
    all_switches_clear: !killSwitchResult.any_avoid_triggered && !killSwitchResult.any_validate_triggered,
  }
}
```

**Files to create:** `lib/stage3/adversarial.ts`, `app/api/research/debate/route.ts`

**Validation:**
- Call 1 and Call 2 system prompts in server logs must show different `system` fields — verify they never share context
- Bear case without kill shot → retry fires → confirm in logs
- Call 3 output cites only arguments from Call 1 or Call 2 — not new evidence
- Kill switch evaluation runs after all three calls

**Complexity:** High (architecture is fragile — concurrent calls, retry logic, parse validation)  
**Priority:** High

---

### C12. Stage 4: Unit Economics Engine

**Status:** Missing  
**Purpose:** Deterministic arithmetic that produces gross margin ranges, breakeven COGS, breakeven units, and capital to breakeven. Two models run in parallel: market baseline (no founder inputs) and founder-specific (substitutes founder-stated values).

**Dependencies:**  
- Stage 1 signals (price, Amazon fees)  
- C8 (COGS benchmark table)  
- C6 (founder profile + Stage 4 inputs)  
- C5 (market signal for price floor and fees)

**Implementation plan:**

New file: `lib/stage4/unit-economics.ts`

```typescript
// All arithmetic is deterministic. No AI. No rounding of intermediate values.

export function computeBreakevenCOGS(price: number, referralPct: number, fbaFee: number, targetGM: number = 0.50): number {
  // Breakeven COGS = price × (1 - referralPct) - fbaFee - price × targetGM
  // Rearranged: COGS = price × (1 - referralPct - targetGM) - fbaFee
  return price * (1 - referralPct / 100 - targetGM) - fbaFee
}

export function computeGrossMargin(price: number, referralPct: number, fbaFee: number, cogs: number): number {
  return (price - price * (referralPct / 100) - fbaFee - cogs) / price
}

export function computeSensitivity(model: UnitEconomicsModel): SensitivityEntry[] {
  // For each variable input, compute output at base, +15%, -15%
  const variables: Array<{ name: string; base: number }> = [
    { name: 'price_point', base: model.inputs.price_point.value },
    { name: 'cogs_base', base: model.inputs.cogs_base.value },
    { name: 'cac_estimate', base: model.inputs.cac_estimate.value },
  ]
  
  return variables.map(({ name, base }) => {
    const atPlus = computeGrossMargin(/* substitute name with base * 1.15 */)
    const atMinus = computeGrossMargin(/* substitute name with base * 0.85 */)
    return {
      input_name: name,
      base_value: base,
      at_plus_15pct: { gross_margin: atPlus, verdict_changes: /* compare to base verdict */ false },
      at_minus_15pct: { gross_margin: atMinus, verdict_changes: false },
    }
  })
}

// COGS outlier detection (prerequisite T1.5)
export function checkCOGSOutlier(founderCOGS: number, benchmarkCOGS: { low: number; high: number }): boolean {
  return founderCOGS < benchmarkCOGS.low * 0.6  // 40% below the low benchmark is an outlier
}
```

**Files to create:** `lib/stage4/unit-economics.ts`, `app/api/research/memo/route.ts`

**Validation:**
- Breakeven COGS at price=$30, referral=15%, FBA=$4.50, target=50% → COGS = $30×(1-0.15-0.50) - $4.50 = $10.50 - $4.50 = $6.00 per unit
- Sensitivity test: if COGS changes +15% and verdict changes, `verdict_changes = true`
- COGS outlier: founder states $1.50 COGS when benchmark is $3–$12 → `checkCOGSOutlier` returns true → warning shown

**Complexity:** Low (pure arithmetic)  
**Priority:** High

---

### C13. Stage 4: Verdict Determination Logic

**Status:** Partially exists (`lib/scoring.ts` implements a scored system; the spec requires a rule-based system)  
**Purpose:** Deterministic rule logic that produces BUILD_NOW / VALIDATE_FURTHER / AVOID. AI cannot produce or override this output. The verdict follows the exact decision tree from spec Section 5.

**Dependencies:**  
- C10 (kill switch results)  
- C12 (unit economics outputs)  
- C5 (Stage 1 signals — demand confirmation count)  
- C6 (founder profile — capital, for UNDERCAPITALIZED check)  
- C3 (data quality gate — for DATA_QUALITY_BELOW_THRESHOLD check)

**Implementation plan:**

New file: `lib/stage4/verdict.ts`

```typescript
export type VerdictDecision = 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'AVOID'

// AVOID kill switches (any one = AVOID)
function checkAvoidTriggers(killSwitches: KillSwitchResult[]): KillSwitchResult | null {
  return killSwitches.find(s => s.triggered && s.severity === 'AVOID') ?? null
}

// VALIDATE_FURTHER overrides (any one prevents BUILD_NOW)
function checkValidateFurtherOverrides(
  signals: MarketSignal,
  economics: UnitEconomicsModel,
  profile: FounderProfile | null,
  threshold: LaunchThreshold | null
): string[] {
  const overrides: string[] = []
  
  if (signals.quality.demand_signals_confirmed < 2)
    overrides.push('INSUFFICIENT_DEMAND_SIGNAL')
  if (signals.quality.demand_history_months < 12)
    overrides.push('DEMAND_TOO_EARLY')
  if (profile && threshold && profile.capital_available < threshold.total_minimum.low)
    overrides.push('UNDERCAPITALIZED')
  if (signals.quality.overall_grade === 'insufficient')
    overrides.push('DATA_QUALITY_BELOW_THRESHOLD')
  if (!profile?.stage4_inputs.cogs_estimate && 
      economics.outputs.gross_margin_at_cogs_low < 0.50 && 
      economics.outputs.gross_margin_at_cogs_high > 0.50)
    overrides.push('COGS_UNVALIDATED')
  
  return overrides
}

// BUILD_NOW conditions (ALL must be true)
function checkBuildNowConditions(/* all signals + economics + switches */): string[] {
  // Returns list of failing conditions; empty = BUILD_NOW
  const failing: string[] = []
  if (signals.quality.demand_signals_confirmed < 2) failing.push('verified_demand')
  if (economics.outputs.gross_margin_at_cogs_base < 0.50) failing.push('viable_economics')
  if (killSwitches.some(s => s.triggered)) failing.push('no_kill_switches')
  // differentiation_passes, capital_adequate, regulatory_clear, data_quality checked here
  return failing
}

export function determineMarketVerdict(/* all inputs */): Verdict {
  const avoidTrigger = checkAvoidTriggers(killSwitches)
  if (avoidTrigger) return { decision: 'AVOID', active_kill_switches: [avoidTrigger], ... }
  
  const validateOverrides = checkValidateFurtherOverrides(/* ... */)
  if (validateOverrides.length > 0) return { decision: 'VALIDATE_FURTHER', rationale: validateOverrides, ... }
  
  const failingBuildNow = checkBuildNowConditions(/* ... */)
  if (failingBuildNow.length === 0) return { decision: 'BUILD_NOW', ... }
  
  return { decision: 'VALIDATE_FURTHER', rationale: failingBuildNow, ... }
}

// Founder verdict: apply market verdict, then adjust for profile
export function determineFounderVerdict(marketVerdict: Verdict, profile: FounderProfile, fitAnnotation: FounderFitAnnotation): Verdict {
  // Start from market verdict
  // Check if founder advantage resolves any VALIDATE_FURTHER override
  // Check if founder gap creates a new override
  // State divergence explicitly
}
```

**Files to create:** `lib/stage4/verdict.ts`

**Validation:**
- Any AVOID kill switch triggered → market verdict AVOID, regardless of BUILD_NOW conditions
- All 8 BUILD_NOW conditions met → BUILD_NOW
- One BUILD_NOW condition fails → VALIDATE_FURTHER (not AVOID)
- Founder has channel advantage that resolves UNDERCAPITALIZED override → Founder VALIDATE_FURTHER upgraded to BUILD_NOW

**Complexity:** Medium (rule logic is well-defined; the inputs from multiple stages need to be correctly threaded)  
**Priority:** Critical

---

### C14. New UI: Market Intelligence Briefing

**Status:** Missing (existing MemoDisplay shows old format)  
**Purpose:** Display Stage 1 output to the founder. No scores. No recommendations. Pure evidence display with source labels, freshness dates, and quality indicators per dimension.

**Dependencies:**  
- C5 (Stage 1 market signal)  
- New routing

**Implementation plan:**

New page: `app/research/[signal_id]/page.tsx`  
New component: `components/research/MarketBriefing.tsx`

Sections:
1. Channel scope declaration (always first, always visible)
2. Data Quality Assessment (per-dimension grades, any blocks)
3. Demand Intelligence (search volume, trend chart, keywords, geographic heat map, TikTok signal)
4. Market Structure (competitor table, price distribution, review concentration index)
5. Customer Voice (complaint themes with frequency/source count, verbatim quotes, sentiment trajectory)
6. Risk Surface (FDA recalls, tariff rate, PubMed trajectory)

Each metric displays: value, source label, source_type badge, freshness date, scope note.
No scoring. No recommendations. Quality grade shown prominently at the top.

**Complexity:** High (UI work; chart components needed for trend and price distribution)  
**Priority:** High

---

### C15. New UI: Opportunity Map

**Status:** Missing  
**Purpose:** Display 2–4 thesis cards ordered by fit rank, with evidence citations and founder-specific annotations.

**Dependencies:**  
- C7 (theses)  
- C9 (fit annotations)

**Implementation plan:**

New component: `components/research/OpportunityMap.tsx`

Each thesis card shows:
- Product angle + differentiation claim
- Evidence citations (linked to Stage 1 EvidencePoints)
- Fit rank badge (when founder profile present)
- Advantages list (green)
- Gaps list (amber/red) with closeable flag
- Capital status (surplus or gap with range)
- Economics flag if quick_economics_check failed
- "Evaluate this thesis" CTA

**Complexity:** Medium  
**Priority:** High

---

### C16. New UI: Adversarial Evaluation Display

**Status:** Missing  
**Purpose:** Show the three-call debate result with kill switch status prominently before all other content.

**Dependencies:**  
- C11 (adversarial debate)

**Implementation plan:**

New component: `components/research/AdversarialEvaluation.tsx`

Sections (in display order):
1. **Kill switch panel** — always first; red for AVOID, amber for VALIDATE_FURTHER, green for clear
2. **Thesis recap** — product angle, differentiation, customer pain (sourced)
3. **Bull case** — strongest arguments, evidence citations, best-case scenario
4. **Bear case** — kill shots (highlighted), significant risks with probability/impact, worst-case scenario
5. **Conflicts** — where the two sides genuinely disagree, which has stronger evidence
6. **Research agenda** — each unknown with: question, stakes, resolution task, priority rank

**Complexity:** Medium  
**Priority:** High

---

### C17. New UI: Investment Memo

**Status:** Missing (existing MemoDisplay shows old format)  
**Purpose:** Display Stage 4 full investment memo with dual verdict, unit economics, and all 10 memo sections from the spec.

**Dependencies:**  
- C12 (unit economics)  
- C13 (verdict)  
- C11 (adversarial debate, for competitor/differentiation sections)

**Implementation plan:**

New page: `app/research/memo/[memo_id]/page.tsx`  
New component: `components/research/InvestmentMemo.tsx`

Ten sections exactly as in spec Stage 4:
1. Thesis statement (AI narrative, sourced)
2. Kill switch status (deterministic, displayed before any positive content)
3. Market reality (demand, structure, customer evidence, differentiation gap)
4. Unit economics (two-column: market baseline | founder-specific; sensitivity tables togglable)
5. Competitive analysis (top 3 incumbents; weakness, moat, win condition)
6. Differentiation stress test (observable, verifiable, defensible)
7. Execution reality check (only when founder profile present)
8. Capital plan (line-item table with gap/surplus against founder capital)
9. Regulatory and IP surface check (with mandatory disclaimers)
10. Dual verdict (market verdict + founder verdict; divergence explanation)

Validation agenda shown below verdict when either verdict is VALIDATE_FURTHER.

**Complexity:** High (largest UI component in the system)  
**Priority:** High

---

## Milestone Plan

---

### Milestone 1 — Data Foundation

**Objective:** A founder can submit a keyword and receive a fully sourced, labeled Market Intelligence Briefing. No AI synthesis. No recommendations. Pure evidence with quality grades.

**Components included:**
- C1 (database schema — new tables, migration 015)
- C2 (EvidencePoint adapter layer)
- C3 (data quality gate)
- C4 (Keepa price history extension)
- C5 (Stage 1 market signal API route: `/api/research/market-signal`)
- C14 (Market Intelligence Briefing UI: `/research/[signal_id]`)

**Not included:**
- Founder profile (no form needed yet — profile is optional for Stage 1)
- AI calls (none in Stage 1)
- Kill switches (depend on Stage 3)
- Verdict logic

**Dependencies (must exist before work starts):**
- Migrations 001-014 applied to Supabase
- All existing provider API keys active (Keepa, Apify, DataForSEO, Google Trends, TikTok)
- `ANTHROPIC_API_KEY` not needed for M1 (no AI calls)

**Expected deliverable:**
- User navigates to `/research`
- Submits a keyword ("magnesium glycinate")
- System runs all Stage 1 providers, shows per-provider loading state
- Receives Market Intelligence Briefing with all metrics labeled (source, type, freshness)
- Data quality grade shown (sufficient / thin / insufficient)
- If insufficient: exact blocking reason shown, no further navigation available
- Existing `/analyze` page continues working without modification

**Definition of Done:**
- [ ] Migration 015 applied to Supabase (run in SQL editor)
- [ ] `EvidencePoint` adapter produces correct `source_type` for every provider output (TypeScript compiles clean)
- [ ] Data quality gate correctly blocks Stage 2 for thin searches ("xyzinvalid" returns `pipeline_blocked: true`)
- [ ] Market Intelligence Briefing displays all Demand Intelligence metrics with source labels
- [ ] Market Intelligence Briefing displays all Market Structure metrics (competitor table, price distribution, review concentration)
- [ ] Customer Voice section shows complaint themes with frequency counts, source count, verbatim quotes
- [ ] Risk Surface section shows FDA recalls (or "no recalls found"), tariff rate, PubMed trajectory
- [ ] Keepa price history extraction returns 24-month comparison (used in M3 for kill switch)
- [ ] All market structure outputs carry the channel scope declaration
- [ ] `npx tsc --noEmit` passes with zero errors

**What can be tested after M1:**
- Data quality gate behavior across different query types
- Provider coverage (which providers return data for which queries)
- EvidencePoint labeling accuracy (verify no `primary_measurement` label on estimated data)
- Keepa price history correctness (compare against manually checking Keepa web UI)
- Stage 1 caching behavior (second request for same query returns cached result within 30 days)

---

### Milestone 2 — Opportunity Map

**Objective:** A founder can go from Market Intelligence Briefing to 2–4 specific investment theses, each with evidence citations and (if profile present) founder-specific fit annotations.

**Components included:**
- C6 (Founder Profile form and API: `/research/profile`, `/api/research/founder-profile`)
- C7 (Stage 2 thesis generation: `/api/research/thesis`)
- C8 (Minimum viable launch threshold table)
- C9 (Stage 2.5 fit layer: `/api/research/fit`)
- C15 (Opportunity Map UI)

**Not included:**
- Kill switches (Stage 3)
- Adversarial evaluation (Stage 3)
- Unit economics (Stage 4)
- Verdict determination

**Dependencies:**
- M1 complete
- `ANTHROPIC_API_KEY` active (thesis generation makes one AI call)
- Minimum viable threshold table (C8) values reviewed and approved

**Expected deliverable:**
- User completes founder profile form (or skips — profile optional)
- From Market Intelligence Briefing, clicks "Find investment theses"
- System runs Stage 2 AI synthesis (evidence gate checked first)
- Returns 2–4 thesis cards
- If founder profile present: cards ordered by fit rank, each showing advantages and gaps
- If evidence gate blocks: shows exactly what evidence is missing and why theses cannot be generated
- Existing system unchanged

**Definition of Done:**
- [ ] Founder profile saved to `founder_profiles` table, RLS verified
- [ ] Evidence gate blocks thesis generation for queries with `pipeline_blocked: true` from M1
- [ ] AI generates theses that cite specific EvidencePoint IDs (validate in response)
- [ ] Every thesis has `quick_economics_check` computed deterministically (not from AI)
- [ ] Fit layer runs for profiles with capital data — capital fit shows range, not point estimate
- [ ] Theses ordered by fit rank when profile present
- [ ] All theses displayed when profile absent (no fit rank, no ordering)
- [ ] Thesis with failed `quick_economics_check` shows economics warning flag
- [ ] No thesis is filtered — all are shown regardless of fit rank or economics flag
- [ ] `npx tsc --noEmit` passes

**What can be tested after M2:**
- Thesis quality: are differentiation claims specific and evidence-backed?
- Evidence gate: does evidence-poor query correctly block thesis generation?
- Fit layer accuracy: does capital fit calculation match manual calculation from threshold table?
- Fit rank ordering: does the best-fit thesis consistently lead?
- Founder profile roundtrip: update profile → fit annotations recompute without re-fetching Stage 1

---

### Milestone 3 — Adversarial Evaluation

**Objective:** A founder can select a thesis and receive a genuine adversarial evaluation with kill switch status and a research agenda.

**Components included:**
- C10 (Kill switch engine: `lib/stage3/kill-switches.ts`)
- C11 (Adversarial three-call architecture: `app/api/research/debate`)
- C16 (Adversarial Evaluation UI)

**Not included:**
- Unit economics (Stage 4)
- Verdict determination (Stage 4)
- Full investment memo (Stage 4)

**Prerequisites (must be resolved before work starts):**
- Kill switch boundary zone behavior defined (C10 implementation plan above covers this)
- Price compression sample composition rule defined (see METRIC_VALIDATION_TABLE prerequisite)
- Bear case "kill shot" definition finalized

**Dependencies:**
- M2 complete
- `ANTHROPIC_API_KEY` active (3 AI calls per evaluation)
- Keepa price history from M1 (feeds kill switch #4)
- USPTO patent search integration needed for kill switch #1 (see note below)

**Note on USPTO integration:** Kill switch #1 (PATENT_BLOCKING) requires USPTO patent search. The USPTO provides a free public search API (PatentsView API). This must be wired in M3. If integration is deferred, kill switch #1 must show "Patent search not yet integrated — manual search required" rather than "no blocking patents found."

**Expected deliverable:**
- From Opportunity Map, user selects one thesis
- System runs three AI calls (parallel for Call 1 + Call 2, then sequential Call 3)
- Kill switch status displayed prominently before any debate content
- If AVOID kill switch triggered: red panel with specific evidence and resolution path
- Bull case, bear case (with kill shots highlighted), conflicts, research agenda all shown
- "Proceed to Investment Memo" CTA available even when kill switch is triggered (with warning)
- Debate result stored to `adversarial_debates` table

**Definition of Done:**
- [ ] Call 1 and Call 2 system prompts verified independent (no context sharing — log and check)
- [ ] Call 2 always produces at least one kill shot (retry tested with a case where first attempt has none)
- [ ] Call 3 output only references arguments from Call 1 or Call 2 (no new evidence introduced)
- [ ] Kill switch #3 (ECONOMICS_STRUCTURALLY_BROKEN) evaluated with real price/fee data from Stage 1
- [ ] Kill switch #4 (COMMODITY_PRICE_COMPRESSION) uses 24-month Keepa price history from M1
- [ ] Kill switch boundary zone shown in UI with explicit uncertainty note
- [ ] Kill switch panel always displayed first, before bull/bear content
- [ ] Research agenda items have specific tasks, not generic "do more research"
- [ ] Kill switch triggered → founder can still access Stage 4 (not blocked, only warned)
- [ ] `npx tsc --noEmit` passes

**What can be tested after M3:**
- Kill switch correctness: test a category with known price compression (e.g., commodity supplements) → kill switch #4 should trigger
- Adversarial quality: does the bear case find risks the bull case missed?
- Independence: run the same thesis twice and verify bull/bear outputs differ (temperature + no shared context)
- Research agenda quality: are the unknowns actionable?
- Kill switch precision: test boundary zone behavior for economics switch

---

### Milestone 4 — Investment Memo

**Objective:** The complete product. A founder receives a full investment memo with dual verdict, unit economics, and all 10 sections. Every claim is sourced. Every assumption is labeled.

**Components included:**
- C12 (Unit economics engine: `lib/stage4/unit-economics.ts`)
- C13 (Verdict determination: `lib/stage4/verdict.ts`)
- C17 (Investment Memo UI: `/research/memo/[memo_id]`)
- Stage 4 founder inputs collection (COGS estimate, lead time, etc.)
- Capital plan calculator
- Win condition generator (AI, per competitor)
- Differentiation stress test display
- Regulatory/IP summary section
- `investment_memos` table (in C1)

**Dependencies:**
- M3 complete
- Founder profile (from M2)
- COGS benchmark table reviewed and approved (prerequisite T1.5 from Architecture Review)

**Expected deliverable:**
- From Adversarial Evaluation, founder clicks "Proceed to Investment Memo"
- Form collects Stage 4 inputs (COGS estimate, confidence, lead time, etc.)
- System runs unit economics (both models), win condition AI call, verdict determination
- Full 10-section memo displayed
- COGS outlier warning shown if founder COGS is below benchmark low
- Dual verdict displayed: market verdict + founder verdict (if profile present)
- Divergence explanation shown when verdicts differ
- Validation agenda shown when either verdict is VALIDATE_FURTHER
- FOUNDER-STATED labels visible on all founder-provided inputs
- Sensitivity analysis tables present (collapsed by default)
- Freshness notice shown
- Memo stored to `investment_memos` table and retrievable by ID

**Definition of Done:**
- [ ] Breakeven COGS calculation verified: price $30, 15% referral, $4.50 FBA → breakeven COGS = $6.00 at 50% target
- [ ] Market verdict is deterministic and AI-generated text never overrides the verdict decision
- [ ] Founder verdict shown only when profile is present; never shown without it
- [ ] FOUNDER-STATED labels appear on every founder-provided input in the unit economics table
- [ ] COGS outlier detection triggers warning when founder COGS < 60% of benchmark low
- [ ] Sensitivity analysis shows which variable most affects verdict
- [ ] Win condition labeled with limitations (not presented as strategic certainty)
- [ ] All 10 memo sections present and populated
- [ ] Patent section carries mandatory disclaimer text
- [ ] Regulatory section scoped explicitly to US FDA
- [ ] Freshness notice states analysis date
- [ ] Memo readable without logging in (founder can share by URL, but only owner can generate)
- [ ] `npx tsc --noEmit` passes
- [ ] `npm run build` completes without errors

**What can be tested after M4:**
- Verdict correctness: construct a test case where all 8 BUILD_NOW conditions are met → verify BUILD_NOW
- Founder verdict upgrade: founder with `regulatory_experience: 'certified'` resolves regulatory override → founder verdict upgrades
- COGS sensitivity: enter founder COGS below benchmark → verify outlier warning fires
- Dual verdict divergence: construct case where market = VALIDATE_FURTHER but founder advantage upgrades to BUILD_NOW → verify divergence explanation appears
- Memo persistence: close and reopen memo URL → same content returned

---

## Dependency Map

### Provider → Metric → Consumer chain

```
EXTERNAL PROVIDERS
├── DataForSEO
│   ├── → Monthly Search Volume [primary_measurement] (#1)
│   │     consumed by: Data Quality Gate (demand_signals_confirmed +1)
│   │     consumed by: Demand Pool calculation (#44)
│   ├── → Search Volume Trend 24-month [primary_measurement] (#2)
│   │     consumed by: Seasonal Pattern detection (#6) [requires 2 annual cycles]
│   │     consumed by: Volume Change Rates (#3) [computed from #2]
│   └── → Top Buying-Intent Keywords [primary_measurement + estimated intent] (#4)
│         consumed by: Revenue Envelope demand pool (#44)
│
├── Google Trends (interestOverTime)
│   └── → Seasonal Pattern confirmation [primary_measurement] (#6)
│         consumed by: Data Quality Gate (demand_signals_confirmed +1)
│         [2 independent sources needed = DataForSEO + Google Trends]
│
├── Google Trends (interestByRegion)
│   └── → Geographic Demand Concentration [primary_measurement] (#5)
│         consumed by: Market Intelligence Briefing (display only)
│
├── TikTok (hashtag API)
│   └── → Social Demand Signal [primary_measurement] (#7)
│         consumed by: Market Intelligence Briefing (display only, labeled separately)
│         [NOT used in revenue envelope]
│
├── Apify (junglee/amazon-crawler)
│   ├── → Meaningful Competitor Count [primary_measurement] (#8)
│   │     consumed by: Data Quality Gate (competitor_products_found)
│   │     consumed by: Stage 2 evidence gate (minimum 5 required)
│   ├── → Price Distribution (min/p25/median/p75/max) [primary_measurement] (#9)
│   │     consumed by: Kill Switch #3 (ECONOMICS_STRUCTURALLY_BROKEN) — uses price floor (p25)
│   │     consumed by: Quick Economics Check (#25) — uses p25 and p75
│   │     consumed by: Unit Economics Engine (#34, #40-42)
│   ├── → Review Count Distribution [primary_measurement]
│   │     consumed by: Review Concentration Index (#11)
│   │     consumed by: Data Quality Gate (review_base_size)
│   ├── → Top Competitor Detail (ASIN, brand, reviews, rating, price, breadcrumb)
│   │     consumed by: Competitor Weakness / Win Condition (#52, #69)
│   │     consumed by: Review Collector (uses ASINs to fetch review text)
│   └── → Competitor Price (per product) [primary_measurement] (#34 per-competitor)
│         consumed by: Competitive Analysis section of memo
│
├── Keepa (bestsellers API)
│   ├── → Amazon Fee Structure (referral %, FBA fee) [primary_measurement] (#14, #35, #36)
│   │     consumed by: Kill Switch #3 (ECONOMICS_STRUCTURALLY_BROKEN)
│   │     consumed by: Quick Economics Check (#25)
│   │     consumed by: Breakeven COGS (#42)
│   ├── → Bestseller Revenue Signals (monthlySold, est. revenue) [provider_model] (#13, #30-33 revenue)
│   │     labeled: provider_model NOT primary_measurement
│   │     consumed by: Market Intelligence Briefing (labeled with full scope note)
│   │     NOT consumed by: Revenue Envelope (besteller data ≠ market data)
│   └── → Category Price History (24-month) [primary_measurement] (#63)
│         consumed by: Kill Switch #4 (COMMODITY_PRICE_COMPRESSION)
│         [Sample composition: only products present in BOTH windows]
│
├── Review Collector (Apify reviews)
│   └── → Review Text (raw, dated) [primary_measurement]
│         consumed by: Consumer Intelligence engine
│
├── Consumer Intelligence (AI analysis of review text)
│   ├── → Aggregated Complaint Themes [ai_synthesis] (#15)
│   │     consumed by: Cross-Product Complaint Validation (#17) [requires ≥2 products]
│   │     consumed by: Customer Voice section of briefing
│   │     consumed by: Stage 2 thesis differentiation sourcing
│   ├── → Complaint Frequency (% of negative reviews) [computed] (#16)
│   │     display rule: always show N of M, never percentage alone
│   └── → Verbatim Customer Language [primary_measurement] (#19)
│         consumed by: Thesis customer_pain field (verbatim quotes)
│
├── openFDA
│   └── → FDA Recalls and Warnings [primary_measurement] (#20)
│         consumed by: Kill Switch #2 (FDA_CLEARANCE_REQUIRED) [separate check]
│         consumed by: Risk Surface section of briefing
│
├── PubMed
│   └── → Scientific Support Trajectory [primary_measurement] (#22)
│         consumed by: Risk Surface section (supplement categories only)
│
├── GDELT + News APIs
│   └── → Category News Events [primary_measurement] (#21)
│         consumed by: Risk Surface section (major events only in v1)
│
└── USPTO Patent Search [to be integrated in M3]
    └── → Patent Landscape Flag [primary_measurement + ai_synthesis] (#49)
          consumed by: Kill Switch #1 (PATENT_BLOCKING)

INTERNAL COMPUTED / DETERMINISTIC
├── Data Quality Gate [computed] (#64)
│   inputs: all Stage 1 provider outputs
│   outputs: overall_grade, dimension_grades, pipeline_blocked
│   consumed by: Kill Switch engine (DATA_QUALITY_BELOW_THRESHOLD override)
│   consumed by: Verdict determination (DATA_QUALITY_BELOW_THRESHOLD override)
│   consumed by: Stage 2 evidence gate (blocks thesis generation)
│
├── Review Concentration Index [computed] (#11)
│   inputs: review counts from Apify (#8)
│   consumed by: Market structure display
│   replaces: Market Concentration top-3 revenue share (#10) — excluded
│
├── Volume Change Rates (3/6/12-month) [computed] (#3)
│   inputs: Search Volume Trend (#2)
│   consumed by: Market Intelligence Briefing
│
├── Category Price Compression [computed] (#63)
│   inputs: Keepa price history
│   consumed by: Kill Switch #4
│
├── COGS Benchmark Range [estimated] (#37)
│   inputs: Launch Threshold Table (C8)
│   consumed by: Kill Switch #3 (optimistic COGS)
│   consumed by: Unit Economics Market Baseline (#40)
│   consumed by: COGS outlier detection
│
├── Breakeven COGS [computed] (#42) ← PRIMARY UNIT ECONOMICS OUTPUT
│   inputs: Price Distribution p50 (#34), Amazon Fees (#14), target GM (50%)
│   formula: price × (1 - referral% - 0.50) - fba_fee
│   consumed by: Investment Memo Section 4 (the number founders take to manufacturers)
│
├── Gross Margin Range [computed] (#40, #41)
│   inputs: Price (#34), Fees (#35, #36), COGS range (#37 or #38)
│   consumed by: Kill Switch #3 (at optimistic COGS)
│   consumed by: Verdict determination (viable_economics condition)
│
├── Sensitivity Analysis [computed] (#70)
│   inputs: Unit Economics Model
│   consumed by: Investment Memo Section 4 (togglable tables)
│
├── Capital Fit Assessment [computed] (#26)
│   inputs: Launch Threshold (#63), Founder Capital (#54)
│   consumed by: Fit Layer (#26, Stage 2.5)
│   consumed by: Verdict (UNDERCAPITALIZED override)
│
├── Kill Switch Engine (4 switches) [computed] (#65-68)
│   inputs: #49 (patent), #50 (regulatory), #9+#14+#37 (economics), #63 (price compression)
│   consumed by: Adversarial Debate assembly
│   consumed by: Market Verdict determination
│   [AI CANNOT OVERRIDE THESE OUTPUTS]
│
├── Market Verdict [computed] (#71)
│   inputs: Kill switches, demand confirmation, economics, data quality, all BUILD_NOW conditions
│   consumed by: Investment Memo Section 10
│   [AI CANNOT GENERATE THIS — deterministic rule only]
│
└── Founder Verdict [computed] (#72)
    inputs: Market Verdict, Founder Profile, Fit Annotations
    consumed by: Investment Memo Section 10 (only when profile present)
    [AI CANNOT GENERATE THIS — deterministic rule only]

AI-SYNTHESIZED (clearly labeled, cannot override deterministic outputs)
├── Investment Theses (#24) — Stage 2, one AI call
├── Bull Case (#30) — Stage 3 Call 1, no context from Call 2
├── Bear Case (#31, #32) — Stage 3 Call 2, no context from Call 1, higher temperature
├── Debate Synthesis (#33 Unknowns) — Stage 3 Call 3, receives Call 1 + Call 2 output only
├── Win Condition per competitor (#69) — Stage 4, labeled with observable-data limitation
└── Investment Memo narrative — Stage 4, all claims must cite EvidencePoint IDs
```

### Execution Order and Parallelism

```
STAGE 1 — Data Collection
Phase 1A (all parallel, no dependencies):
  DataForSEO keywords
  Google Trends interestOverTime
  Google Trends interestByRegion
  Keepa bestsellers + price history
  TikTok hashtag signal
  openFDA recalls
  PubMed research trajectory
  GDELT news events

Phase 1B (sequential after Phase 1A — uses Apify for ASINs, then review collection):
  Apify Amazon search → collect competitor ASINs
  Review Collector (uses ASINs from Apify result)
  Consumer Intelligence analysis (uses review text from review collector)

Phase 1C (deterministic, after 1A + 1B complete):
  EvidencePoint adapter (wraps all provider outputs)
  Data Quality Gate
  Category Price Compression computation
  Review Concentration Index computation
  → Persist to market_signals table

GATE: If pipeline_blocked = true → STOP. Display reason. No further stages run.

STAGE 2 — Thesis Generation
Evidence gate check (deterministic) → if fails, STOP
AI synthesis call (one call) → parse theses → validate EvidencePoint citations
Quick economics check per thesis (deterministic arithmetic)
→ Persist to investment_theses table

STAGE 2.5 — Fit Layer (parallel across theses, sequential after Stage 2)
For each thesis:
  Capital fit assessment (deterministic)
  Experience gap assessment (deterministic)
  Channel fit assessment (deterministic)
  Timeline fit assessment (deterministic)
Sort theses by fit rank
→ Persist to founder_fit_annotations table

GATE: Founder selects one thesis to proceed

STAGE 3 — Adversarial Evaluation
Call 1 (Bull) and Call 2 (Bear) → PARALLEL (no shared context)
Wait for both to complete
→ Validate bear has kill shot; retry Call 2 once if missing
Call 3 (Synthesis) → receives Call 1 + Call 2 output only
Kill switch engine → runs AFTER Call 3 (deterministic, cannot be overridden)
→ Persist to adversarial_debates table

STAGE 4 — Investment Memo
Collect Stage 4 founder inputs (form)
Unit Economics Market Baseline (deterministic arithmetic) — parallel with:
Unit Economics Founder-Specific (deterministic arithmetic, uses founder inputs)
Win condition generation per top competitor (AI call)
Sensitivity Analysis (deterministic arithmetic)
Capital Plan calculation (deterministic)
Regulatory/IP surface classification (deterministic lookup)
Verdict determination:
  Market Verdict (deterministic) — depends on: kill switches, economics, demand signals, quality gate
  Founder Verdict (deterministic) — depends on: market verdict, fit annotations, founder profile
Investment Memo narrative (AI, sourced — final AI call in the pipeline)
→ Persist to investment_memos table
```

### Blocking Dependencies

```
[M1 required for M2]
market_signals table → investment_theses table
Stage 1 EvidencePoints → Stage 2 AI prompt (citations)
Data Quality Gate result → Stage 2 evidence gate check

[M2 required for M3]
investment_theses → adversarial_debates
Thesis EvidencePoints → Stage 3 AI calls
Keepa price history from M1 → Kill Switch #4

[M3 required for M4]
adversarial_debates → investment_memos
Kill switch results → Verdict determination
Debate unknowns → Validation agenda in memo

[Parallel within milestones]
M1: All Phase 1A providers run in parallel
M3: Bull and Bear AI calls run in parallel
M4: Market baseline and Founder-specific unit economics run in parallel

[Founder profile is independent]
Founder profile can be created or updated at any time
Stage 2.5 re-runs on profile update (no re-fetch of Stage 1 data)
Stage 4 founder verdict re-computes on profile update
```

### Metrics excluded from implementation

Per METRIC_VALIDATION_TABLE v1 decisions — do not implement, do not reference in code:

| Metric | Reason |
|--------|--------|
| Market concentration — top-3 revenue share (#10) | Mathematically wrong; replaced by Review Concentration Index (#11) |
| Average rating across category (#12) | Misleading without understanding of review solicitation; no decision value |
| Estimated category units/month (#13) | Bestseller sample ≠ market total; the most misleading metric in the system |
| Multi-region regulatory assessment (#51) | v2 only; display explicit scope limitation in v1 |
| AI-generated market size | Prohibited entirely — never appears in any form |
| Calibrated confidence percentages | No historical outcome data for calibration |
| Composite scores blending verified and synthesized data | Hides data quality of components |
| Single gross margin point estimate | Must always be shown as a range |
| Single revenue point estimate | Must always be shown as a range with all assumptions visible |

---

*This roadmap is the implementation gate. No component should be built until its dependencies are in place. No metric should be implemented until its row in METRIC_VALIDATION_TABLE.md is confirmed for v1. Changes to this roadmap that affect the spec's data models or decision logic require explicit review against PRODUCT_SPEC.md.*
