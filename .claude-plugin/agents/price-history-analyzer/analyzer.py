"""
price-history-analyzer — thin orchestration wrapper.
All analysis logic lives in keepa.prices.
"""

import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.prices import run as _run
from keepa.models import PriceAnalysis


def run(normalized_products: List[Dict[str, Any]]) -> PriceAnalysis:
    print(f"\n{'='*60}")
    print(f"  price-history-analyzer")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    result = _run(normalized_products)

    compressed = "COMPRESSED" if result.price_compression else "Healthy"
    print(f"  Price range:           ${result.category_min_price} – ${result.category_max_price}")
    print(f"  Avg price:             ${result.category_avg_price}")
    print(f"  Price band:            ${result.price_band_usd}  ({compressed})")
    print(f"  Category trend:        {result.price_trend}")
    print(f"  Promo signals:         {'Yes' if result.has_lightning_deal_activity else 'No'}")
    if result.amazon_holds_buybox_pct is not None:
        print(f"  Amazon Buy Box avg:    {result.amazon_holds_buybox_pct}%")

    return result
