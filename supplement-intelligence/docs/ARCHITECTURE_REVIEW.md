# Architecture Review — External CTO Challenge
## Product Intelligence & Investment Decision Engine

**Reviewer perspective:** External CTO attempting to break the specification  
**Review date:** 2026-07-01  
**Spec reviewed:** PRODUCT_SPEC.md v1.0  
**Status:** Issues identified — resolve before Milestone 1 implementation

---

## Summary Verdict

The specification establishes a sound philosophy and a correct structural separation between market intelligence and founder-fit evaluation. The AI/deterministic boundary is well-drawn. The "What Is Never Shown" section is unusually disciplined. These are genuine strengths.

However, the spec has **7 issues that would cause the product to make incorrect recommendations**, not just incomplete ones. These are not polish items — they are cases where following the spec as written produces an output that is actively misleading. They must be resolved before Milestone 1.

Below that tier: 8 specification gaps where required logic is referenced but never defined, leaving critical decisions for implementation time (when they will be made inconsistently). And 6 deeper structural tensions that the architecture does not resolve and needs to explicitly decide.

---

## TIER 1 — Will Produce Incorrect Outputs
*Must be resolved before any implementation begins.*

---

### T1.1 — `market_concentration_top3` Is Mathematically Wrong

**Where:** Stage 1, Market Structure table; `MarketSignal` data model.

**The flaw:** The spec defines market concentration as "top-3 share of estimated category unit volume." The denominator — "estimated category unit volume" — is itself computed from the same sampled bestsellers that make up the numerator. If you sample the top 10 bestsellers and the top 3 account for 60% of those 10 products' combined estimated revenue, the spec reports 60% concentration. But there are hundreds more products in the actual category not in the sample. The real top-3 concentration could be 15%. The spec systematically and silently overstates market consolidation.

**Why it matters:** If concentration appears high, a founder may be told the market is too consolidated to enter. If concentration is actually low, that's a false AVOID signal on the single most important structural dimension.

**Fix:** Rename the field to `sampled_bestseller_concentration` and label it explicitly: *"Share of estimated volume among the top N sampled products. Does not represent total market concentration — there are [estimated remaining competitor count] additional products not in this sample."* Remove any kill switch or thesis logic that treats this figure as market-level. It can inform qualitative assessment but cannot trigger structural gates.

---

### T1.2 — Minimum Viable Launch Threshold Is Undefined

**Where:** Stage 2.5 (Fit Layer), capital fit check; `FounderFitAnnotation.capital_fit`.

**The flaw:** The spec says the fit layer computes "minimum viable launch threshold for this product type." The capital fit gate — one of the most consequential outputs in the product — triggers based on comparing founder capital to this threshold. But how is the threshold computed? From what data? By what formula? The spec never says.

If it's AI-estimated, it's a guess and the AI/deterministic boundary is violated (this is in Stage 2.5 which is supposed to be entirely deterministic rules). If it's a lookup table by category, where does the table come from and what are the values? If it's computed from MOQ estimates, what are the MOQ estimates and where do they originate?

**Why it matters:** A threshold of $80K vs. $300K for the same product category produces opposite capital fit outcomes. A founder who passes a too-low threshold receives BUILD NOW when the real capital requirement is prohibitive.

**Fix:** Define the threshold formula explicitly before implementation. Proposed approach:
```
minimum_viable_threshold = (
  category_typical_moq_units × estimated_cogs_base
  + (estimated_cogs_base × moq_units × 0.5)   // 50% safety stock
  + launch_marketing_floor                      // category-benchmarked floor
  + certification_cost_estimate                 // by product type
  + (6_months × estimated_monthly_operating_cost) // reserve
)
```
Each input must have a source (benchmark table, provider data, or explicit assumption). The benchmark table must be maintained as a spec artifact, not embedded in implementation code.

---

### T1.3 — Thesis Generation Evidence Threshold Is Undefined

**Where:** Stage 2 specification, pipeline gate description; also the adversarial review in the original conversation.

**The flaw:** The spec says "minimum evidence threshold checked before each thesis is generated" with a threshold level per thesis. The Stage 1 pipeline gate blocks thesis generation at the session level (fewer than 2 demand signals or fewer than 5 competitors). But the per-thesis threshold — how much evidence a specific thesis requires before it can be stated — is never quantified.

The AI can generate a thesis about a GI-distress-free magnesium formulation if it finds one mention of GI distress in one review. Is one mention sufficient? 5? 20? Should it be a percentage of negative reviews? An absolute count? A threshold relative to review base size?

**Why it matters:** Theses generated from thin evidence look identical to theses generated from strong evidence in the current spec. A founder cannot distinguish "17% of 800 negative reviews cite this" from "2 of 12 negative reviews mention this." Both produce a thesis. One is an investable insight. One is noise.

**Fix:** Define per-thesis evidence minimums before implementation. Proposed:
- Customer pain sourced from reviews: minimum 10 unique review instances OR 5% of negative reviews (whichever is smaller sample size — use the more generous threshold when review base is thin)
- Competitive gap sourced from competitor analysis: must appear in reviews of at least 2 different products (not concentrated in one product's reviews)
- Each evidence citation in the thesis must link to a specific `EvidencePoint` in the `MarketSignal` — not to AI reasoning. This linkage must be validated programmatically, not assumed.

---

### T1.4 — `data_type: 'verified'` Is Overloaded and Creates False Confidence

**Where:** `EvidencePoint` interface; provider matrix; Stage 1 data tables.

**The flaw:** The spec uses `verified` to mean "data read from a real primary source, not AI-generated." But in practice, `verified` is read by users to mean "accurate." These are different things:

- An Apify-scraped review count is `verified` (the number exists in Amazon) but could be inflated by review manipulation campaigns — common in exactly the high-margin categories this platform analyzes.
- A Keepa `monthlySold` value is `estimated` because Keepa models it — correct.
- A DataForSEO search volume is `verified` — but DataForSEO aggregates from multiple sources and applies its own smoothing algorithms. It is more accurate than AI synthesis but not a direct measurement.

A founder seeing "Verified — DataForSEO" vs. "Estimated — Keepa" concludes the first number is more reliable. In some cases the Keepa estimate is more representative of real behavior than the DataForSEO aggregate.

Additionally, the spec labels "Complaint frequency (% of negative reviews)" as `verified`. The count of reviews mentioning a theme is verified. The synthesis of which reviews belong to which theme is done by AI — making the frequency figure partially `synthesized`, not purely `verified`.

**Fix:** Split `data_type` into two orthogonal dimensions:

```typescript
interface EvidencePoint<T> {
  value: T
  source_type: 'primary_measurement' | 'provider_model' | 'ai_synthesis' | 'computed'
  // primary_measurement: directly read from source system (price, review text, recall record)
  // provider_model: provider's own estimate (Keepa monthlySold, DataForSEO volume)
  // ai_synthesis: AI-generated from source material (theme extraction, complaint grouping)
  // computed: arithmetic from other evidence points (percentage calculations, averages)
  accuracy_note?: string  // when the distinction between sourced and accurate matters
  ...
}
```

Remove the `verified` / `estimated` / `synthesized` tri-state. It conflates too many concerns. The new taxonomy is more specific and harder to misread.

---

### T1.5 — Founder COGS vs. Category Benchmark Conflict Is Unhandled

**Where:** Stage 4, Unit Economics, Founder-Specific Model.

**The flaw:** The spec accepts a founder-stated COGS estimate and uses it as the base case in the founder-specific model. It labels the input `FOUNDER-STATED`. But it defines no behavior when the founder's estimate conflicts dramatically with the category benchmark.

Consider: category benchmark for a supplement is $4–$8 per unit. Founder states $1.50/unit. At $1.50 COGS with a $25 price, the economics look exceptional — 50%+ margin with room to spare. But $1.50 is almost certainly wrong for a finished, certified supplement at any reasonable MOQ. The system accepts it, computes an excellent gross margin, and may contribute to a BUILD NOW verdict — on a number the founder invented.

This is the most dangerous single input the system can receive. A founder who dramatically underestimates COGS, receives BUILD NOW, launches, and discovers real COGS is 4× their estimate has suffered real financial harm from a platform that didn't flag the conflict.

**Fix:** Define explicit behavior for COGS outliers:

1. If founder COGS is below category benchmark `low` value: surface a warning before computing. "Your stated COGS of $X is below the typical range of $Y–$Z for this product type. Verify with actual manufacturer quotes before relying on this figure." The computation still runs (founder may have a genuine advantage), but the warning is not dismissable without acknowledgment.

2. Sensitivity table must show: at the category benchmark `base` COGS (not just the founder's stated COGS), what is the gross margin? This gives the founder a reality check inline.

3. If founder `cogs_confidence` is `rough_guess` AND stated COGS is below benchmark `low`: the founder-specific verdict cannot be BUILD NOW. It defaults to VALIDATE FURTHER with the specific condition: "Verify COGS with manufacturer quote."

---

### T1.6 — VALIDATE FURTHER Has No Resolution Loop

**Where:** Stage 3 Unknowns, Stage 4 Validation Agenda, `Verdict.validation_agenda`.

**The flaw:** The spec produces a validation agenda when the verdict is VALIDATE FURTHER. The agenda lists specific tasks (get manufacturer quotes, investigate patent scope, interview 10 potential customers). But the spec defines no mechanism for what happens after the founder completes those tasks.

Does the founder return to Stage 3? Upload new information? Does the system update its verdict? Is the analysis re-run? Or is the validation agenda just a list of homework that disappears?

A VALIDATE FURTHER verdict that resolves to nothing is not a feature — it is a refusal to decide dressed as guidance. If the platform cannot tell a founder "do these 3 things, submit your findings, and we will give you an updated verdict," then VALIDATE FURTHER is a useless output.

**Why it matters:** VALIDATE FURTHER will be the most common verdict for most real opportunities (it is the correct verdict for any genuinely uncertain opportunity). If it doesn't resolve, the platform's most common output is a dead end.

**Fix:** Design the resolution loop explicitly before implementation. Required decisions:

1. What does "submitting validation findings" look like? Does the founder upload a document, fill a structured form, or both?
2. Which validations trigger a re-run of which stages? (Getting a real COGS quote should trigger Stage 4 recompute. Resolving a patent question should trigger Stage 3 kill switch re-evaluation.)
3. What is the maximum number of validation cycles before the system forces a final verdict?
4. Can a VALIDATE FURTHER status automatically expire if not resolved within a time window?

---

### T1.7 — Bear Case Constrained to Existing Data Misses the Most Important Risks

**Where:** Stage 3, Call 2 (Bear Investor) specification.

**The flaw:** Call 2 is instructed: *"Cite only evidence from the provided market data."* This constraint is well-intentioned (prevent hallucination) but structurally wrong. The most devastating bear arguments for a physical product launch are almost never in the market data:

- A well-funded competitor is 6 months from launching in this exact sub-category with a $5M marketing budget (you cannot see this in current market data)
- The primary raw material supplier is concentrated in one region facing geopolitical risk
- A regulatory proposal under consideration would require reformulation
- The manufacturing lead time for this product type makes a seasonal window impossible to hit
- The category's growth is driven by one high-profile creator whose endorsement is not renewable

If the bear case is constrained to what is already observed in the data, it will primarily surface risks that are already visible — which the market signal covers anyway. The point of the bear case is to surface risks that are NOT in the data.

**Fix:** Restructure Call 2 into two components:

**Component A — Evidence-Based Bear Case:** "Based solely on the market data provided, make the strongest case against this thesis." This is the current Call 2.

**Component B — Structural Risk Inventory:** A separate, explicitly speculative section that asks the AI to surface *categories of risk* that cannot be detected from market data, tailored to this product type and channel. This is labeled: *"Speculative risks not detectable from available data — requires founder investigation."* No evidence citations expected or shown. Pure risk category checklist derived from known physical product launch failure modes (not from the specific market data).

Both components appear in Stage 3 output under different visual treatment. Component A is evidence-backed. Component B is a prompted checklist of known blind spots. Neither is confused with the other.

---

## TIER 2 — Specification Gaps
*Logic is referenced in the spec but never defined. Will be decided ad-hoc at implementation time, producing inconsistency. Must be decided now.*

---

### T2.1 — "Meaningful Competitor" Threshold Is Arbitrary and Unstated

The pipeline gate uses ">50 reviews" to define a meaningful competitor. This threshold is never justified. 50 reviews means a product launched at least 6–18 months ago — depending on category velocity. In a high-velocity category (protein powder), 50 reviews is a very young product. In a slow category (specialty therapeutic supplements), 50 reviews is a seasoned incumbent.

A fixed review count treats all categories identically. A better threshold is category-relative: "products in the top quintile of review count for this category" or "products with review count above the category median." 

**Required decision:** Define the threshold rule, explain the rationale, and codify it as a named constant with its reasoning documented. `MEANINGFUL_COMPETITOR_MIN_REVIEWS = 50` with a comment saying "arbitrary" is not acceptable for a production gate.

---

### T2.2 — Seasonal vs. Trending Distinction Is Undefined

The spec says seasonal pattern is "estimated" from DataForSEO + Google Trends. But the algorithm for distinguishing "seasonal" from "trending" is not defined. Both look like a curve that goes up in a period. A product that spikes every November is seasonal. A product that spikes this November for the first time is trending (or a fad). Treating them the same way produces opposite investment implications.

**Required decision:** Define the seasonal detection algorithm before implementation. Minimum viable approach: require at least 2 full annual cycles of data before calling something seasonal. A single peak is trending or emerging, not seasonal.

---

### T2.3 — Amazon Centricity Is Not Disclosed Consistently

The spec has a channel scope declaration ("Amazon US only, not total market") but does not define where this declaration appears in the UI. It is presumably in a note somewhere in Stage 1. But if a founder reaches the Stage 4 investment memo and the channel scope declaration is not prominently visible near the unit economics section, they will make DTC calculations using Amazon-derived price and fee data.

The current spec places this in the Market Intelligence Briefing (Stage 1). By Stage 4, most founders will have forgotten it.

**Required decision:** Define exactly where the channel scope disclosure appears in each stage output. Propose: it appears as a persistent header in every section that uses Amazon-derived data — not just once in Stage 1.

---

### T2.4 — Session State and Staleness Are Unspecified

Stage 2 (overview) says "founders may re-enter any stage, compare multiple theses in parallel, and update their profile at any time." This implies persistent session state, but the spec defines no session data model, no staleness policy, no re-run triggers, and no cost model for re-running providers.

Specifically undefined:
- How long is Stage 1 data cached before it is considered stale?
- If a founder returns to a saved analysis after 45 days, what is the UX? Does it warn? Re-run? Block?
- If a founder updates their profile, which computations re-run and in what order?
- If two founders analyze the same query in the same week, do they share Stage 1 data or get independent runs?

**Required decision:** Define a session model with explicit staleness windows per provider (DataForSEO data: 30-day cache; Apify competitor scrape: 14-day cache; Keepa fee data: 90-day cache) and the re-run trigger logic.

---

### T2.5 — API Cost Model Is Absent

The spec calls for: DataForSEO (keyword volume), Google Trends, Keepa (product data for 10–20 products), Apify (competitor scraping + review collection), TikTok, openFDA, PubMed, GDELT, and 3 separate AI calls in Stage 3 plus multiple calls in Stage 4.

A Stage 1–4 full analysis pipeline could cost $8–25 per analysis in API fees depending on category depth and AI model selection. At 100 analyses per month, that is $800–$2,500 in API cost before any revenue. At 1,000 analyses, it is $8,000–$25,000.

The spec does not address cost modeling, caching strategy (beyond the session model above), or whether some providers are conditionally called (only if cheaper providers returned insufficient data).

**Required decision before Milestone 1:** Define a provider call sequence that is cost-aware. Proposed approach: cheap providers first (DataForSEO search, Google Trends), then gate expensive providers (Apify full scrape, Keepa full product pull) on the quality of what the cheap providers returned. An analysis with no DataForSEO demand signal should not trigger a full Apify competitive scrape.

---

### T2.6 — Multi-Region Regulatory Scope Is Unaddressed

The regulatory surface check covers FDA (US) and US HTS tariff codes. If `target_geography` is `multi_region` or `international`, this coverage is insufficient and potentially dangerous.

EU Novel Food Regulation, UK MHRA, Health Canada, TGA (Australia), CFDA (China) — all have different approval requirements for supplement ingredients. A product that is DSHEA-compliant in the US may require Novel Food authorization in the EU (a 12–24 month, €50K–€200K process). The founder who sets `target_geography = multi_region` would receive no regulatory flag for this from the current spec.

**Required decision:** Either (a) explicitly scope the platform to US market only and make this a hard constraint on `target_geography` (not a hidden limitation), or (b) define the multi-region regulatory check requirements for at least EU and UK as a Milestone 2 item and surface a disclaimer in Milestone 1: "Regulatory check covers US only. EU, UK, and other regulatory requirements not assessed — consult qualified counsel before targeting non-US markets."

---

### T2.7 — Price Distribution Bias Is Unlabeled

The spec collects price distribution from Apify. Apify's Amazon scraper returns results ranked by Amazon's search ranking algorithm — which favors established, high-review products. The price distribution therefore skews toward the prices of established incumbents, not the full range of products in the category. 

Specifically: low-priced or recently-launched products with few reviews may be systematically underrepresented. The `p25` price may be higher than the true category `p25`. This means a new entrant who wants to price below the observed `p25` to gain traction appears to be below the market floor — when they are actually in the middle of the full market range.

**Required decision:** Label price distribution explicitly: *"Price distribution from top-ranked Amazon search results. Lower-visibility products are underrepresented. True category price floor may be lower than the minimum shown."*

---

### T2.8 — Review Authenticity and Deduplication Are Not Addressed

Amazon reviews used for customer voice analysis have two known integrity problems the spec does not address:

**Duplication:** Reviews are sometimes syndicated across related ASINs. If the same review text appears on 5 products and all 5 are scraped, a complaint theme appears 5× more frequently than it actually does. Complaint frequency figures (used as the primary evidence strength metric) are inflated.

**Authenticity:** Review manipulation is pervasive in high-margin consumer categories — exactly where this platform operates. Paid review farms and incentivized review programs systematically inflate ratings and can manufacture or suppress specific complaint themes. A `data_type: 'verified'` label on review data does not account for this.

**Required decision:** 
1. Deduplication: define a deduplication strategy (fuzzy match on review text across scraped products; deduplicate before frequency analysis).
2. Authenticity: add a disclaimer to all customer voice sections: *"Review analysis is based on public Amazon reviews. Review authenticity is not verified. Review manipulation is common in consumer categories — treat high complaint frequencies as directional, not precise."* Do not claim `verified` status for derived complaint frequency figures.

---

## TIER 3 — Structural Tensions Requiring Explicit Decisions
*The spec does not resolve these — implementation will be forced to resolve them inconsistently. Make the decision explicitly now.*

---

### T3.1 — The Platform Cannot Claim Its Recommendations Are Better Than Chance

The spec mentions "founder outcome tracking" as a post-launch priority, noting this is "the path to eventual calibration of recommendations." This is honest. But it buries a significant limitation.

Until the platform has outcome data, there is no basis for claiming the recommendations are accurate, reliable, or better than alternatives. The platform can claim the recommendations are *honest*, *traceable*, and *based on real evidence* — those are defensible. It cannot claim they are *correct* at any particular rate.

This is not a criticism of the architecture. It is a disclosure requirement. If the platform does not state this limitation prominently, founders who receive BUILD NOW will assume the recommendation has some validated track record behind it. It does not.

**Required decision:** Add an explicit "About This Platform's Recommendations" disclosure to the investment memo that says, in plain language: this platform produces evidence-based analysis. It has no historical outcome data to calibrate against. A BUILD NOW recommendation means the evidence supports investment — not that the investment will succeed. No prediction of success probability is implied or intended.

---

### T3.2 — The Product's Value Proposition Over a Direct AI Conversation Is Not Specified

A sophisticated founder can open Claude, paste in their Keepa export, their DataForSEO data, and their competitor reviews, and ask for a thesis, adversarial evaluation, and investment memo. They will get something in that neighborhood.

The spec does not articulate what this platform does that the direct conversation cannot. The answer should exist and be clear:
1. Automated multi-provider data collection (the founder cannot easily do this themselves)
2. Deterministic kill switches that the AI cannot reason around (a conversation has no equivalent)
3. A structured, versioned, shareable artifact (a conversation is ephemeral)
4. Consistent, reproducible methodology applied identically across analyses (a conversation varies)

If these are the real differentiators, they should be stated in the spec and they should govern feature prioritization. Kill switches become more important than narrative quality. Structured data models become more important than prompt engineering. Provenance labeling becomes more important than comprehensiveness.

**Required decision:** State the platform's irreducible advantages explicitly in the spec. Use them as the tie-breaker when features compete for development time.

---

### T3.3 — The Patent Kill Switch Has a False Negative That Cannot Be Disclosed

The `PATENT_BLOCKING` kill switch requires: USPTO search returns a filing, holder is an active company, filing is granted. When the kill switch is NOT triggered, the spec implies the IP landscape is clear enough to proceed.

But a USPTO keyword search has a structural false negative problem: patent language is deliberately obfuscated to maximize claim breadth. A patent covering "magnesium bioavailability enhancement via amino acid chelation" will not be found by a keyword search for "magnesium glycinate supplement." A freedom-to-operate opinion from a patent attorney involves claim-by-claim analysis of all potentially related filings — not keyword search.

A founder who receives no patent flag from the system may be in an encumbered IP landscape. The kill switch, when not triggered, provides false assurance.

**Required decision:** The patent section must state explicitly: *"No relevant patents were identified by keyword search. This is not a freedom-to-operate opinion. Patent keyword searches have significant false negative rates due to deliberate claim obfuscation. Do not interpret the absence of a flag as IP clearance."* This disclaimer must be prominent, not a footnote.

---

### T3.4 — Customer Voice Captures Only Buyers of Existing Products

The customer voice analysis is built entirely from reviews of existing products. This means the voice captured is the voice of people who:
1. Had a need
2. Found an existing product
3. Bought it
4. Wrote a review

The most valuable customer segment for a differentiated new entrant is the people who had a need, searched, found nothing acceptable, and did not buy. Those people leave no Amazon reviews. They are entirely absent from the customer voice analysis.

This means the differentiation thesis is constructed from the feedback of people who were willing to tolerate existing solutions — which systematically underestimates the size of the unserved need and may miss the most important differentiation angles entirely.

**Required decision:** Either (a) accept this limitation explicitly and disclose it ("Customer voice reflects buyers of existing solutions — non-buyers are not represented"), or (b) add a supplementary signal from Reddit, consumer forums, and social media where people discuss problems without buying. Reddit in particular captures "I've tried everything and nothing works" language that Amazon reviews structurally cannot.

---

### T3.5 — The Differentiation Stress-Test Has No Willingness-to-Pay Check

The spec tests differentiation on three criteria: observable, verifiable, defensible. All three can pass and the differentiation still fails commercially, because customers say they want it in reviews but would not pay a premium for it in practice.

Example: customers complain about magnesium supplements causing GI distress. A gentler formulation is observable (the label says "gentle formula"), verifiable (they can experience it), and defensible (formulation IP). But if customers are not willing to pay $5–8 more for it — and many will accept mild GI distress to save $5 — the differentiation generates no price premium and produces a commodity product.

The spec has no mechanism for estimating willingness to pay. It accepts evidence that the complaint exists as evidence that customers would pay more to solve it. These are different things.

**Required decision:** Either (a) add a willingness-to-pay signal (price elasticity within the category, DTC premium brands succeeding at higher price points, any evidence of customers paying more for adjacent formulation improvements), or (b) add a mandatory "willingness-to-pay evidence" field to the thesis that is required to be addressed, even if the answer is "no evidence available." An empty field is more honest than a gap that is not acknowledged.

---

### T3.6 — The Spec Has No Mechanism for Category-Specific Intelligence

A platform analyzing "magnesium glycinate supplements" should apply different logic than one analyzing "chicken jerky dog treats." The evidence thresholds, the meaningful competitor definitions, the regulatory surface, the seasonal amplitude interpretation, the channel assumptions — all of these differ substantially by category.

The current spec applies uniform logic to all categories. A pipeline gate of "5+ competitors" means something completely different in a crowded supplement category (hundreds of competitors) vs. a niche pet food category (5 meaningful competitors total).

**Required decision:** Either (a) accept that the platform is Amazon supplement / health supplement focused (the current codebase suggests this is the actual scope), codify it explicitly, and tune all thresholds for this context; or (b) define how category-specific configuration will be implemented (a category configuration layer that adjusts thresholds based on category type). Option A is honest and fast. Option B is correct but adds significant complexity.

---

## Summary Table

| # | Issue | Tier | Required Before |
|---|-------|------|----------------|
| T1.1 | `market_concentration_top3` is mathematically wrong | Critical | Milestone 1 |
| T1.2 | Minimum viable launch threshold undefined | Critical | Milestone 1 |
| T1.3 | Thesis generation evidence threshold undefined | Critical | Milestone 1 |
| T1.4 | `verified` label creates false confidence | Critical | Milestone 1 |
| T1.5 | COGS conflict handling undefined | Critical | Milestone 1 |
| T1.6 | VALIDATE FURTHER has no resolution loop | Critical | Milestone 2 |
| T1.7 | Bear case constrained to existing data | Critical | Milestone 3 |
| T2.1 | "Meaningful competitor" threshold unjustified | Gap | Milestone 1 |
| T2.2 | Seasonal vs. trending distinction undefined | Gap | Milestone 1 |
| T2.3 | Channel scope disclosure not placed consistently | Gap | Milestone 1 |
| T2.4 | Session state and staleness undefined | Gap | Milestone 1 |
| T2.5 | API cost model absent | Gap | Milestone 1 |
| T2.6 | Multi-region regulatory scope unaddressed | Gap | Milestone 2 |
| T2.7 | Price distribution bias unlabeled | Gap | Milestone 1 |
| T2.8 | Review authenticity and deduplication unaddressed | Gap | Milestone 2 |
| T3.1 | Platform cannot claim accuracy without outcome data | Decision | Before launch |
| T3.2 | Value proposition over direct AI conversation unstated | Decision | Before Milestone 1 |
| T3.3 | Patent kill switch false negative not disclosed | Decision | Milestone 3 |
| T3.4 | Customer voice missing non-buyers entirely | Decision | Milestone 2 |
| T3.5 | No willingness-to-pay check on differentiation | Decision | Milestone 2 |
| T3.6 | No category-specific intelligence layer | Decision | Before Milestone 1 |

---

## Required Spec Updates Before Implementation

The following additions should be made to PRODUCT_SPEC.md before Milestone 1 begins:

1. **Define minimum viable launch threshold formula** with every input, its source, and its rationale. Codify benchmark tables as a spec appendix.

2. **Define per-thesis evidence minimum** (absolute count + percentage thresholds for complaint frequency, corroboration requirements).

3. **Replace `data_type` tri-state with `source_type` four-state** as specified in T1.4. Update all data tables and the `EvidencePoint` interface.

4. **Define COGS conflict behavior** (warning threshold, sensitivity table requirement, `rough_guess` + below-benchmark COGS → forced VALIDATE FURTHER).

5. **Define VALIDATE FURTHER resolution loop** (what the founder submits, which stages re-run, maximum resolution cycles).

6. **Restructure Stage 3 Call 2 into evidence-based bear + structural risk inventory** as two distinct components.

7. **Define "meaningful competitor" threshold rule** with category-relative logic.

8. **Define seasonal detection algorithm** (minimum 2 annual cycles required).

9. **Add channel scope disclosure placement rule** — appears persistent in every stage that uses Amazon data, not only in Stage 1.

10. **Define session state model** (cache windows per provider, re-run triggers, staleness behavior).

11. **Add API cost sequencing rule** (cheap providers gate expensive providers).

12. **Add patent false negative disclaimer** to the regulatory/IP section spec.

13. **Add customer voice sampling bias disclosure** to Stage 1 and Stage 4 customer evidence sections.

14. **Add review authenticity disclaimer** and define deduplication strategy.

15. **Add willingness-to-pay evidence requirement** to thesis specification (addressed or explicitly acknowledged as absent).

16. **Add platform accuracy disclosure** to Stage 4 investment memo spec.

17. **Define category scope** — supplement-focused or general. Document any category-specific threshold tuning.

---

*This review should be treated as a required input to PRODUCT_SPEC.md v1.1. No implementation should begin until each item in the Required Spec Updates section has been addressed or explicitly accepted with documented reasoning for non-resolution.*
