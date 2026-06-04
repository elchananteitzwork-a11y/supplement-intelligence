"""
Keepa data normalization utilities.

Keepa stores data in two non-standard formats that must be converted
before any downstream processing:

1. TIMESTAMPS — stored as "Keepa minutes": integer minutes elapsed
   since 2011-01-01 00:00:00 UTC. Convert with keepa_minutes_to_dt().

2. PRICES — stored as integer cent-equivalents (multiply by 0.01 for USD).
   -1 means "unavailable" for that data point. Convert with keepa_price_to_usd().

3. CSV SERIES — time-series data is stored as flat arrays of alternating
   [keepa_timestamp, value, keepa_timestamp, value, ...].
   Parse with parse_csv_series().

Keepa CSV index reference (Amazon US, verified against live API responses):
   csv[0]  = Amazon price
   csv[2]  = New third-party offer price
   csv[3]  = Sales Rank (BSR)
   csv[11] = Count of new marketplace offers
   csv[16] = Rating (×10, so 46 = 4.6 stars)   ← confirmed from live data
   csv[17] = Review count                         ← confirmed from live data
   csv[18] = Buy Box price
   csv[19] = Used, like-new price

Note: Indices 16 and 17 are the OPPOSITE of what Keepa's public docs imply.
Verified against real Kitchen category data: csv[16] returns rating-range
integers (40–50), csv[17] returns large integers consistent with review counts.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


# Keepa's epoch is 2011-01-01 00:00:00 UTC
_KEEPA_EPOCH = datetime(2011, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
_KEEPA_MINUTE_SECONDS = 60

# Keepa uses this sentinel to mean "no data" in price/value fields
_KEEPA_NO_DATA = -1


# ------------------------------------------------------------------
# Timestamp conversion
# ------------------------------------------------------------------

def keepa_minutes_to_dt(keepa_minutes: int) -> Optional[datetime]:
    """Convert a Keepa-minutes integer to a UTC datetime."""
    if keepa_minutes == _KEEPA_NO_DATA or keepa_minutes is None:
        return None
    seconds_since_epoch = keepa_minutes * _KEEPA_MINUTE_SECONDS
    return datetime.fromtimestamp(
        _KEEPA_EPOCH.timestamp() + seconds_since_epoch,
        tz=timezone.utc,
    )


def keepa_minutes_to_iso(keepa_minutes: int) -> Optional[str]:
    """Convert a Keepa-minutes integer to an ISO 8601 string."""
    dt = keepa_minutes_to_dt(keepa_minutes)
    return dt.isoformat() if dt else None


# ------------------------------------------------------------------
# Price conversion
# ------------------------------------------------------------------

def keepa_price_to_usd(keepa_price: int) -> Optional[float]:
    """
    Convert a Keepa price integer to USD.
    Keepa stores prices as integer cent-equivalents (divide by 100).
    Returns None if the value is -1 (unavailable).
    """
    if keepa_price == _KEEPA_NO_DATA or keepa_price is None:
        return None
    return round(keepa_price / 100.0, 2)


def keepa_rating_to_float(keepa_rating: int) -> Optional[float]:
    """
    Convert a Keepa rating integer to a 0.0–5.0 float.
    Keepa stores ratings as integer × 10 (e.g., 45 = 4.5 stars).
    Returns None if the value is -1.
    """
    if keepa_rating == _KEEPA_NO_DATA or keepa_rating is None:
        return None
    return round(keepa_rating / 10.0, 1)


# ------------------------------------------------------------------
# CSV series parsing
# ------------------------------------------------------------------

def parse_csv_series(
    csv_array: Optional[List[int]],
    value_converter=None,
) -> List[Dict[str, Any]]:
    """
    Parse a Keepa CSV flat array into a list of {timestamp_iso, value} dicts.

    Keepa CSV format: [ts1, val1, ts2, val2, ...] (alternating pairs).
    Pairs where value == -1 are dropped (no data at that timestamp).

    Args:
        csv_array:       The raw flat integer array from Keepa.
        value_converter: Optional function applied to each raw value
                         before storing (e.g., keepa_price_to_usd).
                         If None, values are stored as-is.

    Returns list of dicts, oldest entry first.
    """
    if not csv_array or len(csv_array) < 2:
        return []

    results: List[Dict[str, Any]] = []

    for i in range(0, len(csv_array) - 1, 2):
        ts_raw = csv_array[i]
        val_raw = csv_array[i + 1]

        if val_raw == _KEEPA_NO_DATA:
            continue

        ts_iso = keepa_minutes_to_iso(ts_raw)
        value = value_converter(val_raw) if value_converter else val_raw

        if ts_iso is not None and value is not None:
            results.append({"timestamp": ts_iso, "value": value})

    return results


def parse_bsr_series(csv_array: Optional[List[int]]) -> List[Dict[str, Any]]:
    """Parse BSR (Sales Rank) time series. Values are raw integers (lower = better)."""
    return parse_csv_series(csv_array)


def parse_price_series(csv_array: Optional[List[int]]) -> List[Dict[str, Any]]:
    """Parse a price time series. Values are converted to USD floats."""
    return parse_csv_series(csv_array, value_converter=keepa_price_to_usd)


def parse_review_count_series(csv_array: Optional[List[int]]) -> List[Dict[str, Any]]:
    """Parse review count time series. Values are raw integers."""
    return parse_csv_series(csv_array)


def parse_rating_series(csv_array: Optional[List[int]]) -> List[Dict[str, Any]]:
    """Parse rating time series. Values are converted to 0.0–5.0 floats."""
    return parse_csv_series(csv_array, value_converter=keepa_rating_to_float)


# ------------------------------------------------------------------
# Product normalizer
# ------------------------------------------------------------------

def normalize_product(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a single raw Keepa product dict into a normalized, human-readable dict.

    All timestamps are ISO 8601 strings.
    All prices are USD floats.
    All -1 sentinel values are replaced with None.
    CSV arrays are parsed into [{timestamp, value}] lists.

    This is the only function downstream agents need to call.
    They receive normalized dicts and never touch raw Keepa format.
    """
    csv = raw.get("csv") or []

    def _get_csv(index: int) -> Optional[List[int]]:
        if index < len(csv) and csv[index]:
            return csv[index]
        return None

    # Extract stats dict (90-day aggregates Keepa pre-computes)
    stats = raw.get("stats") or {}

    def _stat(key: str, sub: Optional[str] = None) -> Any:
        if sub:
            return stats.get(key, {}).get(sub) if isinstance(stats.get(key), dict) else None
        val = stats.get(key)
        return None if val == _KEEPA_NO_DATA else val

    # Product dimensions from Keepa (in mm and g)
    pkg = {
        "height_mm": raw.get("packageHeight"),
        "width_mm":  raw.get("packageWidth"),
        "length_mm": raw.get("packageLength"),
        "weight_g":  raw.get("packageWeight"),
    }

    current_stats = stats.get("current") or []

    def _current(idx: int) -> Any:
        if idx < len(current_stats):
            val = current_stats[idx]
            return None if val == _KEEPA_NO_DATA else val
        return None

    return {
        # Identity
        "asin":            raw.get("asin"),
        "title":           raw.get("title"),
        "brand":           raw.get("brand"),
        "manufacturer":    raw.get("manufacturer"),

        # Category
        "root_category":   raw.get("rootCategory"),
        "category_tree":   raw.get("categoryTree") or [],

        # Dimensions (original Keepa units: mm and grams)
        "package": pkg,

        # Current snapshot
        "current": {
            "bsr":           _current(3),
            "amazon_price":  keepa_price_to_usd(_current(0)) if _current(0) else None,
            "new_3p_price":  keepa_price_to_usd(_current(1)) if _current(1) else None,
            "buybox_price":  keepa_price_to_usd(_current(18)) if _current(18) else None,
            "review_count":  _current(17),
            "rating":        keepa_rating_to_float(_current(16)) if _current(16) else None,
            "offer_count":   _current(11),
        },

        # 90-day stats (pre-aggregated by Keepa)
        "stats_90d": {
            "avg_bsr":          _stat("avg90", None) if not isinstance(stats.get("avg90"), list) else (
                stats["avg90"][3] if len(stats["avg90"]) > 3 and stats["avg90"][3] != _KEEPA_NO_DATA else None
            ),
            "min_bsr":          stats.get("min90", [None]*4)[3] if isinstance(stats.get("min90"), list) and len(stats.get("min90", [])) > 3 else None,
            "avg_amazon_price": keepa_price_to_usd(
                stats["avg90"][0] if isinstance(stats.get("avg90"), list) and len(stats.get("avg90", [])) > 0 and stats["avg90"][0] != _KEEPA_NO_DATA else _KEEPA_NO_DATA
            ),
            "min_amazon_price": keepa_price_to_usd(
                stats["min90"][0] if isinstance(stats.get("min90"), list) and len(stats.get("min90", [])) > 0 and stats["min90"][0] != _KEEPA_NO_DATA else _KEEPA_NO_DATA
            ),
            "max_amazon_price": keepa_price_to_usd(
                stats["max90"][0] if isinstance(stats.get("max90"), list) and len(stats.get("max90", [])) > 0 and stats["max90"][0] != _KEEPA_NO_DATA else _KEEPA_NO_DATA
            ),
            "review_count_delta": (
                stats.get("deltaReviews90") if stats.get("deltaReviews90") != _KEEPA_NO_DATA else None
            ),
        },

        # Full time-series (normalized)
        "history": {
            "bsr":            parse_bsr_series(_get_csv(3)),
            "amazon_price":   parse_price_series(_get_csv(0)),
            "new_3p_price":   parse_price_series(_get_csv(2)),
            "buybox_price":   parse_price_series(_get_csv(18)),
            "review_count":   parse_review_count_series(_get_csv(17)),
            "rating":         parse_rating_series(_get_csv(16)),
            "offer_count":    parse_csv_series(_get_csv(11)),
        },
    }
