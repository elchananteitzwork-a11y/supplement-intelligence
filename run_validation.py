"""
run_validation.py — Low-token validation scan across 5 brand-first categories.

Scans: gut_health, sleep, collagen, protein, womens_health
Token budget: 2 subcategories × 30 ASINs per category = ~60 Keepa tokens/category
              5 categories × 60 = ~300 tokens total (well within daily budget)

Returns top 3 per category with:
  - Estimated monthly revenue
  - Review count
  - Revenue-to-review ratio
  - Google Trends direction
  - Repeat purchase potential
  - Subscription potential
  - TikTok content potential label

Usage:
  python run_validation.py
  python run_validation.py --category collagen   # single category
  python run_validation.py --check-tokens
  python run_validation.py --dry-run             # print config, don't scan
"""

import argparse
import importlib.util
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

_env_path = Path(".env")
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

sys.path.insert(0, str(Path(__file__).parent))

import categories as _cat
from keepa.client import KeepaClient, KeepaAPIError
from keepa.discovery import apply_post_analysis_filter
from keepa.sales_estimate import calibrated_monthly_sales
from v4.sources.google_trends_live import GoogleTrendsLive
from v4.sources.tiktok_stub import TikTokStub
from v4.sources.reddit_stub import RedditStub
from v4.sources.pinterest_stub import PinterestStub
from v4.sources.etsy_stub import EtsyStub
from v5.engine import run as v5_run
from v5.models import V5OpportunityScore


# ── Validation categories (ordered by brand-first priority) ──────────────────
VALIDATION_CATEGORIES = [
    "gut_health",
    "sleep",
    "collagen",
    "protein",
    "womens_health",
]

# Low-token settings (1,200 tokens available; ~10 tokens/product)
MAX_SUBCATEGORIES = 1   # 1 subcategory per category
MAX_ASINS_PER_SUB = 20  # ~200 tokens per category; 1,000 total across 5 categories
TOP_N             = 3


def _load(name: str, rel_path: str):
    full = Path(__file__).parent / rel_path
    spec = importlib.util.spec_from_file_location(name, full)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


discovery_agent = _load("discovery",      ".claude-plugin/agents/opportunity-discovery/discovery.py")
bsr_analyzer    = _load("bsr_analyzer",   ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker      = _load("rv_tracker",     ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer  = _load("price_analyzer", ".claude-plugin/agents/price-history-analyzer/analyzer.py")


# ── Google Trends trend direction label ───────────────────────────────────────
def _trend_direction(score: Optional[V5OpportunityScore]) -> str:
    """Extract Google Trends direction from the V5 score narrative."""
    if score is None:
        return "Unknown"
    tv = score.trend_velocity
    if tv is None:
        return "Unknown"
    # trend_velocity.score: 0=falling, 50=neutral/stub, 100=strong
    s = tv.score
    if s >= 65: return "Rising"
    if s >= 45: return "Stable"
    if s > 0:   return "Declining"
    return "No data"


def _tiktok_label(score: V5OpportunityScore) -> str:
    """Map brandability + repeat purchase into a TikTok content potential label."""
    brand = score.brandability.score if score.brandability else 0
    rpp   = score.repeat_purchase.score if score.repeat_purchase else 0
    if brand >= 70 and rpp >= 70:
        return "VERY HIGH — transformation + routine content"
    if brand >= 55 or rpp >= 65:
        return "HIGH — strong lifestyle angle"
    if brand >= 40:
        return "MODERATE — some content formats available"
    return "LOW — limited content ceiling"


def _r2r(score: V5OpportunityScore) -> Optional[float]:
    """Pull R2R from the market_accessibility factor if available."""
    ns = score.amazon_opportunity  # contains market_accessibility via new_seller
    if ns is None:
        return None
    for f in (ns.factors or []):
        if "r2r" in f.name.lower() and f.points > 0:
            return None  # can't extract $ from points; rely on revenue/reviews
    rev = score.estimated_monthly_revenue
    if rev and score.estimated_monthly_sales:
        rc = None
        # estimated_monthly_revenue / review_count — review count not in V5Score directly
        # Return revenue-per-unit instead as a proxy
    return None


def _format_r2r(score: V5OpportunityScore, product_map: Dict[str, Any]) -> str:
    asin = score.asin
    prod = product_map.get(asin, {})
    reviews = prod.get("current", {}).get("review_count")
    rev = score.estimated_monthly_revenue
    if rev and reviews and reviews > 0:
        return f"${rev / reviews:.0f}/review"
    if reviews == 0:
        return "∞ (0 reviews)"
    return "N/A"


def _scan_category(
    category_name: str,
    cfg,
    trend_sources: list,
) -> Tuple[List[V5OpportunityScore], Dict[str, Any]]:
    """Run a low-token scan for one category. Returns (top_scores, product_map)."""

    print(f"\n{'─'*60}")
    print(f"  SCANNING: {cfg.display_name}")
    print(f"  BSR range: {cfg.min_bsr:,}–{cfg.max_bsr:,} | min_sales: {cfg.min_monthly_sales}/mo")
    print(f"  max_reviews filter: {'NONE (removed)' if cfg.max_reviews is None else cfg.max_reviews}")
    print(f"{'─'*60}")

    _cat.activate(cfg)

    disc = discovery_agent.run(
        niche=category_name,
        parent_cat_id=cfg.parent_cat_id,
        subcategory_ids=cfg.subcategories,
        min_bsr=cfg.min_bsr,
        max_bsr=cfg.max_bsr,
        max_reviews=cfg.max_reviews,
        min_price=cfg.min_price,
        max_subcategories=MAX_SUBCATEGORIES,
        max_asins_per_sub=MAX_ASINS_PER_SUB,
        exclude_asins=set(),
        force_refresh=False,
    )

    products = disc.get("normalized_products", [])
    product_map = {p.get("asin"): p for p in products}

    if not products:
        print(f"  No products found — subcategory IDs may need validation")
        return [], {}

    print(f"  {len(products)} products fetched — running BSR + scoring pipeline …")

    bsr_results = bsr_analyzer.run(products)
    qualified   = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=cfg.min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )

    if not qualified:
        print(f"  No products passed post-filter (declining demand / low sales)")
        return [], product_map

    rv_result    = rv_tracker.run(qualified, bsr_analyses=bsr_results)
    price_result = price_analyzer.run(qualified)

    scores = v5_run(
        products=qualified,
        bsr_results=bsr_results,
        rv_result=rv_result,
        price_result=price_result,
        category_config=cfg,
        trend_sources=trend_sources,
    )

    return scores, product_map


def _print_category_results(
    category_name: str,
    cfg,
    scores: List[V5OpportunityScore],
    product_map: Dict[str, Any],
) -> None:
    print(f"\n{'═'*70}")
    print(f"  {cfg.display_name.upper()}")
    print(f"  Top {min(TOP_N, len(scores))} of {len(scores)} scored")
    print(f"{'═'*70}")

    if not scores:
        print("  No scoreable products found. Check subcategory IDs.")
        return

    for i, s in enumerate(scores[:TOP_N], 1):
        prod = product_map.get(s.asin, {})
        cur  = prod.get("current", {})
        reviews = cur.get("review_count")
        rev_str = f"{reviews:,}" if reviews is not None else "N/A"
        r2r_str = _format_r2r(s, product_map)

        monthly_rev = (
            f"${s.estimated_monthly_revenue:,.0f}/mo"
            if s.estimated_monthly_revenue else "N/A"
        )
        monthly_sales = (
            f"{s.estimated_monthly_sales:,} units/mo"
            if s.estimated_monthly_sales else "N/A"
        )

        print(f"\n  #{i}  {s.title[:65]}")
        print(f"       ASIN: {s.asin} | Brand: {s.brand or 'Unknown'}")
        print(f"       Score: {s.final_score:.0f}/100 | {s.recommendation}")
        print(f"       ─────────────────────────────────────────────────────")
        print(f"       Est. monthly revenue:   {monthly_rev}  ({monthly_sales})")
        print(f"       Review count:           {rev_str}")
        print(f"       Revenue/review (R2R):   {r2r_str}")
        print(f"       Google Trends:          {_trend_direction(s)}")
        print(f"       Repeat purchase (RPP):  {cfg.repeat_purchase_potential}/100")
        print(f"       Subscription eligible:  {'YES' if cfg.subscription_eligible else 'NO'}")
        print(f"       TikTok content:         {_tiktok_label(s)}")
        if s.wipe_events:
            print(f"       ⚠  Review wipes:        {s.wipe_events} event(s) — integrity risk")
        if s.narrative and s.narrative.recommended_action:
            print(f"       Action:                 {s.narrative.recommended_action[:80]}")


def run_validation(categories_to_run: Optional[List[str]] = None) -> None:
    cats = categories_to_run or VALIDATION_CATEGORIES

    trend_sources = [
        GoogleTrendsLive(),
        TikTokStub(),
        RedditStub(),
        PinterestStub(),
        EtsyStub(),
    ]

    print(f"\n{'#'*70}")
    print(f"  BRAND VALIDATION SCAN — V5 + Google Trends Live")
    print(f"  Categories: {', '.join(cats)}")
    print(f"  Token budget: ~{len(cats) * MAX_SUBCATEGORIES * MAX_ASINS_PER_SUB} ASINs max")
    print(f"  Review filter: REMOVED — efficiency metrics replace it")
    print(f"  BSR range: 500 – 50,000 (no arbitrary ceiling)")
    print(f"  Started: {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'#'*70}")

    all_results: Dict[str, Tuple[List[V5OpportunityScore], Dict]] = {}

    for cat_name in cats:
        if not _cat.is_known(cat_name):
            print(f"\n  SKIP: {cat_name!r} not registered")
            continue
        cfg = _cat.load(cat_name)
        scores, pmap = _scan_category(cat_name, cfg, trend_sources)
        all_results[cat_name] = (scores, pmap)
        time.sleep(1)  # brief pause between categories

    # ── Final summary ─────────────────────────────────────────────────────────
    print(f"\n\n{'#'*70}")
    print(f"  VALIDATION RESULTS — TOP {TOP_N} PER CATEGORY")
    print(f"{'#'*70}")

    for cat_name in cats:
        if cat_name not in all_results:
            continue
        cfg    = _cat.load(cat_name)
        scores, pmap = all_results[cat_name]
        _print_category_results(cat_name, cfg, scores, pmap)

    print(f"\n{'#'*70}")
    print(f"  SCAN COMPLETE")
    print(f"{'#'*70}\n")


def check_tokens() -> None:
    try:
        client = KeepaClient()
        status = client.get_token_status()
        print(f"\n  Tokens remaining: {status['tokens_left']}  "
              f"| Refill rate: {status['refill_rate']}/min\n")
    except KeepaAPIError as exc:
        print(f"\n  ERROR: {exc}\n")
        sys.exit(1)
    except KeyError:
        print(f"\n  Tokens remaining: {status.get('tokens_left', '?')}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Brand validation scan — V5 engine with Google Trends.",
    )
    parser.add_argument(
        "--category", "-c",
        nargs="+",
        choices=VALIDATION_CATEGORIES,
        default=None,
        help="Run one or more specific categories (default: all 5)",
    )
    parser.add_argument("--check-tokens", action="store_true")
    parser.add_argument("--dry-run",      action="store_true",
                        help="Print config summary only, skip Keepa API calls")
    args = parser.parse_args()

    if args.check_tokens:
        check_tokens()
        sys.exit(0)

    if args.dry_run:
        print("\nDRY RUN — category configs:")
        for name in (args.category or VALIDATION_CATEGORIES):
            cfg = _cat.load(name)
            print(f"  {name}: rpp={cfg.repeat_purchase_potential} sub={cfg.subscription_eligible} "
                  f"BSR={cfg.min_bsr}-{cfg.max_bsr} max_reviews={cfg.max_reviews}")
        sys.exit(0)

    run_validation(args.category)
