"""V4 report writers — CSV, JSON, and summary console output."""

import csv as csv_module
import dataclasses
import json
from pathlib import Path
from typing import Any, Dict, List

from v4.models import V4OpportunityScore

_CSV_FIELDS = [
    # Identity
    "rank", "recommendation", "final_score", "base_score", "gap_bonus",
    "asin", "title", "brand", "category",
    # V3 component scores
    "demand_score", "new_seller_score", "listing_weakness_score",
    "market_saturation_score", "brand_expansion_score", "review_integrity_score",
    # V4 new scores
    "trend_intelligence_score", "authenticity_score", "opportunity_gap_score",
    # Review integrity detail
    "wipe_events", "wipe_detail",
    # Economics
    "estimated_monthly_sales", "estimated_revenue_mo",
    "price", "fba_size_tier", "fba_fee", "net_margin_pct",
    # Labels
    "competition_level", "risk_level", "confidence",
    # Trend source breakdown
    "trend_sources_status", "trend_dominant_source",
    # Narrative (truncated for CSV readability)
    "pl_suitability", "brand_potential",
    "why_growing", "why_gap_exists",
    "top_risk_1", "recommended_action",
]


def write_csv(scores: List[V4OpportunityScore], path: Path) -> None:
    rows = []
    for rank, s in enumerate(scores, 1):
        n   = s.narrative
        tb  = s.trend_breakdown
        src_status = "; ".join(
            f"{src.name}={'STUB' if src.is_stub else f'{src.score:.0f}'}"
            for src in tb.sources
        )
        risks = n.top_risks
        rows.append({
            "rank":                    rank,
            "recommendation":          s.recommendation,
            "final_score":             s.final_score,
            "base_score":              s.base_score,
            "gap_bonus":               s.opportunity_gap_bonus,
            "asin":                    s.asin,
            "title":                   (s.title or "")[:100],
            "brand":                   s.brand or "",
            "category":                s.category or "",
            "demand_score":            round(s.demand.score, 1),
            "new_seller_score":        round(s.new_seller.score, 1),
            "listing_weakness_score":  round(s.listing_weakness.score, 1),
            "market_saturation_score": round(s.market_saturation.score, 1),
            "brand_expansion_score":   round(s.brand_expansion.score, 1),
            "review_integrity_score":  round(s.review_integrity.score, 1),
            "trend_intelligence_score": round(s.trend_intelligence.score, 1),
            "authenticity_score":      round(s.authenticity_score, 1),
            "opportunity_gap_score":   round(s.opportunity_gap_score, 1),
            "wipe_events":             s.wipe_events,
            "wipe_detail":             s.wipe_detail,
            "estimated_monthly_sales": s.estimated_monthly_sales or "",
            "estimated_revenue_mo":    (
                f"${s.estimated_monthly_revenue:,.0f}"
                if s.estimated_monthly_revenue else ""
            ),
            "price":          f"${s.price:.2f}" if s.price else "",
            "fba_size_tier":  s.fba_size_tier,
            "fba_fee":        f"${s.fba_fee:.2f}" if s.fba_fee else "",
            "net_margin_pct": f"{s.net_margin_pct:.1f}%" if s.net_margin_pct is not None else "",
            "competition_level": s.competition_level,
            "risk_level":        s.risk_level,
            "confidence":        f"{s.confidence:.0f}%",
            "trend_sources_status": src_status,
            "trend_dominant_source": tb.dominant_source or "n/a",
            "pl_suitability":    n.pl_suitability_label,
            "brand_potential":   n.brand_potential_label,
            "why_growing":       n.why_growing[:120],
            "why_gap_exists":    n.why_gap_exists[:120],
            "top_risk_1":        risks[0] if risks else "",
            "recommended_action": n.recommended_action[:120],
        })

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv_module.DictWriter(f, fieldnames=_CSV_FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"  CSV  → {path}  ({len(rows)} opportunities)")


def write_json(
    scores:   List[V4OpportunityScore],
    metadata: Dict[str, Any],
    path:     Path,
) -> None:
    def _default(obj):
        if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
            return dataclasses.asdict(obj)
        raise TypeError(f"Not serializable: {type(obj).__name__}")

    report = {
        **metadata,
        "engine_version": "v4.0.0",
        "total_scored":   len(scores),
        "summary":        _summary(scores),
        "scores":         scores,
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_default, ensure_ascii=False)
    print(f"  JSON → {path}  ({path.stat().st_size // 1024} KB)")


def print_top(scores: List[V4OpportunityScore], n: int = 5) -> None:
    """Print a readable top-N summary to console."""
    print(f"\n{'─'*70}")
    print(f"  TOP {min(n, len(scores))} OPPORTUNITIES")
    print(f"{'─'*70}")
    for i, s in enumerate(scores[:n], 1):
        n_obj = s.narrative
        print(f"\n  #{i} {s.asin} — {s.final_score:.0f}/100  [{s.recommendation}]")
        print(f"     {(s.title or '')[:65]}")
        print(f"     Brand: {s.brand or '(unknown)':20}  PL: {n_obj.pl_suitability_label}")
        print(f"     Demand:{s.demand.score:5.0f}  NewSeller:{s.new_seller.score:5.0f}  "
              f"Trend:{s.trend_intelligence.score:5.0f}  RI:{s.review_integrity.score:5.0f}")
        print(f"     GapScore:{s.opportunity_gap_score:5.0f}  GapBonus:{s.opportunity_gap_bonus:+.0f}  "
              f"Auth:{s.authenticity_score:5.0f}  Wipes:{s.wipe_events}")
        print(f"     {n_obj.brand_potential_label} — {n_obj.why_growing[:75]}")
        if n_obj.top_risks:
            print(f"     Risk: {n_obj.top_risks[0][:70]}")
        print(f"     Action: {n_obj.recommended_action[:70]}")
    print(f"\n{'─'*70}\n")


def _summary(scores: List[V4OpportunityScore]) -> Dict[str, Any]:
    if not scores:
        return {}
    recs = {"STRONG OPPORTUNITY": 0, "WORTH RESEARCH": 0, "REJECT": 0}
    for s in scores:
        recs[s.recommendation] = recs.get(s.recommendation, 0) + 1
    top = scores[0]
    return {
        "total_scored":       len(scores),
        "strong_opportunity": recs["STRONG OPPORTUNITY"],
        "worth_research":     recs["WORTH RESEARCH"],
        "reject":             recs["REJECT"],
        "avg_score":          round(sum(s.final_score for s in scores) / len(scores), 1),
        "avg_gap_score":      round(sum(s.opportunity_gap_score for s in scores) / len(scores), 1),
        "gap_bonus_count":    sum(1 for s in scores if s.opportunity_gap_bonus > 0),
        "wipe_detected_count": sum(1 for s in scores if s.wipe_events > 0),
        "top_opportunity": {
            "asin":               top.asin,
            "title":              top.title,
            "score":              top.final_score,
            "gap_score":          top.opportunity_gap_score,
            "recommendation":     top.recommendation,
            "pl_suitability":     top.narrative.pl_suitability_label,
            "brand_potential":    top.narrative.brand_potential_label,
            "est_monthly_rev":    top.estimated_monthly_revenue,
        },
    }
