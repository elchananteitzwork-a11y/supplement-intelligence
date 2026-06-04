# Agent: review-velocity-tracker

## Role
Converts review count history into small-seller accessibility signals and competitive proof data. Replaces all estimated small-seller tier counts and Review-to-Revenue Efficiency figures with data-backed values.

## Trigger
Called by `run_keepa_phase1.py` as Step 3, after bsr-trend-analyzer.

## Implementation
`tracker.py` in this directory.

## Run
Not invoked standalone — called by `run_keepa_phase1.py`.

## Input
```
normalized_products:  list   # from keepa-data-fetcher
bsr_analyses:         list   # from bsr-trend-analyzer (for sales estimates)
```

## What it does
1. Collects real review counts for all products from current snapshot.
2. Classifies each product into tiers using actual counts:
   - Tier 1: < 100 reviews
   - Tier 2: < 500 reviews
   - Tier 3: < 1,000 reviews
3. Calculates review velocity per product:
   `velocity = (review_count_now - review_count_90d_ago) / 3.0`
4. Estimates listing age from earliest Keepa review count entry.
5. Computes Review-to-Revenue Efficiency per seller:
   `R2R = estimated_monthly_revenue / review_count`
   (Higher efficiency = algorithm rewards new listings, market not review-gated)
6. Identifies the fastest-growing product (by velocity) and highest-efficiency seller.
7. Determines market accessibility verdict from tier distribution.

## Accessibility Verdict Logic
```
"Highly Accessible": Tier 1 has 3+ sellers with > 50 estimated monthly sales
"Accessible":        Tier 2 has 5+ sellers
"Hard to Enter":     Tier 3 has 3+ sellers (Tiers 1–2 are thin)
"Locked":            No small sellers visible
```

## Review-to-Revenue Efficiency
This is the key signal for market accessibility. A high efficiency score means
sellers are generating strong revenue per review they hold — indicating the
algorithm still rewards new listings and the market is not yet "review-gated."

Example: A seller with 80 reviews and $4,500/month revenue has:
`R2R = $4,500 / 80 = $56.25 per review`

Compare against category average to identify outliers.

## Output
`ReviewVelocityAnalysis` instance (see `keepa/models.py`):

```
tier_under_100:              list[SellerTierEntry]
tier_under_500:              list[SellerTierEntry]
tier_under_1000:             list[SellerTierEntry]
avg_reviews_page1:           float
median_reviews_page1:        float
min_reviews_page1:           int
avg_monthly_velocity:        float
fastest_grower_asin:         str
fastest_grower_velocity:     float
category_avg_r2r_efficiency: float
best_r2r_efficiency:         float
best_r2r_asin:               str
accessibility_verdict:       str
```

## Constraints
- Does not call any external APIs.
- If bsr_analyses is None, R2R efficiency and monthly revenue will be None.
- Tier lists are cumulative: Tier 2 includes all Tier 1 entries plus additional.
- Listing age estimates are lower-bounds (Keepa may have started tracking after launch).
