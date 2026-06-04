"""
run_discovery.py — Private-label opportunity scanner.

Scans Kitchen subcategories for products a new seller can realistically
enter: BSR 500–5000, reviews < 200, price ≥ $20, no dominant brand,
≥ 300 calibrated sales/month, stable or improving BSR trend.

Usage:
  python run_discovery.py "kitchen"
  python run_discovery.py "kitchen" --max-subcategories 6
  python run_discovery.py "kitchen" --min-bsr 300 --max-bsr 8000 --max-reviews 300
  python run_discovery.py "kitchen" --force-refresh
  python run_discovery.py --check-tokens

The analysis pipeline (BSR, reviews, prices, scoring) is identical to
run_keepa_phase1.py. Only the product sourcing step is different.
"""

import argparse
import csv as csv_module
import dataclasses
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ── Load .env before any imports that read env vars ───────────────
_env_path = Path(".env")
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

sys.path.insert(0, str(Path(__file__).parent))

import importlib.util

from keepa.client import KeepaClient, KeepaAPIError
from keepa.discovery import apply_post_analysis_filter, KITCHEN_PL_SUBCATEGORIES


def _load(name: str, rel_path: str):
    full = Path(__file__).parent / rel_path
    spec = importlib.util.spec_from_file_location(name, full)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


discovery_agent = _load("discovery",    ".claude-plugin/agents/opportunity-discovery/discovery.py")
bsr_analyzer    = _load("bsr_analyzer", ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker      = _load("rv_tracker",   ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer  = _load("price_analyzer", ".claude-plugin/agents/price-history-analyzer/analyzer.py")
product_scorer  = _load("product_scorer", ".claude-plugin/agents/product-scorer/scorer.py")


OUTPUT_JSON = Path("keepa-discovery-report.json")
OUTPUT_CSV  = Path("discovery-opportunities.csv")


def _json_default(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    raise TypeError(f"Not serializable: {type(obj).__name__}")


def _write_json(report: Dict[str, Any]) -> None:
    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default, ensure_ascii=False)
    print(f"\n  JSON → {OUTPUT_JSON}  ({OUTPUT_JSON.stat().st_size // 1024} KB)")


def _write_csv(scores: List[Any], products: Dict[str, Any], bsr_map: Dict[str, Any],
               rv_result: Any) -> None:
    """Write ranked opportunities to CSV with all key fields."""
    from datetime import timedelta

    fields = [
        "rank", "asin", "title", "score", "grade", "verdict",
        "source_subcategory", "price_usd", "bsr", "bsr_trend", "demand_velocity",
        "review_count", "rating", "review_velocity_90d",
        "calibrated_sales_mo", "estimated_revenue_mo",
        "fba_size_tier", "estimated_fba_fee", "net_margin_pct",
        "accessibility", "offer_count", "is_seasonal", "seasonal_peak",
        "data_penalty", "risk_flags",
    ]

    def rev_vel(p):
        hist   = p.get("history", {}).get("review_count", [])
        cutoff = datetime.now(tz=timezone.utc) - timedelta(days=90)
        pts    = sorted(
            [(datetime.fromisoformat(e["timestamp"]), int(e["value"]))
             for e in hist if e.get("value") is not None
             and datetime.fromisoformat(e["timestamp"]) >= cutoff],
            key=lambda x: x[0])
        return round(max(0, pts[-1][1] - pts[0][1]) / 3.0, 1) if len(pts) >= 2 else ""

    def risk(s, p, b):
        cur = p.get("current", {})
        flags = []
        if (s.get("data_penalty") or 0) > 0:             flags.append(f"data-penalty:{int(s['data_penalty'])}pt")
        if (cur.get("review_count") or 0) == 0:           flags.append("0-reviews")
        if b.get("is_seasonal"):                           flags.append(f"seasonal({b.get('seasonal_peak_month') or '?'})")
        if b.get("trend_direction") == "Declining":        flags.append("declining-BSR")
        if (s.get("estimated_net_margin_pct") or 99) < 10: flags.append(f"tight-margin:{s.get('estimated_net_margin_pct'):.0f}%")
        return "; ".join(flags)

    rows = []
    for rank, s in enumerate(scores, 1):
        p   = products.get(s["asin"], {})
        b   = bsr_map.get(s["asin"], {})
        cur = p.get("current", {})
        rows.append({
            "rank": rank,
            "asin": s["asin"],
            "title": (s.get("title") or "")[:100],
            "score": s["total_score"],
            "grade": s["grade"],
            "verdict": s["verdict"],
            "source_subcategory": p.get("_source_subcategory", ""),
            "price_usd": cur.get("amazon_price") or cur.get("buybox_price") or "",
            "bsr": cur.get("bsr") or "",
            "bsr_trend": b.get("trend_direction") or "",
            "demand_velocity": b.get("demand_velocity") or "",
            "review_count": cur.get("review_count") or "",
            "rating": cur.get("rating") or "",
            "review_velocity_90d": rev_vel(p),
            "calibrated_sales_mo": s.get("calibrated_monthly_sales") or "",
            "estimated_revenue_mo": round(s["estimated_monthly_revenue"], 2) if s.get("estimated_monthly_revenue") else "",
            "fba_size_tier": s.get("fba_size_tier") or "",
            "estimated_fba_fee": s.get("estimated_fba_fee") or "",
            "net_margin_pct": s.get("estimated_net_margin_pct") or "",
            "accessibility": rv_result.accessibility_verdict if rv_result else "",
            "offer_count": cur.get("offer_count") or "",
            "is_seasonal": b.get("is_seasonal") or "",
            "seasonal_peak": b.get("seasonal_peak_month") or "",
            "data_penalty": s.get("data_penalty") or 0,
            "risk_flags": risk(s, p, b),
        })

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv_module.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  CSV → {OUTPUT_CSV}  ({len(rows)} opportunities)")


def run_discovery(
    niche:            str,
    parent_cat_id:    int  = 284507,
    min_bsr:          int  = 500,
    max_bsr:          int  = 5000,
    max_reviews:      int  = 200,
    min_price:        float = 20.0,
    min_monthly_sales: int = 300,
    max_subcategories: int = 5,
    force_refresh:    bool = False,
) -> Dict[str, Any]:

    start = datetime.now(tz=timezone.utc)
    print(f"\n{'#'*60}")
    print(f"  Private-Label Opportunity Discovery")
    print(f"  Niche: {niche!r}")
    print(f"  Criteria: BSR {min_bsr}–{max_bsr} | reviews < {max_reviews} | price ≥ ${min_price} | sales ≥ {min_monthly_sales}/mo")
    print(f"  Subcategories: {max_subcategories}")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'#'*60}")

    # Load existing ASINs from prior scan to avoid re-fetching
    known_asins = set()
    if OUTPUT_JSON.exists():
        try:
            with OUTPUT_JSON.open() as f:
                existing = json.load(f)
            for asin in (existing.get("raw_asin_list") or []):
                known_asins.add(asin)
        except Exception:
            pass
    # Also pull from main scan if available
    main_report = Path("keepa-report.json")
    if main_report.exists():
        try:
            with main_report.open() as f:
                main = json.load(f)
            for asin in (main.get("bsr_analyses") or []):
                known_asins.add(asin.get("asin", "") if isinstance(asin, dict) else asin)
        except Exception:
            pass
    if known_asins:
        print(f"  Excluding {len(known_asins)} already-fetched ASINs to save tokens.")

    # ── Step 1: Discovery ────────────────────────────────────────
    disc = discovery_agent.run(
        niche=niche,
        parent_cat_id=parent_cat_id,
        min_bsr=min_bsr,
        max_bsr=max_bsr,
        max_reviews=max_reviews,
        min_price=min_price,
        max_subcategories=max_subcategories,
        max_asins_per_sub=50,    # top 50 per subcategory by BSR rank
        exclude_asins=known_asins,
        force_refresh=force_refresh,
    )

    products = disc.get("normalized_products", [])
    metadata = disc.get("metadata", {})

    if not products:
        print("\n  No products passed initial criteria.")
        print("  Try: --force-refresh, wider BSR range, higher max-reviews, or lower min-price.")
        return {}

    print(f"\n  {len(products)} products passed initial criteria — running analysis pipeline...")

    # ── Step 2: BSR analysis ─────────────────────────────────────
    bsr_results = bsr_analyzer.run(products)

    # ── Step 3: Post-analysis filter ─────────────────────────────
    qualified = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )
    print(f"\n  After post-analysis filter: {len(qualified)} products")
    print(f"  (removed {len(products) - len(qualified)} with declining demand or < {min_monthly_sales} sales/mo)")

    if not qualified:
        print("  No products remain after filtering. Consider widening criteria.")
        return {}

    # ── Step 4: Review velocity ──────────────────────────────────
    rv_result = rv_tracker.run(qualified, bsr_analyses=bsr_results)

    # ── Step 5: Price analysis ───────────────────────────────────
    price_result = price_analyzer.run(qualified)

    # ── Step 6: Score ────────────────────────────────────────────
    score_results = product_scorer.run(qualified, bsr_results, rv_result, price_result)

    # Inject scores into product dicts
    scores_by_asin = {s.asin: s for s in score_results}
    for p in qualified:
        s = scores_by_asin.get(p.get("asin"))
        if s:
            p["opportunity_score"] = s.total_score
            p["grade"]   = s.grade
            p["verdict"] = s.verdict

    elapsed = (datetime.now(tz=timezone.utc) - start).total_seconds()

    report = {
        "generated_at": start.isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "mode": "private-label-discovery",
        "niche": niche,
        "marketplace": "US",
        "parent_category_id": parent_cat_id,
        "criteria": {
            "bsr_range":    [min_bsr, max_bsr],
            "max_reviews":  max_reviews,
            "min_price":    min_price,
            "min_sales_mo": min_monthly_sales,
        },
        "keepa_tokens_used_estimate": metadata.get("tokens_used_estimate", 0),
        "keepa_tokens_remaining":     metadata.get("tokens_remaining", -1),
        "asins_fetched":         len(disc.get("raw_asin_list", [])),
        "passed_initial_filter": len(products),
        "passed_post_filter":    len(qualified),
        "products_scored":       len(score_results),
        "scoring_summary":       _scoring_summary(score_results),
        "product_scores":        score_results,
        "review_analysis":       rv_result,
        "price_analysis":        price_result,
        "bsr_analyses":          bsr_results,
        "products":              qualified,
        "raw_asin_list":         disc.get("raw_asin_list", []),
        "rejection_summary":     disc.get("rejection_summary", {}),
    }

    _write_json(report)

    # ── CSV export ───────────────────────────────────────────────
    product_map = {p["asin"]: p for p in qualified}
    bsr_map     = {b.asin: dataclasses.asdict(b) for b in bsr_results}
    _write_csv(
        [dataclasses.asdict(s) for s in score_results],
        product_map, bsr_map, rv_result,
    )

    # ── Console summary ──────────────────────────────────────────
    sm = report["scoring_summary"]
    print(f"\n{'='*60}")
    print(f"  DISCOVERY COMPLETE")
    print(f"  ASINs scanned:        {len(disc.get('raw_asin_list', []))}")
    print(f"  Passed all filters:   {len(qualified)}")
    print(f"  Grade A (Excellent):  {sm.get('grade_A', 0)}")
    print(f"  Grade B (Good):       {sm.get('grade_B', 0)}")
    print(f"  Grade C (Average):    {sm.get('grade_C', 0)}")
    if sm.get("top_opportunity"):
        t = sm["top_opportunity"]
        print(f"  Top opportunity:      {t['asin']} — {t['score']}/100 ({t['grade']})")
        print(f"    {t['title'][:60]}")
    print(f"  Tokens used:          ~{metadata.get('tokens_used_estimate', 0)}")
    print(f"  Elapsed:              {elapsed:.1f}s")
    print(f"  Output:               {OUTPUT_JSON}")
    print(f"{'='*60}\n")

    return report


def _scoring_summary(score_results: List[Any]) -> Dict[str, Any]:
    if not score_results:
        return {}
    gc = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in score_results:
        gc[s.grade] = gc.get(s.grade, 0) + 1
    top = score_results[0]
    return {
        "total_scored": len(score_results),
        "grade_A": gc["A"], "grade_B": gc["B"], "grade_C": gc["C"],
        "grade_D": gc["D"], "grade_F": gc["F"],
        "avg_score": round(sum(s.total_score for s in score_results) / len(score_results), 1),
        "top_opportunity": {
            "asin": top.asin, "title": top.title,
            "score": top.total_score, "grade": top.grade, "verdict": top.verdict,
            "est_monthly_sales": top.estimated_monthly_sales,
            "est_monthly_revenue": top.estimated_monthly_revenue,
        },
    }


def check_tokens() -> None:
    try:
        client = KeepaClient()
        status = client.get_token_status()
        print(f"\n  Keepa Token Status")
        print(f"  {'─'*30}")
        print(f"  Tokens remaining:    {status['tokens_left']}")
        print(f"  Refill in:           {status['refill_in_seconds']}s")
        print(f"  Refill rate:         {status['refill_rate_per_minute']} tokens/min")
        print()
    except KeepaAPIError as exc:
        print(f"\n  ERROR: {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Scan Kitchen subcategories for private-label opportunities.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_discovery.py "kitchen"
  python run_discovery.py "kitchen" --max-subcategories 6 --max-reviews 300
  python run_discovery.py "kitchen" --min-bsr 300 --max-bsr 8000
  python run_discovery.py --check-tokens
        """,
    )
    parser.add_argument("niche", nargs="?", default="kitchen",
                        help='Niche name (default: "kitchen")')
    parser.add_argument("--category-id",       type=int,   default=284507)
    parser.add_argument("--min-bsr",           type=int,   default=500)
    parser.add_argument("--max-bsr",           type=int,   default=5000)
    parser.add_argument("--max-reviews",       type=int,   default=200)
    parser.add_argument("--min-price",         type=float, default=20.0)
    parser.add_argument("--min-monthly-sales", type=int,   default=300)
    parser.add_argument("--max-subcategories", type=int,   default=5)
    parser.add_argument("--force-refresh",     action="store_true")
    parser.add_argument("--check-tokens",      action="store_true")

    args = parser.parse_args()

    if args.check_tokens:
        check_tokens()
        sys.exit(0)

    run_discovery(
        niche=args.niche,
        parent_cat_id=args.category_id,
        min_bsr=args.min_bsr,
        max_bsr=args.max_bsr,
        max_reviews=args.max_reviews,
        min_price=args.min_price,
        min_monthly_sales=args.min_monthly_sales,
        max_subcategories=args.max_subcategories,
        force_refresh=args.force_refresh,
    )
