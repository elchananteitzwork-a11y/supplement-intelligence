"""
tests/test_price_fallback.py

Proves the 4-level price fallback cascade in normalize_product().

Priority order:
  Level 1 — stats.current[0]        (Amazon direct price)
  Level 2 — stats.current[1]        (Marketplace-new price)
  Level 3 — csv[2] last entry       (New 3P price history)
  Level 4 — csv[0] last entry       (Amazon price history)
  (None)  — all sources exhausted

Run: python3 tests/test_price_fallback.py
  or: python3 -m pytest tests/test_price_fallback.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from keepa.normalizer import normalize_product

# ── Keepa CSV format helper ───────────────────────────────────────────────────
# Keepa CSVs are flat arrays: [timestamp, value_cents, timestamp, value_cents, ...]
# _KEEPA_NO_DATA sentinel = -1
# We use a fixed dummy timestamp (7_600_000 = a valid recent Keepa time).

_TS = 7_600_000


def _csv_entry(price_usd: float) -> list:
    """Single-entry Keepa CSV flat array for a given USD price."""
    return [_TS, round(price_usd * 100)]


def _raw(
    asin:        str,
    current_0:   int = -1,    # Amazon direct    (-1 = no data)
    current_1:   int = -1,    # Marketplace-new  (-1 = no data)
    csv_amz:     list = None,  # csv[0] Amazon price history
    csv_new3p:   list = None,  # csv[2] New-3P price history
    bsr:         int = 3000,
    weight_g:    int = 200,
):
    """Minimal raw Keepa product dict for price-cascade tests."""
    sc = [-1] * 36
    sc[0]  = current_0
    sc[1]  = current_1
    sc[3]  = bsr
    sc[11] = 1
    sc[16] = 45   # 4.5★
    sc[17] = 50   # 50 reviews
    sc[18] = -1   # buy box always -1 without offers=N

    csv = [None] * 20
    if csv_amz is not None:
        csv[0] = csv_amz
    if csv_new3p is not None:
        csv[2] = csv_new3p

    return {
        "asin":          asin,
        "title":         f"Test {asin}",
        "brand":         "TestBrand",
        "manufacturer":  "TestBrand",
        "rootCategory":  284507,
        "categoryTree":  [],
        "packageWeight": weight_g,
        "packageHeight": 50,
        "packageWidth":  100,
        "packageLength": 150,
        "stats": {"current": sc},
        "csv":   csv,
    }


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_level1_amazon_direct():
    """Level 1: stats.current[0] populated → price = $49.99, stops here."""
    norm = normalize_product(_raw("L1", current_0=4999, current_1=3999,
                                  csv_new3p=_csv_entry(25.99),
                                  csv_amz=_csv_entry(14.99)))
    assert norm["current"]["price"] == 49.99, (
        f"Level 1 should win: expected 49.99, got {norm['current']['price']}"
    )
    assert norm["current"]["amazon_price"] == 49.99
    print(f"PASS  test_level1_amazon_direct           price={norm['current']['price']}")


def test_level2_marketplace_new():
    """Level 2: current[0]=-1, current[1] populated → price = $39.99."""
    norm = normalize_product(_raw("L2", current_0=-1, current_1=3999,
                                  csv_new3p=_csv_entry(25.99),
                                  csv_amz=_csv_entry(14.99)))
    assert norm["current"]["amazon_price"] is None
    assert norm["current"]["price"] == 39.99, (
        f"Level 2 should win: expected 39.99, got {norm['current']['price']}"
    )
    assert norm["current"]["new_3p_price"] == 39.99
    print(f"PASS  test_level2_marketplace_new         price={norm['current']['price']}")


def test_level3_csv_new3p_history():
    """Level 3: both current null, csv[2] (new 3P history) has value → price = $25.99."""
    norm = normalize_product(_raw("L3", current_0=-1, current_1=-1,
                                  csv_new3p=_csv_entry(25.99),
                                  csv_amz=_csv_entry(14.99)))
    assert norm["current"]["amazon_price"]  is None
    assert norm["current"]["new_3p_price"]  is None
    assert norm["current"]["price"] == 25.99, (
        f"Level 3 should win: expected 25.99, got {norm['current']['price']}"
    )
    print(f"PASS  test_level3_csv_new3p_history       price={norm['current']['price']}")


def test_level4_csv_amazon_history():
    """Level 4: all current null, csv[2] empty, csv[0] has value → price = $14.99."""
    norm = normalize_product(_raw("L4", current_0=-1, current_1=-1,
                                  csv_new3p=None,
                                  csv_amz=_csv_entry(14.99)))
    assert norm["current"]["amazon_price"] is None
    assert norm["current"]["new_3p_price"] is None
    assert norm["current"]["price"] == 14.99, (
        f"Level 4 should win: expected 14.99, got {norm['current']['price']}"
    )
    print(f"PASS  test_level4_csv_amazon_history      price={norm['current']['price']}")


def test_all_sources_exhausted():
    """Control: all four sources empty → price = None."""
    norm = normalize_product(_raw("L0", current_0=-1, current_1=-1,
                                  csv_new3p=None, csv_amz=None))
    assert norm["current"]["amazon_price"] is None
    assert norm["current"]["new_3p_price"] is None
    assert norm["current"]["price"] is None, (
        f"No source → price should be None, got {norm['current']['price']}"
    )
    print(f"PASS  test_all_sources_exhausted          price={norm['current']['price']}")


def test_level1_wins_over_all_others():
    """Level 1 wins even when all other sources also have data."""
    norm = normalize_product(_raw("L1_WIN", current_0=4999, current_1=3999,
                                  csv_new3p=_csv_entry(25.99),
                                  csv_amz=_csv_entry(14.99)))
    assert norm["current"]["price"] == 49.99, (
        f"Level 1 should always win: expected 49.99, got {norm['current']['price']}"
    )
    print(f"PASS  test_level1_wins_over_all_others    price={norm['current']['price']}")


def test_level3_uses_last_csv_entry():
    """Level 3 returns the last (most recent) non-sentinel entry in csv[2]."""
    # Three entries: 20.00, 22.00, 25.99 — last should win
    csv_multi = [
        _TS,       2000,   # $20.00 (oldest)
        _TS + 100, 2200,   # $22.00
        _TS + 200, 2599,   # $25.99 (most recent)
    ]
    norm = normalize_product(_raw("L3_LAST", current_0=-1, current_1=-1,
                                  csv_new3p=csv_multi))
    assert norm["current"]["price"] == 25.99, (
        f"Should use last csv entry: expected 25.99, got {norm['current']['price']}"
    )
    print(f"PASS  test_level3_uses_last_csv_entry     price={norm['current']['price']}")


def test_level3_skips_sentinel_entries():
    """Level 3 skips -1 sentinels and returns the most recent real value."""
    # Entries: 25.99 (real), -1 (sentinel = out of stock), -1 (sentinel)
    csv_with_sentinel = [
        _TS,       2599,   # $25.99
        _TS + 100, -1,     # out of stock
        _TS + 200, -1,     # still out of stock
    ]
    norm = normalize_product(_raw("L3_SKIP", current_0=-1, current_1=-1,
                                  csv_new3p=csv_with_sentinel))
    assert norm["current"]["price"] == 25.99, (
        f"Should skip sentinels: expected 25.99, got {norm['current']['price']}"
    )
    print(f"PASS  test_level3_skips_sentinel_entries  price={norm['current']['price']}")


# ── Runner ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    tests = [
        test_level1_amazon_direct,
        test_level2_marketplace_new,
        test_level3_csv_new3p_history,
        test_level4_csv_amazon_history,
        test_all_sources_exhausted,
        test_level1_wins_over_all_others,
        test_level3_uses_last_csv_entry,
        test_level3_skips_sentinel_entries,
    ]
    passed = failed = 0
    print(f"\n{'='*60}")
    print(f"  4-Level Price Fallback Tests")
    print(f"{'='*60}\n")
    for t in tests:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f"FAIL  {t.__name__}: {e}")
            failed += 1
        except Exception as e:
            import traceback
            print(f"ERROR {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{'='*60}")
    print(f"  {passed} passed  |  {failed} failed")
    print(f"{'='*60}\n")
    if failed:
        sys.exit(1)
