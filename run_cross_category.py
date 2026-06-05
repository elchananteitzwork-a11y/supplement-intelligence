"""
run_cross_category.py — Engine consistency validation across 10 diverse categories.

Categories: candles, yoga_mats, resistance_bands, teeth_whitening, dog_treats,
            ice_cube_molds, reusable_straws, cooking_utensils, dog_kennels, potholders

Low-token settings: 1 subcategory × 15 ASINs per category ≈ 1,000 tokens total.

Usage:
  python run_cross_category.py
  python run_cross_category.py --check-tokens
  python run_cross_category.py --category candles yoga_mats
"""

import argparse, importlib.util, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

_env = Path(".env")
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

sys.path.insert(0, str(Path(__file__).parent))

import categories as _cat
from keepa.client import KeepaClient, KeepaAPIError
from keepa.discovery import apply_post_analysis_filter
from keepa.sales_estimate import calibrated_monthly_sales
from v4.sources.google_trends_live import GoogleTrendsLive
from v4.sources.tiktok_stub import TikTokStub
from v4.sources.reddit_stub import RedditStub
from v5.engine import run as v5_run
from v5.models import V5OpportunityScore

CROSS_CATEGORIES = [
    "candles", "yoga_mats", "resistance_bands", "teeth_whitening",
    "dog_treats", "ice_cube_molds", "reusable_straws", "cooking_utensils",
    "dog_kennels", "potholders",
]

MAX_SUBCATEGORIES = 1
MAX_ASINS_PER_SUB = 15
TOP_N = 5


def _load(name, rel):
    full = Path(__file__).parent / rel
    spec = importlib.util.spec_from_file_location(name, full)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

discovery_agent = _load("discovery",    ".claude-plugin/agents/opportunity-discovery/discovery.py")
bsr_analyzer    = _load("bsr_analyzer", ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker      = _load("rv_tracker",   ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer  = _load("price_analyzer", ".claude-plugin/agents/price-history-analyzer/analyzer.py")


def _trend_dir(s: V5OpportunityScore) -> str:
    tv = s.trend_velocity
    if tv is None: return "Unknown"
    if tv.score >= 65: return "Rising"
    if tv.score >= 45: return "Stable"
    return "Declining"


def _brand_label(s: V5OpportunityScore) -> str:
    b = s.brandability.score if s.brandability else 0
    if b >= 75: return "ICONIC"
    if b >= 60: return "STRONG"
    if b >= 45: return "CANDIDATE"
    if b >= 30: return "SINGLE SKU"
    return "COMMODITY"


def _tiktok_label(s: V5OpportunityScore) -> str:
    b = s.brandability.score if s.brandability else 0
    r = s.repeat_purchase.score if s.repeat_purchase else 0
    if b >= 70 and r >= 70: return "VERY HIGH"
    if b >= 55 or  r >= 65: return "HIGH"
    if b >= 40:              return "MODERATE"
    return "LOW"


def _r2r_str(s: V5OpportunityScore, pmap: dict) -> str:
    prod = pmap.get(s.asin, {})
    rev  = prod.get("current", {}).get("review_count")
    mrev = s.estimated_monthly_revenue
    if mrev and rev and rev > 0:
        return f"${mrev / rev:.0f}/review"
    if rev == 0:
        return "∞ (0 reviews)"
    return "N/A"


def _integrity_score(s: V5OpportunityScore) -> str:
    ri = s.review_integrity.score if s.review_integrity else 0
    w  = s.wipe_events
    if w == 0 and ri >= 80: return f"{ri:.0f}/100 — CLEAN"
    if w == 0:              return f"{ri:.0f}/100"
    if w == 1:              return f"{ri:.0f}/100 — 1 wipe (caution)"
    return f"{ri:.0f}/100 — {w} wipes (⚠ reject)"


def _scan(cat_name: str, cfg, trend_sources) -> Tuple[List[V5OpportunityScore], dict]:
    print(f"\n{'─'*60}")
    print(f"  {cfg.display_name.upper()}")
    print(f"  BSR {cfg.min_bsr:,}–{cfg.max_bsr:,} | min_sales {cfg.min_monthly_sales}/mo")
    print(f"{'─'*60}")

    _cat.activate(cfg)
    disc = discovery_agent.run(
        niche=cat_name,
        parent_cat_id=cfg.parent_cat_id,
        subcategory_ids=cfg.subcategories,
        min_bsr=cfg.min_bsr, max_bsr=cfg.max_bsr,
        max_reviews=cfg.max_reviews, min_price=cfg.min_price,
        max_subcategories=MAX_SUBCATEGORIES,
        max_asins_per_sub=MAX_ASINS_PER_SUB,
        exclude_asins=set(), force_refresh=False,
    )
    products = disc.get("normalized_products", [])
    pmap     = {p.get("asin"): p for p in disc.get("all_normalized", [])}

    if not products:
        print("  No products found.")
        return [], pmap

    bsr_results = bsr_analyzer.run(products)
    qualified   = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=cfg.min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )
    if not qualified:
        print("  No products passed post-filter.")
        return [], pmap

    rv_result    = rv_tracker.run(qualified, bsr_analyses=bsr_results)
    price_result = price_analyzer.run(qualified)

    scores = v5_run(
        products=qualified, bsr_results=bsr_results,
        rv_result=rv_result, price_result=price_result,
        category_config=cfg, trend_sources=trend_sources,
    )
    return scores, pmap


def _print(cat_name: str, cfg, scores: List[V5OpportunityScore], pmap: dict) -> None:
    print(f"\n{'═'*65}")
    print(f"  {cfg.display_name.upper()}  — top {min(TOP_N, len(scores))} of {len(scores)}")
    print(f"{'═'*65}")

    if not scores:
        print("  No scoreable products — check subcategory node ID.")
        return

    for i, s in enumerate(scores[:TOP_N], 1):
        prod = pmap.get(s.asin, {})
        cur  = prod.get("current", {})
        reviews  = cur.get("review_count")
        rev_disp = f"{reviews:,}" if reviews is not None else "N/A"
        mrev     = f"${s.estimated_monthly_revenue:,.0f}" if s.estimated_monthly_revenue else "N/A"
        units    = f"{s.estimated_monthly_sales:,}" if s.estimated_monthly_sales else "N/A"

        print(f"\n  #{i}  {s.title[:62]}")
        print(f"       Brand: {s.brand or 'Unknown'} | ASIN: {s.asin}")
        print(f"       Score: {s.final_score:.0f}/100  |  {s.recommendation}")
        print(f"       ─────────────────────────────────────────────────")
        print(f"       Opp Score component:   {s.amazon_opportunity.score:.0f}/100" if s.amazon_opportunity else "")
        print(f"       Monthly revenue:        {mrev}/mo  ({units} units)")
        print(f"       Review count:           {rev_disp}")
        print(f"       R2R:                    {_r2r_str(s, pmap)}")
        print(f"       Google Trends:          {_trend_dir(s)}")
        print(f"       Subscription potential: {'YES' if cfg.subscription_eligible else 'NO'}  (RPP {cfg.repeat_purchase_potential}/100)")
        print(f"       Brand potential:        {_brand_label(s)}  ({s.brandability.score:.0f}/100)" if s.brandability else "")
        print(f"       TikTok content:         {_tiktok_label(s)}")
        print(f"       Integrity:              {_integrity_score(s)}")
        if s.narrative and s.narrative.recommended_action:
            print(f"       Action:                 {s.narrative.recommended_action[:80]}")


def run(cats: Optional[List[str]] = None) -> None:
    cats = cats or CROSS_CATEGORIES
    trend_sources = [GoogleTrendsLive(), TikTokStub(), RedditStub()]

    print(f"\n{'#'*65}")
    print(f"  CROSS-CATEGORY ENGINE CONSISTENCY TEST")
    print(f"  Categories: {', '.join(cats)}")
    print(f"  Token budget: ~{len(cats) * MAX_SUBCATEGORIES * MAX_ASINS_PER_SUB * 10} tokens est.")
    print(f"  {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'#'*65}")

    all_results: Dict[str, Tuple] = {}
    for name in cats:
        if not _cat.is_known(name):
            print(f"\n  SKIP: {name!r} not registered"); continue
        cfg = _cat.load(name)
        scores, pmap = _scan(name, cfg, trend_sources)
        all_results[name] = (scores, pmap)
        time.sleep(1)

    print(f"\n\n{'#'*65}")
    print(f"  RESULTS")
    print(f"{'#'*65}")
    for name in cats:
        if name not in all_results: continue
        cfg = _cat.load(name)
        scores, pmap = all_results[name]
        _print(name, cfg, scores, pmap)

    print(f"\n{'#'*65}  COMPLETE\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", "-c", nargs="+", choices=CROSS_CATEGORIES, default=None)
    parser.add_argument("--check-tokens", action="store_true")
    args = parser.parse_args()

    if args.check_tokens:
        c = KeepaClient()
        s = c.get_token_status()
        print(f"\n  Tokens: {s['tokens_left']}  | Refill: {s['refill_rate_per_minute']}/min\n")
        sys.exit(0)

    run(args.category)
