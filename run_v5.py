"""
run_v5.py — V5 Product Discovery Engine CLI.
Do not find products. Find the next AG1, Bloom, Liquid I.V., Stanley.

Usage:
  python run_v5.py kitchen
  python run_v5.py supplements
  python run_v5.py beauty
  python run_v5.py pet
  python run_v5.py supplements --max-reviews 300
  python run_v5.py --check-tokens
"""

import argparse
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

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
from v5.engine import run as v5_run
from v5.output import write_csv, write_json, print_top

_OUTPUT_JSON = Path("v5-brand-report.json")
_OUTPUT_CSV  = Path("v5-brand-opportunities.csv")


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


def run_v5(
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
    print(f"\n{'#'*70}")
    print(f"  V5 Brand Discovery Engine")
    print(f"  Mission: Find the next AG1, Bloom, Liquid I.V., Stanley.")
    print(f"  Niche: {niche!r}")
    print(f"  Criteria: BSR {min_bsr}–{max_bsr} | reviews < {max_reviews} | "
          f"price ≥ ${min_price} | sales ≥ {min_monthly_sales}/mo")
    if category_config:
        print(f"  Category: {category_config.display_name} | "
              f"rpp={category_config.repeat_purchase_potential} | "
              f"sub={'YES' if category_config.subscription_eligible else 'NO'}")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'#'*70}")

    disc = discovery_agent.run(
        niche=niche,
        parent_cat_id=parent_cat_id,
        subcategory_ids=subcategory_ids,
        min_bsr=min_bsr, max_bsr=max_bsr,
        max_reviews=max_reviews, min_price=min_price,
        max_subcategories=max_subcategories,
        max_asins_per_sub=50,
        exclude_asins=set(),
        force_refresh=force_refresh,
    )
    products = disc.get("normalized_products", [])
    metadata = disc.get("metadata", {})

    if not products:
        print("\n  No products passed initial criteria.")
        return {}

    print(f"\n  {len(products)} products passed initial criteria — running analysis pipeline...")

    bsr_results  = bsr_analyzer.run(products)
    qualified    = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )
    print(f"\n  After filter: {len(qualified)} products "
          f"(removed {len(products) - len(qualified)} declining / low-sales)")

    if not qualified:
        print("  No products remain. Try widening criteria.")
        return {}

    rv_result    = rv_tracker.run(qualified, bsr_analyses=bsr_results)
    price_result = price_analyzer.run(qualified)

    print("\n  Running V5 engine (8 layers: problem → trend → authenticity →")
    print("  amazon opportunity → review integrity → repeat purchase →")
    print("  brandability → amazon gap)...")

    scores = v5_run(
        products=qualified,
        bsr_results=bsr_results,
        rv_result=rv_result,
        price_result=price_result,
        category_config=category_config,
    )

    elapsed = (datetime.now(tz=timezone.utc) - start).total_seconds()
    meta = {
        "generated_at":          start.isoformat(),
        "elapsed_seconds":       round(elapsed, 1),
        "niche":                 niche,
        "marketplace":           "US",
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
        "trend_sources_status":  "all_stubs",
        "problem_sources_status": "all_stubs",
    }

    write_json(scores, meta, _OUTPUT_JSON)
    write_csv(scores, _OUTPUT_CSV)
    print_top(scores, n=5)
    _print_summary(scores, elapsed, meta)
    return {**meta, "scores": scores}


def _print_summary(scores, elapsed, meta):
    iconic   = sum(1 for s in scores if s.recommendation == "ICONIC BRAND POTENTIAL")
    strong   = sum(1 for s in scores if s.recommendation == "STRONG OPPORTUNITY")
    research = sum(1 for s in scores if s.recommendation == "WORTH RESEARCH")
    reject   = sum(1 for s in scores if s.recommendation == "REJECT")
    avg      = round(sum(s.final_score for s in scores) / len(scores), 1) if scores else 0
    sub_b    = sum(1 for s in scores if s.bonuses.subscription_model)
    sku_b    = sum(1 for s in scores if s.bonuses.multi_sku_potential)
    wipes    = sum(1 for s in scores if s.wipe_events > 0)

    print(f"{'='*70}")
    print(f"  V5 BRAND DISCOVERY COMPLETE")
    print(f"  ASINs scanned:           {meta['asins_fetched']}")
    print(f"  Passed all filters:      {meta['passed_post_filter']}")
    print(f"  ICONIC BRAND POTENTIAL:  {iconic}")
    print(f"  STRONG OPPORTUNITY:      {strong}")
    print(f"  WORTH RESEARCH:          {research}")
    print(f"  REJECT:                  {reject}")
    print(f"  Average score:           {avg}/100")
    print(f"  Subscription bonus:      {sub_b} product(s)")
    print(f"  Multi-SKU bonus:         {sku_b} product(s)")
    print(f"  Wipe detected:           {wipes} product(s)")
    print(f"  Elapsed:                 {elapsed:.1f}s")
    print(f"  Output:                  {_OUTPUT_CSV}")
    print(f"{'='*70}\n")


def check_tokens() -> None:
    try:
        client = KeepaClient()
        status = client.get_token_status()
        print(f"\n  Tokens remaining: {status['tokens_left']}  "
              f"| Refill in: {status['refill_in_seconds']}s\n")
    except KeepaAPIError as exc:
        print(f"\n  ERROR: {exc}\n"); sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="V5 Brand Discovery Engine — find future brands, not just products.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"Known categories: {_cat.available()}",
    )
    parser.add_argument("niche", nargs="?", default="supplements",
                        help=f"Category (best for V5: supplements, beauty). Known: {_cat.available()}")
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
        check_tokens(); sys.exit(0)

    if _cat.is_known(args.niche):
        cfg = _cat.load(args.niche)
        _cat.activate(cfg)
        run_v5(
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
            parser.error(f"'{args.niche}' unknown. Provide --category-id or use: {_cat.available()}")
        run_v5(
            niche=args.niche, parent_cat_id=args.category_id,
            min_bsr=           args.min_bsr           if args.min_bsr           is not None else 500,
            max_bsr=           args.max_bsr           if args.max_bsr           is not None else 5000,
            max_reviews=       args.max_reviews       if args.max_reviews       is not None else 200,
            min_price=         args.min_price         if args.min_price         is not None else 20.0,
            min_monthly_sales= args.min_monthly_sales if args.min_monthly_sales is not None else 300,
            max_subcategories= args.max_subcategories,
            force_refresh=     args.force_refresh,
        )
