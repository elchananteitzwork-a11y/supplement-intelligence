"""
opportunity-discovery — subcategory sweep for private-label opportunities.

Replaces the main-category best-sellers sweep with a targeted scan of
specific Kitchen subcategories, returning only products that meet
initial private-label criteria (BSR 500-5000, reviews < 200, price > $20,
no dominant brand).
"""

import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.client import KeepaClient, KeepaAPIError, KeepaRateLimitError
from keepa.normalizer import normalize_product
from keepa.cache import KeepaCache
from keepa.discovery import (
    KITCHEN_PL_SUBCATEGORIES,
    is_excluded,
    meets_initial_criteria,
)


def run(
    niche:              str,
    parent_cat_id:      int,
    subcategory_ids:    Optional[Dict[str, int]] = None,
    min_bsr:            int   = 500,
    max_bsr:            int   = 5000,
    max_reviews:        int   = 200,
    min_price:          float = 20.0,
    max_subcategories:  int   = 5,
    max_asins_per_sub:  int   = 100,
    exclude_asins:      Optional[Set[str]] = None,
    force_refresh:      bool  = False,
    stats_days:         int   = 90,
) -> Dict[str, Any]:
    """
    Scan Kitchen subcategories and return normalized products meeting
    private-label entry criteria.

    Args:
        niche:             Human-readable niche label (used for cache key).
        parent_cat_id:     Root category node (e.g. 284507 = Kitchen).
        subcategory_ids:   Dict of {name: node_id} to scan. Defaults to
                           KITCHEN_PL_SUBCATEGORIES from keepa.discovery.
        min_bsr / max_bsr: Kitchen BSR window to target.
        max_reviews:       Maximum current review count.
        min_price:         Minimum selling price.
        max_subcategories: How many subcategories to sweep (token budget).
        exclude_asins:     ASINs already fetched (skip to save tokens).
        force_refresh:     Bypass disk cache.
        stats_days:        Keepa stats window in days.

    Returns dict with metadata and normalized_products (pre-filtered).
    """
    subs = subcategory_ids or KITCHEN_PL_SUBCATEGORIES
    # Take only the first N subcategories
    selected = dict(list(subs.items())[:max_subcategories])

    print(f"\n{'='*60}")
    print(f"  opportunity-discovery")
    print(f"  Parent category: {parent_cat_id}")
    print(f"  Subcategories to scan: {len(selected)}")
    print(f"  Criteria: BSR {min_bsr}–{max_bsr} | reviews < {max_reviews} | price ≥ ${min_price}")
    print(f"{'='*60}")

    cache      = KeepaCache()
    cache_key  = f"{niche}_discovery"

    # ── Cache check ──────────────────────────────────────────────
    if not force_refresh:
        cached = cache.get(cache_key, parent_cat_id)
        if cached:
            print(f"  Returning cached discovery data ({len(cached.get('normalized_products', []))} products).")
            return cached

    # ── Init client ──────────────────────────────────────────────
    try:
        client = KeepaClient()
    except ValueError as exc:
        print(f"\n  ERROR: {exc}")
        sys.exit(1)

    try:
        token_status  = client.get_token_status()
        tokens_before = token_status["tokens_left"]
        print(f"  Tokens available: {tokens_before}")
        if tokens_before < 300:
            print(f"  WARNING: Low token balance ({tokens_before}). "
                  f"Consider waiting for refill before scanning {len(selected)} subcategories.")
    except KeepaAPIError as exc:
        print(f"  ERROR checking tokens: {exc}")
        sys.exit(1)

    # ── Sweep subcategories for ASINs ────────────────────────────
    discovered: Dict[str, str] = {}   # asin → subcategory name
    already_known = exclude_asins or set()

    for sub_name, sub_id in selected.items():
        try:
            resp  = client.get_best_sellers(sub_id)
            # Subcategory bestsellers returns up to 10,000 ASINs (entire catalog
            # sorted by BSR). Cap at max_asins_per_sub — we only want the top-ranked
            # products, which are the ones most likely to be BSR 500-5000 in Kitchen.
            asins = resp.get("bestSellersList", {}).get("asinList", [])[:max_asins_per_sub]
            new   = [a for a in asins if a not in already_known and a not in discovered]
            for a in new:
                discovered[a] = sub_name
            print(f"  [{sub_name[:42]:<42}]  {len(new):>3} new ASINs  "
                  f"(tokens left: {client.last_tokens_left})")
        except KeepaAPIError as exc:
            print(f"  WARNING: Best sellers failed for {sub_name}: {exc}")
        time.sleep(0.8)

    asins_to_fetch = list(discovered.keys())
    print(f"\n  Unique new ASINs to fetch: {len(asins_to_fetch)}")

    if not asins_to_fetch:
        print("  No new ASINs found. Try --force-refresh or different subcategories.")
        return {"metadata": _meta(niche, parent_cat_id, 0, tokens_before),
                "normalized_products": [], "raw_asin_list": []}

    # ── Fetch product data ────────────────────────────────────────
    print(f"\n  Fetching {len(asins_to_fetch)} products (stats={stats_days}d)...")
    try:
        raw_products = client.get_products_batched(
            asins_to_fetch, stats=stats_days, delay_between_batches=1.2)
    except KeepaRateLimitError as exc:
        print(f"  ERROR: {exc}")
        sys.exit(1)
    except KeepaAPIError as exc:
        print(f"  ERROR: {exc}")
        sys.exit(1)

    tokens_after = client.last_tokens_left
    tokens_used  = max(0, tokens_before - tokens_after)
    print(f"  Products received: {len(raw_products)}")
    print(f"  Tokens used: ~{tokens_used}  |  Remaining: {tokens_after}")

    # ── Normalize ─────────────────────────────────────────────────
    print("\n  Normalizing and filtering...")
    all_normalized:      List[Dict[str, Any]] = []
    criteria_passed:     List[Dict[str, Any]] = []
    skipped_normalize    = 0
    rejected_bsr         = 0
    rejected_reviews     = 0
    rejected_price       = 0
    rejected_brand       = 0

    for raw in raw_products:
        if not raw or not raw.get("asin"):
            skipped_normalize += 1
            continue
        try:
            norm = normalize_product(raw)
        except Exception as exc:
            print(f"  WARNING: normalize failed for {raw.get('asin')}: {exc}")
            skipped_normalize += 1
            continue

        norm["_source_subcategory"] = discovered.get(norm["asin"], "unknown")
        all_normalized.append(norm)

        cur   = norm.get("current", {})
        bsr   = cur.get("bsr")
        rc    = cur.get("review_count")
        price = cur.get("amazon_price") or cur.get("buybox_price")

        if bsr is None or not (min_bsr <= bsr <= max_bsr):
            rejected_bsr += 1; continue
        if rc is not None and rc >= max_reviews:
            rejected_reviews += 1; continue
        if price is not None and price < min_price:
            rejected_price += 1; continue
        if is_excluded(norm):
            rejected_brand += 1; continue

        criteria_passed.append(norm)

    print(f"  Normalized:     {len(all_normalized)}")
    print(f"  Passed criteria:{len(criteria_passed)}")
    print(f"  Rejected — BSR out of range: {rejected_bsr}")
    print(f"  Rejected — too many reviews: {rejected_reviews}")
    print(f"  Rejected — price too low:    {rejected_price}")
    print(f"  Rejected — excluded brand:   {rejected_brand}")

    result = {
        "metadata": _meta(niche, parent_cat_id, tokens_used, tokens_after),
        "normalized_products": criteria_passed,
        "all_normalized": all_normalized,
        "raw_asin_list": asins_to_fetch,
        "rejection_summary": {
            "bsr_out_of_range": rejected_bsr,
            "too_many_reviews": rejected_reviews,
            "price_too_low":    rejected_price,
            "brand_excluded":   rejected_brand,
        },
    }
    cache.set(cache_key, result, parent_cat_id)
    print(f"\n  Done. {len(criteria_passed)} products passed initial criteria.\n")
    return result


def _meta(niche, category_id, tokens_used, tokens_remaining):
    from datetime import datetime, timezone
    return {
        "niche": niche,
        "category_id": category_id,
        "discovery_mode": True,
        "marketplace": "US",
        "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
        "tokens_used_estimate": tokens_used,
        "tokens_remaining": tokens_remaining,
    }
