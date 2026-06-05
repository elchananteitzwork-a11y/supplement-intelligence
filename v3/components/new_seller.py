"""
Component 2 — Market Accessibility Score (20% of Final Opportunity Score).

Redesigned from "New Seller Success" (which counted products with < 100 reviews)
to "Market Accessibility" (which measures revenue efficiency regardless of review
count).

Three factors (weights sum to 100):
  r2r_efficiency          (40) — Revenue-to-Review ratio: how much revenue does
                                  the market generate per unit of social proof?
                                  High R2R means buyers don't require review
                                  validation before purchasing.

  revenue_generating_pct  (35) — What fraction of scanned products generate
                                  > $3,000/month in estimated revenue, regardless
                                  of their review count?  A market where 60%+ of
                                  products are generating meaningful revenue is a
                                  market with broad buyer demand not gated by
                                  incumbents.

  category_s2r            (25) — Category-level Sales-to-Review ratio:
                                  total estimated monthly sales / total review
                                  count across the scan.  Normalises for market
                                  size.  High S2R → buyers choose products without
                                  needing accumulated social proof.

Why this matters:
  The old engine awarded maximum points to products with < 50 reviews, and zero
  points to products with > 500 reviews.  That correctly identified easy-to-rank
  Amazon listings — but incorrectly rejected every large-market opportunity where
  a TikTok-first brand can win on identity rather than review count.
  These three metrics answer a different question: "does this market reward buyers
  over reviewers?"
"""

from typing import Any, Dict, Optional, Tuple

from keepa.models import BSRAnalysis
from v3.components import MarketContext
from v3.models import ComponentScore, FactorDetail

WEIGHT = 0.20

# Revenue threshold: a product generating this much per month is "meaningful"
_MEANINGFUL_REVENUE_USD = 3_000.0


def score(
    product: Dict[str, Any],
    bsr:     BSRAnalysis,
    ctx:     MarketContext,
) -> ComponentScore:
    f_r2r  = _f_r2r(ctx.best_r2r_efficiency, ctx.avg_r2r_efficiency)
    f_rev  = _f_revenue_pct(getattr(ctx, "revenue_generating_pct", 0.0))
    f_s2r  = _f_s2r(getattr(ctx, "category_s2r", 0.0))

    raw       = f_r2r[0] + f_rev[0] + f_s2r[0]
    score_val = min(100.0, round(raw, 1))
    conf      = _confidence(ctx.best_r2r_efficiency,
                             getattr(ctx, "revenue_generating_pct", 0.0))

    return ComponentScore(
        name="market_accessibility",
        weight=WEIGHT,
        score=score_val,
        contribution=round(score_val * WEIGHT, 2),
        factors=[
            FactorDetail("r2r_efficiency",         40, f_r2r[0], f_r2r[1]),
            FactorDetail("revenue_generating_pct", 35, f_rev[0], f_rev[1]),
            FactorDetail("category_s2r",           25, f_s2r[0], f_s2r[1]),
        ],
        confidence=conf,
        data_sources=["keepa"],
    )


# ── Factor scorers ────────────────────────────────────────────────────────────

def _f_r2r(
    best_r2r: Optional[float],
    avg_r2r:  Optional[float],
) -> Tuple[float, str]:
    """
    Revenue-to-Review efficiency.
    best_r2r is the top ASIN in the scan; avg_r2r is the scan-wide mean.
    We weight best 60 % + avg 40 % so outliers don't dominate.
    """
    if best_r2r is None and avg_r2r is None:
        return 20.0, "No R2R data — neutral score"

    parts = []
    if best_r2r is not None:
        parts.append(("best", best_r2r, 0.6))
    if avg_r2r is not None:
        parts.append(("avg",  avg_r2r,  0.4))

    # Normalise to a 0-40 pts score
    def _pts(r2r: float) -> float:
        if r2r >= 500: return 40.0
        if r2r >= 250: return 34.0
        if r2r >= 100: return 26.0
        if r2r >= 50:  return 18.0
        if r2r >= 20:  return 11.0
        if r2r >= 5:   return  5.0
        return 1.0

    weighted_pts = sum(_pts(v) * w for _, v, w in parts) / sum(w for _, _, w in parts)
    pts = round(weighted_pts, 1)

    notes = []
    if best_r2r is not None:
        notes.append(f"best ${best_r2r:.0f}/review")
    if avg_r2r is not None:
        notes.append(f"avg ${avg_r2r:.0f}/review")
    note = " | ".join(notes) + " — " + _r2r_label(best_r2r or avg_r2r or 0)
    return pts, note


def _r2r_label(r2r: float) -> str:
    if r2r >= 500: return "excellent — buyers not review-gated"
    if r2r >= 250: return "strong — market rewards new entrants"
    if r2r >= 100: return "good — moderate review dependency"
    if r2r >= 50:  return "moderate — some review gating"
    if r2r >= 20:  return "low — market prefers review-heavy products"
    return "very low — market is heavily review-gated"


def _f_revenue_pct(pct: float) -> Tuple[float, str]:
    """
    Fraction of scanned products generating > $3,000/month estimated revenue.
    """
    pct_display = round(pct * 100, 0)
    if pct >= 0.70: return 35.0, f"{pct_display:.0f}% of products generating > $3K/mo — broad market demand"
    if pct >= 0.50: return 28.0, f"{pct_display:.0f}% generating > $3K/mo — majority of market is active"
    if pct >= 0.35: return 21.0, f"{pct_display:.0f}% generating > $3K/mo — selective demand"
    if pct >= 0.20: return 14.0, f"{pct_display:.0f}% generating > $3K/mo — demand concentrated in few products"
    if pct >= 0.10: return  7.0, f"{pct_display:.0f}% generating > $3K/mo — thin market"
    return 2.0, f"{pct_display:.0f}% generating > $3K/mo — market too small or data insufficient"


def _f_s2r(s2r: float) -> Tuple[float, str]:
    """
    Category-level Sales-to-Review ratio.
    > 10 means the average buyer is not waiting for extensive social proof.
    < 0.3 means the market is heavily review-gated.
    """
    if s2r >= 15:  return 25.0, f"S2R {s2r:.1f} — buyers choose without review validation"
    if s2r >= 5:   return 20.0, f"S2R {s2r:.1f} — moderate review influence"
    if s2r >= 2:   return 15.0, f"S2R {s2r:.1f} — reviews matter but don't dominate"
    if s2r >= 0.5: return  9.0, f"S2R {s2r:.1f} — market meaningfully review-gated"
    if s2r >= 0.1: return  4.0, f"S2R {s2r:.1f} — market heavily review-gated"
    return 1.0, f"S2R {s2r:.2f} — almost no sales without high review counts"


def _confidence(best_r2r: Optional[float], rev_pct: float) -> float:
    if best_r2r is not None and rev_pct > 0:
        return 70.0
    if best_r2r is not None or rev_pct > 0:
        return 50.0
    return 25.0
