"""
run_opportunity_report.py — Global top-50 opportunity report across all validated categories.

Runs the full V5 discovery pipeline for every confirmed category, aggregates all
scored products globally, ranks by final_score, and writes a ranked report + CSV.

Usage:
    python run_opportunity_report.py
    python run_opportunity_report.py --max 50
"""

import argparse, csv, os, sys, time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Tuple

_env = Path(".env")
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip())

sys.path.insert(0, str(Path(__file__).parent))

from run_cross_category import (
    _scan, _cat, discovery_agent, bsr_analyzer, rv_tracker, price_analyzer,
    CROSS_CATEGORIES, MAX_SUBCATEGORIES, MAX_ASINS_PER_SUB,
)
from keepa.node_validator import NodeValidator
from v4.sources.google_trends_live import GoogleTrendsLive
from v4.sources.tiktok_stub import TikTokStub
from v4.sources.reddit_stub import RedditStub
from v5.models import V5OpportunityScore

LIBRARY_PATH = "verified_node_library.json"

# Only run validated categories (skip dog_kennels — node unresolved)
VALIDATED_CATEGORIES = [
    "candles", "yoga_mats", "resistance_bands", "teeth_whitening",
    "dog_treats", "ice_cube_molds", "reusable_straws", "cooking_utensils",
    "potholders",
]


def _competition_level(review_count) -> str:
    if review_count is None:      return "Unknown"
    if review_count < 50:         return "VERY LOW"
    if review_count < 200:        return "LOW"
    if review_count < 800:        return "MEDIUM"
    if review_count < 3000:       return "HIGH"
    return "VERY HIGH"


def _trend_label(s: V5OpportunityScore) -> str:
    tv = s.trend_velocity
    if tv is None:      return "Unknown"
    if tv.score >= 65:  return f"Rising ({tv.score:.0f})"
    if tv.score >= 45:  return f"Stable ({tv.score:.0f})"
    return f"Declining ({tv.score:.0f})"


def _integrity_label(s: V5OpportunityScore) -> str:
    ri = s.review_integrity.score if s.review_integrity else 0
    w  = s.wipe_events
    if w >= 2:              return f"SUSPICIOUS ({ri:.0f})"
    if w == 1:              return f"CAUTION ({ri:.0f})"
    if ri >= 80:            return f"CLEAN ({ri:.0f})"
    return f"MIXED ({ri:.0f})"


def _sub_signal(cfg, s: V5OpportunityScore) -> str:
    if cfg.subscription_eligible:
        rp = s.repeat_purchase.score if s.repeat_purchase else cfg.repeat_purchase_potential
        return f"YES (RPP {rp:.0f})"
    return "NO"


def run_report(max_results: int = 50) -> None:
    trend_sources = [GoogleTrendsLive(), TikTokStub(), RedditStub()]
    api_key       = os.environ.get("KEEPA_API_KEY", "")
    validator     = NodeValidator(api_key=api_key, library_path=LIBRARY_PATH)

    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    print(f"\n{'#'*70}")
    print(f"  AMAZON OPPORTUNITY INTELLIGENCE — GLOBAL TOP-{max_results} REPORT")
    print(f"  Categories: {', '.join(VALIDATED_CATEGORIES)}")
    print(f"  Scoring: V5  |  Node validation: ON  |  {now_str}")
    print(f"{'#'*70}")
    print(validator.library.summary())

    # ── Collect all scored products ──────────────────────────────────────────
    all_entries: List[Tuple[V5OpportunityScore, dict, str]] = []   # (score, pmap_entry, cat_name)

    for cat_name in VALIDATED_CATEGORIES:
        if not _cat.is_known(cat_name):
            print(f"\n  SKIP: {cat_name!r} not registered")
            continue

        cfg = _cat.load(cat_name)
        scores, pmap = _scan(cat_name, cfg, trend_sources, validator)

        for s in scores:
            prod = pmap.get(s.asin, {})
            all_entries.append((s, prod, cat_name))

        time.sleep(1)

    if not all_entries:
        print("\n  ❌ No products scored across any category.")
        return

    # ── Global ranking by final_score ────────────────────────────────────────
    all_entries.sort(key=lambda x: x[0].final_score, reverse=True)
    top = all_entries[:max_results]

    print(f"\n\n{'═'*70}")
    print(f"  GLOBAL TOP {len(top)} — RANKED BY OPPORTUNITY SCORE")
    print(f"{'═'*70}")

    rows = []
    for rank, (s, prod, cat_name) in enumerate(top, 1):
        cfg = _cat.load(cat_name)
        cur = prod.get("current", {})

        reviews   = cur.get("review_count")
        rev_disp  = f"{reviews:,}" if reviews is not None else "N/A"
        mrev      = s.estimated_monthly_revenue
        units     = s.estimated_monthly_sales
        trend_str = _trend_label(s)
        integ_str = _integrity_label(s)
        comp_str  = _competition_level(reviews)
        sub_str   = _sub_signal(cfg, s)
        brand_str = s.brand or "Unknown"

        print(f"\n  #{rank:02d}  [{cat_name.upper().replace('_',' ')}]")
        print(f"       {s.title[:66]}")
        print(f"       Brand: {brand_str}  |  ASIN: {s.asin}")
        print(f"       ─────────────────────────────────────────────────────")
        print(f"       Opportunity Score:    {s.final_score:.0f}/100  — {s.recommendation}")
        print(f"       Monthly Revenue:      ${mrev:,.0f}/mo" if mrev else "       Monthly Revenue:      N/A")
        print(f"       Monthly Sales:        {units:,} units" if units else "       Monthly Sales:        N/A")
        print(f"       Competition:          {comp_str}  ({rev_disp} reviews)")
        print(f"       Trend Score:          {trend_str}")
        print(f"       Subscription Signal:  {sub_str}")
        print(f"       Review Integrity:     {integ_str}")
        print(f"       Price:                ${cur.get('amazon_price') or cur.get('buybox_price') or 0:.2f}")
        if s.narrative and s.narrative.recommended_action:
            print(f"       Action:               {s.narrative.recommended_action[:70]}")

        rows.append({
            "rank":               rank,
            "category":           cat_name,
            "asin":               s.asin,
            "brand":              brand_str,
            "product_name":       s.title[:80],
            "opportunity_score":  f"{s.final_score:.0f}",
            "recommendation":     s.recommendation,
            "monthly_revenue":    f"{mrev:,.0f}" if mrev else "",
            "monthly_units":      f"{units:,}"   if units else "",
            "competition":        comp_str,
            "review_count":       rev_disp,
            "trend_score":        f"{s.trend_velocity.score:.0f}" if s.trend_velocity else "",
            "trend_direction":    "Rising" if s.trend_velocity and s.trend_velocity.score >= 65 else (
                                  "Stable" if s.trend_velocity and s.trend_velocity.score >= 45 else "Declining"),
            "subscription_signal":sub_str,
            "integrity_score":    f"{s.review_integrity.score:.0f}" if s.review_integrity else "",
            "integrity_label":    integ_str,
            "price":              f"{cur.get('amazon_price') or cur.get('buybox_price') or 0:.2f}",
        })

    # ── Write CSV ────────────────────────────────────────────────────────────
    out_path = Path("opportunity_report.csv")
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"\n\n  Report saved: {out_path}  ({len(rows)} products)")

    # ── Quick stats ──────────────────────────────────────────────────────────
    print(f"\n{'─'*70}")
    print(f"  SUMMARY  ({len(top)} of {len(all_entries)} total scored products)")
    print(f"{'─'*70}")
    by_cat = {}
    for s, _, cn in top:
        by_cat[cn] = by_cat.get(cn, 0) + 1
    for cn, cnt in sorted(by_cat.items(), key=lambda x: -x[1]):
        print(f"    {cn:25} {cnt} products")
    avg = sum(s.final_score for s, _, _ in top) / len(top)
    print(f"\n  Average score: {avg:.1f}/100")
    rev_total = sum(s.estimated_monthly_revenue for s, _, _ in top if s.estimated_monthly_revenue)
    print(f"  Total projected monthly revenue (top {len(top)}): ${rev_total:,.0f}")
    print(f"\n{'#'*70}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--max", type=int, default=50, help="Number of top products to show")
    args = parser.parse_args()
    run_report(args.max)
