"""
run_keepa_phase1.py — Phase 1 orchestrator.

Runs the full Keepa data pipeline:
  Step 1: keepa-data-fetcher   — fetch + normalize product data
  Step 2: bsr-trend-analyzer   — demand signals from BSR history
  Step 3: review-velocity-tracker — accessibility from review data
  Step 4: price-history-analyzer  — margin signals from price history
  Step 5: write keepa-report.json to disk

Does NOT touch the scoring engine. Goal: fetch and normalize only.

Usage:
  python run_keepa_phase1.py "dog lick mats"
  python run_keepa_phase1.py "silicone kitchen tools" --category-id 284507
  python run_keepa_phase1.py "pet accessories" --max-products 50 --force-refresh
  python run_keepa_phase1.py --check-tokens        (check balance without fetching)
"""

import argparse
import dataclasses
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Load .env if present (before importing any module that reads env vars)
_env_path = Path(".env")
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

# Add project root to path so sub-modules resolve correctly
sys.path.insert(0, str(Path(__file__).parent))

import importlib.util

from keepa.client import KeepaClient, KeepaAPIError


def _load(name: str, rel_path: str):
    """Load a module from a file path (handles hyphenated directory names)."""
    full = Path(__file__).parent / rel_path
    spec = importlib.util.spec_from_file_location(name, full)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


data_fetcher   = _load("fetcher",        ".claude-plugin/agents/keepa-data-fetcher/fetcher.py")
bsr_analyzer   = _load("bsr_analyzer",   ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker     = _load("rv_tracker",     ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer = _load("price_analyzer", ".claude-plugin/agents/price-history-analyzer/analyzer.py")
product_scorer = _load("product_scorer", ".claude-plugin/agents/product-scorer/scorer.py")


OUTPUT_FILE = Path("keepa-report.json")


# ------------------------------------------------------------------
# JSON serializer that handles dataclasses and None gracefully
# ------------------------------------------------------------------

def _json_default(obj: Any) -> Any:
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def _write_report(report: Dict[str, Any]) -> None:
    with OUTPUT_FILE.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default, ensure_ascii=False)
    size_kb = OUTPUT_FILE.stat().st_size // 1024
    print(f"\n  Report written → {OUTPUT_FILE}  ({size_kb} KB)")


# ------------------------------------------------------------------
# Main pipeline
# ------------------------------------------------------------------

def run_phase1(
    niche: str,
    category_id: Optional[int] = None,
    max_products: int = 100,
    stats_days: int = 90,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    start = datetime.now(tz=timezone.utc)
    print(f"\n{'#'*60}")
    print(f"  Keepa Phase 1 Pipeline")
    print(f"  Niche: {niche!r}")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'#'*60}")

    # ── Step 1: Fetch ────────────────────────────────────────────
    fetch_result = data_fetcher.fetch_niche(
        niche=niche,
        category_id=category_id,
        max_products=max_products,
        stats_days=stats_days,
        force_refresh=force_refresh,
    )

    products = fetch_result.get("normalized_products", [])
    metadata = fetch_result.get("metadata", {})

    if not products:
        print("\n  No products to analyze. Check category ID or API key.")
        return {}

    # ── Step 2: BSR trend analysis ───────────────────────────────
    bsr_results = bsr_analyzer.run(products)

    # ── Step 3: Review velocity ──────────────────────────────────
    review_result = rv_tracker.run(products, bsr_analyses=bsr_results)

    # ── Step 4: Price history ────────────────────────────────────
    price_result = price_analyzer.run(products)

    # ── Step 5: Score products ───────────────────────────────────
    score_results = product_scorer.run(products, bsr_results, review_result, price_result)

    # Inject opportunity score into each product dict for easy access
    scores_by_asin = {s.asin: s for s in score_results}
    for p in products:
        s = scores_by_asin.get(p.get("asin"))
        if s:
            p["opportunity_score"] = s.total_score
            p["grade"] = s.grade
            p["verdict"] = s.verdict

    # ── Step 6: Build and write report ───────────────────────────
    elapsed = (datetime.now(tz=timezone.utc) - start).total_seconds()

    report = {
        "generated_at": start.isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "phase": "1+2 — Fetch, Normalize, Score",
        "niche": niche,
        "marketplace": "US",
        "category_id": metadata.get("category_id"),
        "category_name": metadata.get("category_name"),

        # API usage
        "keepa_tokens_used_estimate": metadata.get("tokens_used_estimate", 0),
        "keepa_tokens_remaining": metadata.get("tokens_remaining", -1),

        # Counts
        "asins_fetched": len(fetch_result.get("raw_asin_list", [])),
        "products_normalized": len(products),
        "products_scored": len(score_results),

        # Scoring summary (top-level overview)
        "scoring_summary": _scoring_summary(score_results),

        # Analysis outputs
        "bsr_summary": _bsr_summary(bsr_results),
        "review_analysis": review_result,
        "price_analysis": price_result,

        # Per-product scores (full factor breakdown)
        "product_scores": score_results,

        # Full product list (with opportunity_score, grade, verdict injected)
        "products": products,

        # Per-product BSR analyses
        "bsr_analyses": bsr_results,
    }

    _write_report(report)

    # ── Console summary ──────────────────────────────────────────
    sm = report["scoring_summary"]
    print(f"\n{'='*60}")
    print(f"  PHASE 1+2 COMPLETE")
    print(f"  Products fetched:    {len(products)}")
    print(f"  Products scored:     {len(score_results)}")
    print(f"  Grade A (Excellent): {sm.get('grade_A', 0)}")
    print(f"  Grade B (Good):      {sm.get('grade_B', 0)}")
    print(f"  Grade C (Average):   {sm.get('grade_C', 0)}")
    print(f"  Grade D/F (Poor):    {sm.get('grade_D', 0) + sm.get('grade_F', 0)}")
    if sm.get("top_opportunity"):
        t = sm["top_opportunity"]
        print(f"  Top opportunity:     {t['asin']} — {t['score']}/100 ({t['grade']})")
    print(f"  Tokens used:         ~{metadata.get('tokens_used_estimate', 0)}")
    print(f"  Elapsed:             {elapsed:.1f}s")
    print(f"  Output:              {OUTPUT_FILE}")
    print(f"{'='*60}\n")

    return report


def _scoring_summary(score_results: List[Any]) -> Dict[str, Any]:
    """Top-level scoring overview for the report header."""
    if not score_results:
        return {}
    grade_counts = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in score_results:
        grade_counts[s.grade] = grade_counts.get(s.grade, 0) + 1
    top = score_results[0] if score_results else None
    return {
        "total_scored": len(score_results),
        "grade_A": grade_counts["A"],
        "grade_B": grade_counts["B"],
        "grade_C": grade_counts["C"],
        "grade_D": grade_counts["D"],
        "grade_F": grade_counts["F"],
        "avg_score": round(sum(s.total_score for s in score_results) / len(score_results), 1),
        "top_opportunity": {
            "asin": top.asin,
            "title": top.title,
            "score": top.total_score,
            "grade": top.grade,
            "verdict": top.verdict,
            "est_monthly_sales": top.estimated_monthly_sales,
            "est_monthly_revenue": top.estimated_monthly_revenue,
        } if top else None,
    }


def _bsr_summary(bsr_results: List[Any]) -> Dict[str, Any]:
    """Compact BSR summary for the report header."""
    if not bsr_results:
        return {}
    with_sales = [r for r in bsr_results if r.estimated_monthly_sales]
    top5 = bsr_results[:5]
    return {
        "total_analyzed": len(bsr_results),
        "with_sales_estimate": len(with_sales),
        "improving_trend_count": sum(1 for r in bsr_results if r.trend_direction == "Improving"),
        "declining_trend_count": sum(1 for r in bsr_results if r.trend_direction == "Declining"),
        "seasonal_count": sum(1 for r in bsr_results if r.is_seasonal),
        "top_5_by_demand": [
            {
                "asin": r.asin,
                "title": r.title,
                "avg_bsr_90d": r.avg_bsr_90d,
                "est_monthly_sales": r.estimated_monthly_sales,
                "trend": r.trend_direction,
                "velocity": r.demand_velocity,
            }
            for r in top5
        ],
    }


# ------------------------------------------------------------------
# Token check (no data fetch)
# ------------------------------------------------------------------

def check_tokens() -> None:
    try:
        client = KeepaClient()
        status = client.get_token_status()
        print(f"\n  Keepa Token Status")
        print(f"  {'─'*30}")
        print(f"  Tokens remaining:    {status['tokens_left']}")
        print(f"  Refill in:           {status['refill_in_seconds']}s")
        print(f"  Refill rate:         {status['refill_rate_per_minute']} tokens/min")
        if status.get("monthly_limit", -1) > 0:
            print(f"  Monthly limit:       {status['monthly_limit']}")
        print()
    except KeepaAPIError as exc:
        print(f"\n  ERROR: {exc}\n")
        sys.exit(1)


# ------------------------------------------------------------------
# CLI
# ------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run the Keepa Phase 1 data pipeline.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_keepa_phase1.py "dog lick mats"
  python run_keepa_phase1.py "kitchen gadgets" --category-id 284507
  python run_keepa_phase1.py "pet accessories" --max-products 50
  python run_keepa_phase1.py --check-tokens
        """,
    )
    parser.add_argument(
        "niche",
        nargs="?",
        help='Niche keyword (e.g. "dog lick mats")',
    )
    parser.add_argument(
        "--category-id", type=int, default=None,
        help="Override Keepa category node ID",
    )
    parser.add_argument(
        "--max-products", type=int, default=100,
        help="Max products to fetch (default: 100)",
    )
    parser.add_argument(
        "--stats-days", type=int, default=90,
        help="Statistics window in days (default: 90)",
    )
    parser.add_argument(
        "--force-refresh", action="store_true",
        help="Bypass disk cache and fetch fresh data",
    )
    parser.add_argument(
        "--check-tokens", action="store_true",
        help="Check Keepa token balance and exit",
    )

    args = parser.parse_args()

    if args.check_tokens:
        check_tokens()
        sys.exit(0)

    if not args.niche:
        parser.error("niche argument is required unless --check-tokens is set.")

    run_phase1(
        niche=args.niche,
        category_id=args.category_id,
        max_products=args.max_products,
        stats_days=args.stats_days,
        force_refresh=args.force_refresh,
    )
