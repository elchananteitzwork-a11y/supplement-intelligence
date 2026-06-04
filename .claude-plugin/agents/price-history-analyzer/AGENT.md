# Agent: price-history-analyzer

## Role
Converts price time-series data into margin stability and competition signals. Replaces all estimated selling price ranges with data-backed values. Feeds verified `avg_selling_price` and `price_compression` flags into the profit-opportunity-analyzer in Phase 2.

## Trigger
Called by `run_keepa_phase1.py` as Step 4 (final step before report generation).

## Implementation
`analyzer.py` in this directory.

## Run
Not invoked standalone — called by `run_keepa_phase1.py`.

## Input
`normalized_products` list from keepa-data-fetcher output.

## What it does
For each product:
1. Extracts Amazon price and Buy Box price values from the last 90 days.
2. Detects promotional signals: price drops > 25% within any short window.

At category level:
3. Computes price range: min, max, average, median across all current prices.
4. Calculates price band width (max − min). Flags compression if band < $3.
5. Determines price trend direction (Rising / Stable / Declining) by comparing
   the early-third average vs. late-third average of the 90-day window.
6. Estimates Amazon Buy Box ownership % by comparing when Amazon price
   matches Buy Box price (heuristic — not exact without the offers API).
7. Flags Lightning Deal / coupon activity if > 15% of products show promo signals.

## Compression Threshold
A price band under $3.00 is flagged as "price compression" — a race-to-the-bottom
signal. This reduces the profit score in the scoring engine (Phase 2).

## Promotional Signal
Detected when the Buy Box or Amazon price drops > 25% within a short window.
Indicates coupon campaigns or Lightning Deals. More than 15% of products showing
this = category uses promotions heavily to generate velocity (launch norm).

## Buy Box Heuristic
Amazon's own inventory holds the Buy Box when the Amazon price matches the Buy Box
price within $0.02. This is an approximation — direct Buy Box data requires the
`/product` `offers` parameter at higher token cost.

## Output
`PriceAnalysis` instance (see `keepa/models.py`):

```
category_min_price:          float
category_max_price:          float
category_avg_price:          float
category_median_price:       float
price_band_usd:              float
price_compression:           bool
price_trend:                 "Rising" | "Stable" | "Declining"
avg_price_delta_90d:         float
amazon_holds_buybox_pct:     float
has_lightning_deal_activity: bool
coupon_price_detected:       bool
product_summaries:           list[dict]  (top 10 products)
```

## Constraints
- Does not call any external APIs.
- Uses Amazon price history as primary source, falls back to Buy Box history.
- Price trend requires at least 6 data points; returns "Insufficient data" otherwise.
- Buy Box ownership % is a heuristic and should be treated as directional only.
- Product summaries include top 10 products sorted by current price descending.
