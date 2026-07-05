# Product Intelligence Constitution

**Document type:** Permanent architectural law  
**Version:** 1.0.0  
**Date:** 2026-07-05  
**Authority:** Chief Architect  
**Status:** In force from first line of implementation code

This document is the permanent constitution of the Product Intelligence system. It defines the architectural laws that govern how the product is built, how it reasons, what it is allowed to say, and how it must evolve. Technical Specification versions may change. Product roadmaps may shift. This document does not change unless a law is deliberately amended by the Chief Architect with a written rationale — never silently, never for convenience.

These are not guidelines. They are laws. A feature that violates a law in this document is not shipped. A shortcut that breaks a law is not a shortcut — it is technical debt that compounds into a trust collapse.

---

## Part I — Principles of Truth

*What the system is allowed to say, claim, and represent.*

---

### Law 1: Truth Over Confidence

**Statement:** The system never presents a conclusion with more certainty than the evidence supports. When evidence is weak, that weakness is communicated — visibly, on the first screen, not buried in an evidence view.

**Why it exists:** Founders make capital decisions based on what this platform tells them. A false sense of certainty that leads to a poor investment causes real harm. The platform's long-term credibility depends on being right when it is confident and honest when it is not.

**What problem it prevents:** The natural incentive in any software product is to make outputs look good — to smooth over gaps, present confident-sounding language, and avoid surfacing limitations that feel like admissions of failure. This law prevents that optimization from corrupting the signal.

**Acceptable implementations:**
- Confidence tier badges (CONFIRMED / INDICATED / LIMITED) on every signal card, mandatory, not optional
- A confidence qualifier displayed adjacent to the verdict when `verdict_confidence = LOW or MODERATE`
- Explicit "Consumer pain assessment was not possible with available data" when the consumer intelligence corpus was excluded
- Signal cards for LIMITED signals that state in plain language what the tier means

**Violations:**
- Hiding the confidence qualifier behind an info icon or tooltip instead of displaying it inline
- Using language like "early signals suggest..." when the signal is CONFIRMED — false modesty is a form of dishonesty too
- Displaying a VALIDATION_REQUIRED verdict without surfacing why validation is needed
- Averaging a CONFIRMED signal with a LIMITED signal without communicating the mixed quality

**How future features must preserve it:**
Every new signal added to the system must have an explicit confidence tier definition before it is scored. No signal may be shown to a user without a confidence badge. As more data sources are added, the confidence system becomes more precise — it never becomes less visible.

---

### Law 2: No Revenue Predictions

**Statement:** The system never produces, implies, or creates the conditions for founders to extract a revenue projection. No TAM estimates, no SAM estimates, no addressable revenue figures, no category revenue size, no "this market is worth $X."

**Why it exists:** Revenue projections built on keyword volume and price data are not revenue projections — they are fabrications dressed in numerical clothing. The inputs (search volume, median price) do not have a reliable causal relationship with a specific founder's revenue. Presenting them as if they do creates false precision that distorts founder decision-making.

**What problem it prevents:** Founder anchoring. Once a founder sees "$240M market opportunity," that number shapes every subsequent decision, even when the number was computed from two unreliable signals multiplied together. The platform's job is to clarify, not to create anchors.

**Acceptable implementations:**
- "Search volume: 45,200/month" presented as evidence of demand strength, not as a revenue signal
- "Estimated category-wide units: 81,000/month at $35 median price" shown as calibration context for demand interpretation
- "This represents consistent purchase intent across the category" as interpretation of demand volume

**Violations:**
- "This is a $34M annual opportunity"
- "If you capture 1% of this market, you would generate..."
- "Total addressable market: approximately $X"
- Any formula that multiplies volume × price and presents the result as market size
- "The category currently generates..." — even historically accurate market size figures create anchoring

**How future features must preserve it:**
If an investor report feature is ever built, it must not include revenue figures computed by the platform. It may include raw data points (search volume, price ranges) that investors can interpret themselves. The platform never does the multiplication.

---

### Law 3: No Probability of Success

**Statement:** The system never estimates, implies, or suggests the likelihood that a founder will succeed in a market. The system assesses markets. It does not predict outcomes for people.

**Why it exists:** Success probability depends on variables the platform cannot measure: founder capability, execution quality, access to capital, timing, team, relationships, domain expertise. A platform that assigns a success probability without those variables is not providing intelligence — it is providing false precision that reliably misleads. It also shifts moral responsibility from the founder to the platform, which is an architectural failure of trust.

**What problem it prevents:** Founders who interpret market-positive verdicts as personal success probabilities, and make larger capital commitments than the evidence warrants. The law maintains the correct relationship between the platform and its user: the platform is an advisor, not an oracle.

**Acceptable implementations:**
- "The evidence supports market entry" — states what the evidence shows about the market
- "Consumer pain is validated by [N] complaints across [corpus size] reviews" — states what is confirmed
- "Primary risk: Review Moat score of 8.3 suggests established competitors have significant discovery advantages" — characterizes a structural challenge

**Violations:**
- "This product has a high probability of success"
- "Founders in this category typically..." — generalizing from category patterns to a specific founder's outcome
- "Given the strong demand signal, this opportunity is likely to be profitable"
- Any score labeled "Opportunity Score" or "Success Score" that implies a personal outcome assessment
- "Based on current market conditions, a new entrant has approximately..."

**How future features must preserve it:**
The Founder-Market Fit feature (if ever built) must be scoped strictly to characterizing the structural relationship between a market and a set of objective founder attributes — not predicting whether the specific founder will succeed. The output must be phrased as "this market tends to reward founders with [attributes]" not "you are [likely/unlikely] to succeed."

---

### Law 4: No ROI Predictions

**Statement:** The system never computes or presents return on investment, payback period, margin projections, or any other financial ratio that requires estimating future revenue against known or estimated cost.

**Why it exists:** ROI calculations require accurate revenue projections. Revenue projections require market capture assumptions. Market capture assumptions for a product that doesn't exist yet are speculation dressed in spreadsheet formatting. The cost side (COGS, manufacturing) can be estimated from real data. The revenue side cannot. Any ROI figure combines a real number with a fabricated number and presents the result as meaningful analysis.

**What problem it prevents:** Capital misallocation based on a platform-generated ROI figure. When a platform says "estimated ROI: 340%," founders stop doing independent financial modeling. The platform has replaced their judgment with a number that is half real and half invented.

**Acceptable implementations:**
- Showing COGS ratio (unit_cost / median_price) as a cost structure signal, framed as: "Estimated COGS ratio of 52% — margin profile before fulfillment and marketing"
- Manufacturing feasibility score as a signal about structural profitability, not a revenue prediction
- "MOQ of 500 units at $8/unit = $4,000 minimum initial commitment" — factual capital requirement, no return implied

**Violations:**
- "Estimated ROI at 1,000 units/month: 280%"
- "Estimated break-even: 340 units"
- "Payback period: 4.2 months"
- "Net margin range: 18–32%" — this requires a revenue assumption
- Any chart or visualization that projects financial performance over time

**How future features must preserve it:**
A financial modeling feature (if ever built) must be explicitly labeled as a founder-provided scenario tool — where the founder inputs their own revenue assumptions, and the platform validates the cost side only. The platform never provides the revenue input.

---

### Law 5: Market Assessment Is Not Founder Assessment

**Statement:** Every verdict, signal, and insight produced by the system describes a market, not a person. The system assesses whether a market is accessible — not whether a specific founder should enter it.

**Why it exists:** These are different questions requiring different data. Market assessment requires market data (demand, competition, consumer pain, manufacturing). Founder assessment requires founder data (capital, experience, relationships, risk posture). The platform has market data. It does not have founder data. Answering the founder assessment question with market data is a category error.

**What problem it prevents:** Founders interpreting a market-positive verdict as personal validation. Founders interpreting a market-negative verdict as personal rejection. Both misreadings lead to poor decisions: the first to overcommitment, the second to abandonment of potentially good ideas where the founder's specific advantages would change the calculus.

**Acceptable implementations:**
- Verdict framing: "The evidence supports market entry" — assesses market conditions
- "The evidence does not support market entry" — characterizes market structure, not founder capability
- Risk: "Review Moat creates a discovery challenge for new entrants" — structural market characteristic
- The disclaimer visible adjacent to every verdict: "This assessment reflects market conditions, not your specific capabilities or situation"

**Violations:**
- "This is not the right market for you"
- "You should focus on [alternative market]"
- "This market rewards experienced operators" — implies founder-specific advice
- "Given your position as a new entrant..." — the platform does not know the founder's position
- "This is a difficult market even for experienced teams" — the word "even" implies founder assessment
- Any verdict framing that says "you" or "your" in the context of the market outcome

**How future features must preserve it:**
If a Founder Profile feature is ever built, the outputs of the Founder-Market Fit layer must be segregated from the Market Intelligence layer in the UI, in the data model, and in the code. A combined score that merges market signals with founder signals violates this law. The two assessments are displayed separately and never averaged.

---

## Part II — Principles of Design

*How the system is built, how components relate to each other, and what governs component evolution.*

---

### Law 6: Deterministic Engine Before AI

**Statement:** Every number, score, classification, and verdict produced by the system is computed by the Scoring Engine using deterministic logic before the AI Interpretation Layer is invoked. The AI receives a completed, scored, classified analysis. The AI's job is to explain what the engine found — not to find it.

**Why it exists:** AI systems produce different outputs on identical inputs depending on model version, temperature, and prompt construction. A scoring engine produces identical outputs on identical inputs every time. The parts of the system that determine what a market looks like must be deterministic. Only the prose that explains that determination may be probabilistic.

**What problem it prevents:** Score drift, inconsistent verdicts, and the inability to audit what drove a particular conclusion. If the AI both scores and explains, you cannot separate a legitimate change in the market (new data) from a model behavior change (different AI output). The engine-first architecture makes these separable.

**Acceptable implementations:**
- Signal scores computed by the Scoring Engine from raw provider data, before any AI call is made
- Primary risk classified by the Scoring Engine from signal thresholds, passed to the AI as a typed enum
- SynthesisInput constructed by the Scoring Engine and handed to the AI as a complete, final object

**Violations:**
- "Ask the AI to assess whether this market has strong demand" — demand is scored by the engine
- Allowing the AI to adjust a signal score based on "context" it perceives in the consumer data
- Using AI sentiment analysis to compute the Consumer Pain signal instead of the VoC normalization pipeline
- Any architecture where the AI sees raw provider data and decides how to weight it

**How future features must preserve it:**
Every new signal added to the system must be scored deterministically before it reaches the AI. If a signal cannot be scored deterministically (e.g., because no threshold can be defined), it must not be added as a scoring signal. It may be added as contextual prose in the AI's input, clearly labeled as unscored context.

---

### Law 7: AI Interprets; It Never Decides

**Statement:** The AI Interpretation Layer receives a completed analysis and produces prose that explains it. The AI does not choose the verdict, classify the risk, select the signals, or decide what evidence to surface. Every decision has already been made deterministically before the AI is invoked.

**Why it exists:** Decision-making requires auditability. Auditability requires that the same input always produces the same decision. AI reasoning is not auditable in this sense — the same prompt may produce different outputs under different conditions. Explanation does not require auditability in the same way; readers can evaluate the quality of an explanation independent of the decision.

**What problem it prevents:** Situations where the AI "decides" that a market is strong because the consumer reviews it read seemed enthusiastic — independent of what the actual signal scores show. Or where the AI "decides" to downplay a risk because it seems minor in context. These are decision-making functions that belong to the engine.

**Acceptable implementations:**
- AI writes the causal paragraph that explains why the Scoring Engine's signals produced this verdict
- AI writes the risk sentence that explains the specific impact of the deterministically classified primary risk
- AI writes the product thesis based on consumer clusters and competitor data provided in SynthesisInput

**Violations:**
- "Given the context of the consumer complaints, the AI has determined this is a HIGH risk market" — AI determining risk level
- Any prompt that asks the AI to "assess" the market — assessment is the engine's job
- Allowing the AI to write a verdict summary that contradicts the engine's verdict because the AI "sees a different picture"
- Using the AI to select which three signals to show on the first screen — signal selection is deterministic

**How future features must preserve it:**
Every future AI call must have a clear specification of what decision has already been made by the engine and what explanation the AI is being asked to produce. If a future feature cannot articulate what the deterministic component is before writing the AI prompt, the feature is not ready to implement.

---

### Law 8: Structured Contracts Between Components

**Statement:** Every boundary between system components is defined by an explicit, versioned, typed contract. No component may access data it is not explicitly given through its contract. Contracts are enforced at runtime, not just at compile time.

**Why it exists:** Without typed contracts, components silently expand their access to data they should not see. The AI begins using fields in the raw analysis object that were never intended for AI consumption. The UI begins computing logic that should live in the scoring engine. These violations accumulate until the system cannot be maintained or audited.

**What problem it prevents:** Silent coupling — where two components share access to the same data object and one component begins relying on implementation details of the other. When the first component changes its implementation, the second component breaks in ways that are not obvious until production.

**Acceptable implementations:**
- `SynthesisInput` as the explicit, typed contract between the Scoring Engine and the AI Interpretation Layer
- `ExpandableCard` as the explicit contract between the Evidence Layer and the UI
- The AI Interpretation Layer module imports no provider modules — it receives only SynthesisInput
- Runtime validation (zod or equivalent) of SynthesisInput before every AI call

**Violations:**
- Passing the raw `AnalysisResult` object to the AI prompt instead of the scoped SynthesisInput
- Importing a provider module from within the AI Interpretation Layer "just to access one field"
- Adding a field to SynthesisInput without documenting it in the contract and assessing its AI access implications
- Bypassing runtime validation "because TypeScript already checks it" — TypeScript checks are compile-time, not runtime

**How future features must preserve it:**
Every new feature that adds data to an AI prompt must define a new or extended contract type. Every new signal must be explicitly added to SynthesisInput (not accessed by reference to a parent object). Contract changes are reviewed before implementation.

---

### Law 9: Every Deterministic Calculation Has a Single Source of Truth

**Statement:** Each score, threshold, weight, and classification rule exists in exactly one place in the codebase. No value is duplicated. No threshold appears in two files. Scoring Engine version is explicit and immutable for any given analysis.

**Why it exists:** When a threshold exists in two places, they inevitably diverge. The UI starts using one value for display while the engine uses another for scoring. A bug is introduced in one copy and not the other. Debugging requires finding which copy is authoritative.

**What problem it prevents:** Silent threshold drift. An engineer changes the THIN_SAMPLE_THRESHOLD in the scoring file but not in the UI display file. Analyses now say "limited data" at different thresholds depending on which code path runs. A founder gets different confidence indicators on a rerun of the same analysis.

**Acceptable implementations:**
- `THIN_SAMPLE_THRESHOLD = 50` defined once in the scoring constants file, imported wherever needed
- Risk thresholds defined in the Risk Taxonomy module, imported by both the classification logic and the evidence display logic
- `SCORING_ENGINE_VERSION` as an explicit constant that is stored with every analysis result and used to render a "scored with engine version X" label in the full evidence view (when built)

**Violations:**
- A risk threshold defined in `scoring.ts` and redefined (possibly differently) in a UI component file
- Confidence tier boundaries defined differently in the scoring logic vs. the confidence badge rendering logic
- Copy-pasting weight values into a chart component instead of importing them from the weights module
- Hardcoding "50" in a UI check that should reference THIN_SAMPLE_THRESHOLD

**How future features must preserve it:**
Before adding any numeric threshold or classification rule to a new feature, first check whether that value is already defined as a constant. If it is, import it. If it is not, define it in the constants file and import it everywhere. No magic numbers in feature code.

---

### Law 10: Long-Term Maintainability Over Short-Term Optimization

**Statement:** When a short-term optimization conflicts with the architecture's long-term integrity, the architecture wins. Technical debt incurred for speed is always made explicit and has a defined plan for repayment before it is introduced.

**Why it exists:** Shortcut architectural decisions made under time pressure compound. A SynthesisInput that "for now" exposes the full analysis object because scoping it properly takes too long becomes a permanent dependency that blocks future refactoring. In a trust-critical system, accumulated shortcuts eventually produce a system that cannot be reliably maintained — and unmaintainable systems produce unreliable outputs.

**What problem it prevents:** The gradual erosion of architectural principles through a series of individually justified exceptions. Each exception seems reasonable. The cumulative effect is a system that violates its own design.

**Acceptable implementations:**
- Documenting a known shortcut explicitly in a TECH_DEBT.md entry with the reason, the risk, and the repayment plan
- Choosing a slower but architecturally correct approach when the shortcut would violate a Law
- Deferring a feature entirely rather than implementing it in a way that violates the architecture

**Violations:**
- "We'll fix the contract boundary later — for now, pass the full object"
- "The validation pipeline slows down generation — let's skip it in development and add it before prod" (it never gets added)
- Adding a workaround in the AI prompt to compensate for a scoring engine limitation instead of fixing the engine
- Inlining a score computation in a UI component "just this once"

**How future features must preserve it:**
Every PR that introduces a known shortcut must include a TECH_DEBT entry as a required part of the PR. PRs without documented debt entries for their shortcuts are not merged. The tech debt list is reviewed at the start of every development sprint.

---

## Part III — Principles of Evidence

*What the system can claim, how claims must be grounded, and what constitutes an acceptable evidence chain.*

---

### Law 11: Every Sentence Must Be Traceable to Evidence

**Statement:** Every sentence produced by the AI Interpretation Layer must be traceable to a specific field in SynthesisInput. Traceability means: given the sentence, a reader can identify the exact input field(s) that justify the claim. If a sentence cannot be traced, it is invalid and must not be displayed.

**Why it exists:** Without traceability, the AI layer is a text generator operating on market vibes rather than market evidence. Traceability is what separates intelligence from content generation. It is also the technical foundation of the platform's auditability promise — if founders can see both the claim and its evidence source, they can evaluate the platform's reasoning.

**What problem it prevents:** Plausible-but-grounded failure. This is the most dangerous hallucination mode: the AI produces a sentence that sounds specific and authoritative ("customers frequently struggle with the absorption profile of competing products") but the phrasing was synthesized from context rather than directly supported by a specific cluster label and frequency count in the data. The sentence is plausible. It may even be directionally correct. But it is not traceable, and therefore not trustworthy.

**Acceptable implementations:**
- "67% of reviewed customers cite absorption concerns as the primary complaint" — traceable to `consumer_clusters[0].label = 'absorption'` and `consumer_clusters[0].frequency_pct = 67`
- "The category has 14 established competitors with an average of 3,200 reviews" — traceable to `competitor_context.meaningful_competitor_count = 14` and `competitor_context.avg_review_count = 3200`
- "Monthly search volume of 45,200 indicates sustained consumer interest" — traceable to `keyword_summary.total_monthly_volume = 45200`

**Violations:**
- "Consumers in this category frequently look for better absorption" — 'frequently' is a characterization not derived from a specific frequency count
- "The competitive landscape is dominated by a few large players" — no specific data cited; concentration ratio not mentioned
- "Manufacturing costs in this category tend to be favorable" — 'tend to be' implies a pattern; the platform has data for one analysis, not a trend

**How future features must preserve it:**
Every new AI prompt type added to the system must include a traceability specification: for each type of claim the prompt is expected to produce, which SynthesisInput field(s) must be cited. The validation pipeline must include a check for that citation.

---

### Law 12: AI Never Invents Facts, Risks, or Recommendations

**Statement:** The AI Interpretation Layer may not produce a fact, risk type, or recommendation that is not derivable from the SynthesisInput it received. Inventing means: generating a specific claim (fact) or concern (risk) or action (recommendation) that has no basis in the structured input data.

**Why it exists:** Invented facts are the most trust-damaging failure mode in a market intelligence platform. A founder acts on an invented regulatory risk, spends weeks on legal research, and discovers the platform fabricated it. That founder never returns. More importantly, they tell others.

**What problem it prevents:** Hallucination — specifically, the pattern where the AI produces a confident, specific-sounding claim that is not in the input data but is plausible given the topic area. Examples: inventing a regulatory trend, fabricating a consumer complaint not present in the clusters, citing a specific competitor's weakness that is not in the competitor data.

**Acceptable implementations:**
- AI writes a risk sentence for the deterministically classified risk type, using only evidence fields provided in `primary_risk.evidence`
- AI writes consumer pain characterization using only cluster labels and frequencies from `consumer_clusters`
- AI writes competitor context using only brands, prices, and review counts from `competitor_context.top_competitors`

**Violations:**
- AI mentions FDA regulatory pressure when no regulatory signal exists in SynthesisInput
- AI writes "consumers report issues with bioavailability" when the cluster label is 'effectiveness' not 'bioavailability' — this is a plausible but invented specificity
- AI recommends targeting a specific customer segment (e.g., "athletic women aged 25–40") without demographic data in the input
- AI produces a risk type not in the Risk Taxonomy — a risk the engine did not classify but the AI "identified" from context

**How future features must preserve it:**
The validation pipeline's hallucination detection must be updated whenever new risk types are added to the taxonomy or new claim types are enabled in AI prompts. New claim types are never enabled in AI prompts without corresponding additions to the validation checks.

---

### Law 13: Confidence Is Deterministic, Never Subjective

**Statement:** Signal confidence tiers (CONFIRMED / INDICATED / LIMITED) are assigned by explicit, numeric rules applied to provider output quality. No human judgment, no AI assessment, no interpolation. The same provider output always produces the same confidence tier.

**Why it exists:** If confidence is subjective, it becomes optimistic. Products naturally drift toward presenting their outputs in the best possible light. "Well, we only have 8 reviews but the pattern is fairly clear, so INDICATED seems appropriate" becomes the norm. After 50 such decisions, the confidence system no longer conveys meaningful information.

**What problem it prevents:** Confidence inflation. When confidence levels are soft, they eventually all become CONFIRMED because showing LIMITED to users feels like showing failure. Deterministic rules prevent this drift by removing the ability to apply judgment.

**Acceptable implementations:**
- `CONFIRMED` if `withReviews.length >= 10` (competition signal) — no exceptions
- `CONFIRMED` if `corpus_size >= 50` (consumer pain signal) — no exceptions
- `CONFIRMED` if `monthly_search_volume >= 10000 AND keepa_monthly_units >= 5000` (demand signal) — no exceptions

**Violations:**
- "The data quality seems good even though we're below the threshold — let's call it INDICATED"
- Upgrading a LIMITED signal to INDICATED because the analysis otherwise looks weak
- Allowing the AI to assess confidence from context ("the reviews seem consistent, so I'd say HIGH confidence")
- Creating a special case where a specific provider's data quality justifies bypassing the tier thresholds

**How future features must preserve it:**
Every new signal added to the system must have its confidence tier rules defined before any scoring code is written. The rules are numeric. If a numeric rule cannot be defined (because the signal's quality is inherently qualitative), the signal cannot have a CONFIRMED tier — it is capped at INDICATED.

---

### Law 14: Failure Is Transparent, Never Hidden

**Statement:** When data cannot be collected, a signal cannot be scored, or confidence is insufficient, this is surfaced explicitly — on the first screen if it materially affects the verdict, in the evidence view otherwise. Missing data is never silently averaged away.

**Why it exists:** Silent failure is worse than acknowledged failure. When a signal silently fails and its weight is redistributed to the remaining signals, the verdict changes in a way the founder cannot perceive. They see a verdict they believe is based on full data, when it is based on partial data. This is a form of dishonesty.

**What problem it prevents:** Verdicts that appear confident because their weakest components were silently excluded. A BUILD verdict produced from 4 signals (with manufacturing and consumer pain excluded) is materially different from a BUILD verdict produced from all 7 signals. The founder deserves to know which they received.

**Acceptable implementations:**
- `excluded_signals` displayed in the confidence qualifier when signals material to the verdict were excluded
- "Consumer pain assessment was not possible with available data" on the first screen, not in the evidence view
- Signal cards only shown for signals that were actually scored — no placeholder cards for excluded signals

**Violations:**
- Silently excluding manufacturing from scoring without any first-screen indication
- Showing a full-confidence verdict that was actually produced from 4 signals with weights redistributed, without communicating the redistribution
- A confidence qualifier that says "based on limited data" when the limitation was a specific, nameable signal failure
- Showing a demand signal card with INDICATED confidence when the demand provider returned no DataForSEO data and only Keepa data — the card should specify which source

**How future features must preserve it:**
Every new signal added to the system must have a defined failure mode and a defined user-facing representation of that failure. No signal is added to the system without specifying what the UI shows when that signal fails.

---

## Part IV — Principles of User Trust

*How the product relates to the people who use it, and what it owes them.*

---

### Law 15: Validation Before Display

**Statement:** No AI-generated text reaches the user without passing through the validation pipeline. Validation is not optional, not skippable in development, not bypassable in edge cases. The pipeline is part of the product — not a wrapper around it.

**Why it exists:** A single hallucinated sentence displayed to a founder — one invented regulatory risk, one fabricated competitor insight, one made-up percentage — can cause a real capital decision to be made on false information. The validation pipeline exists because AI outputs cannot be trusted without verification, regardless of how carefully the prompts are written.

**What problem it prevents:** The confidence gap — where a system is known to sometimes hallucinate, but validation is treated as optional because "it usually works." In a trust-critical system, "usually works" is not acceptable. The pipeline converts a probabilistic guarantee into a structural one.

**Acceptable implementations:**
- Validation pipeline runs on every AI output, every time, without exception
- Fallback to deterministic template on validation failure — the user still gets an output, just not an AI-generated one
- `is_fallback: true` recorded in every stored analysis where the template was used
- Development environments run the full validation pipeline — not a stripped version

**Violations:**
- Skipping the hallucination pattern scan in development because "it slows down testing"
- Adding an environment variable to bypass validation "for speed"
- Treating validation as a post-launch feature ("we'll add it once we see real outputs")
- Considering a validation failure as a system error rather than a handled state with a defined fallback

**How future features must preserve it:**
Every new AI output type added to the system (new prose, new section, new explanation) must have its own validation rules defined before the AI prompt is written. The validation pipeline is extended, not bypassed, for new features.

---

### Law 16: Explainability Over Simplicity

**Statement:** When a choice must be made between a simpler presentation that obscures reasoning and a more complex presentation that exposes it, the platform chooses to expose reasoning. Simplicity that removes the user's ability to understand the basis for a conclusion is not a UX improvement — it is an epistemic harm.

**Why it exists:** Founders using this platform are making real financial commitments. They are not consuming content — they are gathering evidence for a decision. Evidence-gathering requires understanding how evidence was collected, what it shows, and what its limits are. A platform that says "trust us, the score is 78" without explaining the 78 is asking for blind trust. Blind trust is fragile — it collapses the first time the platform is wrong.

**What problem it prevents:** The optimization trap — where each individual UX simplification seems like an improvement (fewer words, less data, cleaner interface), but the cumulative effect is a platform that looks authoritative but is not auditable. Users stop being able to evaluate the platform's reasoning, which means they stop being able to correct for its errors.

**Acceptable implementations:**
- Progressive disclosure: simple on the first screen, full evidence accessible at Layer 2
- Every claim on the first screen is expandable to reveal its evidence — even if most users never expand it
- The causal paragraph references specific numbers so founders can evaluate whether the characterization is fair

**Violations:**
- Removing signal cards from the first screen because "it feels cleaner" — this removes the user's ability to see what drove the verdict
- Replacing the confidence qualifier with a generic disclaimer ("results may vary") to avoid surfacing the specific limitation
- Hiding evidence expansion behind a paywall to drive account creation
- Summarizing the consumer clusters into a single adjective ("frustrated customers") without allowing founders to see the specific complaints

**How future features must preserve it:**
Before any simplification to the first screen or evidence system is shipped, the product team must verify that: (a) the removed information is accessible at a lower disclosure layer, and (b) a founder making a $20,000 investment decision would not need the removed information to evaluate the platform's reasoning.

---

### Law 17: Progressive Disclosure Instead of Information Overload

**Statement:** The first screen contains exactly the information needed to understand the verdict and its primary evidence. Additional information is accessible at Layer 2 (inline expansion) and Layer 3 (full evidence view). Information not relevant to the initial understanding decision is not shown unless requested.

**Why it exists:** Cognitive overload destroys decision quality. A founder presented with 40 data points makes worse decisions than a founder presented with 5 data points and the ability to access 40 more. The platform's role is to organize evidence, not to dump it. Organization means hierarchy — what the founder needs first, what they need to verify it, what they need for deep audit.

**What problem it prevents:** The data dashboard failure mode — where a product has excellent data and excellent coverage but founders leave confused because they cannot identify what matters. Data without hierarchy is noise with a good color scheme.

**Acceptable implementations:**
- First screen: exactly 6 elements (verdict, causal paragraph, 3 signal cards, primary risk, product thesis headline)
- Layer 2: inline expansion of each element revealing its specific evidence
- "Conditions for Success / Failure" accessible via explicit link, not shown by default
- Full evidence view (Layer 3, future): all provider outputs, structured by signal category

**Violations:**
- Adding a seventh element to the first screen because "it's important" — importance is not sufficient justification for first-screen placement
- Showing all 10 risk types on the first screen instead of only the primary risk
- Displaying the full consumer cluster list on the first screen instead of referencing it in the causal paragraph
- A "see all data" dump that shows raw API responses without structure

**How future features must preserve it:**
Every new data point proposed for the first screen must displace an existing element or be placed at Layer 2. The first screen is not a canvas that grows with the product — it is a fixed hierarchy that is evaluated and defended on every iteration.

---

### Law 18: User Understanding Is More Important Than Visual Complexity

**Statement:** The visual design of the result experience exists to serve the user's understanding of the market evidence — not to convey technical sophistication, product depth, or visual richness. Every design element earns its place by making the evidence more understandable, not by making the product look more comprehensive.

**Why it exists:** There is a consistent failure mode in intelligence products where visual complexity (scores, radar charts, percentile bars, color-coded matrices) creates the impression of rigorous analysis while actually obscuring the simplicity of the underlying reasoning. Founders who cannot understand what they are looking at cannot evaluate whether it is trustworthy.

**What problem it prevents:** Visual credibility substituting for analytical credibility. The platform is trustworthy because its reasoning is sound and traceable, not because it has attractive visualizations. Any design that creates the appearance of rigor without the underlying reality is a liability.

**Acceptable implementations:**
- Three signal cards with a headline phrase and one supporting stat — clear, readable, specific
- Confidence badges in three discrete tiers — not a continuous scale that implies false precision
- The verdict as a text label, not a gauge or speedometer

**Violations:**
- A radar chart showing all 7 signals plotted against each other — the relative positions imply comparisons the engine's weighting does not support
- A composite "Opportunity Score" displayed as a large number without any explanation of what it means — raw number with the appearance of precision
- Color gradients that suggest continuous confidence rather than discrete tiers
- An animated score-reveal sequence that creates excitement around the verdict — the verdict is not good news or bad news, it is market evidence

**How future features must preserve it:**
Every new visualization proposed for the product must be evaluated against this question: "Does this make the underlying evidence more understandable, or does it make the product look more comprehensive?" These are different goals. The first is the law.

---

### Law 19: Every New Feature Must Strengthen Trust, Never Weaken It

**Statement:** Features are added to the product only if they increase the quality of information available to founders, improve the traceability of conclusions, or reduce the hallucination risk. Features that compromise any of these in exchange for engagement, visual appeal, or feature count are not added.

**Why it exists:** Trust is asymmetric. It is built slowly through consistent, accurate, auditable outputs. It is destroyed quickly by a single failure that the user cannot understand or was not warned about. Every feature introduces new code paths, new AI prompts, new data sources, and new failure modes. Each must justify its trust risk.

**What problem it prevents:** Feature accumulation that gradually degrades the product's core promise. A social sharing feature that encourages founders to share their BUILD results (which creates pressure to produce more BUILD results). A "confidence boost" that rounds up confidence tiers when a premium tier is purchased. A comparison feature that presents two analyses side-by-side in a way that implies a more rigorous evaluation than either analysis supports individually.

**Acceptable implementations:**
- A feature that adds a new confirmed signal to the analysis (more data → better evidence)
- A feature that adds a new risk type to the taxonomy (more specific risk identification → better auditability)
- A full evidence view (Layer 3) that makes raw provider data accessible for deep audit

**Violations:**
- A "confidence boost" tier that upgrades confidence badges for premium subscribers without changing the underlying data
- A social sharing feature designed to maximize share rate rather than informational accuracy
- A "market score" leaderboard that ranks products by opportunity score — creates gamification pressure on the scoring engine
- A "follow this market" feature that sends alerts ("this market is now a BUILD!") without explaining what changed and why

**How future features must preserve it:**
Every feature proposal must answer: "Does this strengthen trust or weaken it?" If the answer requires qualification ("it strengthens trust if used correctly, but..."), the answer is "weakens it" and the feature requires redesign before implementation.

---

## Part V — Principles of Integrity

*How the system evolves, how it handles disagreement, and how its principles are preserved over time.*

---

### Law 20: The Scoring Engine Is Versioned and Immutable for Completed Analyses

**Statement:** Every analysis result is stored with the exact version of the Scoring Engine that produced it. An analysis produced by engine version 2.4.0 is permanently associated with 2.4.0. Rerunning an analysis with a different engine version produces a new analysis — it does not overwrite the old one.

**Why it exists:** When the scoring engine changes, previously scored analyses change meaning. A product that was scored as VALIDATION_REQUIRED under engine 2.3.0 might score as ENTRY_SUPPORTED under engine 2.4.0 due to a weight change. If analyses are silently updated to the new score without disclosure, founders who previously received one verdict now see a different one with no explanation. This destroys trust.

**What problem it prevents:** Silent score revision. The most damaging version: a founder receives ENTRY_NOT_SUPPORTED, decides not to pursue the product, and returns a month later to see the same analysis now shows VALIDATION_REQUIRED — because the engine was updated and the old analysis was overwritten. They cannot know whether the market changed or the scoring changed.

**Acceptable implementations:**
- Every stored AnalysisResult includes `scoring_engine_version: '2.4.0'`
- Re-runs with a new engine version create a new AnalysisResult record, linked to the old one
- The full evidence view (Layer 3, future) displays the engine version that produced the analysis

**Violations:**
- Updating a stored analysis in-place when the scoring engine is updated
- Displaying an old analysis with new engine scores without labeling it as a re-analysis
- Storing only the latest analysis for each query, overwriting the historical record

**How future features must preserve it:**
The engine version constant (`SCORING_ENGINE_VERSION`) must be incremented according to semantic versioning on every change to weights, thresholds, or scoring logic. The version is incremented before the change ships — not after.

---

### Law 21: AI May Only Reason Within the Boundaries of the Structured Input

**Statement:** The scope of what the AI is allowed to claim is fully determined by the fields present in SynthesisInput. An absent field is an absent permission. The AI's reasoning does not extend beyond the data it was explicitly given.

**Why it exists:** Language models have extensive general knowledge about markets, products, supplements, consumer behavior, and regulatory environments. This general knowledge is not evidence about this specific market collected by this system. The AI must be constrained to the system's collected evidence — not its training data's priors about the topic area.

**What problem it prevents:** The AI substituting its general knowledge for the system's specific evidence. This produces plausible but ungrounded outputs — sentences that sound like market intelligence but are actually the model's prior beliefs about a category. Example: asking the AI to write about a supplement market and getting back accurate general-knowledge claims about the supplement industry that have nothing to do with the specific signals collected for this analysis.

**Acceptable implementations:**
- System prompt includes: "You may only make claims supported by the fields present in the structured data below. If a field is null or absent, you may not make any claim about that domain."
- Validation pipeline checks that every factual claim references a field from SynthesisInput
- Per-call input scoping (Call B receives only primary_risk and competitor_context, not the full SynthesisInput) to prevent the AI from being tempted by fields irrelevant to the specific output

**Violations:**
- AI writing about "the supplement industry's regulatory environment" when there is no regulatory signal in SynthesisInput
- AI referencing "typical consumer behavior in this category" without citing consumer_clusters
- AI stating "brands in this space typically compete on price" when price competition is not in the competitor_context
- Any prompt that says "use your knowledge of this industry to contextualize the data" — this explicitly invites general knowledge use

**How future features must preserve it:**
Every new AI prompt must include an explicit "reasoning scope" instruction that names the SynthesisInput fields the AI may reason about for that specific call. Fields not named are out of scope. This is not a soft guideline — it is part of every prompt template.

---

## Architectural Review Checklist

This checklist is applied to every pull request that modifies the AI Interpretation Layer, the Scoring Engine, the Evidence Layer, the SynthesisInput contract, or the UI result experience. A "No" answer on any item is a blocker unless explicitly overridden by the Chief Architect with a documented rationale.

### I. Evidence and Truth

```
□ Does every AI-generated sentence in this PR remain traceable to a specific 
  field in SynthesisInput?

□ Does this PR introduce any AI-generated fact, risk type, or recommendation 
  that is not derivable from the structured input data?

□ Does this PR include any revenue projection, market size estimate, ROI 
  calculation, or probability of success, in any form, including charts, 
  tooltips, or hover states?

□ Does this PR add or change a confidence tier rule? If so, is the rule 
  numeric and deterministic — free of all human judgment?

□ Does this PR introduce any language that implies a personal outcome for 
  the founder ("you will," "you are likely to," "your business")?
```

### II. Component Integrity

```
□ Does this PR respect the SynthesisInput contract? If the contract is 
  modified, is the change documented, versioned, and reviewed?

□ Does this PR allow the AI Interpretation Layer to access any data not 
  in SynthesisInput? (Check imports, prompt construction, and any data 
  passed alongside SynthesisInput.)

□ Does this PR move any scoring, classification, or verdict logic from the 
  Scoring Engine into the AI layer or the UI?

□ Does this PR duplicate any threshold, weight, or constant that is already 
  defined in a single source-of-truth location?

□ Does this PR add a new signal without defining its confidence tier rules, 
  failure behavior, and UI representation?
```

### III. Validation and Safety

```
□ Does this PR introduce a new AI output type? If so, does it have a 
  corresponding validation rule set in the pipeline?

□ Does this PR modify the validation pipeline in a way that reduces the 
  coverage of forbidden pattern detection?

□ Does this PR add any code path that allows AI text to reach the user 
  without passing through the full validation pipeline?

□ Does this PR add a new deterministic fallback template for every new AI 
  output type it introduces?

□ Does this PR log the full validation trace (steps passed, failed, retries, 
  fallbacks triggered) for every AI output it produces?
```

### IV. User Trust and Experience

```
□ Does this PR add a new element to the first screen? If so, which existing 
  element has it displaced, or why is an exception justified?

□ Does this PR reduce auditability — making it harder for a founder to trace 
  a claim back to its evidence?

□ Does this PR add any visual element that implies more precision than the 
  underlying data supports (continuous scales, composite scores, radar charts)?

□ Does this PR hide a failure state (missing data, low confidence, excluded 
  signal) that should be visible to the user?

□ Does this PR strengthen user trust, or could any reasonable user 
  interpretation of this feature weaken it?
```

### V. Long-Term Architecture

```
□ Does this PR introduce technical debt? If so, is there a corresponding 
  entry in TECH_DEBT.md with a repayment plan?

□ Does this PR respect the engine versioning law? If the Scoring Engine 
  logic changes, has SCORING_ENGINE_VERSION been incremented?

□ Does this PR blur the boundary between market assessment and founder 
  assessment?

□ Does this PR introduce any feature from the Non-Goals list (Section 13 
  of the Technical Specification) without a documented Chief Architect 
  decision to move that item out of Non-Goals?

□ Could this PR's approach scale to 10× the current signal count and 
  10× the current market scope without architectural changes?
```

---

## Founding Assessment

*If this Constitution is followed exactly, is there anything about the current architecture that will fundamentally prevent this product from becoming an industry-leading Product Intelligence platform?*

The answer is: no. There is no fundamental architectural flaw that would prevent this product from becoming the standard for market intelligence in the consumer goods space, assuming this Constitution is genuinely followed.

But "no" requires being honest about the three real tensions in the architecture. None of them are fatal. All of them require active management.

---

**Tension 1: The constraint-expressiveness tradeoff in AI interpretation**

The stricter the evidence-grounding requirements, the more constrained the AI output. The more constrained the AI output, the more the causal paragraph and product thesis risk reading as sophisticated template-filling rather than genuine insight. This is the most important tension in the system, and it does not resolve itself over time without deliberate effort.

The resolution path is not to loosen the grounding requirements — that trades trust for expressiveness, which is the wrong trade. The resolution path is to make SynthesisInput progressively richer. Richer structured data means the AI can make more specific claims within the constraints. A consumer cluster entry that includes `representative_quote: "I've tried four different magnesium supplements and none of them absorb well"` allows the AI to write a more specific sentence than a cluster entry that only includes `label: 'absorption'` and `frequency_pct: 67`. The law stays. The data gets richer. The output improves.

This requires treating SynthesisInput enrichment as a continuous product priority, not a one-time architecture decision.

**Tension 2: The single-analysis limitation**

The current architecture evaluates one product keyword in one analysis session. Industry-leading intelligence platforms identify opportunities across a space — they surface what a founder hasn't thought to ask about. The current product answers "should I enter this market?" It does not answer "what market should I enter?" and it does not answer "how has this market changed since I last looked?"

These are real gaps. They are also correctly deferred to future extensions. The architecture does not prevent them — it just doesn't implement them. The risk is that this product becomes a validation tool (founders come with an idea, check it, leave) rather than a discovery platform (founders come with a space, discover what's promising, enter it). Validation tools have a ceiling. Discovery platforms grow.

The path forward is the cross-analysis and historical tracking features listed in Section 14 of the Technical Specification. These are not small features — they require a fundamentally different data model (stored analyses, versioned comparisons, change detection). But the architecture as specified supports their eventual addition without requiring a redesign.

**Tension 3: The market-assessment scope versus founder need**

This product answers half the question a founder actually has. "Is this market attractive?" is answerable by the platform. "Am I the right person to enter this market?" is not. Most investment decisions are determined by both halves. A product that delivers only the market half is genuinely useful, but it is not a complete decision system.

This is a deliberate design choice, correctly made. The founder assessment half requires data the platform cannot collect without becoming a different kind of product (one that collects founder profiles, evaluates founder experience, assesses founder networks). That product has different risks (privacy, liability, bias) and different value propositions.

The discipline required here is maintaining the scope constraint even as the product succeeds. The temptation, as the platform grows, will be to add founder-facing scoring ("based on your reported experience, this market is a better fit for you than that one"). If that feature is added carelessly — using market data to proxy for founder assessment — it will undermine both the market intelligence (which was designed to be objective) and the founder assessment (which is not something the market data can support). If it is added carefully, with strict separation between market signals and founder signals, it can be done without violating the Constitution. The law is in Section 13 (Law 5): the two assessments are displayed separately and never averaged.

---

**The one thing this architecture demands that most teams fail at:**

Following this Constitution requires saying no to things that seem reasonable. A founder requests a "success probability" feature. It's a feature that many competitors offer. It would make the product feel more complete. Every product manager instinct says to build it.

The Constitution says: no.

Enforcing these laws under that kind of pressure is not an architectural problem. It is a leadership problem. The architecture is sound. The challenge is maintaining the discipline to follow it when convenience, competitive pressure, or user requests push in a different direction.

If this Constitution is genuinely followed — not as aspiration but as law — this product will build a form of trust that most intelligence tools never achieve: the trust that comes from a platform that consistently tells founders uncomfortable truths, explains exactly why it reached its conclusions, and never confuses what it knows with what it doesn't know.

That trust is not easily replicated. It is an architectural moat.

---

*This document takes effect from the date of its creation. Amendments require written justification, Chief Architect approval, and version increment. The amendment history is maintained in git. No law may be suspended, bypassed, or treated as a guideline without formal amendment.*
