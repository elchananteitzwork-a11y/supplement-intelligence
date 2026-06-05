"""V3 report writers — CSV and JSON."""

import csv as csv_module
import dataclasses
import json
from pathlib import Path
from typing import Any, Dict, List

from v3.models import OpportunityScore

_CSV_FIELDS = [
    "rank", "recommendation", "final_score", "asin", "title", "brand",
    "demand_score", "new_seller_score", "listing_weakness_score",
    "trend_velocity_score", "market_saturation_score",
    "brand_expansion_score", "review_integrity_score",
    "wipe_events", "wipe_detail",
    "estimated_monthly_sales", "estimated_monthly_revenue",
    "price", "fba_size_tier", "fba_fee", "net_margin_pct",
    "competition_level", "risk_level", "confidence",
    # Top factor rationales for quick review
    "demand_top_factor", "integrity_rationale",
]


def write_csv(scores: List[OpportunityScore], path: Path) -> None:
    rows = []
    for rank, s in enumerate(scores, 1):
        demand_top = _top_factor(s.demand)
        integrity_note = s.review_integrity.factors[0].rationale if s.review_integrity.factors else ""
        rows.append({
            "rank":                    rank,
            "recommendation":          s.recommendation,
            "final_score":             s.final_score,
            "asin":                    s.asin,
            "title":                   (s.title or "")[:100],
            "brand":                   s.brand or "",
            "demand_score":            round(s.demand.score, 1),
            "new_seller_score":        round(s.new_seller.score, 1),
            "listing_weakness_score":  round(s.listing_weakness.score, 1),
            "trend_velocity_score":    round(s.trend_velocity.score, 1),
            "market_saturation_score": round(s.market_saturation.score, 1),
            "brand_expansion_score":   round(s.brand_expansion.score, 1),
            "review_integrity_score":  round(s.review_integrity.score, 1),
            "wipe_events":             s.wipe_events,
            "wipe_detail":             s.wipe_detail,
            "estimated_monthly_sales": s.estimated_monthly_sales or "",
            "estimated_monthly_revenue": (
                f"{s.estimated_monthly_revenue:,.0f}" if s.estimated_monthly_revenue else ""
            ),
            "price":          f"{s.price:.2f}" if s.price else "",
            "fba_size_tier":  s.fba_size_tier,
            "fba_fee":        f"{s.fba_fee:.2f}" if s.fba_fee else "",
            "net_margin_pct": f"{s.net_margin_pct:.1f}%" if s.net_margin_pct is not None else "",
            "competition_level": s.competition_level,
            "risk_level":        s.risk_level,
            "confidence":        f"{s.confidence:.0f}%",
            "demand_top_factor":  demand_top,
            "integrity_rationale": integrity_note,
        })

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv_module.DictWriter(f, fieldnames=_CSV_FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"  CSV  → {path}  ({len(rows)} opportunities)")


def write_json(
    scores:   List[OpportunityScore],
    metadata: Dict[str, Any],
    path:     Path,
) -> None:
    def _default(obj):
        if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
            return dataclasses.asdict(obj)
        raise TypeError(f"Not serializable: {type(obj).__name__}")

    report = {
        **metadata,
        "engine_version": "v3.0.0",
        "total_scored":   len(scores),
        "summary":        _summary(scores),
        "scores":         scores,
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_default, ensure_ascii=False)
    print(f"  JSON → {path}  ({path.stat().st_size // 1024} KB)")


def _top_factor(component) -> str:
    if not component.factors:
        return ""
    best = max(component.factors, key=lambda f: f.points)
    return f"{best.name}: {best.rationale[:80]}"


def _summary(scores: List[OpportunityScore]) -> Dict[str, Any]:
    if not scores:
        return {}
    recs = {"STRONG OPPORTUNITY": 0, "WORTH RESEARCH": 0, "REJECT": 0}
    for s in scores:
        recs[s.recommendation] = recs.get(s.recommendation, 0) + 1
    avg_score = round(sum(s.final_score for s in scores) / len(scores), 1)
    top = scores[0]
    return {
        "total_scored":       len(scores),
        "strong_opportunity": recs["STRONG OPPORTUNITY"],
        "worth_research":     recs["WORTH RESEARCH"],
        "reject":             recs["REJECT"],
        "avg_score":          avg_score,
        "top_opportunity": {
            "asin":           top.asin,
            "title":          top.title,
            "score":          top.final_score,
            "recommendation": top.recommendation,
            "est_monthly_rev": top.estimated_monthly_revenue,
        },
    }
