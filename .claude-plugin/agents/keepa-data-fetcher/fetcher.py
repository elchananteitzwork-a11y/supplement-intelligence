"""
keepa-data-fetcher — Phase 1 agent script.

Responsibility: sole API communication layer.
  1. Accept a niche keyword + optional category node ID.
  2. Check disk cache; skip API calls if fresh data exists.
  3. Fetch the Best Sellers ASIN list for the category.
  4. Bulk-fetch full product data for all ASINs (batches of 100).
  5. Normalize every product (timestamps → ISO, prices → USD).
  6. Write normalized products to cache.
  7. Return a dict ready for downstream analysis agents.

No other agent calls the Keepa API directly.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Allow running from project root or from this directory
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.client import KeepaClient, KeepaAPIError, KeepaRateLimitError
from keepa.normalizer import normalize_product
from keepa.cache import KeepaCache


# ------------------------------------------------------------------
# Known category node IDs (Amazon US)
# Add more as needed. Find node IDs from amazon.com URL ?node=XXXXX
# ------------------------------------------------------------------
CATEGORY_NODES: Dict[str, int] = {
    "pet supplies":        2619533,
    "pet accessories":     2619533,
    "dog":                 2975312091,
    "cat":                 2975313011,
    "kitchen":             284507,
    "kitchen & dining":    284507,
    "home & kitchen":      1055398,
    "sports":              3375251,
    "sports & outdoors":   3375251,
    "fitness":             3407731,
    "health":              3760901,
    "health & personal care": 3760901,
    "baby":                165796011,
    "baby products":       165796011,
    "automotive":          15684181,
    "office":              1064954,
    "home office":         1064954,
    "clothing":            7141123011,
    "beauty":              3760911,
}


def resolve_category(niche: str, explicit_id: Optional[int] = None) -> Optional[int]:
    """
    Resolve a niche keyword to a Keepa category node ID.
    Tries exact match, then partial match against known nodes.
    Returns None if no match found (will skip best-sellers fetch).
    """
    if explicit_id:
        return explicit_id

    niche_lower = niche.lower()

    # Exact match first
    if niche_lower in CATEGORY_NODES:
        return CATEGORY_NODES[niche_lower]

    # Partial match (e.g. "dog lick mats" → "dog" → 2975312091)
    for keyword, node_id in CATEGORY_NODES.items():
        if keyword in niche_lower:
            return node_id

    return None


def fetch_niche(
    niche: str,
    category_id: Optional[int] = None,
    max_products: int = 100,
    stats_days: int = 90,
    force_refresh: bool = False,
) -> Dict[str, Any]:
    """
    Main entry point for the keepa-data-fetcher agent.

    Args:
        niche:         Plain-language niche description (e.g. "dog lick mats").
        category_id:   Override category node ID. Auto-resolved if None.
        max_products:  Maximum products to fetch (capped at 100 for Phase 1).
        stats_days:    Statistics window in days (90 recommended).
        force_refresh: Bypass cache and fetch fresh data.

    Returns a dict containing:
        - metadata (niche, category, tokens, timestamps)
        - normalized_products: list of normalized product dicts
        - raw_asin_list: ASINs fetched
    """
    print(f"\n{'='*60}")
    print(f"  keepa-data-fetcher")
    print(f"  Niche: {niche!r}")
    print(f"{'='*60}")

    cache = KeepaCache()

    # ── Step 1: Cache check ──────────────────────────────────────
    resolved_category = resolve_category(niche, category_id)

    if not force_refresh:
        cached = cache.get(niche, resolved_category)
        if cached:
            print(f"  Returning cached data ({len(cached.get('normalized_products', []))} products).")
            return cached

    # ── Step 2: Init client ──────────────────────────────────────
    try:
        client = KeepaClient()
    except ValueError as exc:
        print(f"\n  ERROR: {exc}")
        sys.exit(1)

    # Check token balance before spending any
    try:
        token_status = client.get_token_status()
        tokens_before = token_status["tokens_left"]
        print(f"  Tokens available: {tokens_before}")
        if tokens_before < 200:
            print(f"  WARNING: Token balance is low ({tokens_before}). "
                  "Consider waiting for tokens to regenerate.")
    except KeepaRateLimitError as exc:
        print(f"  ERROR: {exc}")
        sys.exit(1)
    except KeepaAPIError as exc:
        print(f"  ERROR checking token status: {exc}")
        sys.exit(1)

    # ── Step 3: Resolve category & fetch Best Sellers ASIN list ──
    asins_to_fetch: List[str] = []
    category_name: Optional[str] = None

    if resolved_category:
        print(f"  Category node ID: {resolved_category}")
        try:
            bs_resp = client.get_best_sellers(resolved_category)
            bs_list = bs_resp.get("bestSellersList") or {}
            asins_to_fetch = (bs_list.get("asinList") or [])[:max_products]
            print(f"  Best Sellers returned: {len(asins_to_fetch)} ASINs")
        except KeepaAPIError as exc:
            print(f"  WARNING: Could not fetch Best Sellers: {exc}")
            print("  Proceeding with empty ASIN list — add ASINs manually.")
    else:
        print(f"  No category node found for {niche!r}.")
        print("  Add it to CATEGORY_NODES in fetcher.py or pass category_id explicitly.")
        print("  Continuing without Best Sellers sweep.")

    if not asins_to_fetch:
        print("  No ASINs to fetch. Exiting.")
        return {
            "metadata": _build_metadata(niche, resolved_category, category_name, 0, tokens_before),
            "normalized_products": [],
            "raw_asin_list": [],
        }

    # ── Step 4: Bulk product fetch ────────────────────────────────
    print(f"\n  Fetching {len(asins_to_fetch)} products (stats={stats_days}d)...")
    try:
        raw_products = client.get_products_batched(
            asins_to_fetch,
            stats=stats_days,
            delay_between_batches=1.2,
        )
    except KeepaRateLimitError as exc:
        print(f"  ERROR: {exc}")
        sys.exit(1)
    except KeepaAPIError as exc:
        print(f"  ERROR fetching products: {exc}")
        sys.exit(1)

    tokens_after = client.last_tokens_left
    tokens_used = max(0, tokens_before - tokens_after)
    print(f"  Products received: {len(raw_products)}")
    print(f"  Tokens used: ~{tokens_used}  |  Remaining: {tokens_after}")

    # ── Step 5: Normalize ─────────────────────────────────────────
    print("\n  Normalizing product data...")
    normalized: List[Dict[str, Any]] = []
    skipped = 0

    for raw in raw_products:
        if not raw or not raw.get("asin"):
            skipped += 1
            continue
        try:
            normalized.append(normalize_product(raw))
        except Exception as exc:
            print(f"  WARNING: Failed to normalize {raw.get('asin')}: {exc}")
            skipped += 1

    print(f"  Normalized: {len(normalized)}  |  Skipped: {skipped}")

    # ── Step 6: Build result and write cache ──────────────────────
    result = {
        "metadata": _build_metadata(
            niche, resolved_category, category_name,
            tokens_used, tokens_after,
        ),
        "normalized_products": normalized,
        "raw_asin_list": asins_to_fetch,
    }

    cache.set(niche, result, resolved_category)
    print(f"\n  Done. {len(normalized)} products ready for analysis.\n")
    return result


def _build_metadata(
    niche: str,
    category_id: Optional[int],
    category_name: Optional[str],
    tokens_used: int,
    tokens_remaining: int,
) -> Dict[str, Any]:
    return {
        "niche": niche,
        "category_id": category_id,
        "category_name": category_name,
        "marketplace": "US",
        "fetched_at": datetime.now(tz=timezone.utc).isoformat(),
        "tokens_used_estimate": tokens_used,
        "tokens_remaining": tokens_remaining,
    }


# ------------------------------------------------------------------
# CLI entry point
# ------------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Fetch Keepa data for a niche.")
    parser.add_argument("niche", help='Niche keyword, e.g. "dog lick mats"')
    parser.add_argument("--category-id", type=int, default=None,
                        help="Override category node ID")
    parser.add_argument("--max-products", type=int, default=100)
    parser.add_argument("--stats-days", type=int, default=90)
    parser.add_argument("--force-refresh", action="store_true",
                        help="Bypass cache and fetch fresh data")
    args = parser.parse_args()

    result = fetch_niche(
        niche=args.niche,
        category_id=args.category_id,
        max_products=args.max_products,
        stats_days=args.stats_days,
        force_refresh=args.force_refresh,
    )
    print(f"Fetched {len(result['normalized_products'])} products.")
