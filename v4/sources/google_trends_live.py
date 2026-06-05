"""
Google Trends live source — V4 interface.

Uses pytrends to fetch 12-month interest over time for a keyword.
Results are cached in-process so repeated calls within a scan cost 0 tokens.

Rate limiting: 2.0s between unique keyword fetches. 429 errors trigger a
single retry after 30s. If that also fails the source returns None for that
keyword and the scoring system falls back to neutral (stub behaviour).

Dimensions populated:
  trend_score      — avg interest of the last 4 weeks (0–100)
  momentum_30d     — (last 4w avg - prior 4w avg) / prior 4w avg × 100, mapped to 0–100
  momentum_90d     — same logic over 12w vs prior 12w
  stability_12m    — 1 - (std_dev / mean) × 100, clipped 0–100
  search_correlation — 100 (search IS the signal)
  purchase_intent  — % of top related queries containing buying-intent words
"""

import time
import statistics as _stats
from typing import Dict, Optional

from v4.sources import TrendSignal

# ── Module-level cache (persists for the lifetime of the process) ─────────────
_cache: Dict[str, Optional[TrendSignal]] = {}

_BUYING_WORDS = {
    "buy", "best", "review", "cheap", "deal", "price",
    "where", "online", "order", "discount", "coupon", "shop",
}
_DELAY_SECONDS    = 2.0
_RETRY_WAIT       = 30.0
_CONFIDENCE_LIVE  = 72.0
_CONFIDENCE_EMPTY = 20.0

# ── Category → canonical search keyword ──────────────────────────────────────
# Used when the product title yields a poor keyword (too brand-specific).
_CATEGORY_SEEDS: Dict[str, str] = {
    "gut_health":    "probiotic supplement",
    "sleep":         "sleep supplement melatonin",
    "collagen":      "collagen peptides powder",
    "protein":       "protein powder supplement",
    "womens_health": "women vitamins supplement",
    "supplements":   "dietary supplement vitamins",
    "beauty":        "beauty supplement collagen",
    "pet":           "pet supplement dog",
    "kitchen":       "kitchen organizer storage",
}


def _normalize(kw: str) -> str:
    return kw.lower().strip()[:50]


def _purchase_intent(pytrends_obj, keyword: str) -> Optional[float]:
    """Return % of top related queries that contain a buying-intent word."""
    try:
        time.sleep(1.0)
        related = pytrends_obj.related_queries()
        df = (related or {}).get(keyword, {}).get("top", None)
        if df is None or df.empty:
            return None
        queries = df["query"].str.lower().tolist()
        if not queries:
            return None
        hits = sum(1 for q in queries if any(bw in q for bw in _BUYING_WORDS))
        return min(100.0, round(hits / len(queries) * 100, 1))
    except Exception:
        return None


def _fetch_once(keyword: str) -> Optional[TrendSignal]:
    """Single attempt to fetch Google Trends data for *keyword*."""
    try:
        from pytrends.request import TrendReq
    except ImportError:
        return None

    try:
        pt = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
        pt.build_payload([keyword], cat=0, timeframe="today 12-m", geo="US")
        time.sleep(_DELAY_SECONDS)
        df = pt.interest_over_time()
    except Exception as exc:
        raise exc  # caller handles retry

    if df is None or df.empty or keyword not in df.columns:
        return None

    series = df[keyword].tolist()
    n = len(series)
    if n < 4:
        return None

    # ── trend_score: avg of last 4 data points ────────────────────────────────
    trend_score = round(sum(series[-4:]) / 4, 1)

    # ── momentum_30d: last 4w vs prior 4w, mapped to 0–100 (50 = flat) ───────
    if n >= 8:
        r4 = sum(series[-4:]) / 4
        p4 = sum(series[-8:-4]) / 4
        if p4 > 0:
            pct = (r4 - p4) / p4 * 100
            momentum_30d = round(min(100.0, max(0.0, pct + 50)), 1)
        else:
            momentum_30d = 50.0 if r4 == 0 else 75.0
    else:
        momentum_30d = None

    # ── momentum_90d: last 12w vs prior 12w ──────────────────────────────────
    if n >= 24:
        r12 = sum(series[-12:]) / 12
        p12 = sum(series[-24:-12]) / 12
        if p12 > 0:
            pct = (r12 - p12) / p12 * 100
            momentum_90d = round(min(100.0, max(0.0, pct + 50)), 1)
        else:
            momentum_90d = 50.0 if r12 == 0 else 75.0
    else:
        momentum_90d = None

    # ── stability_12m ─────────────────────────────────────────────────────────
    mean_val = sum(series) / n
    if mean_val > 1:
        std_val  = _stats.stdev(series) if n > 1 else 0.0
        stability = round(max(0.0, min(100.0, (1 - std_val / mean_val) * 100)), 1)
    else:
        stability = 0.0

    # ── purchase intent via related queries ───────────────────────────────────
    intent = _purchase_intent(pt, keyword)

    confidence = _CONFIDENCE_LIVE if trend_score > 5 else _CONFIDENCE_EMPTY

    return TrendSignal(
        source_name="google_trends",
        keyword=keyword,
        trend_score=trend_score,
        momentum_30d=momentum_30d,
        momentum_90d=momentum_90d,
        stability_12m=stability,
        engagement_ratio=None,       # not available from search data
        creator_diversity=None,      # not available
        search_correlation=100.0,    # search IS the signal by definition
        community_signal=None,
        purchase_intent=intent,
        confidence=confidence,
        is_stub=False,
        raw_metrics={
            "series_n":     n,
            "trend_score":  trend_score,
            "momentum_30d": momentum_30d,
            "momentum_90d": momentum_90d,
        },
    )


class GoogleTrendsLive:
    """
    Live Google Trends source.

    Drop-in replacement for GoogleTrendsStub.
    Set is_available = True so the trend engine uses it.
    """

    name         = "google_trends"
    weight       = 0.30
    is_available = True

    def get_signal(self, keyword: str, category: str = "") -> Optional[TrendSignal]:
        # Prefer category seed keyword when the product keyword is very short
        # or is likely a brand name (single word / no whitespace).
        effective = _normalize(keyword)
        if (not effective or len(effective) < 6 or " " not in effective):
            seed = _CATEGORY_SEEDS.get(category.lower(), "")
            if seed:
                effective = seed

        if not effective:
            return None

        if effective in _cache:
            return _cache[effective]

        print(f"    [Google Trends] fetching: {effective!r}")
        try:
            signal = _fetch_once(effective)
        except Exception as exc:
            # Single retry after a wait (handles 429 TooManyRequests)
            if "429" in str(exc) or "Too Many" in str(exc):
                print(f"    [Google Trends] rate limited — waiting {_RETRY_WAIT}s …")
                time.sleep(_RETRY_WAIT)
                try:
                    signal = _fetch_once(effective)
                except Exception:
                    signal = None
            else:
                print(f"    [Google Trends] error: {exc}")
                signal = None

        _cache[effective] = signal
        return signal
