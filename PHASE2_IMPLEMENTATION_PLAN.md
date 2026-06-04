# PHASE 2 IMPLEMENTATION PLAN
## Amazon Product Opportunity Intelligence System — Codebase Audit & Roadmap
**Audit Date:** 2026-06-03
**Audited By:** Full read of every source file
**Repository:** https://github.com/elchananteitzwork-a11y/amazon-opportunity-hunter

---

## 1. What Is Already Functional

These components will work correctly the moment a valid `KEEPA_API_KEY` is in the environment. No code changes required.

### keepa/ package — 100% Functional

| File | Status | Evidence |
|------|--------|---------|
| `keepa/client.py` | ✅ Production-ready | Full HTTP client with auth, timeout, rate-limit detection, batching (100 ASINs/request), and session reuse. All 5 endpoints implemented. |
| `keepa/normalizer.py` | ✅ Production-ready | Keepa-minutes → ISO 8601 conversion correct. Price → USD division correct. CSV flat-array parser handles all -1 sentinel values. |
| `keepa/cache.py` | ✅ Production-ready | File-based TTL cache with read, write, invalidate, and directory auto-creation. |
| `keepa/models.py` | ✅ Production-ready | All dataclasses defined. Serialization via `dataclasses.asdict()` works. |

### Phase 1 Agents — Functional

| File | Status | Notes |
|------|--------|-------|
| `keepa-data-fetcher/fetcher.py` | ✅ Functional | Resolves category, fetches ASINs, normalizes, caches. Category name is never fetched (minor gap — see §2). |
| `bsr-trend-analyzer/analyzer.py` | ✅ Functional | Linear regression slope, log-linear BSR→sales, volatility CV, demand velocity. No API calls needed. |
| `review-velocity-tracker/tracker.py` | ✅ Functional | 3-tier analysis, review velocity, Review-to-Revenue Efficiency, accessibility verdict. |
| `price-history-analyzer/analyzer.py` | ✅ Functional | Price band, compression detection, Buy Box heuristic, promo signals. |
| `run_keepa_phase1.py` | ✅ Functional | `importlib` loading handles hyphenated paths correctly. `.env` parsing before imports is correct. JSON serializer handles dataclasses. |

### Original 12 Reasoning Agents (AGENT.md only) — Functional as Claude Prompts

All 12 original agents (`amazon-demand-analyzer`, `competition-analyzer`, etc.) are instruction files for Claude. When `/product-hunt` is invoked, Claude reads the AGENT.md files and **reasons through each step**. This works today — it just produces estimates, not verified data. The 12 agents are:

```
amazon-demand-analyzer      competition-analyzer         small-seller-success-detector
profit-opportunity-analyzer trend-validator              supplier-analyzer
legal-risk-analyzer         product-validation-analyzer  launch-difficulty-analyzer
opportunity-size-analyzer   brand-builder-agent          product-opportunity-ranker
```

---

## 2. What Is Still Placeholder or Incomplete

### A. category_name is always None
**File:** `keepa-data-fetcher/fetcher.py` — line 143
**Problem:** `category_name` is declared but never populated. The `/category` endpoint exists in `client.py` but is never called in `fetch_niche()`.
**Impact:** `keepa-report.json` always has `"category_name": null`. Low severity.
**Fix:** One call to `client.get_category(resolved_category)` and extract `categories[0].name`.

### B. deltaViews90 field name unverified
**File:** `keepa/normalizer.py` — line 243
**Problem:**
```python
"review_count_delta": (
    stats.get("deltaViews90") if stats.get("deltaViews90") != _KEEPA_NO_DATA else None
),
```
`deltaViews90` may not be the correct Keepa field name for review count delta. The correct field is likely `stats["delta90"][16]` (delta array indexed by CSV position), not a named key. This will silently return `None` on every product until verified against a live response.
**Impact:** `review_count_delta` in `stats_90d` will always be `None`. Velocity tracking degrades to history-only mode, which still works but loses Keepa's pre-computed delta.
**Fix:** Must be verified against a real Keepa API response. Run once with a real key and inspect `raw["stats"]` keys.

### C. stats.avg90 / min90 / max90 extraction is fragile
**File:** `keepa/normalizer.py` — lines 230–245
**Problem:** The extraction uses deeply nested ternary expressions like:
```python
stats["avg90"][3] if len(stats["avg90"]) > 3 and stats["avg90"][3] != _KEEPA_NO_DATA else None
```
If Keepa returns `avg90` as a dict instead of a list in some product categories, or if the array is shorter than expected, this silently returns `None` without logging. The Keepa API does not always return uniform response shapes across product categories.
**Impact:** `stats_90d.avg_bsr` and `stats_90d.avg_amazon_price` may be `None` for some products. The BSR analyzer has a fallback (`stats_90d.avg_bsr`), so it degrades gracefully, but price stats would be missing.
**Fix:** Add defensive logging when expected fields are absent. Verify field shapes against a live response before Phase 2.

### D. Seasonal peak month is a string, not actual months
**File:** `bsr-trend-analyzer/analyzer.py` — line 217
**Problem:**
```python
seasonal_peak = "Detected — review history timestamps for exact months"
```
The seasonal detection knows a product is seasonal (BSR variance > 60%) but does not compute which months are the peak. It returns a placeholder string instead.
**Impact:** Seasonal classification works; specific peak months do not. The scoring engine currently doesn't use `seasonal_peak_month` for scoring, so this doesn't break anything.
**Fix:** In Phase 2, zip the BSR values with their timestamps and group by month to find the true peak month.

### E. Buy Box % is a heuristic, not real data
**File:** `price-history-analyzer/analyzer.py`
**Problem:** Amazon Buy Box ownership is estimated by comparing when the Amazon price equals the Buy Box price within $0.02 tolerance. This is explicitly labeled in the code as approximate.
**Impact:** `amazon_holds_buybox_pct` is directionally useful but not accurate.
**Fix:** In Phase 3, use the `/product` `offers` parameter to get actual Buy Box history at higher token cost.

### F. keepa-report.json on disk is the schema example, not real data
**File:** `keepa-report.json` (root)
**Problem:** This file contains `"B0EXAMPLE01"` ASINs and manually crafted numbers. It is a schema illustration, not a real analysis output.
**Impact:** Anyone who reads the file without running the pipeline will see fake data.
**Fix:** Already labeled with `"_note"` field explaining this. Add a `"_is_example": true` flag to make it unambiguous.

### G. The 12 original agents produce estimated outputs, not verified data
**All original AGENT.md reasoning agents**
**Problem:** When `/product-hunt` runs today, Claude reasons through all 12 steps and produces scores like `demand_score: 85` based on training knowledge, not real Amazon data. The average confidence across all produced outputs is ~48/100.
**Impact:** The system produces useful directional rankings but every specific number is an estimate.
**Fix:** This is the entire point of Phase 2 — wire the Keepa-verified data into the scoring agents.

---

## 3. Files That Require a Real Keepa API Key

Only the API communication layer requires the key. Everything else works without it.

| File | Requires Key | Reason |
|------|-------------|--------|
| `keepa/client.py` | ✅ Directly | Embeds key in every HTTP request |
| `keepa-data-fetcher/fetcher.py` | ✅ Via client | Calls `KeepaClient()` at runtime |
| `run_keepa_phase1.py` | ✅ Via fetcher | But ONLY for the fetch step — analysis agents run on cached data |
| `bsr-trend-analyzer/analyzer.py` | ❌ No | Pure computation on normalized dicts |
| `review-velocity-tracker/tracker.py` | ❌ No | Pure computation on normalized dicts |
| `price-history-analyzer/analyzer.py` | ❌ No | Pure computation on normalized dicts |
| `keepa/normalizer.py` | ❌ No | Pure data transformation |
| `keepa/cache.py` | ❌ No | File I/O only |
| All 12 AGENT.md files | ❌ No | Claude reasoning, no API calls |
| All SKILL.md files | ❌ No | Claude reasoning, no API calls |

**Practical implication:** If you have a cached `keepa_cache/*.json` file from a prior run, you can re-run all 3 analysis agents (`bsr-trend-analyzer`, `review-velocity-tracker`, `price-history-analyzer`) indefinitely with zero tokens and no API key.

---

## 4. Files That Currently Use Mock / Placeholder Data

| File | Mock Data | Details |
|------|-----------|---------|
| `keepa-report.json` | ✅ MOCK | Schema example. ASINs are `B0EXAMPLE01`–`B0EXAMPLE05`. All numbers are manually chosen for illustration. |
| `product-ranking.json` | ✅ MOCK | From the manual analysis run (2026-06-03). All 17 scores are reasoning-based estimates, confidence ~48/100. |
| All 12 AGENT.md outputs | ✅ ESTIMATED | Claude reasoning from training data. No live Amazon data. Labeled in `PROJECT_STATUS.md`. |
| `bsr-trend-analyzer/analyzer.py` | ⚠️ BENCHMARK | BSR→sales table is based on published benchmarks (not mock), but uses US-wide averages without category calibration. |

---

## 5. What Is Required to Run a Real Analysis

### Minimum requirements (Phase 1 — Keepa data only)

**Step 1 — Get a Keepa API key**
```
Visit: https://keepa.com/#!api
Minimum plan: Researcher (~$19/month, 1,250 tokens/day)
Sufficient for: ~1–2 full 100-product analyses per day
```

**Step 2 — Install Python dependencies**
```bash
pip3 install -r requirements.txt
# Installs: requests>=2.31.0, python-dotenv>=1.0.0
```

**Step 3 — Configure the API key**
```bash
cp .env.example .env
# Edit .env: KEEPA_API_KEY=your_actual_key_here
```

**Step 4 — Verify the key works**
```bash
python3 run_keepa_phase1.py --check-tokens
# Expected output:
#   Tokens remaining:    1250
#   Refill in:           Xs
#   Refill rate:         Y tokens/min
```

**Step 5 — Run a real Phase 1 analysis**
```bash
python3 run_keepa_phase1.py "dog lick mats"
# Consumes ~650–900 tokens
# Writes keepa-report.json with real ASINs, BSR, prices, review history
```

**Total time to first real output: ~15 minutes** (sign up, install, configure, run)

---

### What Phase 1 gives you (once running)

After `run_keepa_phase1.py "dog lick mats"` completes, `keepa-report.json` will contain:
- Real ASINs from Amazon's Best Sellers list for Pet Supplies
- Verified 90-day BSR history for each product
- Actual review counts (not estimates)
- Real price history (Amazon price, Buy Box price, 3rd-party)
- BSR-derived monthly sales estimates (still estimates, but based on real BSR)
- Verified market price range (actual min/max/avg)

**What Phase 1 does NOT give you yet:**
- No scores (demand score, competition score, etc.)
- No Master Opportunity Score
- No Final Verdict
- No investment recommendations
- No brand analysis

Those require Phase 2, which wires the Keepa data into the existing 12-agent scoring pipeline.

---

## 6. The Exact Next Steps to Reach a Working MVP

### Definition of MVP
A system that runs `/product-hunt "dog lick mats"` and produces a Final Opportunity Score, ranking, and recommendation using **at least partially verified data** (real BSR, real review counts, real prices) rather than pure estimates.

---

### Step 1 — Verify the normalizer against a real response (1 hour)
**Blocker before all other Phase 2 work.**

Run:
```bash
python3 -c "
import json, sys
sys.path.insert(0, '.')
from keepa.client import KeepaClient
c = KeepaClient()
r = c.get_products(['B0CSKWGHK3'], stats=90)
print(json.dumps(r['products'][0].get('stats', {}), indent=2))
"
```
Inspect the raw `stats` dict and verify:
- Is `avg90` a list or dict?
- What is the correct key for review count delta?
- Does `current` exist as an array indexed by CSV position?

Then update `keepa/normalizer.py` lines 229–245 if field names or shapes differ.

**Output:** Fixed `normalizer.py`. All stats_90d fields populated correctly.

---

### Step 2 — Fetch category name (30 minutes)
**File:** `keepa-data-fetcher/fetcher.py`

Add after the `get_best_sellers` call:
```python
try:
    cat_resp = client.get_category(resolved_category)
    cats = cat_resp.get("categories", {})
    if cats:
        first_cat = list(cats.values())[0]
        category_name = first_cat.get("name")
except KeepaAPIError:
    pass  # non-critical
```
**Output:** `keepa-report.json` has real `category_name` instead of null.

---

### Step 3 — Build the Keepa→Scoring Bridge (4–6 hours)
**This is the core of Phase 2.** Create a new file: `bridge.py`

The bridge translates `keepa-report.json` output into the input format expected by the 12 existing Claude reasoning agents. It replaces estimated values with verified ones.

```python
# bridge.py (new file at project root)

def build_demand_inputs(keepa_report: dict) -> dict:
    """
    Replace estimated demand_score inputs with Keepa-verified values.
    Returns a dict shaped to match amazon-demand-analyzer expected output.
    """
    bsr_analyses = keepa_report.get("bsr_analyses", [])
    price_analysis = keepa_report.get("price_analysis", {})

    # Use top 5 products by BSR for demand signals
    top5 = sorted(
        [b for b in bsr_analyses if b["avg_bsr_90d"]],
        key=lambda x: x["avg_bsr_90d"]
    )[:5]

    avg_bsr_top5 = (
        sum(b["avg_bsr_90d"] for b in top5) / len(top5)
        if top5 else None
    )

    return {
        "avg_bsr_top5": avg_bsr_top5,
        "review_velocity": keepa_report["review_analysis"]["avg_monthly_velocity"],
        "total_sellers_estimate": keepa_report["products_normalized"],
        "demand_velocity_trend": top5[0]["demand_velocity"] if top5 else "Unknown",
        "source": "keepa_verified",
        "confidence": 85,
    }


def build_competition_inputs(keepa_report: dict) -> dict:
    """Replace estimated competition inputs with Keepa-verified values."""
    review_analysis = keepa_report.get("review_analysis", {})
    price_analysis = keepa_report.get("price_analysis", {})

    return {
        "avg_reviews_page1": review_analysis.get("avg_reviews_page1"),
        "median_reviews_page1": review_analysis.get("median_reviews_page1"),
        "min_reviews_page1": review_analysis.get("min_reviews_page1"),
        "price_range": {
            "min": price_analysis.get("category_min_price"),
            "max": price_analysis.get("category_max_price"),
        },
        "price_compression": price_analysis.get("price_compression", False),
        "source": "keepa_verified",
        "confidence": 85,
    }


def build_small_seller_inputs(keepa_report: dict) -> dict:
    """Replace estimated small-seller tier data with Keepa-verified values."""
    r = keepa_report.get("review_analysis", {})

    return {
        "tier_under_100_count": len(r.get("tier_under_100", [])),
        "tier_under_500_count": len(r.get("tier_under_500", [])),
        "tier_under_1000_count": len(r.get("tier_under_1000", [])),
        "accessibility_verdict": r.get("accessibility_verdict"),
        "category_avg_r2r_efficiency": r.get("category_avg_r2r_efficiency"),
        "best_r2r_efficiency": r.get("best_r2r_efficiency"),
        "source": "keepa_verified",
        "confidence": 82,
    }


def build_profit_inputs(keepa_report: dict) -> dict:
    """Replace estimated selling price with Keepa-verified price data."""
    p = keepa_report.get("price_analysis", {})

    return {
        "verified_avg_price": p.get("category_avg_price"),
        "verified_price_range": {
            "min": p.get("category_min_price"),
            "max": p.get("category_max_price"),
        },
        "price_compression": p.get("price_compression", False),
        "price_trend": p.get("price_trend"),
        "source": "keepa_verified",
        "confidence": 85,
    }
```

**Output:** `bridge.py` translates Phase 1 data into scoring inputs.

---

### Step 4 — Update the /product-hunt skill pipeline (2–3 hours)
**File:** `.claude-plugin/skills/product-hunt/SKILL.md`

Add a new Step 0 before the existing 12 steps:

```
### Step 0 — Load Keepa Data (if available)
Before running the 12 reasoning agents, check whether keepa-report.json exists
in the working directory. If it does:
  - Load it and extract verified inputs for downstream agents
  - Pass them as "verified_inputs" to each relevant agent
  - Each agent should use verified inputs where available and estimate only
    where Keepa data is absent
  - Log confidence level per metric as: "source: keepa_verified (confidence: 85)"
    vs "source: estimated (confidence: 45)"

If keepa-report.json does not exist, proceed with estimation mode (current behavior).
```

Update each of the 5 affected agents to accept the optional `verified_inputs` parameter and use it when present.

**Output:** `/product-hunt` runs in two modes — verified (with Keepa data) and estimated (without).

---

### Step 5 — Add a confidence field to every score (1–2 hours)
**Files:** All AGENT.md files for agents 1–5

Each agent's output JSON should add:
```json
"demand_score": 82,
"demand_score_confidence": 85,
"demand_score_source": "keepa_verified",
```
vs:
```json
"demand_score": 82,
"demand_score_confidence": 45,
"demand_score_source": "estimated",
```

This transforms the manual transparency audit from `PROJECT_STATUS.md` into automated per-metric reporting.

**Output:** Every score in `product-opportunity-report.md` shows its confidence level.

---

### Step 6 — End-to-end MVP test (2 hours)

Run the complete pipeline in sequence:

```bash
# 1. Fetch Keepa data
python3 run_keepa_phase1.py "dog lick mats"

# 2. Run /product-hunt — reads keepa-report.json from disk
#    (Claude loads bridge.py outputs into the reasoning agents)
/product-hunt "dog lick mats"
```

Verify:
- Scores that were previously estimated now show `source: keepa_verified`
- Confidence levels for demand, competition, small-seller, and profit scores are 80+
- `product-opportunity-report.md` shows real BSR values, real review counts, real prices

**Output:** MVP — a full product analysis with verified core metrics.

---

## Phase 2 Work Summary

| Task | File(s) Affected | Effort | Blocker? |
|------|-----------------|--------|---------|
| Verify normalizer against live response | `keepa/normalizer.py` | 1 hr | ✅ Yes — do first |
| Fix `deltaViews90` field name | `keepa/normalizer.py` | 30 min | ✅ Yes |
| Fetch real category name | `keepa-data-fetcher/fetcher.py` | 30 min | No |
| Build `bridge.py` translation layer | `bridge.py` (new) | 4–6 hr | Yes |
| Update SKILL.md to add Step 0 | `product-hunt/SKILL.md` | 2 hr | Yes |
| Add confidence fields to agent outputs | 5 AGENT.md files | 2 hr | No |
| End-to-end MVP test | All | 2 hr | Yes |
| Fix seasonal peak month detection | `bsr-trend-analyzer/analyzer.py` | 1 hr | No |

**Total Phase 2 effort: ~13–16 hours**

---

## System Readiness Summary

| Layer | Today | After Phase 2 MVP |
|-------|-------|------------------|
| Data pipeline (Keepa fetch + normalize) | ✅ Ready (needs API key) | ✅ Ready |
| BSR analysis | ✅ Ready | ✅ Ready |
| Review velocity analysis | ✅ Ready | ✅ Ready |
| Price history analysis | ✅ Ready | ✅ Ready |
| Demand score | ⚠️ Estimated (conf. ~48) | ✅ Verified (conf. ~85) |
| Competition score | ⚠️ Estimated | ✅ Verified |
| Small seller score | ⚠️ Estimated | ✅ Verified |
| Profit score (selling price) | ⚠️ Estimated | ✅ Verified |
| TikTok score | ⚠️ Estimated | ⚠️ Estimated (Phase 3) |
| Legal / patent risk | ⚠️ Estimated | ⚠️ Estimated (Phase 3) |
| Validation score | ⚠️ Estimated | ⚠️ Estimated (Phase 3) |
| Final Opportunity Score | ⚠️ ~48/100 confidence | ✅ ~80/100 confidence |
| Output reports (4 files) | ✅ Structure ready | ✅ With verified data |

---

## Single Most Important Next Action

**Get a Keepa API key and run:**
```bash
python3 run_keepa_phase1.py --check-tokens
```

Everything else in Phase 2 depends on seeing a real Keepa response to verify the normalizer field shapes. Without a real response, `bridge.py` cannot be built correctly because the exact format of `stats.avg90`, `stats.delta90`, and related fields must be observed in a live payload before they can be safely mapped.

**The entire system unblocks the moment a real Keepa response is inspected.**
