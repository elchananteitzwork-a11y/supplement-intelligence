"""
product-scorer — thin orchestration wrapper.
All scoring logic lives in keepa.scoring.
"""

import sys
from pathlib import Path
from typing import Any, Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from keepa.scoring import run as _run
from keepa.models import BSRAnalysis, ProductScore, ReviewVelocityAnalysis, PriceAnalysis


def run(
    normalized_products: List[Dict[str, Any]],
    bsr_results: List[BSRAnalysis],
    rv_analysis: ReviewVelocityAnalysis,
    price_analysis: PriceAnalysis,
) -> List[ProductScore]:
    print(f"\n{'='*60}")
    print(f"  product-scorer")
    print(f"  Scoring {len(normalized_products)} products")
    print(f"{'='*60}")

    scores = _run(bsr_results, normalized_products, rv_analysis, price_analysis)

    grade_counts = {"A": 0, "B": 0, "C": 0, "D": 0, "F": 0}
    for s in scores:
        grade_counts[s.grade] = grade_counts.get(s.grade, 0) + 1

    if scores:
        top = scores[0]
        print(f"  Top opportunity:  {top.asin} — {top.total_score}/100 ({top.grade}) {top.verdict}")
    print(f"  Grade breakdown:  A={grade_counts['A']}  B={grade_counts['B']}  "
          f"C={grade_counts['C']}  D={grade_counts['D']}  F={grade_counts['F']}")

    return scores
