# Agent: bsr-trend-analyzer

## Role
Converts raw BSR (Sales Rank) time-series data into verified demand signals. Replaces all estimated `demand_score` inputs in the scoring engine with data-backed values.

## Trigger
Called by `run_keepa_phase1.py` as Step 2, immediately after keepa-data-fetcher.

## Implementation
`analyzer.py` in this directory.

## Run
Not invoked standalone — called by `run_keepa_phase1.py`.

## Input
`normalized_products` list from keepa-data-fetcher output.

## What it does
For each product:
1. Extracts BSR values from the 90-day and 365-day history windows.
2. Calculates rolling averages: 30-day, 90-day, 365-day.
3. Computes linear regression slope across 90-day BSR values.
   - Negative slope (BSR decreasing) = Improving demand.
   - Positive slope (BSR increasing) = Declining demand.
4. Measures BSR volatility via coefficient of variation.
   - High volatility flags promotional rank spikes (unreliable demand signal).
5. Converts average BSR → estimated monthly unit sales using BSR-to-sales table
   (log-linear interpolation between documented conversion benchmarks).
6. Determines demand velocity by comparing 30-day vs 90-day BSR averages.
7. Detects seasonal patterns from peak-to-trough BSR variance in annual data.

## BSR → Monthly Sales Conversion Table
```
BSR ≤ 50:       ~12,000 units/month
BSR 50–100:     ~8,000
BSR 100–200:    ~5,000
BSR 200–500:    ~2,500
BSR 500–1,000:  ~1,200
BSR 1k–2k:      ~700
BSR 2k–5k:      ~350
BSR 5k–10k:     ~170
BSR 10k–20k:    ~80
BSR 20k–50k:    ~30
BSR 50k–100k:   ~10
BSR > 100k:     ~1–4
```
Log-linear interpolation between brackets. Category-specific calibration in Phase 5.

## Output
List of `BSRAnalysis` objects (see `keepa/models.py`), sorted by avg_bsr_90d ascending (best demand first).

```
BSRAnalysis fields:
  asin, title
  avg_bsr_90d, avg_bsr_30d, avg_bsr_365d
  trend_direction:        "Improving" | "Stable" | "Declining"
  trend_slope_per_day:    float (negative = improving)
  bsr_volatility:         "Low" | "Medium" | "High"
  estimated_monthly_sales: int
  sales_estimate_confidence: int (0–100)
  demand_velocity:        "Accelerating" | "Stable" | "Decelerating"
  is_seasonal:            bool
  seasonal_peak_month:    str or None
```

## Confidence levels
- 20+ data points in 90-day window, low volatility → 78
- 10–19 data points → 60
- Relying on Keepa pre-aggregated stat only → 40
- No usable BSR data → 15

## Constraints
- Does not call any external APIs. Read-only from normalized product dicts.
- Sales estimates are category-agnostic in Phase 1. Category multipliers added in Phase 5.
- Returns BSRAnalysis with None values (not errors) when history is unavailable.
