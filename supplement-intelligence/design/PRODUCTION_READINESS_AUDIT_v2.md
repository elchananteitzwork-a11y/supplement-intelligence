# Production Readiness Audit — v2 (2026-07-01)

> Re-audit following: Apify billing raised to $50; TikTok hashtag bug fixed; Google Trends broadening fix; Alibaba MOQ fabrication fix.
> Baseline from: PRODUCTION_READINESS_AUDIT.md (2026-07-01, pre-fix).

---

## 1. Apify Billing Status

| Field                  | Value                               |
|------------------------|-------------------------------------|
| Plan                   | STARTER                             |
| Billing cycle          | 2026-06-24 → 2026-07-23             |
| Limit (raised)         | **$50.00** (was $29)                |
| Current spend          | **$29.73**                          |
| Remaining budget       | **$20.27**                          |
| Competition actor      | `junglee~amazon-crawler` (PAID)     |
| Blocked?               | **No — unblocked**                  |

---

## 2. Provider Coverage (v2.0.0 Analyses)

> 8 total v2 analyses: 4 pre-fix (run ~2026-06-28) + 4 run today (2026-07-01).
> Legacy analyses (64) used v1 scoring and do not have signal_evidence/signal_metadata structure.

| Provider                  | Coverage (v2) | New-run (4 today) | Change vs baseline |
|---------------------------|:-------------:|:-----------------:|:------------------:|
| **Keepa**                 | 8/8 **100%**  | 4/4 **100%**      | No change (was 100%) |
| **Google Trends**         | 4/8 **50%**   | 4/4 **100%** ✅   | +100% on new analyses |
| **TikTok**                | 3/8 **38%**   | 3/4 **75%** ✅    | +75% on new analyses |
| **Apify Competition**     | 4/8 **50%**   | 4/4 **100%** ✅   | +100% on new analyses |
| **Keyword Intelligence**  | 7/8 **88%**   | 4/4 **100%** ✅   | No regression      |
| **News Intelligence**     | 6/8 **75%**   | 3/4 **75%**       | No change          |
| **Consumer Intelligence** | 0/8 **0%**    | 0/4 **0%** ❌     | Blocked (external) |
| **Reddit**                | 0/8 **0%**    | 0/4 **0%** ❌     | Not configured     |
| **Manufacturing**         | 0/8 **0%**    | 0/4 **0%** ❌     | On-demand only     |
| **Amazon Ads (stub)**     | 0/8 **0%**    | 0/4 **0%** ❌     | Stub not implemented |
| **Meta Ads (stub)**       | 0/8 **0%**    | 0/4 **0%** ❌     | Stub not implemented |

**Note:** The 50% overall figures for Google Trends and Apify Competition reflect the 4 pre-fix analyses that ran before today's fixes were deployed. All 4 analyses run today show 100% coverage for these providers. Going forward, coverage should be 100% for both.

---

## 3. Bug Fixes Applied

### 3.1 TikTok `toHashtagCandidates()` — FIXED
**Root cause:** Generated duplicate candidates for product names without a "for X" clause and without generic tail words. "Dog Anxiety Calming Chews" → only candidate was `doganxietycalmingchews` (non-existent hashtag). Result: 0% TikTok data in all analyses before fix.

**Fix (commit b0084a6 + this session):**
- Added 4→5 progressive strategies including 2-word meaningful join (`doganxiety`, `collagenpeptide`)
- Lowered single-word min-length threshold from 4 → 3 chars (covers "dog", "cat", "gut", "eye")
- Verified: Dog Anxiety → candidates: `doganxietycalmingchews`, `doganxiety`, `dog`

**Live evidence from today's runs:**
- Magnesium Glycinate for Sleep: `#magnesium` — 1,157,903 videos / 8.89B views (VERIFIED)
- Collagen Peptide Gummies for Skin: `#collagenpeptidegummies` — VERIFIED
- Pre-Workout Energy Powder: `#preworkout` — VERIFIED
- Dog Anxiety Calming Chews: no TikTok data (1s elapsed = cached result, no live API call ran)

### 3.2 Google Trends `broadenGoogleTrendsQuery()` — FIXED
**Root cause:** Single query too specific for Google Trends (< 8 data points → null). "Collagen Peptide Gummies for Skin Health" → no data.

**Fix:** Progressive broadening with 4 fallback strategies (strip "for X" clause → 2 meaningful words → first word). All 4 new analyses returned Google Trends demand/seasonality data.

**Live evidence:**
- Magnesium Glycinate for Sleep: `+41% YoY` growth, pattern: `Seasonal`, peak: `Apr`
- Pre-Workout Energy Powder: Google Trends data populated ✅

### 3.3 Alibaba `parseMOQ()` — FIXED
**Root cause:** Returned hardcoded `{low:500, high:2000}` when no real MOQ string was present. Violated "real data or null" rule.

**Fix:** Returns `undefined` instead. Callers already handle `undefined` gracefully.

### 3.4 Review Actor Region Fallback — PARTIAL FIX
**Root cause discovered:** `web_wanderer~amazon-reviews-extractor` actor logs show:
```
WARN: Amazon US has restricted access to text reviews.
ERROR [Reviews] status_code:500
```
Amazon has blocked US text review scraping. UK/IN/CA alternatives tested — all returned 0 (US ASINs not available on those marketplaces, status_code:404).

**Fix applied:** Added `REGION_FALLBACK_ORDER = ['amazon.com', 'amazon.co.uk']` to try UK after US fails. **This is a dead code path** until either:
- The actor is updated to handle the Amazon restriction
- A different review actor is used
- UK-marketplace ASINs are fetched alongside US results

---

## 4. Active Blockers (Priority Order)

### P0 — Consumer Intelligence (Review Text Analysis)
- **Module:** `lib/consumer-intelligence/analyze.ts` + `lib/review-collector/providers/apify.ts`
- **Blocker:** Amazon US has permanently restricted text review scraping (as of ~2026-06-30). The `web_wanderer~amazon-reviews-extractor` actor returns status_code:500 for all US requests. Other regions return 404 because US ASINs don't exist on UK/IN/CA marketplaces.
- **Impact:** 0% consumer intelligence coverage. Pain points, feature requests, repurchase signals, customer language grounding are all missing. Claude cannot cite real review themes in output.
- **Fix options (ordered by feasibility):**
  1. Switch to a review actor that is not blocked (test `junglee~amazon-reviews-scraper` or scrape from Amazon's US marketplace via authenticated session)
  2. Use Amazon Product Advertising API (requires seller/developer credentials, 90-day approval)
  3. Use a third-party review aggregator API (Brightdata, Oxylabs) — adds cost
- **Urgency:** HIGH. Consumer Intelligence grounds the scoring engine's Customer Pain and Subscription composites.

### P1 — Reddit Signal Provider
- **Module:** `lib/signal-engine/providers/reddit.ts`
- **Blocker:** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` not set in `.env.local`.
- **Impact:** No Reddit sentiment, discussion volume, or community pain signal. Virality and Customer Pain composites lack this source.
- **Fix:** Register a Reddit app at https://www.reddit.com/prefs/apps, set both env vars.
- **Cost:** Free (Reddit API is free for read-only use within rate limits).
- **Urgency:** MEDIUM. Reddit supplements Keepa + TikTok virality signal.

### P2 — TikTok: "Dog Anxiety" 2-word fallback not tested live
- **Module:** `lib/signal-engine/providers/tiktok.ts`
- **Status:** Code fix applied in this session. Dog Anxiety test returned in 1s (cached result, no live API call). Need a fresh analysis to confirm `#doganxiety` resolves.
- **Fix:** Next fresh analysis of a "Dog Anxiety" category will confirm. Expected result: `#doganxiety` with substantial video/view counts.
- **Urgency:** LOW. Other categories confirmed working.

### P3 — Manufacturing Engine: on-demand only
- **Module:** `lib/manufacturing-engine/`
- **Blocker:** Manufacturing is called via `/api/manufacturing` on-demand. Not called during `/api/generate`. Requires separate user action.
- **Impact:** 0% manufacturing coverage during analysis generation. Unit cost, MOQ, lead time, supplier count all missing from initial analysis.
- **Fix options:**
  1. Call manufacturing engine during `/api/generate` if `ALIBABA_APP_KEY` is set (adds ~8s latency)
  2. Display a "Load manufacturing data" button on the analysis page and call on demand
- **Current state:** Alibaba credentials (`ALIBABA_APP_KEY`, `ALIBABA_APP_SECRET`) are not set — so manufacturing would fall through to AI estimates even if called. Credentials needed first.
- **Urgency:** LOW for private beta. Manufacturing is supplementary to the core go/no-go decision.

### P4 — Amazon Ads / Meta Ads stubs
- **Status:** Providers return null, no integration implemented.
- **Impact:** No paid media CPC/CPM benchmarks.
- **Urgency:** LOW. Would require agency API access.

### P5 — News Intelligence: 75% coverage, 0 items for pet/fitness categories
- **Module:** `lib/news-engine/`
- **Issue:** Dog Anxiety and some fitness analyses returned `articles: 0`. openFDA and PubMed searches may not match non-supplement keywords well.
- **Fix:** Expand GDELT queries or add a broader news search for non-health categories.
- **Urgency:** LOW. News is supplementary context.

---

## 5. Live Data Verification (4 New Analyses, 2026-07-01)

### Magnesium Glycinate for Sleep Support
| Signal | Source | Value |
|--------|--------|-------|
| Demand trend | Keepa + Google Trends | +41% YoY, Strong |
| TikTok | `#magnesium` (verified) | 1.15M videos / 8.89B views |
| Seasonality | Google Trends | Seasonal — peak: Apr |
| Top competitors | Apify (10 real) | Nature's Bounty $15.97 ★4.8, Doctor's Best $20.99 ★4.6 |
| Avg competitor price | Keepa | $32 (range $21–$46) |
| Keyword clusters | DataForSEO | 10 clusters, "magnesium glycinate" primary |
| News | openFDA + PubMed | 1 FDA recall (melatonin), PubMed articles |
| Score | v2.0.0 | 67 — VALIDATE_FURTHER |

### Collagen Peptide Gummies for Skin Health
| Signal | Source | Value |
|--------|--------|-------|
| TikTok | `#collagenpeptidegummies` (verified) | VERIFIED |
| Apify competitors | apify-amazon-search | 10 real competitors |
| Score | v2.0.0 | 42 — SKIP |

### Pre-Workout Energy Powder
| Signal | Source | Value |
|--------|--------|-------|
| Keepa | demand, growth, pricing | ✅ |
| Google Trends | seasonality, trend | ✅ |
| TikTok | `#preworkout` | VERIFIED |
| Apify | competition | ✅ 10 competitors |
| Keywords | DataForSEO | 10 clusters |
| Score | v2.0.0 | — VALIDATE_FURTHER |

### Dog Anxiety Calming Chews
| Signal | Source | Value |
|--------|--------|-------|
| Keepa | demand, growth, pricing | ✅ |
| Google Trends | trend | ✅ |
| TikTok | — | ❌ (cached result, no live test) |
| Apify | competition | ✅ |
| Keywords | DataForSEO | 10 clusters |
| News | — | ❌ 0 articles |

---

## 6. Before/After Comparison

| Metric | Baseline (pre-fix) | Today (v2 new analyses) |
|--------|-------------------|------------------------|
| TikTok coverage | 0% (all 68 analyses) | 75% on new analyses |
| Google Trends coverage | 0% (v2) / partial (legacy) | 100% on new analyses |
| Apify Competition | 0% (billing exhausted) | 100% on new analyses |
| Consumer Intelligence | 0% | 0% (new blocker: Amazon restriction) |
| Keyword Intelligence | 4.4% | 100% on new analyses |
| News Intelligence | partial | 75% (6/8 v2) |
| Alibaba MOQ fabrication | Present | Fixed — returns `undefined` |
| Apify budget | $29/$29 (exhausted) | $29.73/$50 ($20.27 remaining) |
| Scoring version | legacy (64/68) | v2.0.0 on all new analyses |

---

## 7. Overall Real-Data Score

> Methodology: count providers returning verified live data ÷ total possible providers per analysis, averaged over the 4 new analyses run today.

| Provider | New analyses score |
|----------|--------------------|
| Keepa | 4/4 = **100%** |
| Google Trends | 4/4 = **100%** |
| TikTok | 3/4 = **75%** |
| Apify Competition | 4/4 = **100%** |
| Keyword Intelligence | 4/4 = **100%** |
| News Intelligence | 3/4 = **75%** |
| Consumer Intelligence | 0/4 = **0%** |
| Reddit | 0/4 = **0%** |
| Manufacturing | 0/4 = **0%** |
| **Overall (core 6 providers)** | **19/24 = 79%** |
| **Overall (all 9 providers)** | **19/36 = 53%** |

**Core-6 coverage (79%) represents the providers that are configured, funded, and operational.** Consumer Intelligence (external blocker), Reddit (missing credentials), and Manufacturing (on-demand) are structural gaps, not operational failures.

---

## 8. Recommended Next Steps (Priority Order)

1. **Fix Consumer Intelligence** — Switch `web_wanderer~amazon-reviews-extractor` to a working review actor. This is the single highest-value unblocked action. Pain points and repurchase signals are used by 2 scoring composites (Customer Pain, Subscription). Estimated impact: +15–20% signal coverage per analysis.

2. **Configure Reddit credentials** — Register app at reddit.com/prefs/apps. 30-minute setup, free, adds virality/sentiment signal from the highest-quality source for DTC supplement/health/beauty communities.

3. **Verify TikTok 2-word fix** — Run a fresh "Dog Anxiety" analysis to confirm `#doganxiety` resolves. Expected: ≥10K videos.

4. **Wire Manufacturing to generate** — Call the manufacturing engine inline (if Alibaba credentials are set). Add a `"Load Manufacturing"` fallback button on the Analysis Results page.

5. **Expand News Intelligence to non-supplement categories** — Pet/fitness analyses return 0 news articles. Add category-aware GDELT/news search queries.

---

## 9. Code Changes This Session

| File | Change | Reason |
|------|--------|--------|
| `lib/signal-engine/providers/tiktok.ts` | Added 2-word meaningful join + lowered min-length 4→3 | Missed `#doganxiety`, `#eyecream`, etc. |
| `lib/review-collector/providers/apify.ts` | Added UK region fallback after US returns 0 reviews | Amazon US blocked text reviews; UK dead-code path until actor fixed |
| `lib/manufacturing-engine/providers/alibaba.ts` | `parseMOQ()` returns `undefined` instead of hardcoded `{500,2000}` | Fabricated data violation |

---

*Audit conducted by Claude Code (claude-sonnet-4-6). Test user audit-v2-1782883795298@test.local (userId 6f08fd89-208b-474e-8395-9e5ace4bd4b9) was created, used for 4 analyses, and deleted. No real user data was used.*
