# Metric Validation Table
## Product Intelligence & Investment Decision Engine

**Version:** 1.0  
**Date:** 2026-07-01  
**Purpose:** Pre-implementation audit of every metric in the specification. Governs labeling, confidence levels, and v1 inclusion decisions.

---

## How to Read This Table

**Measurable:** Yes = can be read directly from a primary source. Partially = real data exists but requires estimation or inference to produce the metric. No = cannot be measured; entirely estimated or AI-synthesized.

**Type:** Real = read directly from source system. Calculated = arithmetic from real inputs. Estimated = derived from benchmarks or models. AI = language model synthesis. Founder = self-reported.

**Accuracy:** Stated as a qualitative range. Where numerical precision is possible, a ± figure is given.

**v1 Confidence:** How confident the platform should be that this metric is reliable enough to show in a production product. High / Medium / Low.

**Include v1:** Yes / Conditional / No. "Conditional" means include only if the stated condition is met.

---

## Section 1: Demand Intelligence

---

### 1. Monthly Search Volume

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | DataForSEO keyword research API |
| **Scope** | Google US (or specified geography). Not Amazon. Not total purchase intent. |
| **Type** | Real (DataForSEO aggregates from Google infrastructure data) |
| **Update Frequency** | Monthly (DataForSEO refreshes volume data monthly; lag is typically 30–45 days from current month) |
| **Cost Per Query** | ~$0.02–$0.05 per keyword |
| **Expected Accuracy** | High for keywords >1,000/month (within ±15%). Low for <500/month — DataForSEO interpolates rather than measures at low volumes, rounding to nearest 100 or 1,000. |
| **Known Limitations** | Google US only. Search intent ≠ purchase intent — a search for "magnesium glycinate side effects" is not a buyer. Commercial intent filtering must be applied but never eliminates all ambiguous queries. Does not capture Amazon-specific search behavior. |
| **v1 Confidence** | High |
| **Include v1** | Yes |
| **If Not, Replacement** | N/A |

---

### 2. Search Volume Trend (24-Month History)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | DataForSEO historical keyword data |
| **Scope** | Google US |
| **Type** | Real (historical monthly volumes from DataForSEO) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | ~$0.05–$0.15 per keyword (historical pulls cost more than current-month) |
| **Expected Accuracy** | High for high-volume keywords (>5,000/month) across the full 24 months. DataForSEO historical data quality degrades for low-volume keywords and for periods >18 months ago. |
| **Known Limitations** | DataForSEO applies smoothing algorithms to historical data. Very recent months may show provisional figures that are later revised. Keywords that gained volume recently may have limited history. |
| **v1 Confidence** | High |
| **Include v1** | Yes |
| **If Not, Replacement** | N/A |

---

### 3. Volume Change Rates (3/6/12-Month)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (computed from real data) |
| **Source(s)** | Computed from DataForSEO historical data |
| **Scope** | Google US |
| **Type** | Calculated (arithmetic from real data) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | No additional cost — derived from metric #2 |
| **Expected Accuracy** | Dependent on underlying volume accuracy. For low-volume keywords, a 10% change may be statistically indistinguishable from measurement error. Minimum display threshold needed: do not show % change when absolute volume is <500/month. |
| **Known Limitations** | Percentage change on a small base is misleading (100 to 150 = +50% but represents 50 additional searches). The denominator must be shown alongside the percentage. |
| **v1 Confidence** | High |
| **Include v1** | Conditional — suppress display when base volume is below 500/month. Show absolute change alongside percentage. |
| **If Not, Replacement** | N/A |

---

### 4. Top Buying-Intent Keywords

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (volumes are real; intent classification is estimated) |
| **Source(s)** | DataForSEO keyword suggestions + intent classification |
| **Scope** | Google US |
| **Type** | Real (volumes) + Estimated (commercial intent classification uses DataForSEO's model) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | ~$0.10–$0.30 per seed keyword (generates related keyword list with volumes) |
| **Expected Accuracy** | Volumes: high for major keywords. Intent classification: medium — DataForSEO's commercial intent model is reasonable for clear transactional keywords ("buy magnesium glycinate") but inconsistent for research-oriented ones ("magnesium glycinate benefits"). |
| **Known Limitations** | "Commercial intent" is DataForSEO's classification, not a measured fact. Different tools classify the same keywords differently. A keyword with "commercial" classification still represents a mix of buyers and researchers. |
| **v1 Confidence** | High |
| **Include v1** | Yes — labeled "Keywords with purchase intent signals (DataForSEO classification)" |
| **If Not, Replacement** | N/A |

---

### 5. Geographic Demand Concentration

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Google Trends (interestByRegion endpoint) |
| **Scope** | Google US, by state |
| **Type** | Real (relative index, 0–100 — not absolute search counts) |
| **Update Frequency** | Weekly |
| **Cost Per Query** | Free via unofficial API; low-to-medium via third-party proxy services |
| **Expected Accuracy** | High for relative comparison between states. Cannot be converted to absolute search volumes. Index is normalized so the highest-interest state = 100 regardless of actual volume. |
| **Known Limitations** | The unofficial Google Trends API is fragile — rate limits, IP blocking, and schema changes occur without notice. A state at 100 is highest relative interest, not necessarily high absolute demand. Cannot compare interest levels between different queries using this index. |
| **v1 Confidence** | Medium (API reliability is the primary risk) |
| **Include v1** | Conditional — include only with a stable API proxy or fallback. If the API fails, show "Geographic data unavailable" rather than stale data. |
| **If Not, Replacement** | DataForSEO's CPC geographic breakdown (where advertisers bid most) as a partial proxy for geographic demand |

---

### 6. Seasonal Pattern and Amplitude

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (pattern detection is calculated from real data; seasonal vs. trending classification involves judgment) |
| **Source(s)** | DataForSEO (24-month history) — Google Trends as confirmation signal |
| **Scope** | Google US |
| **Type** | Calculated (pattern detection from real data) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | No additional — derived from metric #2 |
| **Expected Accuracy** | High when 24+ months of data are available and the pattern repeats across 2+ annual cycles. Low when <18 months of data — insufficient to distinguish seasonal from trending. Amplitude classification (high/medium/low) involves an arbitrary threshold. |
| **Known Limitations** | A product with one winter spike is "trending" or "emerging," not seasonal. Requiring 2 confirmed annual cycles before labeling something seasonal is critical — but this means the metric cannot be produced for recently-emerged categories. Single-year spikes are common in health categories after viral content. |
| **v1 Confidence** | Medium |
| **Include v1** | Conditional — require minimum 2 confirmed annual cycles before labeling "seasonal." If fewer cycles available, label "insufficient history to confirm seasonal pattern." |
| **If Not, Replacement** | N/A — show "Pattern unconfirmed" rather than estimate |

---

### 7. Social Demand Signal (TikTok)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (content volume is measurable; its relationship to purchase demand is inferred) |
| **Source(s)** | TikTok hashtag/keyword data (unofficial API or TikTok Research API for approved accounts) |
| **Scope** | TikTok platform only |
| **Type** | Real (view counts, video counts) — inference required to connect to product demand |
| **Update Frequency** | Near-real-time (daily) |
| **Cost Per Query** | Low if unofficial API (fragile); moderate via third-party TikTok analytics tools; restricted via official Research API |
| **Expected Accuracy** | View counts: high. Relevance of hashtag content to product purchase intent: low. A high #magnesiumsupplement view count may primarily be side-effect discussion, not buyer intent. |
| **Known Limitations** | TikTok hashtag counts are cultural awareness signals, not purchase intent signals. Content about a product category skews heavily toward creators discussing problems, risks, and experiences — not product buyers. Unofficial API access is fragile and TikTok's ToS is actively enforced. Trajectory (rising/stable/declining) is more useful than absolute volume. |
| **v1 Confidence** | Low-Medium |
| **Include v1** | Conditional — include only if API is stable. Label explicitly: "Social content volume — measures creator interest, not purchase intent. Use as a leading indicator of cultural awareness." Never use as a demand signal in the revenue envelope. |
| **If Not, Replacement** | If TikTok data unavailable, omit — do not substitute with YouTube or Reddit volume. Show "Social data unavailable" rather than misrepresent scope. |

---

## Section 2: Market Structure

---

### 8. Meaningful Competitor Count

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (count is real; "meaningful" definition involves an arbitrary threshold) |
| **Source(s)** | Apify Amazon scraper (top search results for query) |
| **Scope** | Amazon US — top search results only. Does not represent total market. |
| **Type** | Real (scrape results) + Rule (threshold application: >50 reviews to qualify) |
| **Update Frequency** | Per-query (real-time scrape, though Amazon search ranking updates continuously) |
| **Cost Per Query** | ~$0.10–$0.50 per scrape run depending on depth (number of pages scraped) |
| **Expected Accuracy** | High for products appearing in top 50–100 results. Systematically underrepresents low-ranking and recently-launched products. Amazon's algorithm favors established, high-review products — new entrants are nearly invisible in scrape results. |
| **Known Limitations** | The ">50 reviews" threshold is documented in the spec as an explicit choice with rationale, but it is inherently arbitrary and treats all categories identically. A 50-review threshold is a young product in a high-velocity category (protein powder) and a seasoned incumbent in a niche category. Amazon ToS risk at scale. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — threshold must be documented and its rationale preserved. Label: "Amazon products with 50+ reviews in search results for this query. Likely underrepresents new entrants." |
| **If Not, Replacement** | N/A |

---

### 9. Price Distribution (min/p25/median/p75/max)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Apify Amazon scraper |
| **Scope** | Amazon US — top search results. Biased toward established, high-ranking products. |
| **Type** | Real (scraped listed prices) |
| **Update Frequency** | Per-query (Amazon prices change frequently — daily for competitive products) |
| **Cost Per Query** | Included in metric #8 scrape run |
| **Expected Accuracy** | High for listed prices at time of scrape. Listed price ≠ realized transaction price — Subscribe & Save, coupons, lightning deals, and Prime-exclusive discounts are not captured. Price distribution skews toward high-ranking products (which typically charge median-to-premium prices), understating the true price floor. |
| **Known Limitations** | Scraper samples the most visible products. True price floor (new entrants, unranked products) is likely lower than reported minimum. Prices can change within hours — scrape time matters for volatile categories. Does not represent DTC pricing, retail pricing, or non-Amazon channels. |
| **v1 Confidence** | High (with bias disclosure) |
| **Include v1** | Yes — with label: "Listed prices from top Amazon US search results. True category price floor may be lower. Transaction prices may differ from listed prices." |
| **If Not, Replacement** | N/A |

---

### 10. Market Concentration (Top-3 Revenue Share)

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | Computed from Keepa monthlySold estimates for sampled products |
| **Scope** | Amazon US sampled bestsellers — NOT total market |
| **Type** | Estimated (Keepa model for numerator; estimated denominator from same sample) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | Included in Keepa product pull |
| **Expected Accuracy** | Very low. The denominator is the sampled products' combined estimated revenue — not total market or total Amazon category revenue. This metric systematically overstates concentration by 3–10× because the long tail of category products is excluded from the denominator. See Architecture Review T1.1. |
| **Known Limitations** | This metric is mathematically wrong as a market concentration measure. Top-3 share of a 10-product sample is not market concentration — it is within-sample dominance. Showing this as "market concentration" is actively misleading. |
| **v1 Confidence** | Low — do not ship in current form |
| **Include v1** | No — replace with Review Concentration Index (metric #11) |
| **If Not, Replacement** | Review Concentration Index: share of total reviews in the sampled competitive set held by the top 3 products. This is an honest proxy for incumbency weight — measurable, scoped, and not misleadingly labeled as market-level. |

---

### 11. Review Concentration Index (replaces #10)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Apify (review counts per scraped product) |
| **Scope** | Amazon US sampled competitors |
| **Type** | Calculated (arithmetic from real review counts) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #8 scrape |
| **Expected Accuracy** | High for scraped products. Biased sample (same Apify bias as #8). |
| **Known Limitations** | Measures incumbency depth (tenure × review solicitation), not market share. A high RCI means a few established players have dominant social proof in search results. It does not mean they have dominant revenue share. New entrant challenge is high review count, not high revenue. |
| **v1 Confidence** | High |
| **Include v1** | Yes — with label: "Share of all reviews in sampled Amazon results held by top 3 products. Measures incumbency depth, not market share." |
| **If Not, Replacement** | N/A (this is the replacement metric) |

---

### 12. Average Rating Across Category

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Apify (Amazon scraper) |
| **Scope** | Amazon US sampled competitors |
| **Type** | Real (scraped ratings) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #8 |
| **Expected Accuracy** | High for scraped values. However: ratings in competitive consumer categories are systematically inflated by review solicitation programs, vine programs, and review clubs. Category average of 4.6 stars means all players operate a review program, not that all products are excellent. |
| **Known Limitations** | Rating is not a quality or trust signal. It is a function of how aggressively sellers solicit reviews. High-margin categories (supplements, beauty) tend to have the most inflated ratings. Showing category average rating without explaining what it actually measures leads founders to overestimate how well the category is served. |
| **v1 Confidence** | Low — misleading as presented in most tools |
| **Include v1** | No — remove from market-level view. If retained anywhere, label: "Category review management benchmark — reflects review solicitation practices, not product quality." This label raises more questions than it answers and adds no decision value. |
| **If Not, Replacement** | Review sentiment trajectory (#18) is more useful — it measures direction of change, not absolute inflated level. |

---

### 13. Estimated Category Units/Month

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | Keepa (monthlySold field, sampled bestsellers) |
| **Scope** | Amazon US, sampled bestsellers only — NOT category total |
| **Type** | Estimated (Keepa's own model) summed across a sample |
| **Update Frequency** | Monthly |
| **Cost Per Query** | ~$0.02–$0.10 per Keepa product token |
| **Expected Accuracy** | Very low for category-level interpretation. Three compounding errors: (1) Keepa's monthlySold model has ±20–40% uncertainty per product; (2) sample excludes the long tail; (3) sum of sample ≠ category total. Summing uncertain estimates across an incomplete sample produces a number that is simultaneously inaccurate and miscategorized. |
| **Known Limitations** | This metric has the highest misleading-to-useful ratio in the entire platform. It sounds like market volume but measures sample volume of estimated figures. It is the most direct embodiment of the problem this platform was designed to solve. |
| **v1 Confidence** | Low — do not show in current form |
| **Include v1** | No — remove from market-level view entirely. Keepa monthlySold estimates may appear in the competitive analysis section for individual products, labeled explicitly: "Keepa estimated monthly units for [specific product] — Keepa model, not Amazon-verified." |
| **If Not, Replacement** | Commercial Viability Signal (qualitative): "Multiple established competitors have sustained meaningful unit volume over 12+ months at prices above [floor]. The market demonstrably purchases this product type." This is honest, directional, and cannot be misread as a market size number. |

---

### 14. Amazon Fee Structure

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Keepa (referralFeePercentage and fbaFees.pickAndPackFee fields — Amazon's published fee schedule mirrored by Keepa) |
| **Scope** | Amazon US, category-specific, standard-size tier |
| **Type** | Real (Amazon's own published fee schedule, not Keepa-modeled) |
| **Update Frequency** | When Amazon updates fee schedule (typically annual with minor quarterly adjustments) |
| **Cost Per Query** | Included in Keepa product pull |
| **Expected Accuracy** | High — this is Amazon's actual fee schedule. Caveat: FBA fee depends on product dimensions and weight. Standard-size assumption must be noted; oversize products carry significantly different fees. |
| **Known Limitations** | Fee schedule applies to standard-size products. Oversize, hazmat, or melt-sensitive products have different FBA fee structures. Fee schedule is category-wide — individual products within a category may have different classifications if dimensions differ. |
| **v1 Confidence** | High |
| **Include v1** | Yes — with label: "Amazon fee schedule for this category, standard size tier, verified via Keepa. Oversize or specialty products may have different fees." |
| **If Not, Replacement** | N/A |

---

### 63. Category Price Compression (24-Month History)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (computed from real historical price data) |
| **Source(s)** | Keepa (continuous price history for tracked products) |
| **Scope** | Amazon US — top products in sampled competitive set |
| **Type** | Calculated (arithmetic from real historical price data) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | Included in Keepa product pull — historical price data is part of the standard Keepa product history record |
| **Expected Accuracy** | High for products with continuous Keepa coverage. Keepa records price changes in near-real-time for tracked ASINs. The primary limitation is sample composition: if the top competitive set has changed over 24 months (new entrants, discontinued products), comparing median price then vs. now mixes different sets of products. |
| **Known Limitations** | The 30% threshold for Kill Switch #4 triggering is a spec choice. Price compression may reflect category maturation (normal), aggressive new entrant pricing (possibly temporary), or a commoditization spiral (the concerning case). The metric cannot distinguish between causes — the trigger fires on the number, not the explanation. A sample composition rule must be defined before implementation: only products present in the top results in BOTH periods should be included in the comparison. Without this rule, the metric may reflect competitive set evolution rather than actual price decline. |
| **v1 Confidence** | Medium — data is real and Keepa price history is reliable, but sample composition challenge requires implementation care |
| **Include v1** | Yes — required as the primary input to Kill Switch #4 (`COMMODITY_PRICE_COMPRESSION`). Display as: "Category median price: $[today] vs. $[24 months ago]. Change: [%]." If the comparison set has fewer than 5 products with continuous 24-month history, show: "Insufficient price history to evaluate price compression." Do not infer from partial samples. |
| **If Not, Replacement** | N/A — without this metric, Kill Switch #4 cannot be implemented |

---

## Section 3: Customer Voice

---

### 15. Aggregated Complaint Themes

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (review text is real; theme classification is AI) |
| **Source(s)** | Apify (review text scraping) + AI synthesis |
| **Scope** | Amazon US reviews of sampled competitors — buyers of existing products only |
| **Type** | Real (review text) + AI synthesized (theme extraction and classification) |
| **Update Frequency** | Per-query (with caching — reviews do not change rapidly for established products) |
| **Cost Per Query** | ~$0.20–$1.00 per analysis depending on review volume and AI model |
| **Expected Accuracy** | High for frequent, clearly-expressed complaints (appear in many reviews with similar language). Medium for subtle or nuanced themes. AI classification can conflate related but distinct complaints (GI distress from coating vs. GI distress from dose — these may be conflated into one theme). |
| **Known Limitations** | Buyers of existing products only — the most important segment (non-buyers who found nothing acceptable) is entirely absent. Review text may include syndicated reviews (same review on multiple products). Review manipulation can artificially inflate specific complaint themes in competitor products (competitors seeding negative reviews). No deduplication across products currently specified. |
| **v1 Confidence** | Medium-High |
| **Include v1** | Yes — with two mandatory disclosures: (1) "Buyers of existing products only — non-buyers are not represented." (2) "Review manipulation is common in high-margin consumer categories — treat complaint frequencies as directional, not precise." |
| **If Not, Replacement** | N/A |

---

### 16. Complaint Frequency (% of Negative Reviews)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (count is computed from AI classification output; denominator is real) |
| **Source(s)** | Computed from AI theme classification applied to scraped reviews |
| **Scope** | Amazon US reviews of sampled competitors |
| **Type** | Calculated (from AI synthesis) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #15 |
| **Expected Accuracy** | ±10–20% for frequency estimates. Theme boundary definition by AI affects count significantly — a broad theme definition inflates frequency. The denominator (total negative reviews) is real; the numerator (how many belong to this theme) is AI-classified. |
| **Known Limitations** | "25% of negative reviews mention X" is not "25% of customers experience X." If a product has a 4.7-star average with 3% negative reviews, then 25% of those 3% = 0.75% of all reviewers mention this issue. The denominator must always be shown. Percentage of negative reviews without the absolute count and total review base is misleading. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — display as: "X% of negative reviews ([N] of [M] sampled)" — always show the absolute count and the sample size. Never show percentage alone. |
| **If Not, Replacement** | N/A |

---

### 17. Cross-Product Complaint Validation

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially |
| **Source(s)** | Computed from #15 across multiple scraped products |
| **Scope** | Amazon US — sampled competitor products |
| **Type** | Calculated (from AI classification) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #15 |
| **Expected Accuracy** | Medium — a theme appearing in reviews of multiple products is more likely to be a market-level gap than a product-specific failure. The more products the theme appears in, the higher the confidence. |
| **Known Limitations** | The sample of products is already biased toward established products. Themes that are product-specific may coincidentally appear in multiple products if all have the same formulation from the same OEM supplier. |
| **v1 Confidence** | High (most reliable signal in the customer voice section) |
| **Include v1** | Yes — this is the primary quality gate for complaint themes. A theme must appear in reviews of ≥2 different products to be labeled "market-level." Single-product themes are labeled "product-specific." |
| **If Not, Replacement** | N/A |

---

### 18. Review Sentiment Trajectory

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (when computed from rating distribution over time) |
| **Source(s)** | Apify (reviews with dates) — computed from rating change over time |
| **Scope** | Amazon US sampled competitors |
| **Type** | Calculated (rating distribution change, last 12 months vs. prior 12 months) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #15 |
| **Expected Accuracy** | High when sufficient dated reviews exist (>100 reviews with dates per product). Low for products with sparse review history or products that recently started soliciting reviews (which inflates recent ratings independently of product quality). |
| **Known Limitations** | Amazon vine and review solicitation programs can cause rating improvement independent of product quality changes. A rating trajectory moving upward might mean product improved or might mean seller started a review program. Cannot distinguish between these. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — based on rating distribution change, not AI sentiment analysis of review text (simpler, more reliable). Label: "Category buyer satisfaction trend based on rating distribution change — review programs may affect this signal independently of product quality." |
| **If Not, Replacement** | N/A |

---

### 19. Verbatim Customer Language

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Apify (review text) |
| **Scope** | Amazon US buyers |
| **Type** | Real (verbatim text from actual reviews) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in #8/#15 scrape |
| **Expected Accuracy** | High — the words are the words. Sampling methodology determines representativeness. Apify typically returns most-helpful or most-recent reviews, not a random sample. |
| **Known Limitations** | Non-random sample — most-helpful reviews are selected by Amazon's algorithm and may skew toward certain viewpoints. May not be representative of the majority experience. Reviews may contain PII (names, locations, health conditions) — output must be filtered before display. |
| **v1 Confidence** | High |
| **Include v1** | Yes — with PII filtering applied before display. Label: "Representative sample of actual review text — not a random sample; selection by Amazon's 'most helpful' algorithm." |
| **If Not, Replacement** | N/A |

---

## Section 4: Risk Surface

---

### 20. FDA Recalls and Warnings

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | openFDA API (food, drug, and supplement enforcement records) |
| **Scope** | FDA regulated products, US only |
| **Type** | Real (regulatory records) |
| **Update Frequency** | Weekly (openFDA updates as FDA publishes actions) |
| **Cost Per Query** | Free (openFDA is a public API) |
| **Expected Accuracy** | High — these are actual FDA regulatory actions. Historical completeness may vary for older records. openFDA coverage is comprehensive for last 5–10 years; older actions may not be digitized. |
| **Known Limitations** | Covers FDA-regulated categories only. Products outside FDA jurisdiction (certain devices, some import categories) may not appear. A resolved recall may still appear in results — resolved status must be checked. International recalls not included. DSHEA supplements have limited pre-market oversight — many unsafe products never receive recalls because FDA is not aware of them. |
| **v1 Confidence** | High |
| **Include v1** | Yes — show: count, most recent date, classification (Class I/II/III), and basis (formulation, labeling, contamination). Show resolved status where determinable. |
| **If Not, Replacement** | N/A |

---

### 21. Category News Events

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (news articles are real; relevance to this opportunity is inferred) |
| **Source(s)** | GDELT, PubMed (for regulatory/safety news), major news APIs |
| **Scope** | General news (global) |
| **Type** | Real (articles exist) + AI relevance classification |
| **Update Frequency** | Daily |
| **Cost Per Query** | Low-to-medium (GDELT free; commercial news APIs vary) |
| **Expected Accuracy** | High for fact that articles exist. Low-to-medium for relevance classification — general supplement news is high-volume and mostly irrelevant to specific product opportunities. False positive rate is high without precise topic filtering. |
| **Known Limitations** | News about "supplements" as a category is extremely noisy. AI relevance filtering at the specificity needed (magnesium glycinate specifically, not magnesium in general) is imprecise. High false-positive rate means potential alert fatigue and undermined trust. |
| **v1 Confidence** | Low |
| **Include v1** | Conditional — include only for major regulatory/safety events (FDA enforcement, class action filings, congressional hearings) where classification is more reliable. Omit general market news in v1 — the signal-to-noise ratio is too low. Replace with structured FDA/regulatory news monitoring only. |
| **If Not, Replacement** | Focused FDA enforcement tracker: scrape FDA warning letters and enforcement actions specifically, rather than general news. Higher accuracy, more relevant to investment decision. |

---

### 22. Scientific Support Trajectory (PubMed)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | PubMed API (NCBI Entrez) |
| **Scope** | Biomedical research literature (global, indexed by PubMed) |
| **Type** | Real (publication counts are real counts of real publications) |
| **Update Frequency** | Monthly (PubMed indexes continuously; search results may lag 1–4 weeks) |
| **Cost Per Query** | Free (public NCBI API with rate limits) |
| **Expected Accuracy** | High for publication counts. Trend direction is straightforward arithmetic. Mapping the product category to appropriate MeSH terms requires setup and may need refinement per category. |
| **Known Limitations** | Publication count ≠ scientific consensus. An increase in publications could reflect controversy (safety concerns trigger research) rather than support. PubMed covers biomedical literature — highly relevant for supplement/health categories, minimally relevant for pet food or non-health consumer products. MeSH term mapping for novel ingredients is imprecise. |
| **v1 Confidence** | Medium-High for supplement categories; Low for non-health categories |
| **Include v1** | Conditional — include for health, supplement, and personal care categories. Suppress for categories where research trajectory is irrelevant (pet food, home goods). Label: "PubMed publications on [mechanism] — measures research activity, not safety or efficacy consensus." |
| **If Not, Replacement** | Omit for non-health categories; do not substitute with a general "research score." |

---

### 23. Import Tariff Exposure

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (once HTS code is determined) |
| **Source(s)** | USITC Harmonized Tariff Schedule + USTR Section 301 tariff lists |
| **Scope** | US import tariffs (China-origin baseline; country of origin affects rate) |
| **Type** | Real (published tariff schedule) |
| **Update Frequency** | Annually (HTS schedule); Section 301 tariffs may change with trade policy (unpredictable) |
| **Cost Per Query** | Free (public database) — but HTS code determination requires logic or AI |
| **Expected Accuracy** | High once HTS code is correctly identified. The variable is HTS code assignment accuracy — misclassification produces the wrong tariff rate. HTS classification for products described by keyword (not technical specification) has meaningful error rate. |
| **Known Limitations** | HTS code mapping from product keyword is imprecise — a "magnesium glycinate capsule supplement" may map to several plausible HTS codes with different rates. Country of origin significantly affects rate (China vs. India vs. Vietnam vs. domestic). Does not account for duty drawback, de minimis, or first-sale valuation. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — with explicit disclosure: "Tariff rate shown assumes China-origin manufacturing and [HTS code assigned]. Different country of origin or product classification may result in different rates. Verify HTS classification before relying on this figure." |
| **If Not, Replacement** | N/A |

---

## Section 5: Opportunity Map (Stage 2)

---

### 24. AI-Generated Investment Thesis

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI synthesis of Stage 1 Market Signal data |
| **Scope** | All Stage 1 evidence sources |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis (re-runs if Stage 1 data is refreshed) |
| **Cost Per Query** | ~$0.50–$2.00 per thesis set depending on model, context length, and number of theses generated |
| **Expected Accuracy** | Variable — highly dependent on Stage 1 data quality. With rich customer voice data and clear competitive gaps, theses can be specific and well-evidenced. With thin data, the AI synthesizes despite insufficient evidence. The evidence gate (minimum threshold before generation is permitted) is the primary quality control. |
| **Known Limitations** | AI may over-index on the most salient data points and miss structural considerations. The same AI that generated the thesis generates the evidence citations — circular self-validation risk. Theses require the evidence gate to be meaningfully enforced (see Architecture Review T1.3). |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — with evidence gate enforced. Every thesis claim must link to a specific EvidencePoint from Stage 1. |
| **If Not, Replacement** | N/A |

---

### 25. Quick Economics Viability Check (Per Thesis)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially |
| **Source(s)** | Price distribution (#9) + Amazon fees (#14) + category COGS benchmark (internal table) |
| **Scope** | Amazon US |
| **Type** | Calculated (real price + real fees + estimated COGS range) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional — derived from existing data |
| **Expected Accuracy** | ±30–50% due to COGS estimate uncertainty. This is a viability signal, not a margin estimate. |
| **Known Limitations** | COGS benchmarks are category averages that can be wrong by ±50% for specific products. The check should produce only a binary signal: "50% gross margin is theoretically achievable at some realistic COGS" vs "50% gross margin is mathematically impossible given price floor and fees." Not a margin number. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — as a binary flag only. Never display an estimated gross margin from this check. Display: "Economics viable: 50% gross margin achievable if COGS is below $[breakeven COGS]" vs "Economics structurally challenged: achieving 50% gross margin requires COGS below $[unrealistically low number]." |
| **If Not, Replacement** | N/A |

---

## Section 6: Founder-Opportunity Fit Layer (Stage 2.5)

---

### 26. Capital Fit / Minimum Viable Launch Threshold

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (threshold is estimated from benchmarks; founder capital is self-reported) |
| **Source(s)** | Internal category benchmark table (MOQ estimates, certification costs, marketing floors) + founder profile |
| **Scope** | Amazon US channel, category-specific |
| **Type** | Estimated (from benchmarks) + Founder-provided |
| **Update Frequency** | Threshold: periodic (table maintenance). Founder capital: when profile updated. |
| **Cost Per Query** | No additional — rule-based lookup |
| **Expected Accuracy** | Low-Medium. Minimum viable threshold varies ±50% or more based on product complexity, sourcing country, required certifications, and MOQ at first order. The threshold formula must be documented (see Architecture Review T1.2). |
| **Known Limitations** | The threshold formula is undefined in v1.0 spec — this is a critical gap that must be resolved before implementation. The number must be shown as a range (low/high) with the formula components visible. A point estimate is false precision. |
| **v1 Confidence** | Medium — requires threshold formula to be specified before implementation |
| **Include v1** | Yes — but the threshold formula must be defined as a prerequisite. Show as range, not point estimate. |
| **If Not, Replacement** | N/A |

---

### 27. Experience Gap Assessment

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — self-reported inputs + rule-based inference |
| **Source(s)** | Founder profile + product type rules |
| **Scope** | Founder |
| **Type** | Founder-provided + Rule-based |
| **Update Frequency** | When founder profile updates |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Low — entirely dependent on founder self-assessment accuracy. "Manufacturing experience: sourced before" encompasses a wide range of actual capability. Rules cannot calibrate for depth, only existence. |
| **Known Limitations** | Systematic optimism bias in self-reporting. The rule system can only use binary inputs (has/has not) when reality is continuous (depth of experience). A founder who visited a factory once and a founder with 5 years of manufacturing ops both check "sourced before." |
| **v1 Confidence** | Medium (for gap identification) / Low (for gap severity) |
| **Include v1** | Yes — identify gaps from rules; show severity as categories only (minor/significant/blocking), not scores. Pair with "closeable: yes/no" which is also rule-based. |
| **If Not, Replacement** | N/A |

---

### 28. Channel Fit Assessment

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (thesis channel requirement is AI-determined; founder channel is self-reported) |
| **Source(s)** | AI-determined channel requirement from thesis + founder profile |
| **Scope** | Founder + market |
| **Type** | AI (thesis channel) + Founder-provided (founder channel) |
| **Update Frequency** | Per thesis per founder profile update |
| **Cost Per Query** | No additional (determined during thesis generation) |
| **Expected Accuracy** | Medium — thesis may validly succeed through multiple channels; declaring one "primary" channel may incorrectly flag founders with non-standard but viable channel strategies |
| **Known Limitations** | The system must represent that most physical products can enter through multiple channels. Channel fit should show alignment between the thesis's optimal channel and the founder's existing channel — not declare a single required channel. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — show all viable channels for the thesis, note the optimal one, and compare to founder's channel. Not a binary pass/fail — a graduated fit assessment. |
| **If Not, Replacement** | N/A |

---

### 29. Timeline Fit Assessment

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (category lead times are estimated; founder horizon is self-reported) |
| **Source(s)** | Product type benchmark (lead times, certification timelines) + founder profile |
| **Scope** | Founder |
| **Type** | Estimated + Founder-provided |
| **Update Frequency** | Per thesis per founder profile update |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Low — supplement lead times range from 60 days (simple formulation, domestic co-packer) to 9+ months (custom formulation, offshore manufacturer, required certifications). Category benchmarks are wide ranges, not reliable estimates. |
| **Known Limitations** | Timeline estimates have high variance by sourcing country, formulation complexity, supplier relationship, and certification requirements. The range is so wide that it may not meaningfully constrain the timeline fit assessment. Shown only as "typical range" with explicit caveat. |
| **v1 Confidence** | Low-Medium |
| **Include v1** | Yes — show as "typically X–Y months for this product type" with explicit note: "Actual timeline depends on formulation complexity, certification requirements, and supplier relationship." Never show a point estimate for timeline. |
| **If Not, Replacement** | N/A |

---

## Section 7: Adversarial Thesis Evaluation (Stage 3)

---

### 30. Bull Case

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI synthesis (Call 1 — advocate frame, separate from bear case call) |
| **Scope** | Stage 1 market evidence |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis per thesis |
| **Cost Per Query** | ~$0.50–$1.50 per call |
| **Expected Accuracy** | Variable — dependent on evidence richness. Risk: the same model family that generated the thesis is generating the bull case. Training coherence may mean the bull case supports the thesis more strongly than a genuinely independent advocate would. |
| **Known Limitations** | Not truly independent from thesis generation — the model is coherent with its own prior outputs. "Advocate frame" reduces but does not eliminate this. Temperature tuning and explicit instruction to cite only evidence (not reasoning) mitigates but cannot eliminate confirmation bias. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — labeled: "Investment advocate perspective — structured argument from available evidence. May not represent a fully independent view." |
| **If Not, Replacement** | N/A |

---

### 31. Bear Case — Evidence-Based Component

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI synthesis (Call 2 — adversarial frame, receives no output from Call 1) |
| **Scope** | Stage 1 market evidence only |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis per thesis |
| **Cost Per Query** | ~$0.50–$1.50 per call |
| **Expected Accuracy** | Medium — more reliable when constrained to evidence. The constraint to existing data is the limitation: the most dangerous bear arguments are often absent from current market data (see Architecture Review T1.7). The evidence-based component will tend to surface risks that are already visible, which the market signal covers anyway. |
| **Known Limitations** | Same AI model family as bull case — training biases shared. Higher temperature setting helps force exploration of less-obvious risks. Requirement to produce at least one "kill shot" (single decisive failure mode) is important to prevent the bear case from becoming a generic risk list. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — separate call from bull case, higher temperature, must produce at least one kill shot. |
| **If Not, Replacement** | N/A |

---

### 32. Bear Case — Structural Risk Inventory

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI synthesis using physical product launch failure mode templates — NOT evidence from Stage 1 |
| **Scope** | Product type and category (not market evidence) |
| **Type** | AI synthesized (speculative, prompted checklist) |
| **Update Frequency** | Per-analysis per thesis |
| **Cost Per Query** | ~$0.30–$0.80 per call |
| **Expected Accuracy** | Low for specific probability assignment. High for category coverage — AI is reliable at generating plausible failure mode categories for physical products. The value is breadth of risk categories surfaced, not accuracy of any specific risk. |
| **Known Limitations** | Entirely speculative — not evidence-backed. Must be visually separated from the evidence-based bear case and labeled clearly. Risk categories must be kept at category level (e.g., "supply chain concentration risk") not specific probability claims (e.g., "40% chance of supply disruption"). |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — visually distinct section labeled: "Speculative risks — not evidence-backed. Categories of risk that cannot be detected from available market data. Requires founder investigation." |
| **If Not, Replacement** | N/A |

---

### 33. Unknowns List (Research Agenda)

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI synthesis from Stage 3 (Call 3 — synthesis of bull + bear outputs) |
| **Scope** | Full analysis |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis per thesis |
| **Cost Per Query** | Included in Stage 3 Call 3 |
| **Expected Accuracy** | High for obvious unknowns (COGS validation, manufacturer quotes). Medium for structural unknowns. May miss systematic blind spots in training data. |
| **Known Limitations** | AI identifies unknowns based on expected information — structurally novel unknowns outside its training distribution will be missed. The research agenda must include specific tasks, not generic "do more research" guidance. |
| **v1 Confidence** | High (most reliable Stage 3 output if prompted correctly) |
| **Include v1** | Yes — highest-priority Stage 3 output. Each unknown must include: what is unknown, why it matters, how to resolve it, what the answer changes. |
| **If Not, Replacement** | N/A |

---

## Section 8: Unit Economics (Stage 4)

---

### 34. Observed Price Point (Median)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Source(s)** | Apify scraper (same as #9) |
| **Scope** | Amazon US, top search results |
| **Type** | Real (scraped listed prices) |
| **Update Frequency** | Per-query |
| **Cost Per Query** | Included in scrape |
| **Expected Accuracy** | High for listed price at time of scrape. ±5–10% from typical realized transaction price. |
| **Known Limitations** | Listed ≠ transaction price. Subscribe & Save and coupon prices not captured. Sample biased toward established products (higher than true median). |
| **v1 Confidence** | High |
| **Include v1** | Yes — with label: "Median listed price, top Amazon US search results. Transaction prices may differ." |
| **If Not, Replacement** | N/A |

---

### 35 & 36. Amazon Fee Structure (Referral % and FBA Fee)

*(See #14 — same data. Repeated in unit economics section as formula inputs.)*

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes |
| **Type** | Real (Amazon published fee schedule) |
| **v1 Confidence** | High |
| **Include v1** | Yes |

---

### 37. COGS Estimate — Market Baseline

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — estimated from category benchmarks |
| **Source(s)** | Internal category benchmark tables (maintained as spec artifact, not code) |
| **Scope** | Category average — not product-specific, not founder-specific |
| **Type** | Estimated (benchmark range) |
| **Update Frequency** | Periodic (table maintenance; requires industry knowledge to update accurately) |
| **Cost Per Query** | No additional — rule-based lookup |
| **Expected Accuracy** | Low to medium — ±30–50%. Supplement powders in capsule form: $2–$12/unit depending on formulation complexity, certifications, MOQ, and sourcing country. This range is too wide to produce a meaningful point estimate. |
| **Known Limitations** | Category benchmarks represent average conditions; outliers in either direction are common and consequential. The benchmark table requires ongoing maintenance and domain expertise. The COGS estimate itself is less useful than the breakeven COGS calculation (what must COGS be for economics to work at 50% margin?). |
| **v1 Confidence** | Low — the range is the useful output, not the estimate |
| **Include v1** | Yes — shown as range only (low/high). Primary output must be breakeven COGS (#42). The market baseline COGS range is context for interpreting the breakeven number. |
| **If Not, Replacement** | N/A |

---

### 38. COGS Estimate — Founder-Specific

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — self-reported |
| **Source(s)** | Founder input (Stage 4 collection) |
| **Scope** | Founder |
| **Type** | Founder-provided |
| **Update Frequency** | When founder updates Stage 4 inputs |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Entirely dependent on founder's accuracy. Founders without manufacturer quotes systematically underestimate COGS. This is the single most consequential and least reliable input in the entire platform. |
| **Known Limitations** | If founder's COGS input falls below the category benchmark low, a mandatory warning must be shown (Architecture Review T1.5). Sensitivity table must show what happens to gross margin at benchmark COGS. A COGS with `confidence: rough_guess` that falls below benchmark prevents the founder-specific verdict from being BUILD NOW. |
| **v1 Confidence** | Medium — reliable for collection; low for accuracy |
| **Include v1** | Yes — with mandatory outlier warning and sensitivity table at benchmark COGS. |
| **If Not, Replacement** | N/A |

---

### 39. CAC Estimate

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — estimated from category benchmarks |
| **Source(s)** | DataForSEO CPC data (for the category's top keywords) + industry conversion rate benchmarks |
| **Scope** | Amazon US PPC or channel-specific |
| **Type** | Estimated (CPC is real; conversion rate is benchmarked; CAC = CPC ÷ conversion rate) |
| **Update Frequency** | Per-query (CPC changes with competition); benchmarks periodic |
| **Cost Per Query** | CPC from existing DataForSEO pull — no additional cost |
| **Expected Accuracy** | Low — conversion rate varies 1–15%+ depending on listing quality, review count, pricing, product photography, and advertising strategy. A 5× range in conversion rate produces a 5× range in CAC. The input CPC is real; the output CAC is a very wide range. |
| **Known Limitations** | The most variable input in the unit economics model. New brand CAC on Amazon can range from $8 to $80+ in the same category depending on execution quality. A founder with a strong existing audience has a fundamentally different CAC than an unknown new brand. Showing a single CAC number without founder channel context is misleading. |
| **v1 Confidence** | Low — only valid as a wide range |
| **Include v1** | Yes — as a wide range only, with explicit note: "New entrant CAC on Amazon in this category: estimated [$X–$Y]. Actual CAC depends heavily on listing quality, review count, advertising execution, and whether the founder has an existing audience." |
| **If Not, Replacement** | N/A |

---

### 40 & 41. Gross Margin (Market Baseline and Founder-Specific)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially — calculated from real price/fees and estimated COGS |
| **Source(s)** | Price (#34) + fees (#35/#36) + COGS (#37 or #38) |
| **Scope** | Amazon US |
| **Type** | Calculated (real inputs + estimated COGS) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | ±30–50% due to COGS uncertainty. The most consequential metric for the BUILD NOW decision and the least accurate due to COGS uncertainty. |
| **Known Limitations** | A calculated output is only as accurate as its weakest input. COGS is the weak input. Showing gross margin as a range (at low/base/high COGS) is more honest than a point estimate. |
| **v1 Confidence** | Medium — range only |
| **Include v1** | Yes — three-column table: conservative/base/optimistic COGS, with corresponding gross margin. Never show a single gross margin number. |
| **If Not, Replacement** | N/A |

---

### 42. Breakeven COGS

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (calculated from real inputs and a stated margin target) |
| **Source(s)** | Computed from price (#34) + fees (#35/#36) + target gross margin (50% spec threshold) |
| **Scope** | Amazon US |
| **Type** | Calculated (arithmetic from real price and real fees — deterministic) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | High — this is arithmetic from real numbers. Given a specific price and fee structure, the COGS required to hit 50% gross margin is a deterministic calculation. |
| **Known Limitations** | The 50% gross margin threshold is a spec choice, not a universal truth. Some categories can be viable at lower margins (high volume, low competition, repeat purchase). The threshold should be labeled as a general guideline, with the ability to show breakeven at other target margins. |
| **v1 Confidence** | High — this is the most honest unit economics output in the system |
| **Include v1** | Yes — PRIMARY output of the unit economics section. "For this business to reach 50% gross margin at the observed median price and Amazon fee structure, your COGS must be below $X.XX per unit." The founder takes this number to manufacturers. |
| **If Not, Replacement** | N/A |

---

### 43. Breakeven Units and Capital to Breakeven

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (computed from real fees and estimated COGS/capital requirements) |
| **Source(s)** | Computed from unit economics model + capital plan estimates |
| **Scope** | Amazon US |
| **Type** | Calculated (from estimated inputs) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | ±30–50% due to COGS and capital estimate uncertainty. Shown as a range. |
| **Known Limitations** | Multiple uncertain inputs compound. Capital requirements for launch include inventory (COGS × MOQ), marketing, certifications, and operating reserve — all estimated. |
| **v1 Confidence** | Medium — range only |
| **Include v1** | Yes — as ranges, with the formula visible: "At [COGS base], breaking even requires selling [N range] units. Estimated capital to reach breakeven: $[low]–$[high]." |
| **If Not, Replacement** | N/A |

---

## Section 9: Revenue Envelope

---

### 44. Demand Pool (Google-to-Amazon Funnel)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially — search volume is real; channel transition rate is estimated |
| **Source(s)** | DataForSEO (search volume) + industry benchmark (channel transition rate: 30–50% of Google searchers reach Amazon) |
| **Scope** | Google US → Amazon US |
| **Type** | Real × Estimated |
| **Update Frequency** | Monthly |
| **Cost Per Query** | No additional — derived from #1 |
| **Expected Accuracy** | Search volume: high. Channel transition rate: medium. The 30–50% range is an industry benchmark for consumer health categories; actual rate varies by category, brand, and marketing mix. Output must be a range, not a point. |
| **Known Limitations** | Channel transition rate is one of the most uncertain inputs in the model. A buyer in this category who found a DTC brand first never appears in Amazon demand — the platform cannot see them. Transition rate is lower for categories with strong DTC brands and higher for commodity categories. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — as an explicit range with the transition rate assumption shown and adjustable. |
| **If Not, Replacement** | N/A |

---

### 45. New Entrant Capture Rate

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — estimated from industry benchmarks |
| **Source(s)** | E-commerce and Amazon conversion rate benchmarks (industry range for new, unreviewed brands) |
| **Scope** | Amazon US |
| **Type** | Estimated |
| **Update Frequency** | Periodic (benchmark updates) |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Low for specific products. Range of 1–4% for a new brand with a well-optimized listing is broadly defensible as an industry benchmark but varies enormously with listing quality, review count, and pricing relative to competition. |
| **Known Limitations** | The single most uncertain input in the revenue envelope. A 1% vs 4% conversion rate produces a 4× difference in revenue estimate. The range must be shown, not a midpoint. The width of the range is itself signal: it communicates the uncertainty, not hides it. |
| **v1 Confidence** | Low — only valid as a wide range |
| **Include v1** | Yes — never shown as a point estimate. Always shown as a range (1–4%) with explicit statement: "Actual conversion depends on listing quality, photography, pricing, and review count — all of which are determined by execution, not market conditions." |
| **If Not, Replacement** | N/A |

---

### 46. Year 1 Revenue Envelope

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | Computed from demand pool (#44) × capture rate (#45) × price (#34) |
| **Scope** | Amazon US (channel-specific) |
| **Type** | Estimated (derived from multiple estimates) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Low to medium as a range. Meaningless as a point estimate. The conservative/base/optimistic spread may be a 5–10× range — this is honest, not a failure of precision. |
| **Known Limitations** | Represents what a well-executed new entrant could achieve in Year 1, with consistent marketing spend, a quality listing, and no major execution failures. The range is wide because it depends on founder execution, not market conditions. |
| **v1 Confidence** | Medium (as explicit range with all assumptions shown) |
| **Include v1** | Yes — three scenarios (conservative/base/optimistic) with every assumption visible. Label: "Year 1 estimate for a well-executed new entrant on Amazon US. Range reflects conversion rate uncertainty — not a forecast." |
| **If Not, Replacement** | N/A |

---

### 47. Year 3 Revenue Envelope

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | Year 1 envelope × assumed annual growth × repeat purchase component |
| **Scope** | Amazon US |
| **Type** | Estimated (additional assumptions compound Year 1 uncertainty) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Lower than Year 1 — each year adds compounding assumption uncertainty. |
| **Known Limitations** | Year 3 projection requires assumptions about growth rate (itself estimated), repeat purchase rate (benchmarked), and competitive response (unknown). The projection is illustrative, not predictive. |
| **v1 Confidence** | Low-Medium |
| **Include v1** | Yes — labeled explicitly: "Illustrative Year 3 scenario assuming [X% annual growth and Y% repeat rate]. Requires consistent execution and successful market capture. Not a forecast." |
| **If Not, Replacement** | N/A |

---

### 48. Minimum Viable Check

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially — founder's required revenue is self-reported; demand pool is estimated |
| **Source(s)** | Founder profile (capital, required revenue) + demand pool analysis |
| **Scope** | Founder + Amazon US |
| **Type** | Calculated (from founder-provided and estimated data) |
| **Update Frequency** | Per-analysis per founder |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Medium — the check is whether the minimum viable unit volume represents a realistic share of estimated demand. Useful even at low precision because it frames the right question. |
| **Known Limitations** | Depends on founder's self-reported capital and revenue requirements, which may be inaccurate. Depends on demand pool estimate, which has uncertainty. Output is directional guidance, not a precise calculation. |
| **v1 Confidence** | Medium-High (most actionable output of the revenue envelope section) |
| **Include v1** | Yes — primary output of the revenue sizing section. Frames the question as "is this market big enough for your requirements?" rather than "how big is this market?" |
| **If Not, Replacement** | N/A |

---

## Section 10: Investment Memo — Risk and IP

---

### 49. Patent Landscape Flag

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially — patents can be searched; their relevance to this specific product requires legal interpretation |
| **Source(s)** | USPTO patent database (full-text and claims search) |
| **Scope** | US patents |
| **Type** | Real (patents exist or don't) + AI relevance classification |
| **Update Frequency** | Weekly (USPTO updates) |
| **Cost Per Query** | Free (USPTO public API) — setup cost for query construction |
| **Expected Accuracy** | Low-to-medium. Keyword patent searches have a structural false negative problem: patent claims use deliberate obfuscation (broad language, genus-species naming, functional claim language) that may not match product-descriptive keywords. "No patents found" is not IP clearance — this is the most important limitation in the entire risk section. |
| **Known Limitations** | A freedom-to-operate opinion requires a patent attorney performing claim-by-claim analysis of all relevant filings — not a keyword search. A missed patent can result in significant legal and financial liability. The false negative risk of keyword patent search is not small — it is the dominant risk of this feature. See Architecture Review T3.3. |
| **v1 Confidence** | Medium (as flagging tool only) |
| **Include v1** | Yes — as a flagging function only, never as clearance. Mandatory disclaimer on every patent section: "Patent keyword search identifies potentially relevant filings. It does not constitute a freedom-to-operate opinion. Patent language is deliberately broad — relevant patents may not contain searchable terms. The absence of a flag does not mean IP is clear. Do not proceed past this point on patent questions without a qualified patent attorney." |
| **If Not, Replacement** | N/A |

---

### 50. Regulatory Classification (US)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (for well-defined categories) |
| **Source(s)** | FDA category classification rules + product type lookup table |
| **Scope** | FDA (US) only |
| **Type** | Rule-based lookup |
| **Update Frequency** | When FDA rules change |
| **Cost Per Query** | No additional — rule-based |
| **Expected Accuracy** | High for mainstream categories (standard DSHEA dietary supplement, conventional food). Lower for edge cases: novel ingredients without established GRAS status, combination products (drug-device combinations), products making borderline claims. |
| **Known Limitations** | US-only. EU, UK, Canada, Australia, and other markets have different and often more restrictive regulatory frameworks — not addressed in v1. Novel ingredients without established regulatory history require expert analysis that this system cannot provide. Regulatory landscape for certain ingredients (CBD, NAC, certain peptides) is actively contested. |
| **v1 Confidence** | High for mainstream supplements; Medium for edge cases |
| **Include v1** | Yes — with explicit: "US FDA only. Non-US regulatory requirements not assessed — consult qualified counsel before targeting non-US markets." |
| **If Not, Replacement** | N/A |

---

### 51. Multi-Region Regulatory Assessment

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially (EU Novel Food register is public; other jurisdictions vary) |
| **Source(s)** | EMA, MHRA, Health Canada, TGA databases |
| **Scope** | EU, UK, Canada, Australia |
| **Type** | Real (regulatory records) — where accessible |
| **Update Frequency** | Varies by jurisdiction |
| **Cost Per Query** | Varies — some public, some require licensed database access |
| **Expected Accuracy** | Requires jurisdiction-specific expertise to interpret correctly |
| **Known Limitations** | Significant jurisdictional variation. EU Novel Food regulation applies to ingredients without a history of use in the EU before 1997 — a broad and complex determination. Requires regulatory expertise per jurisdiction that is difficult to systematize. |
| **v1 Confidence** | Low |
| **Include v1** | No — explicitly out of scope for v1. Show disclosure: "Regulatory assessment covers US FDA only. EU, UK, Canadian, Australian, and other regulatory requirements are not assessed in this version. Required if founder's target_geography is multi_region or international." |
| **If Not, Replacement** | Show explicit scope limitation. Note as roadmap item for v2. |

---

### 52. Competitor Moat Type Assessment

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — AI inference from limited information |
| **Source(s)** | AI reasoning from competitive evidence (review counts, price positioning, product range breadth) |
| **Scope** | Amazon US sampled competitors |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | Included in Stage 4 AI calls |
| **Expected Accuracy** | Low-to-medium. AI can identify obvious surface moats (review volume, pricing position) but cannot assess private competitive advantages: supplier relationships, unreported patents, exclusive distribution agreements, deep brand community. The most important moats are rarely visible in Amazon data. |
| **Known Limitations** | Fundamental limitation: private information (manufacturing relationships, IP not yet filed, distribution agreements, community loyalty) cannot be inferred from Amazon data. AI moat assessment misses the most important dimensions of competitive durability. |
| **v1 Confidence** | Low-Medium |
| **Include v1** | Yes — labeled: "AI-inferred moat type from observable Amazon data. Private competitive advantages (supplier relationships, unreported IP, distribution agreements) are not visible to this system and may be significant." |
| **If Not, Replacement** | N/A |

---

### 53. Differentiation Stress-Test (Observable / Verifiable / Defensible)

| Attribute | Value |
|-----------|-------|
| **Measurable** | No — AI applies qualitative tests |
| **Source(s)** | AI evaluation of thesis differentiation claim |
| **Scope** | Thesis-level |
| **Type** | AI synthesized (rule application to qualitative claim) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | Included in Stage 4 AI calls |
| **Expected Accuracy** | Medium — AI applies the three tests inconsistently. The "observable" test has clearer criteria; "defensible" requires reasoning about IP and competition that may be poorly calibrated. |
| **Known Limitations** | The three tests check whether differentiation is communicated and sustained — not whether customers will pay for it. A differentiation can pass all three tests and still be commercially irrelevant if customers do not value it enough to switch or pay more. See Architecture Review T3.5. |
| **v1 Confidence** | Medium |
| **Include v1** | Yes — with mandatory willingness-to-pay evidence field added: "Evidence that the market pays for this differentiation" (addressed if evidence exists; acknowledged as absent if not). |
| **If Not, Replacement** | N/A |

---

## Section 11: Founder Profile Inputs

All founder profile fields share common characteristics:

| Shared Attribute | Value |
|------------------|-------|
| **Measurable** | No — all self-reported |
| **Source(s)** | Founder input |
| **Scope** | Founder |
| **Type** | Founder-provided |
| **Update Frequency** | When founder updates profile |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Variable; systematically optimistic. No external validation. |
| **Known Limitations** | Self-reported inputs are systematically biased toward optimism. The system cannot verify any founder claim. Capital figures may reflect total savings rather than liquid, committable capital. Experience fields cannot represent depth or quality of experience — only existence. |
| **v1 Confidence** | High for collection mechanism; Low for accuracy of information |

---

| # | Field | Include v1 | Decision Note |
|---|-------|------------|---------------|
| 54 | Capital available (USD) | Yes | Most consequential input. Must be paired with `capital_confidence` field to weight its reliability. |
| 55 | Capital confidence | Yes | Required alongside capital amount — without it, the system cannot calibrate how much to trust the stated figure. |
| 56 | Manufacturing experience | Yes | Binary classification understates nuance but is implementable. |
| 57 | Regulatory experience | Yes | Critical for regulatory gap assessment in Stage 2.5. |
| 58 | Existing channel type and size | Yes | Channel size affects CAC assumption in founder-specific model. |
| 59 | Target geography | Yes | Determines regulatory scope disclosure. `multi_region` or `international` must trigger explicit regulatory limitation warning. |
| 60 | Time horizon | Yes | Affects timeline fit assessment and VALIDATE FURTHER urgency. |
| 61 | Risk posture | Yes | Affects framing of uncertainty ranges in investment memo. Conservative founders should see worst-case prominently; high-risk-tolerance founders should see the full range. |
| 62 | Long-term goal | Yes | Affects capital plan framing (lifestyle business = smaller initial scale; scale to exit = different capital efficiency requirements). |

---

## Section 12: Data Quality Gate

The Data Quality Assessment is not a metric that is displayed to founders as a data point — it is the deterministic gate that controls whether subsequent stages can run. It deserves its own validation row because it has its own source logic, accuracy characteristics, and failure modes.

---

### 64. Data Quality Assessment (Stage 1 Exit Gate)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (computed deterministically from Stage 1 provider responses) |
| **Source(s)** | All Stage 1 provider outputs: DataForSEO, Keepa, Apify, openFDA, TikTok |
| **Scope** | Full Stage 1 data collection — four dimensions: demand, market_structure, customer_voice, risk_surface |
| **Type** | Calculated (deterministic rule logic applied to data presence, sample size, and confirmation count) |
| **Update Frequency** | Per-analysis (runs immediately after Stage 1 data collection completes) |
| **Cost Per Query** | No additional — derived from Stage 1 outputs that are already collected |
| **Expected Accuracy** | High for pipeline gate decisions. The quality tiers operate on counts and presence checks, not estimates. "Strong" = multiple providers confirmed independently with >12 months history. "Adequate" = single provider confirmed with sufficient sample. "Thin" = data exists but below recommended sample size. "Missing" = no usable data returned from any provider. The gate thresholds (e.g., "fewer than 2 independent demand signals = Stage 2 blocked") are judgment calls, not scientifically derived thresholds. |
| **Known Limitations** | Thresholds are spec choices and may need calibration after launch. A legitimate niche market may have only 3 real competitors and pass viability checks in practice — the "fewer than 5 competitor products" Stage 2 block could be too strict for narrow-niche searches. The system must display exactly what is missing and why Stage 2 was blocked, not just that it was. The failure reason must be shown at the provider level (which provider returned no data, what the failure reason was). |
| **v1 Confidence** | High for rule application; gate threshold calibration requires post-launch feedback |
| **Include v1** | Yes — required before Milestone 1 ships. This is the exit gate for Stage 1. Display per-dimension quality grades, overall grade (`sufficient` / `thin` / `insufficient`), any blocked stages, and specific missing dimensions with provider failure reasons. A `thin` result still permits Stage 2 to run — the reduced confidence label propagates to thesis generation and the memo. An `insufficient` result on any material dimension blocks Stage 2 entirely. |
| **If Not, Replacement** | N/A — this is a system gate, not an optional metric |

---

## Section 13: Kill Switches

Kill switches are deterministic rules, not metrics. They are computed from data already validated in earlier sections. Each switch has a single trigger condition; a triggered switch overrides all positive signals. This section documents each switch's data dependency, trigger logic, and implementation requirements.

**Why these are in the validation table:** Kill switches cannot be implemented correctly unless their data dependencies are validated. Each depends on at least one earlier metric — and the accuracy limitations of that metric propagate into the switch's reliability. A kill switch evaluated on unreliable data is itself unreliable.

---

### 65. Kill Switch: PATENT_BLOCKING

| Attribute | Value |
|-----------|-------|
| **Measurable** | Partially — the flag is deterministic once AI relevance classification produces a result; the classification itself is AI-assisted and imprecise |
| **Source(s)** | USPTO patent database + AI relevance classification (same data as metric #49) |
| **Scope** | US patents — granted filings with active holders whose claims appear to cover this product's mechanism |
| **Type** | Rule applied to AI classification output (the rule is deterministic; the AI determines the relevance flag that the rule reads) |
| **Update Frequency** | Weekly (USPTO publishes new grants weekly; a relevant grant could appear between analysis runs) |
| **Cost Per Query** | Included in #49 patent search |
| **Expected Accuracy** | Low for "no IP risk" conclusions — false negatives are structurally guaranteed by keyword patent search (deliberate claim obfuscation means relevant patents may not match search terms). High for "possible IP risk" flags when something is found — the system surfaces what it finds. The switch triggers conservatively: false positives (flagging a non-blocking patent) are acceptable; false negatives (not flagging a blocking patent) are the catastrophic failure mode. |
| **Known Limitations** | Does not constitute a freedom-to-operate opinion. Many patents blocking a product will never be surfaced by keyword search. A clean result ("no potentially blocking patents found") means exactly that — not "IP is clear." The switch's "triggered" state means "possible conflict found — requires legal review," not "confirmed infringement." Cannot be lifted by the platform. |
| **v1 Confidence** | Medium — reliable as a flagging system; unreliable as a clearance system |
| **Include v1** | Yes — but with mandatory legal disclaimer at implementation. Trigger condition: USPTO search returns a granted filing, held by an active company, whose claims appear to cover this product's mechanism (AI relevance classification). When triggered: display the filing(s) found, the basis for relevance flag, and the required next step (freedom-to-operate opinion from patent attorney). When not triggered: display "No obviously conflicting patents found — this is not IP clearance." |
| **If Not, Replacement** | N/A — kill switch must be included or the system is blind to a major risk category |

---

### 66. Kill Switch: FDA_CLEARANCE_REQUIRED

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes — regulatory classification is deterministic from lookup table; clearance status is a binary known fact |
| **Source(s)** | Regulatory classification lookup table (#50) + FDA clearance databases (510(k) database, GRAS notice inventory) |
| **Scope** | US FDA — product categories requiring pre-market clearance or GRAS designation |
| **Type** | Rule applied to deterministic classification |
| **Update Frequency** | When FDA classification rules change, or when product specification changes, or when a pending clearance is granted |
| **Cost Per Query** | No additional — derived from #50 |
| **Expected Accuracy** | High for mainstream supplement categories (DSHEA-regulated dietary supplements do not require pre-market clearance under most circumstances). Uncertainty for edge cases: novel ingredients without established safety data, products making structure-function claims that approach drug claims, combination products (drug-device). The switch triggers conservatively when classification is ambiguous. |
| **Known Limitations** | US-only. Does not cover EU Novel Food, Canadian Natural Health Products, Australian TGA, or other regulatory regimes. Novel ingredient regulatory status is actively contested for certain compounds (e.g., NAC, certain peptides, CBD) — the classification table may be outdated. Pending clearance (a founder who says "we're in the process of getting GRAS") does not lift the switch — only confirmed clearance in hand does. |
| **v1 Confidence** | High for standard supplement categories; Medium for novel ingredient or borderline claim categories |
| **Include v1** | Yes — required. Trigger condition: product classification requires 510(k) clearance OR GRAS designation AND neither is confirmed for this specific product or formulation. When triggered: display required pathway, typical duration (12–36 months), estimated cost range ($50K–$500K), and what specifically would lift the switch. |
| **If Not, Replacement** | N/A |

---

### 67. Kill Switch: ECONOMICS_STRUCTURALLY_BROKEN

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes — arithmetic from real price/fee data and an estimated COGS range |
| **Source(s)** | Price floor from price distribution (#9) + Amazon fees (#14) + optimistic COGS from category benchmark (#37) |
| **Scope** | Amazon US at observed category price floor |
| **Type** | Calculated (deterministic arithmetic) |
| **Update Frequency** | Per-analysis (recalculates when any input updates) |
| **Cost Per Query** | No additional — derived from existing metrics |
| **Expected Accuracy** | High when the result is clearly above or below threshold. The check uses the OPTIMISTIC COGS (the most favorable cost assumption) at the PRICE FLOOR (the least favorable revenue assumption). This is the best-case scenario. If gross margin is still below 35% under these conditions, no realistic operating scenario produces viable economics. In the boundary zone (result within ±5% of the 35% threshold), COGS estimate uncertainty can change the trigger outcome — in this zone, the switch triggers conservatively. |
| **Known Limitations** | The 35% gross margin floor is a spec choice. Some categories can operate viably below this threshold (extremely high repeat purchase, alternative cost structures, DTC channels with better margins). The threshold should be labeled in the output. COGS benchmark uncertainty (±30–50%) means a borderline result may be wrong. The boundary zone must be defined and handled explicitly in implementation — do not let threshold proximity produce inconsistent trigger behavior. |
| **v1 Confidence** | High when clearly above or below threshold; Medium in the boundary zone (within ±5% of 35% at optimistic COGS) |
| **Include v1** | Yes — required. Trigger condition: (observed price floor − Amazon referral fee − Amazon FBA fee − optimistic COGS) ÷ (observed price floor) < 35%. All inputs shown with their sources. If the result is in the boundary zone, show: "Economics close to threshold — result depends on COGS accuracy. Validate COGS with manufacturer quotes before relying on this result." |
| **If Not, Replacement** | N/A |

---

### 68. Kill Switch: COMMODITY_PRICE_COMPRESSION

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes — computed from real historical price data |
| **Source(s)** | Category price compression metric (#63 — Keepa 24-month price history) |
| **Scope** | Amazon US — products present in top results in both today and 24 months ago |
| **Type** | Calculated (arithmetic from real historical data, deterministic rule applied) |
| **Update Frequency** | Monthly |
| **Cost Per Query** | Included in Keepa pull (see #63) |
| **Expected Accuracy** | High for the arithmetic (percentage calculation from Keepa price history is reliable). The interpretation question — whether the decline represents a commoditization spiral vs. temporary competitive pricing vs. category maturation — is not addressed by the switch. The switch fires on the number, not the cause. A founder who understands the cause may find the switch is overcautious. This is by design: the platform resolves uncertainty conservatively. |
| **Known Limitations** | Sample composition over 24 months is the primary reliability concern (see #63). If the comparison set includes newly entered products that launched at low prices (increasing downward price pressure from new entrants rather than secular decline), the decline percentage may misrepresent underlying category dynamics. The implementation must track which products are in the comparison and show this transparently. |
| **v1 Confidence** | Medium — reliable when sample composition is stable; less reliable when competitive set has changed significantly over the comparison period |
| **Include v1** | Yes — required. Trigger condition: median price of products continuously present in the top results over 24 months has declined >30%. If comparison set has fewer than 5 products with continuous history: show "Insufficient price history to evaluate price compression — switch cannot be evaluated" rather than clearing the switch. |
| **If Not, Replacement** | N/A |

---

## Section 14: Final Computed Outputs

These are outputs produced at Stage 3 and Stage 4 that depend on all prior metrics. They are deterministic (from rules or arithmetic) or AI-synthesized — but they are not raw data. They are included here because each has a distinct accuracy profile and known limitations that affect how it should be labeled and displayed.

---

### 69. Win Condition (Per Top Competitor, AI Synthesis)

| Attribute | Value |
|-----------|-------|
| **Measurable** | No |
| **Source(s)** | AI reasoning from competitor-specific data: review count (#11, per-product), observed price (#9, per-product), specific weakness from cross-product complaint analysis (#17), moat type assessment (#52) |
| **Scope** | Top 3 incumbents per thesis — Stage 4 competitive analysis section |
| **Type** | AI synthesized |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | Included in Stage 4 AI calls (~$0.50–$1.50 per set of top competitors) |
| **Expected Accuracy** | Low-to-medium. AI can identify obvious tactical win conditions (undercut on price, address a known complaint, launch with more certifications). It cannot assess private competitive dynamics: exclusive supplier contracts, pending or unregistered IP, distributor relationships, deep brand community. Win conditions derived exclusively from observable Amazon data will systematically underestimate the difficulty of displacing established incumbents. |
| **Known Limitations** | The most important competitive barriers are rarely visible in Amazon data. An AI-generated win condition is a structured prompt for founder investigation — not a strategic assessment. Founders who rely on it without verifying private competitive dynamics make decisions on incomplete information. This limitation must be documented at the point of display, not buried in metadata. |
| **v1 Confidence** | Low-Medium — useful as a structured starting point for competitor research; unreliable as a final competitive strategy |
| **Include v1** | Yes — per competitor, not a single generic statement. Required label: "AI-reasoned win condition from observable Amazon data. Private competitive advantages (supplier relationships, brand community, exclusive distribution, pending IP) are not visible to this system and are frequently the more significant barrier to entry." |
| **If Not, Replacement** | N/A |

---

### 70. Sensitivity Analysis (Unit Economics)

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (deterministic arithmetic) |
| **Source(s)** | Computed from all unit economics model inputs (#34–42 for market baseline; #38 added for founder-specific) |
| **Scope** | Amazon US per-thesis |
| **Type** | Calculated (arithmetic — deterministic) |
| **Update Frequency** | Per-analysis |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | High — this is arithmetic from defined inputs. The sensitivity table is reliable as a conditional computation: "given these inputs, this is what ±15% on each variable produces." The output is only as reliable as the inputs, but the calculation itself is exact. |
| **Known Limitations** | The ±15% sensitivity table tests each variable in isolation (ceteris paribus). Real-world scenarios involve correlated changes: a supplier charging 20% more COGS may also produce higher quality, enabling higher pricing. The single-variable independence assumption is a useful simplification but does not capture correlated risk. The most important output of the sensitivity table is identifying which single variable, if wrong, most changes the verdict — this is the "most sensitive variable" that the founder should validate first. |
| **v1 Confidence** | High — the most honest representation of unit economics uncertainty in the system |
| **Include v1** | Yes — required. For each variable input: base value, output at +15%, output at −15%, and whether the verdict changes at that level. The input whose variation most affects the verdict is prominently labeled "Most sensitive variable — validate this first." Collapsed by default in the UI (to reduce cognitive load) but not hidden. |
| **If Not, Replacement** | N/A |

---

### 71. Market Verdict

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (deterministic rule logic applied to all prior metrics) |
| **Source(s)** | Verdict determination logic (spec Section 5) applied to Stage 1–3 outputs: demand signals, kill switch status, BUILD NOW conditions |
| **Scope** | Market-level — does not depend on founder profile |
| **Type** | Calculated (deterministic rule) |
| **Update Frequency** | Per-analysis (does not change when founder profile updates — only when Stage 1/2/3 data refreshes) |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | High for rule application — the verdict logic is exact. The verdict's reliability depends on the accuracy of the inputs. Kill switch triggers (#65–68) are highly reliable when their underlying data is available. BUILD NOW conditions vary: "verified demand" and "viable economics" depend on data with known uncertainty. The asymmetry in the design (false BUILD NOW is worse than false VALIDATE FURTHER) is intentional: the cost of an unwarranted BUILD NOW recommendation is potential capital loss; the cost of an excess VALIDATE FURTHER recommendation is a missed opportunity. The platform is calibrated to prefer caution. |
| **Known Limitations** | A deterministic verdict from imperfect inputs is still deterministic — it follows the rules exactly, even when the underlying data quality is low. The data quality gate (#64) is the upstream protection: if data quality is `insufficient`, Stage 2 is blocked and the verdict loop never runs. The BUILD NOW requirements (#5 in spec) involve conditions that are themselves binary-classified outputs of earlier metrics — the compound probability of all 8 conditions being correctly assessed simultaneously is lower than any individual condition. BUILD NOW should be treated as "all conditions met with currently available evidence" — not "definitely correct to build." |
| **v1 Confidence** | High for rule application; Medium for calibration of the rules themselves |
| **Include v1** | Yes — required. Cannot be AI-generated under any circumstances. Must include: decision (`BUILD_NOW` / `VALIDATE_FURTHER` / `AVOID`), cited supporting evidence (specific, not generic), conditions that must remain true for this verdict to hold, and (when `VALIDATE_FURTHER`) the upgrade path — exactly what must change to reach `BUILD_NOW`. |
| **If Not, Replacement** | N/A — this is the primary system output |

---

### 72. Founder Verdict

| Attribute | Value |
|-----------|-------|
| **Measurable** | Yes (deterministic logic applied to market verdict + founder profile + fit annotations) |
| **Source(s)** | Market Verdict (#71) + Founder Profile (#54–62) + Fit Annotations (#26–29) |
| **Scope** | Founder-specific — the same market, evaluated for this specific founder's capital, experience, and channel |
| **Type** | Calculated (deterministic rule) |
| **Update Frequency** | Per-profile update — recomputes without re-running Stage 1 or Stage 2, because founder inputs do not change market facts |
| **Cost Per Query** | No additional |
| **Expected Accuracy** | Medium — the verdict logic is reliable, but the founder-stated inputs (#54–62) that drive it carry systematic optimism bias and are unverifiable. The most consequential input is capital (#54): founders frequently overstate liquid, committable capital. A Founder Verdict of BUILD NOW based on stated capital that is not actually available is a false positive with real capital consequences. |
| **Known Limitations** | The Founder Verdict can diverge from the Market Verdict in either direction. Upward divergence (Founder = BUILD NOW when Market = VALIDATE FURTHER): happens when a founder advantage resolves an override — but this upgrade is only as reliable as the founder's self-assessment of that advantage. Downward divergence (Founder = VALIDATE FURTHER when Market = BUILD NOW): happens when a founder gap creates a new override — this is the more reliable direction because the system is applying a conservative constraint. When verdicts diverge, the divergence explanation must state specifically which founder input is driving the difference and how sensitive the conclusion is to that input's accuracy. |
| **v1 Confidence** | High for rule application; Low for reliability of the founder-stated inputs that drive it |
| **Include v1** | Yes — required when a founder profile is present. Always displayed alongside the Market Verdict, never as a replacement for it. When the two verdicts differ, a dedicated "Why these verdicts differ" paragraph is mandatory, with explicit attribution to the specific profile factor causing the divergence. |
| **If Not, Replacement** | N/A |

---

## Summary: v1 Inclusion Decisions

| Category | Include | Conditional | Exclude |
|----------|---------|-------------|---------|
| **Demand Intelligence** | Search volume, trend, change rates, buying keywords, seasonal pattern | Geographic concentration (API stability), TikTok signal (API stability + signal quality) | — |
| **Market Structure** | Competitor count, price distribution, review concentration index, Amazon fees, category price compression | — | Market concentration (top-3 revenue share — mathematically wrong), average rating, estimated category units/month |
| **Customer Voice** | Aggregated complaint themes, cross-product validation, verbatim language, sentiment trajectory | Complaint frequency (must show absolute count + denominator) | — |
| **Risk Surface** | FDA recalls, tariff exposure, PubMed research trajectory (supplement categories) | Category news events (relevance filtering), patent flag (with mandatory disclaimer) | Multi-region regulatory (v2) |
| **Opportunity Map** | AI-generated theses, quick economics viability check | — | — |
| **Founder-Fit Layer** | Experience gaps, channel fit, timeline fit | Capital fit (threshold formula must be defined before implementation) | — |
| **Adversarial Debate** | Bull case, evidence-based bear case, structural risk inventory, unknowns list | — | — |
| **Unit Economics** | Breakeven COGS (primary output), price/fees, gross margin as range, breakeven units as range | COGS estimate — market baseline (range only), COGS estimate — founder-specific (outlier warning required), CAC estimate (range only) | Single gross margin point estimate, single revenue estimate |
| **Revenue Envelope** | Demand pool (range), minimum viable check | Year 1 envelope (range, all assumptions shown), Year 3 envelope (labeled illustrative) | Revenue point estimate, market revenue, category units sold |
| **IP & Regulatory** | Regulatory classification (US), patent flag (with mandatory disclaimer) | — | Multi-region regulatory (v2) |
| **Competitive Analysis** | Competitor weakness (cross-product), win condition (AI-labeled, per competitor) | Moat type assessment (AI-labeled with limitations) | — |
| **Differentiation** | Three-part stress test + willingness-to-pay evidence requirement | — | — |
| **Founder Profile** | All 9 fields | — | — |
| **Data Quality Gate** | Data Quality Assessment (Stage 1 exit gate — deterministic) | — | — |
| **Kill Switches** | All 4 switches: PATENT_BLOCKING, FDA_CLEARANCE_REQUIRED, ECONOMICS_STRUCTURALLY_BROKEN, COMMODITY_PRICE_COMPRESSION | — | — |
| **Final Outputs** | Market Verdict (deterministic), Sensitivity Analysis (deterministic) | Founder Verdict (only when founder profile present) | Single composite verdict that collapses market and founder verdicts |

---

## Metrics Requiring Prerequisite Decisions Before Implementation

These metrics cannot be implemented until the specified decision is resolved (from Architecture Review):

| Metric | Prerequisite | Architecture Review Ref |
|--------|-------------|------------------------|
| Capital fit threshold | Define minimum viable threshold formula with all inputs and sources | T1.2 |
| Thesis generation | Define per-thesis evidence minimums (absolute count + cross-product requirement) | T1.3 |
| All EvidencePoint labels | Replace `verified/estimated/synthesized` with `primary_measurement/provider_model/ai_synthesis/computed` | T1.4 |
| Founder COGS input | Define outlier detection threshold and forced sensitivity table at benchmark COGS | T1.5 |
| VALIDATE FURTHER verdicts | Design resolution loop before any Stage 3 implementation | T1.6 |
| Seasonal pattern | Define minimum annual cycles required before "seasonal" label is applied | T2.2 |
| Complaint frequency | Define display rule: always show absolute count and denominator alongside percentage | T2.8 |
| Patent section | Draft mandatory disclaimer text before implementation — cannot be added as an afterthought | T3.3 |
| Category price compression (#63) | Define the sample composition rule: which products to include when the top competitive set has changed over 24 months. Without this rule, Kill Switch #4 cannot produce a reliable comparison. (New — not in Architecture Review v1.0) | NEW |
| Kill switch boundary zone (#67) | Define behavior when the ECONOMICS_STRUCTURALLY_BROKEN result falls within ±5% of the 35% threshold: the switch should trigger conservatively, but the display must show exactly how close the result was and how much COGS uncertainty affects it. (New — not in Architecture Review v1.0) | NEW |

---

*This table is the implementation gate. No metric should be built until its row is reviewed and its v1 status confirmed. Rows marked "Conditional" require the stated condition to be met and documented before the metric ships.*
