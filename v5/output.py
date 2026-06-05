"""V5 report writers — CSV, JSON, and console output."""

import csv as csv_module
import dataclasses
import json
from pathlib import Path
from typing import Any, Dict, List

from v5.models import V5OpportunityScore

_CSV_FIELDS = [
    # Identity + verdict
    "rank", "recommendation", "final_score", "base_score",
    "bonus_total", "ext_bonus", "sub_bonus", "multi_bonus",
    "asin", "title", "brand", "category",
    # 7 component scores
    "problem_score", "trend_velocity_score", "trend_authenticity_score",
    "amazon_opportunity_score", "review_integrity_score",
    "repeat_purchase_score", "brandability_score",
    # Gap
    "amazon_gap_score",
    # Review integrity detail
    "wipe_events", "wipe_detail",
    # Economics
    "estimated_monthly_sales", "estimated_revenue_mo",
    "price", "fba_size_tier", "fba_fee", "net_margin_pct",
    # Labels
    "competition_level", "risk_level", "confidence",
    "pl_suitability", "brand_potential",
    # Narrative (truncated)
    "why_people_want_it", "why_gap_exists",
    "copy_difficulty", "time_to_saturation",
    "top_risk_1", "recommended_action",
]


def write_csv(scores: List[V5OpportunityScore], path: Path) -> None:
    rows = []
    for rank, s in enumerate(scores, 1):
        n = s.narrative
        b = s.bonuses
        rows.append({
            "rank":                     rank,
            "recommendation":           s.recommendation,
            "final_score":              s.final_score,
            "base_score":               s.base_score,
            "bonus_total":              b.total,
            "ext_bonus":                b.external_acceleration,
            "sub_bonus":                b.subscription_model,
            "multi_bonus":              b.multi_sku_potential,
            "asin":                     s.asin,
            "title":                    (s.title or "")[:100],
            "brand":                    s.brand or "",
            "category":                 s.category or "",
            "problem_score":            round(s.problem_score.score, 1),
            "trend_velocity_score":     round(s.trend_velocity.score, 1),
            "trend_authenticity_score": round(s.trend_authenticity.score, 1),
            "amazon_opportunity_score": round(s.amazon_opportunity.score, 1),
            "review_integrity_score":   round(s.review_integrity.score, 1),
            "repeat_purchase_score":    round(s.repeat_purchase.score, 1),
            "brandability_score":       round(s.brandability.score, 1),
            "amazon_gap_score":         round(s.amazon_gap_score, 1),
            "wipe_events":              s.wipe_events,
            "wipe_detail":              s.wipe_detail,
            "estimated_monthly_sales":  s.estimated_monthly_sales or "",
            "estimated_revenue_mo":     (
                f"${s.estimated_monthly_revenue:,.0f}" if s.estimated_monthly_revenue else ""
            ),
            "price":          f"${s.price:.2f}" if s.price else "",
            "fba_size_tier":  s.fba_size_tier,
            "fba_fee":        f"${s.fba_fee:.2f}" if s.fba_fee else "",
            "net_margin_pct": f"{s.net_margin_pct:.1f}%" if s.net_margin_pct is not None else "",
            "competition_level": s.competition_level,
            "risk_level":        s.risk_level,
            "confidence":        f"{s.confidence:.0f}%",
            "pl_suitability":    n.pl_suitability,
            "brand_potential":   n.brand_potential,
            "why_people_want_it": n.why_people_want_it[:120],
            "why_gap_exists":    n.why_gap_exists[:120],
            "copy_difficulty":   n.copy_difficulty,
            "time_to_saturation": n.time_to_saturation,
            "top_risk_1":        n.top_risks[0] if n.top_risks else "",
            "recommended_action": n.recommended_action[:120],
        })

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv_module.DictWriter(f, fieldnames=_CSV_FIELDS)
        w.writeheader()
        w.writerows(rows)
    print(f"  CSV  → {path}  ({len(rows)} opportunities)")


def write_json(scores: List[V5OpportunityScore], metadata: Dict[str, Any], path: Path) -> None:
    def _default(obj):
        if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
            return dataclasses.asdict(obj)
        raise TypeError(f"Not serializable: {type(obj).__name__}")

    report = {
        **metadata,
        "engine_version": "v5.0.0",
        "total_scored":   len(scores),
        "summary":        _summary(scores),
        "scores":         scores,
    }
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_default, ensure_ascii=False)
    print(f"  JSON → {path}  ({path.stat().st_size // 1024} KB)")


def print_top(scores: List[V5OpportunityScore], n: int = 5) -> None:
    print(f"\n{'─'*72}")
    print(f"  TOP {min(n, len(scores))} BRAND OPPORTUNITIES — V5")
    print(f"{'─'*72}")
    for i, s in enumerate(scores[:n], 1):
        nr = s.narrative
        b  = s.bonuses
        print(f"\n  #{i} [{s.recommendation}]  {s.final_score:.0f}/100  ({s.base_score:.0f} base"
              f"{f' +{b.total:.0f} bonus' if b.total else ''})")
        print(f"     {(s.title or '')[:68]}")
        print(f"     Brand: {(s.brand or '(unknown)'):20}  Category: {s.category}")
        print(f"     Problem:{s.problem_score.score:5.0f}  Trend:{s.trend_velocity.score:5.0f}"
              f"  Amazon:{s.amazon_opportunity.score:5.0f}  RI:{s.review_integrity.score:5.0f}")
        print(f"     Repeat:{s.repeat_purchase.score:5.0f}  Brand:{s.brandability.score:5.0f}"
              f"  Auth:{s.trend_authenticity.score:5.0f}  Gap:{s.amazon_gap_score:5.0f}")
        bonuses_str = " | ".join(
            p for p, v in [
                ("EXT+10", b.external_acceleration), ("SUB+10", b.subscription_model),
                ("SKU+10", b.multi_sku_potential)
            ] if v
        ) or "no bonuses"
        print(f"     Bonuses: {bonuses_str}  |  Wipes: {s.wipe_events}")
        print(f"     PL: {nr.pl_suitability:12}  Brand: {nr.brand_potential}")
        print(f"     Want: {nr.why_people_want_it[:68]}")
        print(f"     Copy difficulty: {nr.copy_difficulty}  |  Time to saturation: {nr.time_to_saturation[:40]}")
        if nr.top_risks:
            print(f"     Risk: {nr.top_risks[0][:68]}")
        print(f"     Action: {nr.recommended_action[:68]}")
    print(f"\n{'─'*72}\n")


def _summary(scores: List[V5OpportunityScore]) -> Dict[str, Any]:
    if not scores:
        return {}
    recs = {"ICONIC BRAND POTENTIAL": 0, "STRONG OPPORTUNITY": 0,
            "WORTH RESEARCH": 0, "REJECT": 0}
    for s in scores:
        recs[s.recommendation] = recs.get(s.recommendation, 0) + 1
    top = scores[0]
    return {
        "total_scored":            len(scores),
        "iconic_brand_potential":  recs["ICONIC BRAND POTENTIAL"],
        "strong_opportunity":      recs["STRONG OPPORTUNITY"],
        "worth_research":          recs["WORTH RESEARCH"],
        "reject":                  recs["REJECT"],
        "avg_score":               round(sum(s.final_score for s in scores) / len(scores), 1),
        "avg_problem_score":       round(sum(s.problem_score.score for s in scores) / len(scores), 1),
        "avg_brandability":        round(sum(s.brandability.score for s in scores) / len(scores), 1),
        "sub_bonus_count":         sum(1 for s in scores if s.bonuses.subscription_model),
        "multi_sku_bonus_count":   sum(1 for s in scores if s.bonuses.multi_sku_potential),
        "wipe_detected_count":     sum(1 for s in scores if s.wipe_events > 0),
        "top_opportunity": {
            "asin":            top.asin,
            "title":           top.title,
            "score":           top.final_score,
            "recommendation":  top.recommendation,
            "brand_potential": top.narrative.brand_potential,
            "pl_suitability":  top.narrative.pl_suitability,
            "est_monthly_rev": top.estimated_monthly_revenue,
        },
    }
