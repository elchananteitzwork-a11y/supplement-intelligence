# KEEPA INTEGRATION PLAN
## Amazon Product Opportunity Intelligence System — Data Layer v0.5.0
**Status:** Planning
**Created:** 2026-06-03
**Depends on:** PROJECT_STATUS.md — v0.5.0 roadmap item

---

## Why Keepa

Every score the current system produces is an estimate. The single biggest upgrade available is replacing estimated BSR, review counts, price history, and seller counts with **real historical data from Keepa** — the industry-standard Amazon product data provider.

Keepa tracks over 4 billion Amazon products across 21 marketplaces and stores the full time-series history of:
- Sales Rank (BSR) — updated multiple times per day
- Price (Amazon, third-party, new, used, Buy Box)
- Review count and rating
- Seller count
- Product availability

This data transforms the system from a reasoning framework into a data-verified intelligence engine.

**Confidence impact:** Average metric confidence moves from **~48/100 (estimated)** to **~85/100 (data-verified)** for all metrics where Keepa has historical records.

---

## What Keepa Provides (Relevant to This System)

| Data Type | Keepa Field | Current System Status | Post-Integration Status |
|-----------|------------|----------------------|------------------------|
| BSR history (90-day, 1-year) | `csv[3]` | ⚠️ Estimated from benchmarks | ✅ Real time-series |
| BSR current value | `csv[3][-1]` | ⚠️ Estimated | ✅ Live |
| Review count history | `csv[16]` | ⚠️ Estimated | ✅ Real growth curve |
| Rating history | `csv[17]` | ⚠️ Estimated | ✅ Real |
| Amazon price history | `csv[0]` | ⚠️ Estimated range | ✅ Full price timeline |
| Third-party price history | `csv[2]` | ⚠️ Estimated range | ✅ Full price timeline |
| Buy Box price history | `csv[18]` | Not tracked | ✅ New signal |
| Seller count history | `csv[19]` | ⚠️ Estimated | ✅ Real count per day |
| New offer count | `csv[11]` | ⚠️ Estimated | ✅ Real |
| Product dimensions / weight | `data.packageHeight`, etc. | ⚠️ Estimated for FBA fees | ✅ Exact FBA tier |
| Category rank | `categories` | ⚠️ Estimated | ✅ Real sub-category ranks |
| ASIN list by category | Best Sellers API | Not available | ✅ Full category sweep |
| Lightning deal history | `csv[9]` | Not tracked | ✅ New signal |

---

## Keepa API Architecture

### Authentication
All requests authenticate via a single API key passed as a query parameter:
```
?key=YOUR_API_KEY
```
API keys are per-account and rate-limited by token balance.

### Token System
Keepa uses a **token-based quota system**. Tokens regenerate over time based on subscription tier. Each API request costs tokens proportional to the data retrieved.

| Request Type | Token Cost (approx.) |
|---|---|
| Product lookup (basic, no history) | 1 token |
| Product lookup with 90-day history | 5–10 tokens |
| Product lookup with full history | 15–25 tokens |
| Category best sellers list | 50–100 tokens |
| Seller lookup | 1–5 tokens |
| Deals endpoint | 1–5 tokens |

### Base URL
```
https://api.keepa.com/
```

### Response Format
All responses return JSON. Price values are stored in Keepa's format:
- Prices are in **cent-equivalents** (divide by 100 for USD)
- `-1` means "not available" for that data point
- Time values are **Keepa minutes** (minutes since 2011-01-01 00:00:00 UTC)

A **Keepa minutes to timestamp converter** must be built into the data fetcher before any downstream agent can use time-series data.

---

## Required API Endpoints

### Endpoint 1: Product Lookup
```
GET /product?key=KEY&domain=1&asin=ASIN&stats=90&history=1
```
**Purpose:** Fetch full product data for a single ASIN including 90-day price/BSR/review history.

**Parameters:**
| Parameter | Value | Purpose |
|-----------|-------|---------|
| `domain` | `1` | Amazon US (1=US, 2=UK, 3=DE, 4=FR, 5=JP, 6=CA, 7=CN) |
| `asin` | ASIN string or comma-separated list (up to 100) | Products to fetch |
| `stats` | `90` or `365` | Statistics window in days |
| `history` | `1` | Include full CSV time-series history |
| `rating` | `1` | Include rating and review history |
| `offers` | `20` | Include top N live offers |
| `only-live-offers` | `1` | Filter to live offers only |
| `update` | `0` | Don't force refresh (use cached) |

**Key response fields used by this system:**
```
product.title              → product name
product.categoryTree       → full category path
product.rootCategory       → root category for FBA fee lookup
product.packageHeight/Width/Length/Weight → exact FBA size tier
product.csv[0]             → Amazon price history array
product.csv[2]             → Third-party new price history
product.csv[3]             → Sales Rank (BSR) history ← most important
product.csv[11]            → New offer count history (seller count proxy)
product.csv[16]            → Review count history
product.csv[17]            → Rating history
product.csv[18]            → Buy Box price history
product.csv[19]            → Seller count history (if available)
product.stats.current[3]   → Current BSR
product.stats.avg90[3]     → 90-day average BSR
product.stats.min90[3]     → 90-day BSR low (peak demand)
product.stats.avg90[16]    → 90-day average review count
product.stats.delta90[16]  → Review count change in 90 days (velocity)
```

---

### Endpoint 2: Best Sellers by Category
```
GET /bestsellers?key=KEY&domain=1&category=CATEGORY_NODE_ID
```
**Purpose:** Get the top ~100 ASINs currently ranked in a category's Best Seller list.

**How we use it:** To identify the full competitive set for a niche, rather than relying on keyword search results. Feed the resulting ASIN list to Endpoint 1 for bulk product lookup.

**Parameters:**
| Parameter | Value | Purpose |
|-----------|-------|---------|
| `domain` | `1` | Amazon US |
| `category` | node ID (e.g. `289913`) | Category to query |

**Key response fields:**
```
bestSellersList.asinList   → array of up to 100 ASINs
bestSellersList.lastUpdate → timestamp of last list update
```

---

### Endpoint 3: Category Lookup
```
GET /category?key=KEY&domain=1&category=CATEGORY_NODE_ID&parents=1
```
**Purpose:** Resolve a category node ID to its full name, parent chain, and sibling categories.

**How we use it:** Map product category names to Keepa node IDs, and find the correct Best Sellers list to query. Also retrieves subcategory structure for market sizing.

---

### Endpoint 4: Seller Lookup
```
GET /seller?key=KEY&domain=1&seller=SELLER_ID
```
**Purpose:** Retrieve seller profile including feedback count, rating, storefront ASIN count, and account age.

**How we use it:** Feed into `small-seller-success-detector` to verify whether a seller is genuinely small (low feedback count, small catalogue) vs. an established operation using a new brand.

**Key response fields:**
```
seller.name                → storefront name
seller.feedbackCount       → total lifetime feedback (seller size proxy)
seller.rating              → seller rating
seller.asinList            → ASINs sold by this seller (catalogue size)
seller.totalStorefrontAsins → catalogue size number
```

---

### Endpoint 5: Deals Feed
```
GET /deals?key=KEY&domain=1&selection=JSON_SELECTION_OBJECT
```
**Purpose:** Find products with recent significant price drops, Lightning Deals, or coupon activity.

**How we use it:** Identify products with aggressive PPC/coupon promotional patterns (a launch signal) and detect price instability in a niche (a margin risk signal).

---

## Data Flow Diagram

```
User runs: /product-hunt "dog lick mats"
                │
                ▼
┌───────────────────────────────────────────┐
│         KEEPA-DATA-FETCHER AGENT          │
│                                           │
│  1. Resolve niche → Category Node ID      │
│     (via /category endpoint)              │
│                                           │
│  2. Fetch top 100 ASINs in category       │
│     (via /bestsellers endpoint)           │
│                                           │
│  3. Bulk fetch all 100 products           │
│     in batches of 100 ASINs               │
│     (via /product endpoint, stats=90)     │
│                                           │
│  4. Fetch seller data for top 20          │
│     sellers found on page 1               │
│     (via /seller endpoint)                │
│                                           │
│  5. Normalize all timestamps              │
│     (Keepa minutes → Unix timestamps)     │
│                                           │
│  6. Normalize all prices                  │
│     (Keepa cents → USD)                   │
│                                           │
│  7. Write to local cache                  │
│     keepa_cache/{niche_slug}.json         │
└───────────────┬───────────────────────────┘
                │
                │  Structured data objects
                │  passed to all downstream agents
                ▼
┌───────────────────────────────────────────┐
│            BSR-TREND-ANALYZER             │
│                                           │
│  Input: csv[3] BSR history arrays         │
│                                           │
│  Computes:                                │
│  • 30 / 90 / 365-day BSR averages         │
│  • BSR trend slope (improving/declining)  │
│  • BSR volatility (stable vs. spiking)    │
│  • Estimated monthly units (BSR→sales     │
│    conversion using category multipliers) │
│  • Demand velocity: Accelerating/         │
│    Stable/Decelerating                    │
│                                           │
│  Replaces: all demand_score estimates     │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│         REVIEW-VELOCITY-TRACKER           │
│                                           │
│  Input: csv[16] review count history      │
│         seller data from /seller          │
│                                           │
│  Computes:                                │
│  • Reviews/month rate per product         │
│  • Review age (time to reach current      │
│    count → listing age estimate)          │
│  • Small seller tier classification       │
│    (<100 / <500 / <1,000 real numbers)    │
│  • Review-to-Revenue Efficiency           │
│    (verified, not estimated)              │
│  • Seller catalogue size (real)           │
│                                           │
│  Replaces: all small_seller estimates     │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│         PRICE-HISTORY-ANALYZER            │
│                                           │
│  Input: csv[0] Amazon price history       │
│         csv[2] 3P price history           │
│         csv[18] Buy Box price history     │
│                                           │
│  Computes:                                │
│  • 90-day price range (real min/max)      │
│  • Price stability score                  │
│  • Price compression detection (real)     │
│  • Buy Box win rate (PL friendliness)     │
│  • Promotional pricing patterns           │
│    (launch coupon signals)                │
│  • Average selling price (verified)       │
│                                           │
│  Replaces: all price range estimates      │
└───────────────┬───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────┐
│        EXISTING 12-AGENT PIPELINE         │
│    (now receiving verified data objects   │
│     instead of making estimates)          │
│                                           │
│  amazon-demand-analyzer   ← BSR data      │
│  competition-analyzer     ← review data   │
│  small-seller-detector    ← seller data   │
│  profit-analyzer          ← price data    │
│  opportunity-size         ← sales data    │
│  [other agents unchanged]                 │
└───────────────┬───────────────────────────┘
                │
                ▼
        product-opportunity-ranker
        (writes 4 output files)
```

---

## New Agents Required

### Agent 1: keepa-data-fetcher

**Role:** Sole API communication layer. All Keepa API calls flow through this agent. No other agent ever calls the Keepa API directly.

**Responsibilities:**
- Resolve niche keyword → Amazon category node ID
- Fetch Best Sellers ASIN list for the category
- Bulk fetch product data for up to 100 ASINs per request
- Fetch seller profiles for top-20 sellers
- Handle rate limiting — pause when token balance is low
- Convert all Keepa timestamps to standard Unix timestamps
- Convert all Keepa price values to USD
- Write full response to local cache: `keepa_cache/{niche_slug}_{date}.json`
- Return a normalized data object to downstream agents

**Cache behavior:**
- Cache is valid for 24 hours (BSR data updates multiple times daily but daily granularity is sufficient for research)
- If cache exists and is < 24 hours old, skip API calls and serve from cache
- Cache prevents redundant API calls when re-running analysis on same niche

**Error handling:**
- Token exhaustion: report token balance and pause gracefully
- ASIN not found: skip and log
- Rate limit exceeded: back off with exponential retry

**Inputs:** `niche: string`, `marketplace: string (default "US")`
**Outputs:** Normalized data object with all products' full histories

---

### Agent 2: bsr-trend-analyzer

**Role:** Converts raw BSR time-series data into demand signals and sales estimates.

**Responsibilities:**
- Calculate BSR 30-day, 90-day, and 365-day rolling averages
- Determine BSR trend direction: Improving (BSR decreasing) / Stable / Declining (BSR increasing)
- Measure BSR volatility: identifies products with spiking vs. steady BSR (spike = promotional / unreliable)
- Convert BSR to estimated monthly unit sales using category-specific multipliers
- Classify demand velocity: Accelerating / Stable / Decelerating (from slope of 90-day trend)
- Identify seasonal patterns: flag products where BSR degrades significantly outside peak months

**BSR → Monthly Sales Conversion Model:**
Uses published BSR-to-sales conversion tables as a basis, adjusted per category:
- BSR 1–100: ~3,000–15,000 units/month (top tier)
- BSR 100–500: ~1,000–3,000 units/month
- BSR 500–2,000: ~300–1,000 units/month
- BSR 2,000–10,000: ~50–300 units/month
- BSR 10,000–50,000: ~5–50 units/month
- BSR > 50,000: < 5 units/month

Note: These conversion rates vary significantly by category — kitchen products convert differently than electronics. Category-specific calibration coefficients should be added in v1.0.

**Inputs:** BSR history arrays from keepa-data-fetcher
**Outputs:** `demand_score` (verified), `monthly_sales_estimate` (verified), `demand_velocity_trend` (verified), `bsr_volatility`

---

### Agent 3: review-velocity-tracker

**Role:** Converts raw review count history into small-seller accessibility signals and verified competition data.

**Responsibilities:**
- Calculate review velocity per product: reviews gained per month (from history delta)
- Estimate listing age from review history start point
- Classify each product into small seller tiers (<100 / <500 / <1,000) using real current counts
- Calculate time-to-current-review-count (how long it took each seller to accumulate their reviews)
- Verify seller size using /seller API data (feedback count, catalogue size)
- Calculate Review-to-Revenue Efficiency for each small seller found: `monthly_revenue / review_count`
- Build verified tier analysis with real monthly sales (from bsr-trend-analyzer)

**Inputs:** Review history arrays + seller data from keepa-data-fetcher; monthly sales from bsr-trend-analyzer
**Outputs:** `small_seller_opportunity_score` (verified), tier breakdown (verified), `review_to_revenue_efficiency` (verified)

---

### Agent 4: price-history-analyzer

**Role:** Converts raw price time-series into margin, stability, and competition signals.

**Responsibilities:**
- Calculate verified 90-day price range (real min, real max, real average)
- Detect price compression: if price band < $3 over 90 days = compressed
- Calculate price stability score: standard deviation of prices over 90 days
- Identify promotional periods: flag products with significant price drops (coupons / Lightning Deals)
- Determine Buy Box control: % of time Amazon vs. third-party sellers hold the Buy Box
- Flag race-to-the-bottom dynamics: if price trend is consistently declining over 90 days
- Provide real average selling price for profit model input

**Inputs:** Price history arrays (Amazon, 3P, Buy Box) from keepa-data-fetcher
**Outputs:** Verified `price_range`, `price_compression`, `avg_selling_price`, `price_stability_score`, `buy_box_ownership_pct`

---

## Changes Needed to Existing Scoring Engine

### Agents That Receive Verified Inputs (No Logic Change Required)

| Agent | Current Input | Post-Integration Input |
|-------|--------------|----------------------|
| `amazon-demand-analyzer` | Estimates BSR, ad density | Receives verified BSR from bsr-trend-analyzer; still estimates ad density (not in Keepa) |
| `competition-analyzer` | Estimates avg reviews, review distribution | Receives real review counts per product from review-velocity-tracker |
| `small-seller-success-detector` | Estimates tier counts and sales | Receives verified tier counts and monthly sales from review-velocity-tracker |
| `profit-opportunity-analyzer` | Estimates selling price, uses benchmark COGS | Receives verified avg selling price from price-history-analyzer; COGS still estimated |
| `opportunity-size-analyzer` | Estimates total category monthly sales | Receives real monthly sales aggregated from bsr-trend-analyzer |

### Score Calculation Changes

**Demand Score** — logic update required:
- Add BSR trend slope weighting: product with improving BSR over 90 days gets +5–10 point bonus
- Add BSR volatility penalty: high-volatility BSR (promotional spikes) gets −5–10 point penalty
- Remove reliance on autocomplete variant count estimation (still useful as supplementary signal)

**Competition Score** — logic update required:
- Replace estimated avg_reviews_page1 with real average from review data
- Replace estimated review distribution tiers with real counts
- New signal: seller count trend from csv[19] — if seller count is rising, market is attracting entrants (growing) vs. falling (consolidating)

**Profit Score** — logic update required:
- Replace estimated selling price with verified 90-day average from price-history-analyzer
- New signal: price stability as a margin reliability multiplier — unstable prices = less reliable margin projection
- FBA fees can now be calculated exactly using real product dimensions from Keepa

**Confidence Score System** — new field required on every metric:
Each metric should now report: `{ value: 82, confidence: 91, source: "keepa_verified" }` vs. `{ value: 82, confidence: 45, source: "estimated" }`. This makes the transparency audit from v0.4.0 automated rather than manual.

### Fields Not Covered by Keepa (Still Estimated Post-Integration)

| Metric | Why Keepa Doesn't Cover It | Alternative |
|--------|---------------------------|------------|
| Ad density / CPC | Amazon Advertising data, not product data | Amazon Advertising API (separate) |
| Patent risk | IP database, not retail | USPTO API (Phase 2) |
| TikTok virality | Social media data | TikTok Research API (Phase 3) |
| Supplier COGS | Manufacturing data | Alibaba API (Phase 4) |
| Reddit community signals | Forum data | Reddit API (Phase 3) |
| Amazon gating status | Seller Central, not public | Manual verification or Seller Central API |

---

## Cost Estimates

### Keepa Subscription Tiers

| Plan | Price | Tokens/Day | Tokens/Month | Best For |
|------|-------|-----------|-------------|---------|
| Free | $0 | ~100 | ~3,000 | Testing only — insufficient for production |
| Keepa Researcher | ~$19/month | 1,250 | ~37,500 | 1–2 analyses per day |
| Keepa Developer | ~$79/month | 5,000+ | ~150,000 | 5–10 analyses per day |
| Enterprise | Custom | Unlimited | Unlimited | High-volume production |

### Token Cost Per Analysis Run

| Operation | API Calls | Tokens Used |
|-----------|-----------|------------|
| Category lookup (1 category) | 1 | ~5 tokens |
| Best Sellers fetch (100 ASINs) | 1 | ~50 tokens |
| Bulk product fetch (100 products × 90-day history) | 1–2 | ~500–800 tokens |
| Seller lookup (top 20 sellers) | 20 | ~40–100 tokens |
| **Total per 100-product analysis** | **~25 calls** | **~600–950 tokens** |

### Cost Per Analysis at Each Tier

| Plan | Tokens/Day | Analyses/Day | Monthly Cost | Cost Per Run |
|------|-----------|-------------|-------------|-------------|
| Researcher ($19/mo) | 1,250 | ~1–2 full runs | $19 | ~$0.63–$1.27 |
| Developer ($79/mo) | 5,000+ | ~5–8 full runs | $79 | ~$0.33–$0.53 |
| Enterprise | Unlimited | Unlimited | Custom | Near zero |

### Total Monthly Cost Projections

| Usage Level | Analyses/Month | Keepa Plan | Monthly Cost |
|------------|---------------|-----------|-------------|
| Light (personal use) | 10–20 | Researcher | ~$19 |
| Medium (regular research) | 30–60 | Developer | ~$79 |
| Heavy (agency / team) | 100+ | Enterprise | TBD |

### One-Time Implementation Cost Estimate

| Task | Estimated Hours | Notes |
|------|----------------|-------|
| keepa-data-fetcher development | 6–8 hours | API integration, caching, normalization |
| bsr-trend-analyzer development | 4–5 hours | BSR→sales model, trend calculations |
| review-velocity-tracker development | 4–5 hours | Review history processing |
| price-history-analyzer development | 3–4 hours | Price statistics |
| Scoring engine updates (4 agents) | 4–6 hours | Wire new inputs into existing agents |
| Confidence score system | 2–3 hours | Add confidence field to all metrics |
| Testing and calibration | 4–6 hours | Validate against known products |
| **Total** | **27–37 hours** | |

---

## Implementation Phases

### Phase 1 — Foundation (Week 1–2)
**Goal:** Get real data flowing. Replace estimated BSR and prices with verified Keepa data.

**Deliverables:**
1. Create `keepa-data-fetcher` agent with full authentication, rate limiting, and caching
2. Implement Keepa timestamp and price normalizers
3. Implement batch ASIN lookup (100 products in one API call)
4. Integrate `/bestsellers` endpoint to auto-identify the competitive ASIN set
5. Write `keepa_cache/{slug}_{date}.json` to disk

**Definition of done:** Running `/product-hunt "dog lick mats"` fetches 100 real ASINs from Keepa and writes a cache file with full product histories.

**Token budget:** ~800 tokens per test run. Test with Researcher plan.

---

### Phase 2 — Demand and Competition (Week 3)
**Goal:** Replace the two highest-impact estimated scores with verified data.

**Deliverables:**
1. Create `bsr-trend-analyzer` agent with full BSR→sales conversion model
2. Implement 30/90/365-day BSR averaging and trend slope calculation
3. Create `review-velocity-tracker` agent with real tier classification
4. Update `amazon-demand-analyzer` to accept verified BSR inputs
5. Update `competition-analyzer` to accept verified review count inputs
6. Update `small-seller-success-detector` to accept verified tier inputs

**Verification test:** Run analysis on a known product (e.g., a well-reviewed bestseller) and confirm the output monthly sales estimate matches publicly known benchmarks.

---

### Phase 3 — Pricing and Margins (Week 4)
**Goal:** Replace estimated selling prices with verified price history.

**Deliverables:**
1. Create `price-history-analyzer` agent with full price statistics
2. Detect price compression and buy box dynamics from real data
3. Update `profit-opportunity-analyzer` to use verified selling price
4. Recalibrate profit score thresholds against real-world data
5. Add exact FBA fee calculation using real product dimensions from Keepa

**Verification test:** Check that calculated margins match actual seller P&L estimates from public case studies.

---

### Phase 4 — Confidence Scoring System (Week 5)
**Goal:** Every metric reports its own confidence level and data source.

**Deliverables:**
1. Add `{ value, confidence, source }` structure to all metric outputs
2. Sources: `"keepa_verified"` / `"partially_verified"` / `"estimated"`
3. Add system-level confidence summary to all 4 output files
4. Update `product-opportunity-report.md` template to show confidence per metric
5. Update `product-ranking.json` schema to include confidence fields

**Output example:**
```
"demand_score": {
  "value": 82,
  "confidence": 88,
  "source": "keepa_verified",
  "basis": "90-day BSR average 4,200; improving trend slope -12/day"
}
```

---

### Phase 5 — Calibration and Accuracy Testing (Week 6)
**Goal:** Validate the system's output against real-world outcomes.

**Deliverables:**
1. Run the system against 10 products with publicly known sales data (documented case studies)
2. Compare Master Opportunity Score to actual product performance
3. Adjust BSR→sales conversion coefficients per category if needed
4. Adjust score weighting if any metrics show low predictive correlation
5. Document calibration results in a `CALIBRATION_LOG.md`

**Success criteria:** Predicted monthly sales within ±30% of verified sales for at least 7/10 test products.

---

### Phase 6 — Production Hardening (Week 7–8)
**Goal:** System is reliable enough for daily commercial use.

**Deliverables:**
1. Token balance monitoring: alert when balance drops below 200 tokens
2. Automatic cache invalidation after 24 hours
3. Graceful degradation: if Keepa API is unavailable, fall back to estimation mode with reduced confidence scores
4. Error logging for failed ASIN lookups
5. Add `keepa_integration_status` field to `PROJECT_STATUS.md` (this file)

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Keepa API pricing changes | Medium | Medium | Monitor; cache aggressively to reduce token burn |
| BSR→sales conversion accuracy varies by category | High | Medium | Build per-category calibration coefficients in Phase 5 |
| Rate limiting during bulk analysis | Medium | Low | Batch requests to 100 ASINs max; cache results |
| Category node ID mapping is wrong | Medium | High | Build lookup verification step in keepa-data-fetcher |
| Products with < 30-day BSR history (new listings) | High | Low | Flag as "insufficient history" and fall back to estimated signals |
| Keepa data gaps (BSR = -1) | Medium | Low | Interpolate or exclude from averages |

---

## What This Integration Does NOT Solve

Keepa is the highest-ROI integration available, but it does not cover:

| Gap | Still Needs |
|-----|------------|
| CPC / PPC bid costs | Amazon Advertising API (separate plan) |
| Keyword search volume | Helium 10 Magnet or similar |
| Patent risk | USPTO API integration (Phase 2 roadmap) |
| TikTok virality data | TikTok Research API |
| Supplier COGS and MOQ | Alibaba API or manual research |
| Amazon gating status | Manual Seller Central check |

These are addressed in subsequent roadmap phases beyond v0.5.0.

---

## Pre-Implementation Checklist

Before starting Phase 1:

- [ ] Create Keepa account at keepa.com
- [ ] Subscribe to appropriate tier (Researcher for testing, Developer for production)
- [ ] Generate API key from Keepa dashboard
- [ ] Store API key in environment variable: `KEEPA_API_KEY`
- [ ] Confirm `.gitignore` excludes `.env` files (already done)
- [ ] Test a single manual API call to confirm key is active
- [ ] Map the top 5 target niches to their Amazon category node IDs manually
- [ ] Confirm cache directory `keepa_cache/` is added to `.gitignore`

---

## Open Questions Before Implementation

1. **Category node mapping:** Should the system auto-detect category nodes from the niche keyword, or require the user to provide them? Auto-detection is more user-friendly but adds ambiguity (one keyword can belong to multiple categories).

2. **Analysis scope:** Should the system always analyze the full top-100 ASINs in a category (most accurate but uses more tokens), or allow a "quick scan" of top-20 only (faster, cheaper)?

3. **Cache storage:** Local disk cache works for single-user. If the system scales to multiple users, a shared cache (Redis or similar) would prevent duplicate API calls for the same niches.

4. **Marketplace scope:** Start with US (domain=1) only, or support UK and CA from the beginning?

5. **Calibration baseline:** Which 10 products should be used as calibration targets in Phase 5? Need products with independently verifiable sales data.
