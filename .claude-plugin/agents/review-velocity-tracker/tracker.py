"""
review-velocity-tracker — thin orchestration wrapper.
All analysis logic lives in keepa.reviews.
"""

import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.reviews import run as _run
from keepa.models import ReviewVelocityAnalysis


def run(
    normalized_products: List[Dict[str, Any]],
    bsr_analyses: Optional[List[Any]] = None,
) -> ReviewVelocityAnalysis:
    print(f"\n{'='*60}")
    print(f"  review-velocity-tracker")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    result = _run(normalized_products, bsr_analyses=bsr_analyses)

    print(f"  Avg reviews (page 1):    {result.avg_reviews_page1}")
    print(f"  Sellers < 100 reviews:   {len(result.tier_under_100)}")
    print(f"  Sellers < 500 reviews:   {len(result.tier_under_500)}")
    print(f"  Sellers < 1,000 reviews: {len(result.tier_under_1000)}")
    print(f"  Accessibility verdict:   {result.accessibility_verdict}")

    return result
