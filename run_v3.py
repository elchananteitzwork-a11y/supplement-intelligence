"""
run_v3.py — V3 Product Discovery Engine CLI.

Same fetch + normalize + BSR/review/price analysis pipeline as run_discovery.py,
but scores products through the V3 7-component engine instead of V2.

Usage:
  python run_v3.py kitchen
  python run_v3.py pet
  python run_v3.py beauty
  python run_v3.py supplements
  python run_v3.py kitchen --max-subcategories 6
  python run_v3.py kitchen --min-bsr 300 --max-bsr 8000 --max-reviews 300
  python run_v3.py kitchen --force-refresh
  python run_v3.py --check-tokens
"""

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

# ── Load .env ─────────────────────────────────────────────────────
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
from v3.engine import run as v3_run
from v3.output import write_csv, write_json

_OUTPUT_JSON = Path("v3-discovery-report.json")
_OUTPUT_CSV  = Path("v3-opportunities.csv")


def _load(name: str, rel_path: str):
    full = Path(__file__).parent / rel_path
    spec = importlib.util.spec_from_file_location(name, full)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


discovery_agent = _load("discovery",     ".claude-plugin/agents/opportunity-discovery/discovery.py")
bsr_analyzer    = _load("bsr_analyzer",  ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker      = _load("rv_tracker",    ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer  = _load("price_analyzer",".claude-plugin/agents/price-history-analyzer/analyzer.py")


def run_v3(
    niche:             str,
    parent_cat_id:     int   = 284507,
    subcategory_ids:   Optional[Dict[str, int]] = None,
    min_bsr:           int   = 500,
    max_bsr:           int   = 5000,
    max_reviews:       int   = 200,
    min_price:         float = 20.0,
    min_monthly_sales: int   = 300,
    max_subcategories: int   = 5,
    force_refresh:     bool  = False,
    category_config            = None,
) -> Dict[str, Any]:

    start = datetime.now(tz=timezone.utc)
    print(f"\n{'#'*60}")
    print(f"  V3 Product Discovery Engine")
    print(f"  Niche: {niche!r}")
    print(f"  Criteria: BSR {min_bsr}–{max_bsr} | reviews < {max_reviews} | "
          f"price ≥ ${min_price} | sales ≥ {min_monthly_sales}/mo")
    print(f"  Subcategories: {max_subcategories}")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'#'*60}")

    # ── Step 1: Discovery ────────────────────────────────────────────
    disc = discovery_agent.run(
        niche=niche,
        parent_cat_id=parent_cat_id,
        subcategory_ids=subcategory_ids,
        min_bsr=min_bsr,
        max_bsr=max_bsr,
        max_reviews=max_reviews,
        min_price=min_price,
        max_subcategories=max_subcategories,
        max_asins_per_sub=50,
        exclude_asins=set(),
        force_refresh=force_refresh,
    )

    products = disc.get("normalized_products", [])
    metadata = disc.get("metadata", {})

    if not products:
        print("\n  No products passed initial criteria.")
        print("  Try: --force-refresh, wider BSR range, higher --max-reviews, or lower --min-price.")
        return {}

    print(f"\n  {len(products)} products passed initial criteria — running analysis pipeline...")

    # ── Step 2: BSR analysis ─────────────────────────────────────────
    bsr_results = bsr_analyzer.run(products)

    # ── Step 3: Post-analysis filter ──────────────────────────────────
    qualified = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )
    print(f"\n  After filter: {len(qualified)} products "
          f"(removed {len(products) - len(qualified)} declining / low-sales)")

    if not qualified:
        print("  No products remain after filtering. Try widening criteria.")
        return {}

    # ── Step 4: Review velocity ───────────────────────────────────────
    rv_result = rv_tracker.run(qualified, bsr_analyses=bsr_results)

    # ── Step 5: Price analysis ────────────────────────────────────────
    price_result = price_analyzer.run(qualified)

    # ── Step 6: V3 scoring ────────────────────────────────────────────
    print("\n  Running V3 7-component scoring engine...")
    scores = v3_run(
        products=qualified,
        bsr_results=bsr_results,
        rv_result=rv_result,
        price_result=price_result,
        category_config=category_config,
    )

    elapsed = (datetime.now(tz=timezone.utc) - start).total_seconds()

    # ── Output ───────────────────────────────────────────────────────
    meta = {
        "generated_at":     start.isoformat(),
        "elapsed_seconds":  round(elapsed, 1),
        "niche":            niche,
        "parent_cat_id":    parent_cat_id,
        "marketplace":      "US",
        "criteria": {
            "bsr_range":   [min_bsr, max_bsr],
            "max_reviews": max_reviews,
            "min_price":   min_price,
            "min_sales_mo": min_monthly_sales,
        },
        "asins_fetched":         len(disc.get("raw_asin_list", [])),
        "passed_initial_filter": len(products),
        "passed_post_filter":    len(qualified),
        "products_scored":       len(scores),
        "tokens_used_estimate":  metadata.get("tokens_used_estimate", 0),
        "tokens_remaining":      metadata.get("tokens_remaining", -1),
    }

    write_json(scores, meta, _OUTPUT_JSON)
    write_csv(scores, _OUTPUT_CSV)
    _print_summary(scores, elapsed, meta)

    return {**meta, "scores": scores}


def _print_summary(scores, elapsed, meta):
    strong  = sum(1 for s in scores if s.recommendation == "STRONG OPPORTUNITY")
    research = sum(1 for s in scores if s.recommendation == "WORTH RESEARCH")
    reject  = sum(1 for s in scores if s.recommendation == "REJECT")
    avg     = round(sum(s.final_score for s in scores) / len(scores), 1) if scores else 0

    print(f"\n{'='*60}")
    print(f"  V3 DISCOVERY COMPLETE")
    print(f"  ASINs scanned:           {meta['asins_fetched']}")
    print(f"  Passed all filters:      {meta['passed_post_filter']}")
    print(f"  STRONG OPPORTUNITY:      {strong}")
    print(f"  WORTH RESEARCH:          {research}")
    print(f"  REJECT:                  {reject}")
    print(f"  Average score:           {avg}/100")
    if scores:
        top = scores[0]
        print(f"  Top opportunity:         {top.asin} — {top.final_score}/100 ({top.recommendation})")
        print(f"    {top.title[:60]}")
        print(f"    RI: {top.review_integrity.score:.0f} | "
              f"Demand: {top.demand.score:.0f} | "
              f"NewSeller: {top.new_seller.score:.0f} | "
              f"Wipes: {top.wipe_events}")
    print(f"  Elapsed:                 {elapsed:.1f}s")
    print(f"  Output:                  {_OUTPUT_CSV}")
    print(f"{'='*60}\n")


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
        description="V3 Product Discovery Engine — 7-component opportunity scorer.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Known categories: {_cat.available()}

Examples:
  python run_v3.py kitchen
  python run_v3.py pet
  python run_v3.py supplements
  python run_v3.py beauty
  python run_v3.py kitchen --max-reviews 300 --max-subcategories 6
  python run_v3.py --check-tokens
        """,
    )
    parser.add_argument("niche", nargs="?", default="kitchen",
                        help=f"Category name (known: {_cat.available()}) or custom niche")
    parser.add_argument("--category-id",       type=int,   default=None)
    parser.add_argument("--min-bsr",           type=int,   default=None)
    parser.add_argument("--max-bsr",           type=int,   default=None)
    parser.add_argument("--max-reviews",       type=int,   default=None)
    parser.add_argument("--min-price",         type=float, default=None)
    parser.add_argument("--min-monthly-sales", type=int,   default=None)
    parser.add_argument("--max-subcategories", type=int,   default=5)
    parser.add_argument("--force-refresh",     action="store_true")
    parser.add_argument("--check-tokens",      action="store_true")

    args = parser.parse_args()

    if args.check_tokens:
        check_tokens()
        sys.exit(0)

    if _cat.is_known(args.niche):
        cfg = _cat.load(args.niche)
        _cat.activate(cfg)
        run_v3(
            niche=args.niche,
            parent_cat_id=cfg.parent_cat_id,
            subcategory_ids=cfg.subcategories,
            min_bsr=           args.min_bsr           if args.min_bsr           is not None else cfg.min_bsr,
            max_bsr=           args.max_bsr           if args.max_bsr           is not None else cfg.max_bsr,
            max_reviews=       args.max_reviews       if args.max_reviews       is not None else cfg.max_reviews,
            min_price=         args.min_price         if args.min_price         is not None else cfg.min_price,
            min_monthly_sales= args.min_monthly_sales if args.min_monthly_sales is not None else cfg.min_monthly_sales,
            max_subcategories= args.max_subcategories,
            force_refresh=     args.force_refresh,
            category_config=   cfg,
        )
    else:
        if not args.category_id:
            parser.error(
                f"'{args.niche}' is not a known category. "
                f"Provide --category-id, or use one of: {_cat.available()}"
            )
        run_v3(
            niche=args.niche,
            parent_cat_id=args.category_id,
            min_bsr=           args.min_bsr           if args.min_bsr           is not None else 500,
            max_bsr=           args.max_bsr           if args.max_bsr           is not None else 5000,
            max_reviews=       args.max_reviews       if args.max_reviews       is not None else 200,
            min_price=         args.min_price         if args.min_price         is not None else 20.0,
            min_monthly_sales= args.min_monthly_sales if args.min_monthly_sales is not None else 300,
            max_subcategories= args.max_subcategories,
            force_refresh=     args.force_refresh,
        )
