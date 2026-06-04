"""
bsr-trend-analyzer — thin orchestration wrapper.
All analysis logic lives in keepa.bsr.
"""

import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.bsr import run as _run
from keepa.models import BSRAnalysis


def run(normalized_products: List[Dict[str, Any]]) -> List[BSRAnalysis]:
    print(f"\n{'='*60}")
    print(f"  bsr-trend-analyzer")
    print(f"  Analyzing {len(normalized_products)} products")
    print(f"{'='*60}")

    results = _run(normalized_products)

    improving    = sum(1 for r in results if r.trend_direction == "Improving")
    accelerating = sum(1 for r in results if r.demand_velocity == "Accelerating")
    seasonal     = sum(1 for r in results if r.is_seasonal)

    print(f"  Analyzed: {len(results)}")
    print(f"  Improving trend: {improving}  |  Accelerating: {accelerating}  |  Seasonal: {seasonal}")

    return results
