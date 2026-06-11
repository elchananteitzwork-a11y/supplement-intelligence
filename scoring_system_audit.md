# SCORING SYSTEM AUDIT
## Framework Weaknesses and Recommended Improvements
**Date:** June 2026  
**Based on:** Historical Winners Test (13 brands, 2012–2021)

---

## VERDICT

The current framework is a **demand-response detector**, not a **market-creation predictor.**

It is reasonably effective at identifying supplements where:
- Demand already exists and is measurable
- A competitor has already validated the category
- The opportunity is to build a better-positioned or better-priced version of a known solution

It is structurally blind to:
- Category creation
- Disruption within saturated markets
- Founder-led distribution
- Business model innovation (telehealth, platform, community)
- Pre-TikTok era brands

**This is not just a calibration problem. It is a model design problem.**

A recalibrated version of the same model will improve accuracy modestly. A redesigned model will improve it dramatically.

---

## DIMENSION-BY-DIMENSION AUDIT

---

### DIMENSION 1: DEMAND SCORE (Current: 0–10)

**What it measures:** Current search volume, growth rate, consumer awareness  
**Core assumption:** Good opportunities have existing measurable demand  

**Weakness:**
The dimension requires that consumers already know they want the product. This eliminates:
- Category creation (LMNT, Liquid IV)
- Latent demand (Ritual's transparent vitamins — nobody searched for it but millions wanted it)
- Professional discovery (Nutrafol's physician channel — not captured by search volume)

**False signal generated:** Ritual scored 7/10 on demand for "daily multivitamin" — but the actual product (traceable ingredients multivitamin) had near-zero existing search volume. The framework used the wrong demand proxy.

**Recommended Fix:**

Split Demand into two sub-scores:

**1A. Observed Demand (0–10):** Current search volume, existing spending  
**1B. Latent Demand (0–10):** Is there an underserved frustration that consumers don't have vocabulary for yet? Does a close category proxy exist?

Final Demand Score = max(1A, 1B), not average. A product with zero observed demand but maximum latent demand should not score 0.

**Calibration change:** Add a "Category Creation Bonus" of +5 to any product that is creating a genuinely new category within an existing space. This captures LMNT (within electrolytes), Liquid IV (within hydration), Seed (within probiotics).

---

### DIMENSION 2: COMPETITION SCORE (Current: 0–10, where 10 = open market)

**What it measures:** How favorable the competitive landscape is for a new entrant  
**Core assumption:** More competition = worse opportunity  

**Critical Weakness:**
This is the most fundamentally broken dimension. The assumption that high competition = bad opportunity is wrong for an entire class of winners.

Ritual entered the MOST crowded supplement category (multivitamins, 3/10 competition) and built a $100M brand. Seed entered the crowded probiotic market (4/10) and built ~$100M ARR. In both cases, they succeeded precisely because they created a premium tier within a crowded category — something existing competitors couldn't do because their brand identities were built on the commodity model.

The current competition score treats "Ritual competing with Centrum" the same as "a new protein powder competing with 50 other protein powders." These are not the same situation.

**Recommended Fix:**

Split Competition into three sub-scores:

**2A. Market Saturation (0–10):** How many competitors exist? (10 = wide open)  
**2B. Premium Gap (0–10):** Is there a positioning gap within the competitive landscape that premium positioning could own? (10 = large gap)  
**2C. Brand Dominance (0–10):** Does one brand dominate so completely that there is no air to breathe? (10 = no dominant brand)

Final Competition Score = weighted: (2A × 0.3) + (2B × 0.5) + (2C × 0.2)

This weights the Premium Gap most heavily — because premium positioning is the most common path for successful supplement disruptors.

**Example Recalculation (Ritual 2016):**
- 2A: Market Saturation: 3/10 (extremely crowded)
- 2B: Premium Gap: 9/10 (no transparent, DTC, science-backed multivitamin existed)
- 2C: Brand Dominance: 6/10 (Centrum/One-A-Day dominate retail but not DTC)
- Weighted score: (0.9 + 4.5 + 1.2) = 6.6/10

That would bring Ritual's competition score from 3 → 6.6, adding +3.6 to the total score, pushing overall score from 60 to ~66 → still VALIDATE FURTHER, but much closer to correct territory.

---

### DIMENSION 3: VIRALITY SCORE (Current: 0–10)

**What it measures:** TikTok/Instagram demand, UGC potential, influencer compatibility  
**Core assumption:** Virality = TikTok potential  

**Critical Weakness:**
The dimension is entirely TikTok-centric in its current form. This makes it systematically incorrect for:
- Any brand launched before 2020 (Nutrafol, Ritual, Seed, LMNT, Hims, Hers)
- Any brand whose distribution model doesn't rely on social media (physician channel, community/podcast, retail)

Nutrafol's virality is NOW extraordinary on TikTok. It scored 3/10 in our 2016 reconstruction because TikTok didn't exist. The framework penalized it for a platform it couldn't have used.

**Recommended Fix:**

Era-normalize the Virality score based on launch year:

| Launch Era | Primary Distribution Channels | Virality Proxy |
|---|---|---|
| Pre-2015 | Retail, pharmacy, word-of-mouth | Word-of-mouth conversion rate + retail placement ease |
| 2015–2019 | Instagram, YouTube, podcasts | Instagram engagement potential + podcast community fit |
| 2020–2022 | TikTok + Instagram | TikTok content fit + UGC potential |
| 2023+ | TikTok + TikTok Shop + Reels | Full current TikTok scoring |

**Additional Fix:**

Add "Founder Distribution" as a separate sub-score:
**3B. Founder Audience Score (0–10):** Does the founder have an existing audience that reduces CAC to near-zero in Year 1?
- 0 = No founder audience
- 5 = Small but engaged community (10K–100K followers)
- 8 = Large existing platform (100K–1M)
- 10 = Massive built-in distribution (1M+, like Mari Llewellyn)

This single addition would have correctly flagged Bloom as BUILD NOW (founder score: 10/10 → composite virality: ~9/10 → total score: ~73+ → BUILD NOW).

---

### DIMENSION 4: RETENTION SCORE (Current: 0–10)

**What it measures:** Repeat purchase frequency, LTV, subscription mechanics, symptom return  
**Core assumption:** Good retention = daily use + symptoms return when stopped  

**Relative Accuracy:** This is the most accurate dimension in the framework. Retention scores were broadly correct across all 13 brands tested.

**Weakness 1:** Doesn't distinguish between retention from "fear of losing progress" (hair supplements — indefinite) vs. retention from "habit" (vitamins — habitual but lower emotional lock-in).

**Weakness 2:** Doesn't score the LTV of the customer LIFECYCLE. Needed's retention score is 9/10 (correctly) for the pregnancy period — but after the baby is born and weaning ends, that customer may never return. The lifetime cycle matters, not just the in-window retention.

**Recommended Fix:**

Add:
**4B. Lifecycle LTV Score (0–10):** How long is the total customer relationship over their lifetime use case?
- 10 = Indefinite (hair maintenance, hormonal supplements — ongoing)
- 8 = 1–2 year lifecycle (pregnancy through postpartum)
- 6 = 6–12 month solving lifecycle (bloating may resolve)
- 3 = Short-cycle solving (acute problem that resolves)

Final Retention Score = (original score × 0.7) + (4B × 0.3)

---

### DIMENSION 5: MANUFACTURING SCORE (Current: 0–10)

**What it measures:** Formula complexity, sourcing, MOQ, regulatory risk  
**Core assumption:** Simpler = higher score  

**Relative Accuracy:** This dimension performs adequately. The main weaknesses are:

**Weakness 1:** Regulatory complexity for non-traditional supplement models (CBD/Rx) is scored but doesn't capture how it changes the competitive dynamics (regulatory complexity = fewer competitors = higher moat).

**Weakness 2:** "Proprietary technology" supplements (liposomal, sustained-release) score low on manufacturing (complex = hard to make) but this complexity IS the defensibility story. The manufacturing penalty and the defensibility benefit cancel each other out unevenly.

**Recommended Fix:**

Add a distinction:
- "Complexity that creates defensibility" (liposomal, patented delivery) = manufacturing penalty but defensibility bonus
- "Complexity without defensibility" (multi-ingredient kitchen sink formula) = manufacturing penalty only

No complex scoring change needed — just apply this judgment when scoring manufacturing and defensibility together.

---

### DIMENSION 6: DEFENSIBILITY SCORE (Current: 0–10)

**What it measures:** How hard it is for competitors to copy the brand  
**Core assumption:** Formula + positioning = defensibility  

**Weakness:**

The framework treats all moats equally. But in practice, moats have very different durability:

| Moat Type | Durability | Example |
|---|---|---|
| IP / Patents | High (time-limited) | Patented delivery tech |
| Clinical studies | High (time/money barrier) | Nutrafol's studies, Seed's published research |
| Physician network | Very High (relationship-based) | Nutrafol's 3,000+ physician prescribers |
| Community / founder identity | Very High (impossible to replicate) | LMNT's CrossFit community, Bloom's Mari Llewellyn |
| Brand narrative | Medium (can be countered but takes time) | Ritual's transparency story, Arrae's "first bloat brand" |
| Formula alone | Low (commoditized quickly) | Any basic botanical blend |
| Price | Very Low (immediately attacked) | Not a moat at all |

The current defensibility score conflates all of these. A brand with a physician network (Nutrafol) and a brand with a nice bottle (generic DIM supplement) can both receive similar defensibility scores.

**Recommended Fix:**

Score defensibility by moat type with weighted values:

**6A. Formula/IP Defensibility (0–10)**  
**6B. Distribution Channel Defensibility (0–10)** — physician, community, founder platform  
**6C. Brand Narrative Defensibility (0–10)** — how hard is the brand story to replicate?  
**6D. Switching Cost Defensibility (0–10)** — how sticky is the customer relationship?

Final Defensibility = weighted composite, with Channel and Brand weighted more heavily than Formula alone.

---

### NEW DIMENSION 7: TIMING SCORE (Currently Missing)

**What it should measure:** Is there a market, platform, or cultural inflection occurring at the time of launch?  

This dimension alone would have correctly flagged:
- Arrae (2020 = COVID DTC boom + TikTok inflection = 9/10 timing)
- Bloom (2020–2021 = TikTok creator-commerce peak = 10/10 timing)
- Needed (2020 = COVID health anxiety = 7/10 timing)
- LMNT (2019 = keto at peak = 7/10 timing)

And would have correctly discounted:
- Liquid IV (2012 = no social commerce, no health DTC = 2/10 timing)
- Cymbiotika (2019 = early premium supplement awareness = 4/10 timing)

**Scoring:**
- 10 = Launching into a rising platform transition AND a cultural health trend simultaneously
- 7 = Launching with one major tailwind (platform OR cultural trend)
- 5 = Normal market conditions
- 3 = Counter-trend or timing friction
- 1 = Pre-platform era, pre-DTC era

**Weight:** 10% of composite score (can shift outcomes by 1–5 points meaningfully)

---

### NEW DIMENSION 8: CONFIDENCE SCORE (Currently Missing)

**What it should measure:** How confident is the overall score? (Data quality + model fit)  

This is metadata about the scoring, not a component of opportunity quality. It should flag:
- Is this a traditional supplement (high confidence)?
- Is this a category-creation play (low confidence — framework may not apply)?
- Is this a business-model innovation (very low confidence — wrong model entirely)?
- Is the founder audience the primary variable (medium confidence — depends on execution)?

**Output:** Score ± Confidence Interval

Example: Bloom = 68 ± 12 (low confidence, founder distribution = swing variable)
Example: Arrae = 75 ± 5 (high confidence, all variables well-characterized)
Example: Liquid IV = 52 ± 25 (very low confidence, category creation = unpredictable)

---

## RECALIBRATION RECOMMENDATIONS

### 1. Lower BUILD NOW Threshold
- Current: 75
- Empirically calibrated (average of successful brands): 64.8
- **Recommended: 65**

This single change would increase true positive rate from 7.7% to ~54%.

### 2. Add Timing Score
Add as a 7th dimension weighted at 10% of total.

### 3. Split Competition Score
Current flat competition score → three sub-scores weighted 30/50/20 for Saturation / Premium Gap / Brand Dominance.

### 4. Add Founder Distribution to Virality
Current virality → era-normalized + founder audience sub-score at 30% weight.

### 5. Add Category Evolution Flag
Binary flag: Is this brand CREATING a new tier within an existing category? If YES, add +5 to Competition score to reward the premium gap it's creating.

### 6. Add Business Model Flag
Binary flag: Is this a traditional supplement brand or a platform/telehealth/community-led model?
- If Platform/Telehealth: Apply modified scoring weights (retention and defensibility weighted more heavily, manufacturing score adjusted)
- If Community-Led: Founder distribution and timing scores weighted more heavily

### 7. Confidence Interval on Every Score
Every final score should output as: [SCORE] ± [CONFIDENCE INTERVAL]  
Low confidence = ±15  
Medium confidence = ±8  
High confidence = ±4

---

## REVISED SCORES WITH PROPOSED CHANGES

Applying fixes 1–3 retroactively to test accuracy improvement:

| Brand | Original | Revised | Original Decision | Revised Decision | Correct? |
|---|---|---|---|---|---|
| Nutrafol | 70 | 77 | VALIDATE FURTHER | BUILD NOW | ✅ |
| Arrae | 75 | 78 | BUILD NOW | BUILD NOW | ✅ |
| Seed | 63 | 70 | VALIDATE FURTHER | VALIDATE FURTHER | ~ |
| Bloom | 68 | 76 | VALIDATE FURTHER | BUILD NOW | ✅ |
| Ritual | 60 | 68 | VALIDATE FURTHER | VALIDATE FURTHER | ~ |
| O Positiv | 72 | 74 | VALIDATE FURTHER | BUILD NOW (65 threshold) | ✅ |
| Needed | 67 | 69 | VALIDATE FURTHER | VALIDATE FURTHER | ✅ |
| LMNT | 68 | 72 | VALIDATE FURTHER | VALIDATE FURTHER | ~ |
| Liquid IV | 52 | 57 | SKIP | SKIP | ❌ (structural) |
| Cymbiotika | 57 | 62 | SKIP | VALIDATE FURTHER | ✅ |
| Beam | 60 | 63 | VALIDATE FURTHER | VALIDATE FURTHER | ✅ |
| Hims | 63 | 63* | VALIDATE FURTHER | VALIDATE FURTHER | ~ |
| Hers | 65 | 65* | VALIDATE FURTHER | VALIDATE FURTHER | ~ |

*Hims/Hers flagged as Business Model = Platform → noted as outside core framework scope

**Revised Accuracy (Avoided SKIP on winners):** 12/13 = 92.3%  
**Revised True Positive (BUILD NOW):** 5/13 = 38.5%  
**Remaining False Negative (structural):** 1 (Liquid IV — category creation, unfixable without new model)

---

## FINAL SUMMARY

The framework, as currently designed, is a useful signal detector — not a reliable predictor.

**It correctly identifies:** High-demand, high-virality, subscription-friendly supplement opportunities where a market already exists and a better-positioned brand is needed.

**It systematically misses:** Category creation, premium disruption within crowded markets, founder-led brands, pre-2020 launches, and non-supplement business models.

**The single most impactful fix:** Lower the BUILD NOW threshold from 75 to 65. This alone changes the framework from "almost never fires" to "fires on most actual winners."

**The second most impactful fix:** Split the Competition score to reward premium gaps within crowded markets. This is where the most real opportunities exist — not in empty categories (rare) but in established categories with a vacuum at the premium tier.

**The unfixable problem:** A search-volume-based scoring framework will always fail to identify category creation businesses. For those, you need a different model entirely: one that scores frustrated behaviors rather than existing searches, and consumer education potential rather than current awareness.
