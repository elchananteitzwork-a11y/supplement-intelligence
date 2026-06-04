"""
run_pet_discovery.py — Pet Supplies private-label scanner.

Uses the IDENTICAL analysis pipeline as run_discovery.py (same discovery
agent, BSR analyzer, review tracker, price analyzer, scorer) but points
at Pet Supplies subcategories instead of Kitchen.

This file was written to test whether the discovery engine is
category-agnostic.  NO existing code was modified.

Usage:
  python3 run_pet_discovery.py
  python3 run_pet_discovery.py --check-tokens
  python3 run_pet_discovery.py --force-refresh
"""

import argparse, csv as csv_module, dataclasses, importlib.util, json, os, sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

# ── Load .env ───────────────────────────────────────────────────────────────
_env = Path(".env")
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            k, _, v = _line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

sys.path.insert(0, str(Path(__file__).parent))

from keepa.client import KeepaClient, KeepaAPIError
from keepa.discovery import apply_post_analysis_filter


def _load(name, rel):
    full = Path(__file__).parent / rel
    spec = importlib.util.spec_from_file_location(name, full)
    mod  = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


discovery_agent = _load("discovery",     ".claude-plugin/agents/opportunity-discovery/discovery.py")
bsr_analyzer    = _load("bsr_analyzer",  ".claude-plugin/agents/bsr-trend-analyzer/analyzer.py")
rv_tracker      = _load("rv_tracker",    ".claude-plugin/agents/review-velocity-tracker/tracker.py")
price_analyzer  = _load("price_analyzer",".claude-plugin/agents/price-history-analyzer/analyzer.py")
product_scorer  = _load("product_scorer",".claude-plugin/agents/product-scorer/scorer.py")

# ── Pet Supplies subcategory catalog ────────────────────────────────────────
# IDs verified via live Keepa bestsellers probe on 2026-06-04.
PET_PL_SUBCATEGORIES: Dict[str, int] = {
    "Dog Toys":           2975317011,   #   830 ASINs in category
    "Dog Beds/Furniture": 2975315011,   # 10000 ASINs
    "Pet Grooming":       2975321011,   #  2478 ASINs
    "Dog Training":       2975320011,   #  3101 ASINs
    "Dog Kennels/Crates": 2975314011,   #   303 ASINs
}

PET_PARENT_CAT_ID = 2619533   # Pet Supplies root

OUTPUT_JSON = Path("keepa-pet-discovery-report.json")
OUTPUT_CSV  = Path("pet-discovery-opportunities.csv")


def _json_default(obj):
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return dataclasses.asdict(obj)
    raise TypeError(type(obj).__name__)


def run_pet_discovery(
    min_bsr:           int   = 500,
    max_bsr:           int   = 5000,
    max_reviews:       int   = 200,
    min_price:         float = 20.0,
    min_monthly_sales: int   = 300,
    max_subcategories: int   = 3,
    max_asins_per_sub: int   = 15,
    force_refresh:     bool  = False,
) -> Dict[str, Any]:

    start = datetime.now(tz=timezone.utc)
    print(f"\n{'#'*60}")
    print(f"  Pet Supplies Private-Label Discovery")
    print(f"  Criteria: BSR {min_bsr}–{max_bsr} | reviews < {max_reviews} | price ≥ ${min_price}")
    print(f"  Subcategories: {max_subcategories}  |  ASINs/sub: {max_asins_per_sub}")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"{'#'*60}")

    # Load ASINs already seen in prior scans to avoid re-fetching
    known = set()
    for path in ["keepa-report.json", "keepa-discovery-report.json"]:
        p = Path(path)
        if p.exists():
            try:
                d = json.loads(p.read_text())
                for item in d.get("bsr_analyses") or []:
                    known.add(item.get("asin","") if isinstance(item, dict) else item)
            except Exception:
                pass
    if known:
        print(f"  Excluding {len(known)} already-fetched ASINs.")

    # ── Step 1: Discovery ──────────────────────────────────────────────────
    disc = discovery_agent.run(
        niche="pet_supplies",
        parent_cat_id=PET_PARENT_CAT_ID,
        subcategory_ids=PET_PL_SUBCATEGORIES,          # ← the key parameter
        min_bsr=min_bsr,
        max_bsr=max_bsr,
        max_reviews=max_reviews,
        min_price=min_price,
        max_subcategories=max_subcategories,
        max_asins_per_sub=max_asins_per_sub,
        exclude_asins=known,
        force_refresh=force_refresh,
    )

    products = disc.get("normalized_products", [])
    metadata = disc.get("metadata", {})

    if not products:
        print("\n  No products passed initial criteria.")
        return {}

    print(f"\n  {len(products)} products passed initial criteria — running pipeline...")

    # ── Steps 2-6: Identical pipeline as run_discovery.py ─────────────────
    bsr_results = bsr_analyzer.run(products)

    qualified = apply_post_analysis_filter(
        products, bsr_results,
        min_monthly_sales=min_monthly_sales,
        allowed_trends={"Improving", "Stable"},
    )
    print(f"\n  After post-analysis filter: {len(qualified)} products")

    if not qualified:
        print("  No products remain after filtering.")
        return {}

    rv_result     = rv_tracker.run(qualified, bsr_analyses=bsr_results)
    price_result  = price_analyzer.run(qualified)
    score_results = product_scorer.run(qualified, bsr_results, rv_result, price_result)

    scores_by_asin = {s.asin: s for s in score_results}
    for p in qualified:
        s = scores_by_asin.get(p.get("asin"))
        if s:
            p["opportunity_score"] = s.total_score
            p["grade"]   = s.grade
            p["verdict"] = s.verdict

    elapsed = (datetime.now(tz=timezone.utc) - start).total_seconds()

    sm = _scoring_summary(score_results)
    report = {
        "generated_at":   start.isoformat(),
        "elapsed_seconds": round(elapsed, 1),
        "mode":           "pet-supplies-discovery",
        "niche":          "pet_supplies",
        "marketplace":    "US",
        "parent_category_id": PET_PARENT_CAT_ID,
        "criteria": {
            "bsr_range":   [min_bsr, max_bsr],
            "max_reviews": max_reviews,
            "min_price":   min_price,
            "min_sales_mo": min_monthly_sales,
        },
        "keepa_tokens_used_estimate": metadata.get("tokens_used_estimate", 0),
        "keepa_tokens_remaining":     metadata.get("tokens_remaining", -1),
        "asins_fetched":         len(disc.get("raw_asin_list", [])),
        "passed_initial_filter": len(products),
        "passed_post_filter":    len(qualified),
        "products_scored":       len(score_results),
        "scoring_summary":       sm,
        "product_scores":        score_results,
        "review_analysis":       rv_result,
        "price_analysis":        price_result,
        "bsr_analyses":          bsr_results,
        "products":              qualified,
        "raw_asin_list":         disc.get("raw_asin_list", []),
        "rejection_summary":     disc.get("rejection_summary", {}),
    }

    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default, ensure_ascii=False)
    print(f"\n  JSON → {OUTPUT_JSON}  ({OUTPUT_JSON.stat().st_size // 1024} KB)")

    # CSV
    _write_csv(score_results, {p["asin"]: p for p in qualified},
               {b.asin: dataclasses.asdict(b) for b in bsr_results}, rv_result)

    print(f"\n{'='*60}")
    print(f"  PET SUPPLIES DISCOVERY COMPLETE")
    print(f"  ASINs scanned:       {len(disc.get('raw_asin_list', []))}")
    print(f"  Passed all filters:  {len(qualified)}")
    print(f"  Grade A (Excellent): {sm.get('grade_A', 0)}")
    print(f"  Grade B (Good):      {sm.get('grade_B', 0)}")
    print(f"  Grade C (Average):   {sm.get('grade_C', 0)}")
    if sm.get("top_opportunity"):
        t = sm["top_opportunity"]
        print(f"  Top opportunity:     {t['asin']} — {t['score']}/100 ({t['grade']})")
        print(f"    {t['title'][:65]}")
    print(f"  Tokens used:         ~{metadata.get('tokens_used_estimate', 0)}")
    print(f"  Elapsed:             {elapsed:.1f}s")
    print(f"{'='*60}\n")

    return report


def _scoring_summary(score_results):
    if not score_results:
        return {}
    gc  = {"A":0,"B":0,"C":0,"D":0,"F":0}
    for s in score_results:
        gc[s.grade] = gc.get(s.grade, 0) + 1
    top = score_results[0]
    return {
        "total_scored": len(score_results),
        "grade_A": gc["A"], "grade_B": gc["B"], "grade_C": gc["C"],
        "grade_D": gc["D"], "grade_F": gc["F"],
        "avg_score": round(sum(s.total_score for s in score_results)/len(score_results), 1),
        "top_opportunity": {
            "asin": top.asin, "title": top.title,
            "score": top.total_score, "grade": top.grade, "verdict": top.verdict,
            "est_monthly_sales": top.estimated_monthly_sales,
        },
    }


def _write_csv(scores, products, bsr_map, rv_result):
    from datetime import timedelta
    fields = [
        "rank","asin","title","score","grade","verdict",
        "source_subcategory","price_usd","bsr","bsr_trend","demand_velocity",
        "review_count","rating","review_velocity_90d",
        "calibrated_sales_mo","estimated_revenue_mo",
        "fba_size_tier","estimated_fba_fee","net_margin_pct",
        "accessibility","offer_count","is_seasonal","seasonal_peak",
        "data_penalty","risk_flags",
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

    def risk_flags(s, p, b):
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
        s_d = dataclasses.asdict(s)
        p   = products.get(s.asin, {})
        b   = bsr_map.get(s.asin, {})
        cur = p.get("current", {})
        rows.append({
            "rank": rank, "asin": s.asin,
            "title": (s_d.get("title") or "")[:100],
            "score": s_d["total_score"], "grade": s_d["grade"], "verdict": s_d["verdict"],
            "source_subcategory": p.get("_source_subcategory",""),
            "price_usd": cur.get("amazon_price") or cur.get("buybox_price") or "",
            "bsr": cur.get("bsr") or "",
            "bsr_trend": b.get("trend_direction") or "",
            "demand_velocity": b.get("demand_velocity") or "",
            "review_count": cur.get("review_count") or "",
            "rating": cur.get("rating") or "",
            "review_velocity_90d": rev_vel(p),
            "calibrated_sales_mo": s_d.get("calibrated_monthly_sales") or "",
            "estimated_revenue_mo": round(s_d["estimated_monthly_revenue"],2) if s_d.get("estimated_monthly_revenue") else "",
            "fba_size_tier": s_d.get("fba_size_tier") or "",
            "estimated_fba_fee": s_d.get("estimated_fba_fee") or "",
            "net_margin_pct": s_d.get("estimated_net_margin_pct") or "",
            "accessibility": rv_result.accessibility_verdict if rv_result else "",
            "offer_count": cur.get("offer_count") or "",
            "is_seasonal": b.get("is_seasonal") or "",
            "seasonal_peak": b.get("seasonal_peak_month") or "",
            "data_penalty": s_d.get("data_penalty") or 0,
            "risk_flags": risk_flags(s_d, p, b),
        })

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv_module.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  CSV → {OUTPUT_CSV}  ({len(rows)} opportunities)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pet Supplies PL discovery scan.")
    parser.add_argument("--check-tokens",      action="store_true")
    parser.add_argument("--force-refresh",     action="store_true")
    parser.add_argument("--max-subcategories", type=int,   default=3)
    parser.add_argument("--max-asins-per-sub", type=int,   default=15)
    parser.add_argument("--min-bsr",           type=int,   default=500)
    parser.add_argument("--max-bsr",           type=int,   default=5000)
    parser.add_argument("--max-reviews",       type=int,   default=200)
    parser.add_argument("--min-price",         type=float, default=20.0)
    parser.add_argument("--min-monthly-sales", type=int,   default=300)
    args = parser.parse_args()

    if args.check_tokens:
        client = KeepaClient()
        s = client.get_token_status()
        print(f"\n  Keepa Token Status")
        print(f"  Tokens remaining: {s['tokens_left']}")
        print(f"  Refill rate:      {s['refill_rate_per_minute']} tokens/min\n")
        sys.exit(0)

    run_pet_discovery(
        min_bsr=args.min_bsr,
        max_bsr=args.max_bsr,
        max_reviews=args.max_reviews,
        min_price=args.min_price,
        min_monthly_sales=args.min_monthly_sales,
        max_subcategories=args.max_subcategories,
        max_asins_per_sub=args.max_asins_per_sub,
        force_refresh=args.force_refresh,
    )
