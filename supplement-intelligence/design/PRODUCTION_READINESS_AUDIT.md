# Production Readiness Audit — Intelligence Lab
**Date:** 2026-07-01  
**Sample:** 68 production analyses (all-time)  
**Audit scope:** Every data source, API integration, parser, and calculation pipeline

---

## Executive Summary

The platform has **two critical billing/configuration failures** that collectively eliminate 3 major data signals and reduce overall real-data coverage to ~30%. Four code-level bugs cause further degradation. After fixing all identified issues, projected coverage rises from ~30% to ~85–90%, with the remaining gap requiring Apify plan upgrade (billing).

---

## Data Coverage Report — Current State

| Module | Coverage | Count | Root Cause |
|---|---|---|---|
| Signal Evidence (any) | **32.4%** | 22/68 | Keepa only; legacy analyses lacked signal engine |
| Keyword Intelligence | **4.4%** | 3/68 | DataForSEO only recently wired; not in legacy |
| News Intelligence | **23.5%** | 16/68 | openFDA/PubMed/GDELT all work; legacy skipped |
| Consumer Intelligence | **17.6%** | 12/68 | Depends on Apify; billing exhausted for v2 |
| Manufacturing Estimate | **0.0%** | 0/68 | Lazy-loaded on-demand only — never in generate |
| TikTok / Virality | **0.0%** | 0/68 | Hashtag candidate generation bug |
| Google Trends (signal) | **0.0%** | 0/4 v2 | Query too specific for GT (< 8 data points) |
| Apify Competition | **0.0%** | 0/4 v2 | **Apify $29/month hard limit exceeded** |
| Competitor Verified | **5.9%** | 4/68 | Depends on Apify (same billing issue) |
| Score: any real data | **54.4%** | 37/68 | Keepa works; all else missing in legacy |
| Score: 2+ providers | **25.0%** | 17/68 | Apify + Keepa combo (pre-billing exhaustion) |
| Scoring v2.0.0 | **5.9%** | 4/68 | New engine deployed 2026-06-29 only |

### Provider Contribution (all-time)
| Provider | Contribution Rate |
|---|---|
| Keepa | 52.9% (36/68) |
| Apify (Amazon search) | 20.6% (14/68) |
| Google Trends | 10.3% (7/68) |
| TikTok | 0.0% — zero contributions ever |
| DataForSEO (via signal) | 0.0% — keyword engine, not signal engine |
| Reddit | 0.0% — credentials not configured |
| Alibaba | 0.0% — credentials not configured |
| Manufacturing AI | 0.0% — on-demand endpoint only |

---

## Root Cause Analysis — Every Gap

### CRITICAL-1: Apify Hard Limit Exceeded (BILLING)
- **Affected modules:** Competition Intelligence, Consumer Intelligence, Competitor Verification
- **Coverage impact:** 3 full signals eliminated → 0% Apify data in all v2 analyses
- **Root cause:** `junglee~amazon-crawler` is a PAID actor billed per event (~$1/run). The Apify STARTER plan ($29/mo) was exhausted this month: `PAID_ACTORS_PER_EVENT: $29.20/29.00`
- **Evidence:** Direct API call returns `{ "type": "platform-feature-disabled", "message": "Monthly usage hard limit exceeded" }`
- **Fix required:** Upgrade Apify plan to Growth ($49/mo) or switch to free/lower-cost actor

### CRITICAL-2: TikTok Hashtag Generation Bug (CODE)
- **Affected modules:** Virality signal, TikTok scoring dimension
- **Coverage impact:** 0% virality data in all 68 analyses
- **Root cause:** `toHashtagCandidates()` in `lib/signal-engine/providers/tiktok.ts` generates duplicate candidates for product names that end in non-generic words. Example: "Collagen Peptide Gummies for Skin" → both candidates = `collagenpeptidegummiesforskin` (hashtag doesn't exist). `GENERIC_TAIL` only strips from the end, so "for" and "skin" block any shortening.
- **Evidence:** Live test confirms `#collagenpeptidegummiesforskin` → no statsV2 (NO_DATA), but `#collagenpeptidegummies` → 186 videos / 571K views (VERIFIED), `#collagen` → 3.9M videos / 25.6B views (VERIFIED)
- **Fix:** Add more candidate strategies: first-word-only, first-two-words, "for X" clause stripping

### HIGH-1: Google Trends Query Too Specific (CODE)
- **Affected modules:** Demand trend signal, growth signal
- **Coverage impact:** 0% Google Trends contribution in v2 analyses (was 10% in legacy with shorter category names)
- **Root cause:** Specific product names ("Collagen Peptide Gummies for Skin") return < 8 data points in Google Trends → `valid.length < 8` threshold → returns null. `toSearchKeyword()` only strips "supplement(s)" — no broader fallbacks.
- **Evidence:** Google Trends IS working (live test: "collagen gummies" → 53 data points). It's the input query that's too specific.
- **Fix:** Add progressive query broadening, same pattern DataForSEO already uses (strip "for X", try first 2 words, try just key ingredient)

### HIGH-2: Manufacturing Coverage 0% (DESIGN)
- **Affected modules:** Manufacturing Feasibility scoring dimension, Profitability COGS margin sub-signal
- **Coverage impact:** 0% manufacturing data — Profitability composite never has COGS Margin sub-signal
- **Root cause:** Manufacturing is lazy-loaded on-demand via `/api/manufacturing` endpoint, intentionally not triggered during `/api/generate` to keep latency manageable. Manufacturing estimate is never attached to stored analyses.
- **Code evidence:** `lib/scoring.ts` comment: "NOT YET populated by app/api/generate/route.ts — manufacturing is currently fetched lazily, on-demand, from the Manufacturing tab"
- **Fix options:** (a) Trigger manufacturing fetch async during generate (fire-and-forget, attach when complete), (b) Pre-warm manufacturing on memo page load via client fetch, (c) Accept 0% as design decision

### MEDIUM-1: Consumer Intelligence Depends on Apify (DEPENDENCY)
- **Affected modules:** Consumer Intelligence, customer_language prompt grounding
- **Coverage impact:** Self-resolves when Apify billing fixed (CRITICAL-1)
- **Root cause:** `consumerIntelligencePromise` only fires if `topCompetitors?.length > 0`, which requires `signals?.review_velocity?.value.top_competitors` — only populated when Apify competition succeeds
- **Code:** `app/api/generate/route.ts` line 498: `const topCompetitors = signals?.review_velocity?.value.top_competitors`

### MEDIUM-2: Reddit Credentials Missing (CONFIGURATION)
- **Affected modules:** Demand/pain-point signal for supplements
- **Coverage impact:** Reddit supplements signal never runs
- **Root cause:** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` not in `.env.local`
- **Note:** Reddit provider is also currently gated to `categoryId === 'supplements'` only

### LOW-1: Alibaba Credentials Missing (CONFIGURATION)
- **Affected modules:** Manufacturing Intelligence alternative provider
- **Coverage impact:** Alibaba never tried; AI fallback fills with qualitative-only data
- **Root cause:** `ALIBABA_APP_KEY` and `ALIBABA_APP_SECRET` not configured

### LOW-2: Alibaba MOQ Hardcoded Fallback (DATA QUALITY)
- **File:** `lib/manufacturing-engine/providers/alibaba.ts`, line 92-95
- **Issue:** When no real MOQ data is found, code returns `{ low: 500, high: 2000, unit: 'units' }` — a hardcoded guess that violates the "real data or null" rule
- **Fix:** Return `undefined` instead of fabricated numbers

### LOW-3: Amazon Ads + Meta Ads are Stubs (NOT IMPLEMENTED)
- **Files:** `lib/signal-engine/providers/amazon-ads.ts`, `lib/signal-engine/providers/meta-ads.ts`
- Both have `enabled = false` hardcoded, always return null
- No credentials defined, no implementation
- **Impact:** 0% ad intelligence — documented, not broken

---

## Prioritized Remediation Plan

| Priority | Issue | Action | Owner | Effort | Expected Impact |
|---|---|---|---|---|---|
| P0 | Apify billing exhausted | Upgrade to Growth plan ($49/mo) | Owner | 5 min | +20pp competition coverage, +17pp consumer intel |
| P0 | TikTok hashtag bug | Fix `toHashtagCandidates()` — add first-word, first-2-word, "for X" strip strategies | Code | 2h | +~60% virality coverage |
| P1 | Google Trends too specific | Add progressive query broadening to GT provider | Code | 1h | +~40pp demand trend coverage |
| P1 | Alibaba MOQ hardcoded | Return `undefined` instead of `{low:500,high:2000}` | Code | 15 min | Data integrity |
| P2 | Reddit credentials | Add REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET to env | Owner | 1h setup | +supplements demand signal |
| P2 | Manufacturing 0% | Trigger during generate (async fire-and-forget) | Code | 3h | +manufacturing feasibility scoring |
| P3 | Alibaba credentials | Configure ALIBABA_APP_KEY + ALIBABA_APP_SECRET | Owner | 2h setup | +manufacturing alternative path |
| P3 | Consumer intelligence blocking | Add fallback path: run consumer intel with public Amazon search if Apify fails | Code | 4h | Resilience |

---

## Target Coverage After Fixes

| Module | Current | After P0 fixes | After all fixes |
|---|---|---|---|
| Signal Evidence (any) | 32% | 32% | 85%+ |
| TikTok / Virality | 0% | 0% | 65%+ |
| Google Trends | 0% | 0% | 55%+ |
| Apify Competition | 0% | 20%+ | 20%+ |
| Consumer Intelligence | 0% | 15%+ | 15%+ |
| Keyword Intelligence | 4% | 4% | 75%+ |
| Manufacturing | 0% | 0% | 15%+ |
| **Overall real-data score** | **32%** | **40%** | **85–90%** |

---

## Immediate Code Fixes (in this PR)

1. ✅ TikTok hashtag candidate generation — more fallback strategies
2. ✅ Google Trends query broadening
3. ✅ Alibaba MOQ hardcoded fallback → return null

## Required Owner Actions

1. 🔴 Apify plan upgrade ($49/mo Growth) — at https://console.apify.com/billing
2. 🟡 Reddit OAuth app setup — at https://www.reddit.com/prefs/apps
3. 🟡 Alibaba OpenPlatform API credentials — at https://developer.alibaba.com
