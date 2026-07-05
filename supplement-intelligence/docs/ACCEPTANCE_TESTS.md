# Product Intelligence v1.0 — Acceptance Test Specification

**Document type:** Acceptance test specification and Definition of Done  
**Version:** 1.0.0  
**Date:** 2026-07-05  
**Authority:** Derived from CONSTITUTION.md and TECHNICAL_SPEC_V1.md  
**Status:** Active — all tests must pass before v1.0 beta deployment

This document turns the Constitution's laws and the Technical Specification's rules into enforceable pass/fail tests. Every test references the specific Constitution law or Spec section it enforces. A test that fails is not a quality issue — it is a Constitution violation.

---

## How to Use This Document

**Before writing any implementation code:** Read this document. The tests define what "done" means. Building toward the tests is more efficient than building toward a vague sense of completion.

**During implementation:** Run automated tests continuously. Log manual review tests as a separate queue.

**Before any beta deployment:** Every Must-Pass test passes. Every manual review test has been reviewed by someone who did not write the code being tested.

**When a test fails:** Do not work around the test. Fix the code until the test passes. If a test is genuinely wrong (the spec or constitution has an error), update the spec and constitution before updating the test.

---

## Test Format

Each test includes:
- **ID:** Unique reference (e.g., AT-CONTRACT-001)
- **Name:** Descriptive test name
- **Purpose:** What behavior is being verified
- **Law / Spec:** The Constitution law or Spec section being enforced
- **Type:** `Automated` | `Integration` | `Manual`
- **Priority:** `Must-Pass` | `Standard` | `Edge Case`
- **Input scenario:** Specific conditions under which the test runs
- **Expected output:** What the system must produce
- **Pass condition:** The exact criterion for passing
- **Fail condition:** What constitutes failure (eliminates ambiguity)
- **Trust risk if untested:** The specific harm that escapes if this test doesn't exist

---

## Critical Path — Must-Pass Tests

These tests must pass before any deployment to any environment with real user traffic. A single failure in this list is a deployment blocker.

| ID | Test Name | Type |
|----|-----------|------|
| AT-CONTRACT-001 | SynthesisInput schema validation fires on invalid input | Automated |
| AT-CONTRACT-002 | Prohibited fields absent from SynthesisInput | Automated |
| AT-ACCESS-001 | AI module imports no provider modules | Automated |
| AT-HALL-001 | Revenue pattern regex catches all variants | Automated |
| AT-HALL-002 | Validation pipeline runs on every AI output | Integration |
| AT-HALL-003 | Fallback template exists for all three output types | Automated |
| AT-REV-001 | Revenue language rejected before display | Integration |
| AT-VERDICT-001 | Score thresholds produce correct verdict labels | Automated |
| AT-VERDICT-002 | Verdict display text matches approved strings exactly | Automated |
| AT-CONF-001 | Identical inputs produce identical confidence tiers | Automated |
| AT-RISK-001 | Primary risk selection follows priority order | Automated |
| AT-RISK-002 | Risk sentence contains a numeric evidence reference | Integration |
| AT-VAL-001 | Validation pipeline blocks AI text on hallucination match | Integration |
| AT-VAL-002 | Fallback triggers after two validation failures | Integration |
| AT-VAL-003 | is_fallback flag recorded when fallback triggers | Integration |
| AT-MISS-001 | Missing demand data causes fatal error, not partial analysis | Integration |
| AT-UI-001 | First screen renders exactly six elements | Manual |
| AT-AUDIT-001 | Every first-screen signal card has a corresponding ExpandableCard | Automated |
| AT-AUDIT-002 | No first-screen claim lacks a Layer 2 evidence card | Manual |
| AT-E2E-001 | Full pipeline runs to completion on a known valid query | Integration |
| AT-E2E-002 | Full pipeline handles all-provider-failure gracefully | Integration |

---

## Section 1 — SynthesisInput Contract

**Spec reference:** Section 3 (AI Contract — SynthesisInput)  
**Constitution laws:** Law 6, Law 8, Law 21

---

#### AT-CONTRACT-001: SynthesisInput schema validation fires on invalid input

**Purpose:** Verify that runtime schema validation (zod or equivalent) rejects malformed SynthesisInput before any AI call is made.  
**Law / Spec:** Law 8 (Structured Contracts), Spec §3.1  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
SynthesisInput with verdict field missing (required field absent)
```

**Expected output:**
Validation throws with a specific error identifying the missing field. No AI call is made.

**Pass condition:** Validation error is thrown with field name before `fetchAIOutputs()` is called.

**Fail condition:** AI call proceeds with invalid input, or validation throws a generic error without field identification.

**Trust risk if untested:** Schema drift between the scoring engine and the AI layer goes undetected. The AI reasons about incomplete data and produces grounded-sounding but invalid output.

---

#### AT-CONTRACT-002: Prohibited fields are absent from SynthesisInput

**Purpose:** Verify that the fields explicitly prohibited from AI access do not exist on the SynthesisInput object constructed by the scoring engine.  
**Law / Spec:** Law 21 (AI reasoning scope), Spec §3.2  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Complete analysis result from the scoring engine, passed through SynthesisInput construction
```

**Expected output:**
The constructed SynthesisInput object contains none of the following:
- Raw review text (individual review content)
- Full keyword arrays
- Individual ASIN identifiers
- Provider names (DataForSEO, Axesso, junglee, Apify, Keepa)
- Score computation steps or weight values
- Cache metadata (TTLs, cache keys)
- Raw Keepa data arrays

**Pass condition:** `Object.keys(synthesisInput)` contains no prohibited field names. TypeScript type enforcement is confirmed via `tsc --noEmit`.

**Fail condition:** Any prohibited field name appears in the SynthesisInput object or in any object nested within it.

**Trust risk if untested:** The AI uses provider names, raw review text, or ASIN data to generate output that references information founders were never supposed to see, or that the AI layer has no legitimate basis to claim.

---

#### AT-CONTRACT-003: Per-call input scoping — Call B receives only risk-relevant fields

**Purpose:** Verify that the risk sentence AI call (Call B) receives only the subset of SynthesisInput relevant to risk explanation, not the full object.  
**Law / Spec:** Law 21, Spec §3.3  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Valid SynthesisInput with all fields populated
```

**Expected output:**
The input passed to Call B contains: `{ query, primary_risk, competitor_context.meaningful_competitor_count, thin_corpus }` and no other fields.

**Pass condition:** The prompt constructed for Call B, when inspected, contains only the scoped fields. Keyword data, consumer clusters, manufacturing context, and virality context are absent from the Call B prompt.

**Fail condition:** Full SynthesisInput is passed to Call B, allowing the AI to make risk claims based on data not in the risk evidence.

**Trust risk if untested:** Call B references a signal (e.g., seasonality) that is not in the primary risk evidence, producing a risk sentence that conflates multiple risk types.

---

#### AT-CONTRACT-004: SynthesisInput construction is idempotent

**Purpose:** Verify that running the scoring engine twice on identical provider outputs produces an identical SynthesisInput.  
**Law / Spec:** Law 6 (Deterministic Engine Before AI), Spec §2.1  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Identical provider output objects passed to SynthesisInput constructor twice
```

**Expected output:**
`JSON.stringify(synthesisInput1) === JSON.stringify(synthesisInput2)`

**Pass condition:** Both constructions are byte-identical.

**Fail condition:** Any field differs between runs (timestamps, ordering, rounding).

**Trust risk if untested:** Non-deterministic SynthesisInput construction makes the AI output non-reproducible, undermining auditability.

---

## Section 2 — AI Access Boundaries

**Spec reference:** Section 3.2 (What the AI Is Explicitly Prohibited From Accessing)  
**Constitution laws:** Law 7, Law 8, Law 21

---

#### AT-ACCESS-001: AI module imports no provider modules

**Purpose:** Verify at the module level that the AI Interpretation Layer has no direct imports from any data provider module.  
**Law / Spec:** Law 7 (AI Interprets; It Never Decides), Law 8, Spec §1.3  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Static analysis of import graph for lib/ai-interpretation/ (or equivalent module path)
```

**Expected output:**
No import from any of:
- `lib/review-collector/*`
- `lib/signal-engine/providers/*`
- `lib/manufacturing-engine/providers/*`
- `lib/keyword-engine/*`
- `lib/consumer-intelligence/*`
- `lib/provider-cache/*`

**Pass condition:** Import graph analysis returns zero provider imports in the AI Interpretation Layer module.

**Fail condition:** Any direct import from a provider module exists in the AI Interpretation Layer.

**Trust risk if untested:** A developer adds a convenience import "just to access one field" and the AI layer begins silently using raw provider data for reasoning — a violation that is invisible at runtime.

---

#### AT-ACCESS-002: Provider names are absent from all AI prompt templates

**Purpose:** Verify that the words "DataForSEO", "Apify", "Axesso", "Keepa", "junglee", and "axesso" do not appear in any AI prompt template.  
**Law / Spec:** Law 12 (AI Never Invents Facts), Spec §8.1 constraint 7  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Static scan of all prompt template strings in the AI Interpretation Layer module
```

**Expected output:**
Zero occurrences of any provider name in any prompt template.

**Pass condition:** `grep -ri "DataForSEO\|Apify\|Axesso\|Keepa\|junglee" lib/ai-interpretation/` returns no results.

**Fail condition:** Any provider name found in a prompt template.

**Trust risk if untested:** A prompt that says "DataForSEO shows demand of..." teaches the AI that provider names are acceptable in output, increasing the chance it references them in generated text.

---

## Section 3 — Hallucination Prevention

**Spec reference:** Section 8.3 (AI Writing Rules), Section 12 (Validation Pipeline)  
**Constitution laws:** Law 11, Law 12, Law 15

---

#### AT-HALL-001: Revenue pattern regex catches all common variants

**Purpose:** Verify that the hallucination detection regex catches all documented revenue pattern variants before they reach the user.  
**Law / Spec:** Law 2 (No Revenue Predictions), Spec §8.2, §12 Step 3  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Test the regex against each of the following strings:
1. "This is a $34M annual opportunity"
2. "Revenue potential: $240 million"
3. "If you capture 1% you would generate $1.2M"
4. "The market generates approximately $400k per month"
5. "Annual revenue of $12B for this category"
6. "Total market: $2.4B"
7. "$340 million opportunity"
```

**Expected output:**
All seven strings match the revenue detection regex: `/\$[\d,]+\.?\d*\s*(million|billion|M|B|k|thousand)?/i`

**Pass condition:** All seven match. Regex returns a truthy result for each.

**Fail condition:** Any string escapes detection.

**Trust risk if untested:** A revenue figure reaches a founder, who anchors on it for their investment decision. The platform is blamed when the projection is wrong — which it will always be, because it was fabricated.

---

#### AT-HALL-002: Validation pipeline executes on every AI output

**Purpose:** Verify that the validation pipeline is called on every AI output, with no code path that bypasses it.  
**Law / Spec:** Law 15 (Validation Before Display), Spec §12  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Intercept all three AI calls (causal paragraph, risk sentence, product thesis) 
in a full analysis run and verify that the validation function is called with each output.
```

**Expected output:**
Validation function is called exactly once per AI call, with the raw AI output as input, before the output is stored or returned.

**Pass condition:** Spy/mock confirms validation function called 3 times (once per call type) during a single analysis run.

**Fail condition:** Any AI call completes without the validation function being invoked.

**Trust risk if untested:** A code path exists (error handling, early return, new feature branch) that accidentally bypasses validation, allowing unchecked AI output to reach users.

---

#### AT-HALL-003: Fallback template exists for all three output types

**Purpose:** Verify that a deterministic fallback template is implemented and returns a valid, non-empty output for all three AI call types before any AI generation code is used.  
**Law / Spec:** Law 15, Spec §12 Step 5  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Call each fallback template function with a valid SynthesisInput
```

**Expected output:**
- `fallbackCausalParagraph(input)` returns a non-empty string ≤ 160 words
- `fallbackRiskSentence(input)` returns a non-empty string ≤ 35 words, ending with a period
- `fallbackProductThesis(input)` returns `{ headline: string, full_thesis: string }` with both fields non-empty

**Pass condition:** All three fallback functions return valid, length-conforming output without throwing.

**Fail condition:** Any fallback function throws, returns empty string, or returns output exceeding length limits.

**Trust risk if untested:** When AI validation fails (and it will), the system has no fallback. It either crashes, shows an error, or — worst case — shows the invalid AI output.

---

#### AT-HALL-004: Probability language pattern is detected and rejected

**Purpose:** Verify the validation pipeline catches probability of success language.  
**Law / Spec:** Law 3 (No Probability of Success), Spec §8.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Test the probability pattern regex against:
1. "This opportunity is likely to succeed"
2. "High chance of market capture"
3. "Will probably generate strong returns"
4. "Expected to become profitable within 18 months"
5. "Projected to outperform competitors"
```

**Expected output:**
All five strings match: `/\b(likely to succeed|high chance|will probably|expected to achieve|projected to|probability of success)\b/i`

**Pass condition:** All five match.

**Fail condition:** Any string escapes detection.

**Trust risk if untested:** Founders receive probability assessments they treat as evidence-based predictions of personal success.

---

#### AT-HALL-005: Year reference detection catches temporal hallucination

**Purpose:** Verify that specific year references in AI output are detected when the year is not present in SynthesisInput.analysis_date.  
**Law / Spec:** Law 12, Spec §8.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
SynthesisInput with analysis_date = "2026-07-05"
AI output containing: "demand has grown significantly since 2024"
```

**Expected output:**
Year "2024" is detected as a forbidden year reference (not present in analysis_date). Output is rejected.

**Pass condition:** Validation rejects the output and triggers a retry.

**Fail condition:** Output passes validation despite containing a year reference not in the input.

**Trust risk if untested:** AI output contains specific historical claims ("since 2023, this market has...") that are plausible but ungrounded in the analysis data.

---

## Section 4 — Revenue, ROI, and Probability Prohibitions

**Spec reference:** Section 13 (Non-Goals)  
**Constitution laws:** Law 2, Law 3, Law 4

---

#### AT-REV-001: Revenue language in AI causal paragraph is rejected

**Purpose:** Full integration test that a causal paragraph containing revenue language is rejected before display.  
**Law / Spec:** Law 2 (No Revenue Predictions), Spec §12  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Mock the Anthropic API to return a causal paragraph containing:
"This represents a $45M annual market opportunity"
```

**Expected output:**
The validation pipeline detects the revenue pattern, rejects the output, logs the violation, and either retries or falls back to the deterministic template. The string "$45M" never appears in any data returned to the client.

**Pass condition:** No response object returned to the client contains a dollar-sign revenue figure in any field.

**Fail condition:** The revenue figure reaches the client response in any field, including debug fields, fallback fields, or raw AI output fields.

**Trust risk if untested:** A revenue figure reaches a founder, creating the precise anchoring harm the Constitution was written to prevent.

---

#### AT-REV-002: TAM / SAM language is rejected

**Purpose:** Verify that TAM and SAM estimates in any form are detected and rejected.  
**Law / Spec:** Law 2, Spec §13  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Test against:
1. "Total addressable market: $1.2B"
2. "TAM for this category exceeds $400M"
3. "Serviceable addressable market of $85M"
4. "SAM: approximately $200 million"
```

**Expected output:** All four match the combined revenue + TAM detection pattern.

**Pass condition:** All four trigger rejection.

**Fail condition:** Any escapes detection.

**Trust risk if untested:** Market size estimates in TAM/SAM framing are the precise format investors and founders use for capital allocation decisions. An invented TAM creates more harm than a generic revenue claim.

---

#### AT-ROI-001: ROI language pattern is detected and rejected

**Purpose:** Verify that return-on-investment language is detected in AI outputs.  
**Law / Spec:** Law 4 (No ROI Predictions), Spec §13  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Test regex against:
1. "Estimated ROI: 280%"
2. "Return on investment of approximately 3x"
3. "Break-even at 340 units"
4. "Payback period: 4.2 months"
5. "Net margin range: 18–32%"
```

**Expected output:** All five match: `/\b(ROI|return on investment|break-even|payback period|net margin range)\b/i`

**Pass condition:** All five detected.

**Fail condition:** Any escape detection.

**Trust risk if untested:** ROI figures create the same false precision harm as revenue figures, applied to the cost side of the investment decision.

---

#### AT-PROB-001: Personal directive language is detected and rejected

**Purpose:** Verify that personal directive language ("you should," "we recommend") is caught by the validation pipeline.  
**Law / Spec:** Law 5 (Market Assessment Is Not Founder Assessment), Spec §8.1 constraint 6  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Test regex against:
1. "You should consider entering this market"
2. "We recommend starting with a 500-unit MOQ"
3. "The founder needs to secure manufacturing partners early"
4. "Your target customer would be athletic adults"
5. "You are well-positioned if you have relevant domain experience"
```

**Expected output:** All five match: `/\b(you should|we recommend|the founder (needs|must|should)|your target|you are well)\b/i`

**Pass condition:** All five detected.

**Fail condition:** Any escape detection.

**Trust risk if untested:** Founders receive advice they interpret as personalized recommendation when the platform has no information about their capabilities, capital, or situation.

---

## Section 5 — Verdict Generation

**Spec reference:** Section 6 (Verdict Generation)  
**Constitution laws:** Law 5, Law 1, Law 13

---

#### AT-VERDICT-001: Score thresholds produce correct verdict labels

**Purpose:** Verify that the three score thresholds produce the correct VerdictLabel values.  
**Law / Spec:** Law 6, Spec §6.1  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Three test cases:
A: overall_score = 75  → expected: 'ENTRY_SUPPORTED'
B: overall_score = 52  → expected: 'VALIDATION_REQUIRED'
C: overall_score = 35  → expected: 'ENTRY_NOT_SUPPORTED'
```

**Pass condition:** All three return the correct VerdictLabel.

**Fail condition:** Any test case returns a different VerdictLabel.

**Trust risk if untested:** Score threshold bugs produce wrong verdicts. A founder receives ENTRY_SUPPORTED at a score that should produce VALIDATION_REQUIRED.

---

#### AT-VERDICT-002: Boundary conditions at exact thresholds

**Purpose:** Verify behavior at exact threshold values (65 and 40) is deterministic and correct.  
**Law / Spec:** Law 13 (Confidence Is Deterministic), Spec §6.1  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
A: overall_score = 65.0 → expected: 'ENTRY_SUPPORTED'
B: overall_score = 64.9 → expected: 'VALIDATION_REQUIRED'
C: overall_score = 40.0 → expected: 'VALIDATION_REQUIRED'
D: overall_score = 39.9 → expected: 'ENTRY_NOT_SUPPORTED'
```

**Pass condition:** All four return the expected VerdictLabel.

**Fail condition:** Off-by-one errors at either boundary.

**Trust risk if untested:** A product that scores 64.9 gets ENTRY_SUPPORTED and a product that scores 65.0 gets VALIDATION_REQUIRED due to floating-point handling — an invisible and undetectable trust failure.

---

#### AT-VERDICT-003: Verdict display text matches approved strings exactly

**Purpose:** Verify that the user-facing verdict text matches the three approved strings from the Technical Specification exactly — including capitalization and wording.  
**Law / Spec:** Law 5, Spec §6.2  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
All three VerdictLabel values passed through the display text mapping
```

**Expected output:**
```
'ENTRY_SUPPORTED'        → "The evidence supports market entry"
'VALIDATION_REQUIRED'    → "The evidence requires validation before entry"
'ENTRY_NOT_SUPPORTED'    → "The evidence does not support market entry"
```

**Pass condition:** Exact string match for all three.

**Fail condition:** Any variant ("Evidence supports market entry", "Market entry supported", "BUILD") — even minor wording differences.

**Trust risk if untested:** Verdict text drifts toward personal directive language ("We recommend entry") or imperative language ("BUILD") through small wording changes over time.

---

#### AT-VERDICT-004: Confidence qualifier is shown for LOW and MODERATE confidence

**Purpose:** Verify that the confidence qualifier renders when `verdict_confidence = LOW or MODERATE` and does not render when `verdict_confidence = HIGH`.  
**Law / Spec:** Law 1 (Truth Over Confidence), Spec §6.4  
**Type:** Automated + Manual  
**Priority:** Must-Pass

**Input scenario:**
```
Three test cases, each with a different verdict_confidence value
```

**Expected output:**
- LOW → confidence qualifier rendered adjacent to verdict
- MODERATE → confidence qualifier rendered adjacent to verdict
- HIGH → no confidence qualifier rendered

**Pass condition:** Qualifier renders in exactly the two required cases and is absent in the HIGH case.

**Fail condition:** Qualifier absent for LOW or MODERATE; qualifier present for HIGH.

**Trust risk if untested:** Founders with LOW confidence analyses see a clean verdict without any indication of data limitations, making decisions on false confidence.

---

## Section 6 — Confidence System

**Spec reference:** Section 10 (Confidence System)  
**Constitution laws:** Law 13, Law 1, Law 14

---

#### AT-CONF-001: Identical provider outputs produce identical confidence tiers

**Purpose:** Verify that confidence tier assignment is fully deterministic — same provider output always produces the same tier.  
**Law / Spec:** Law 13 (Confidence Is Deterministic), Spec §10.1  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Fixed provider output object passed to confidence tier assignment function twice
```

**Expected output:**
Both calls return identical tier values for all signals.

**Pass condition:** `tier1 === tier2` for all signals across both runs.

**Fail condition:** Any signal returns a different tier between runs.

**Trust risk if untested:** A founder reruns an analysis and sees different confidence badges without any change in underlying data, destroying trust in the confidence system.

---

#### AT-CONF-002: Competition signal CONFIRMED tier requires withReviews.length >= 10

**Purpose:** Verify the exact threshold for competition signal CONFIRMED tier.  
**Law / Spec:** Law 13, Spec §5.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
A: withReviews.length = 10 → expected: CONFIRMED
B: withReviews.length = 9  → expected: INDICATED
C: withReviews.length = 5  → expected: INDICATED
D: withReviews.length = 4  → expected: LIMITED
```

**Pass condition:** All four return the expected tier.

**Fail condition:** Any boundary mismatch.

**Trust risk if untested:** A CONFIRMED badge is shown on data with 9 results — a threshold violation that inflates user confidence.

---

#### AT-CONF-003: Demand signal CONFIRMED requires both DataForSEO AND Keepa above threshold

**Purpose:** Verify that the demand CONFIRMED tier requires both providers (AND logic, not OR).  
**Law / Spec:** Law 13, Spec §5.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
A: DataForSEO = 12000, Keepa = 6000 → expected: CONFIRMED
B: DataForSEO = 12000, Keepa = 4000 → expected: INDICATED (Keepa below 5000)
C: DataForSEO = 4000,  Keepa = 6000 → expected: INDICATED (DataForSEO below 10000)
D: DataForSEO = 4000,  Keepa = 4000 → expected: LIMITED
E: DataForSEO = null,  Keepa = 6000 → expected: INDICATED (single source)
F: DataForSEO = null,  Keepa = null  → expected: LIMITED
```

**Pass condition:** All six return the expected tier.

**Fail condition:** Any test case returns the wrong tier.

**Trust risk if untested:** A single provider with high volume gets CONFIRMED when two independent providers are required for confirmation — inflating confidence when data is unvalidated.

---

#### AT-CONF-004: Consumer pain LIMITED tier is assigned when corpus_size < 50

**Purpose:** Verify that thin_corpus cases correctly receive LIMITED tier and that thin_corpus flag is set.  
**Law / Spec:** Law 14 (Failure Is Transparent), Spec §5.2, §10.5  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
A: corpus_size = 50 → CONFIRMED, thin_corpus = false
B: corpus_size = 49 → INDICATED, thin_corpus = true
C: corpus_size = 20 → INDICATED, thin_corpus = true
D: corpus_size = 19 → LIMITED, thin_corpus = true
```

**Pass condition:** All four return correct tier and thin_corpus value.

**Fail condition:** Any boundary mismatch or incorrect thin_corpus flag.

**Trust risk if untested:** A 49-review corpus gets CONFIRMED confidence — a silent threshold violation where the platform asserts high confidence in consumer pain signals from insufficient data.

---

#### AT-CONF-005: Verdict confidence LOW is triggered by thin_corpus

**Purpose:** Verify that thin_corpus = true overrides verdict confidence to LOW regardless of other signal tiers.  
**Law / Spec:** Law 1, Spec §6.3, §10.5  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Analysis with 4 CONFIRMED signals but thin_corpus = true
```

**Expected output:**
`verdict_confidence = 'LOW'`

**Pass condition:** Verdict confidence is LOW despite strong other signals.

**Fail condition:** Verdict confidence is computed as HIGH or MODERATE based on the four CONFIRMED signals, ignoring the thin corpus flag.

**Trust risk if untested:** A founder receives a HIGH confidence verdict on an analysis where consumer pain could not be validated — the most important signal for product differentiation.

---

## Section 7 — Risk Taxonomy

**Spec reference:** Section 4 (Risk Taxonomy)  
**Constitution laws:** Law 7, Law 11, Law 12

---

#### AT-RISK-001: Primary risk selection follows priority order

**Purpose:** Verify that when two risks have equal severity, the risk with higher priority in the taxonomy order is selected as primary.  
**Law / Spec:** Law 6 (Deterministic Engine Before AI), Spec §4.1  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Analysis with two triggered risks, both MODERATE severity:
- MARKET_SATURATION (priority 2)
- SEASONALITY (priority 7)
```

**Expected output:**
`primary_risk.type = 'MARKET_SATURATION'`

**Pass condition:** MARKET_SATURATION selected as primary.

**Fail condition:** SEASONALITY selected, or selection is non-deterministic.

**Trust risk if untested:** Primary risk selection is random or order-dependent on the scoring engine's evaluation order — founders see different primary risks on reruns.

---

#### AT-RISK-002: REVIEW_MOAT risk fires at correct thresholds

**Purpose:** Verify REVIEW_MOAT risk classification requires both conditions.  
**Law / Spec:** Law 7, Spec §4.2  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
A: review_moat_score = 8.5, meaningful_competitor_count = 10 → REVIEW_MOAT HIGH
B: review_moat_score = 7.5, meaningful_competitor_count = 10 → REVIEW_MOAT MODERATE
C: review_moat_score = 8.5, meaningful_competitor_count = 9  → not triggered (count below threshold)
D: review_moat_score = 7.4, meaningful_competitor_count = 10 → not triggered (score below threshold)
```

**Pass condition:** All four produce the expected result.

**Fail condition:** Any case fires the risk when both conditions are not met.

**Trust risk if untested:** REVIEW_MOAT fires on a market with only 9 established competitors — misleading founders about the actual entry barrier.

---

#### AT-RISK-003: THIN_CONSUMER_DATA risk is triggered when thin_corpus = true

**Purpose:** Verify the THIN_CONSUMER_DATA risk classification.  
**Law / Spec:** Spec §4.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
A: corpus_size = 18 → THIN_CONSUMER_DATA HIGH
B: corpus_size = 35 → THIN_CONSUMER_DATA MODERATE
C: corpus_size = 50 → not triggered
```

**Pass condition:** All three produce the expected result.

**Fail condition:** Any boundary mismatch.

**Trust risk if untested:** Founders receive a risk-free verdict when they should see a warning that consumer pain couldn't be validated.

---

#### AT-RISK-004: VIRALITY_ABSENCE risk is never HIGH severity

**Purpose:** Verify that VIRALITY_ABSENCE is capped at LOW severity and cannot be primary risk unless all other applicable risks are also LOW.  
**Law / Spec:** Spec §4.2 (VIRALITY_ABSENCE)  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Analysis where VIRALITY_ABSENCE is triggered AND another risk with LOW severity is triggered (e.g., DEMAND_CONCENTRATION LOW)
```

**Expected output:**
Primary risk is determined by priority order between two LOW risks, not by severity escalation of VIRALITY_ABSENCE.

**Pass condition:** `primary_risk.severity` for VIRALITY_ABSENCE is always 'LOW'. VIRALITY_ABSENCE is never assigned MODERATE or HIGH.

**Fail condition:** VIRALITY_ABSENCE assigned MODERATE or HIGH severity.

**Trust risk if untested:** A product without TikTok presence is labeled HIGH risk for virality absence — overstating the importance of a single, optional channel.

---

#### AT-RISK-005: Risk sentence contains a numeric evidence reference

**Purpose:** Verify that the generated risk sentence (AI or fallback) references at least one specific numeric value from the risk evidence.  
**Law / Spec:** Law 11 (Every Sentence Must Be Traceable), Spec §4.2 (sentence requirements)  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Any complete analysis where primary_risk is classified and AI Call B completes
```

**Expected output:**
The risk sentence contains at least one number. Example: "Review Moat score of 8.3 indicates..."

**Pass condition:** Regex `/\d+\.?\d*/` matches at least once in the risk sentence.

**Fail condition:** Risk sentence contains no numeric value — it is a generic description without evidence grounding.

**Trust risk if untested:** Risk sentences like "competition is intense in this category" appear to founders — indistinguishable from a generic boilerplate warning, destroying the signal value of the primary risk.

---

## Section 8 — Signal Taxonomy

**Spec reference:** Section 5 (Signal Taxonomy)  
**Constitution laws:** Law 9, Law 13

---

#### AT-SIG-001: First-screen signal selection is verdict-conditional and deterministic

**Purpose:** Verify that the three signals shown on the first screen are selected by the verdict-conditional rules, not by a static list.  
**Law / Spec:** Law 6, Spec §5.3  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Three analyses:
A: ENTRY_SUPPORTED verdict → top 3 highest-scored signals selected
B: VALIDATION_REQUIRED verdict → highest-scored + two lowest-scored signals
C: ENTRY_NOT_SUPPORTED verdict → three lowest-scored signals
```

**Pass condition:** Signal selection matches the expected rule for each verdict type.

**Fail condition:** Same three signals selected regardless of verdict type, or selection varies between runs.

**Trust risk if untested:** A VALIDATION_REQUIRED verdict shows the three strongest signals — creating a first screen that contradicts the verdict, leaving founders confused about what to validate.

---

#### AT-SIG-002: Tie-breaking follows the defined weight order

**Purpose:** Verify that when two signals have equal scores, the higher-weight signal is selected first.  
**Law / Spec:** Law 9 (Single Source of Truth), Spec §5.3  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
demand signal score = 7.0, market_accessibility signal score = 7.0
(demand weight = 22, market_accessibility weight = 18)
```

**Expected output:**
Demand signal is selected before market_accessibility in tie-breaking.

**Pass condition:** Demand selected first.

**Fail condition:** market_accessibility selected or selection is arbitrary.

**Trust risk if untested:** Signal card ordering is random — a demand limitation that should anchor the verdict analysis is shown last while a less important signal is shown first.

---

#### AT-SIG-003: Excluded signals have their weight redistributed

**Purpose:** Verify that when a signal is excluded, its weight is added proportionally to remaining signals.  
**Law / Spec:** Law 9, Spec §11.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
consumer_pain (weight=18) excluded from analysis.
Remaining signal weights before redistribution: demand=22, market_accessibility=18, profitability=20, virality=10, subscription=7, manufacturing=5 (total=82)
```

**Expected output:**
Redistributed weights sum to 100. Each remaining weight increases proportionally by factor (100/82).

**Pass condition:** `sum(redistributed_weights) === 100`

**Fail condition:** Weights sum to 82 (exclusion applied but weight not redistributed), or weights sum to any other value.

**Trust risk if untested:** Overall score is out of 82 but displayed as if out of 100 — a score of 60/82 looks identical to 60/100 but represents a different market position.

---

## Section 9 — AI Sentence Validation

**Spec reference:** Section 8 (AI Writing Rules), Section 12 (Validation Pipeline)  
**Constitution laws:** Law 11, Law 12, Law 15

---

#### AT-VAL-001: Validation pipeline blocks hallucination-matched output

**Purpose:** Verify that when a forbidden pattern is detected, the output is blocked and a retry or fallback is triggered.  
**Law / Spec:** Law 15 (Validation Before Display), Spec §12 Step 3  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Mock Anthropic to return: "This market has been growing at 40% year-over-year since 2024"
Expected response: both year reference (2024) and growth percentage are forbidden
```

**Expected output:**
1. Validation Step 3 detects both patterns
2. Output is rejected
3. Retry is triggered
4. If retry also fails: fallback template is used
5. The string "40% year-over-year since 2024" never appears in any response field

**Pass condition:** Neither the year reference nor the percentage change claim reaches the client.

**Fail condition:** Either pattern reaches the client in any field.

**Trust risk if untested:** A temporal growth claim based on AI training data (not the analysis evidence) reaches founders and is interpreted as market intelligence.

---

#### AT-VAL-002: Fallback triggers after two consecutive validation failures

**Purpose:** Verify the retry-then-fallback logic: exactly one retry, then deterministic fallback.  
**Law / Spec:** Law 15, Spec §12 Step 5  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Mock Anthropic to return a forbidden-pattern string on both the first and retry call
```

**Expected output:**
1. First call: validation fails, retry triggered
2. Second call: validation fails, fallback triggered
3. No third AI call attempted
4. `is_fallback: true` recorded in stored result
5. Fallback template output returned to client

**Pass condition:** Exactly two AI calls attempted, fallback used on second failure, flag recorded.

**Fail condition:** Third AI call attempted; fallback not recorded; validation failure causes error response.

**Trust risk if untested:** Infinite retry loops, crashes on double validation failure, or unrecorded fallback usage that prevents quality monitoring.

---

#### AT-VAL-003: is_fallback flag is persisted in stored analysis result

**Purpose:** Verify that when a fallback template is used, the stored analysis record reflects this.  
**Law / Spec:** Law 15, Spec §12 Step 6  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Force fallback by causing two consecutive validation failures for the causal paragraph
```

**Expected output:**
Stored analysis result includes `causal_paragraph_is_fallback: true` (or equivalent field).

**Pass condition:** Field is present and true in the stored record after a fallback.

**Fail condition:** Field is absent, false, or not stored.

**Trust risk if untested:** Fallback usage cannot be monitored. The team cannot know how often the AI validation is failing in production, making quality improvement impossible.

---

#### AT-VAL-004: Causal paragraph contains at least one numeric evidence reference

**Purpose:** Verify the evidence grounding check (Step 4) for the causal paragraph.  
**Law / Spec:** Law 11 (Every Sentence Traceable), Spec §12 Step 4  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
Complete analysis where causal paragraph AI call returns a paragraph
```

**Expected output:**
At least one number from SynthesisInput (e.g., monthly_search_volume, meaningful_competitor_count, frequency_pct) appears verbatim in the causal paragraph.

**Pass condition:** The grounding check finds at least one SynthesisInput numeric value in the output.

**Fail condition:** The paragraph contains no numbers, or all numbers in the paragraph differ from SynthesisInput values.

**Trust risk if untested:** The causal paragraph uses approximate or rounded numbers that don't trace to SynthesisInput — a subtle form of imprecision that gradually erodes auditability.

---

#### AT-VAL-005: Product thesis contains at least one consumer cluster label

**Purpose:** Verify that the product thesis grounds its differentiation claim in actual consumer cluster data.  
**Law / Spec:** Law 11, Spec §12 Step 4  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
SynthesisInput with consumer_clusters[0].label = "absorption"
```

**Expected output:**
The product thesis (headline or full_thesis) contains the word "absorption" or a direct reference to the top cluster.

**Pass condition:** At least one consumer_cluster.label from SynthesisInput appears in the product thesis output.

**Fail condition:** Product thesis describes product differentiation without reference to the actual consumer complaints in the data.

**Trust risk if untested:** The product thesis is generic market advice not grounded in what customers actually complain about — the most valuable part of the analysis becomes a generic recommendation.

---

#### AT-VAL-006: Risk sentence is exactly one sentence (ends with exactly one period)

**Purpose:** Verify the structural constraint that the risk sentence is exactly one sentence.  
**Law / Spec:** Spec §8.1 constraint 9, §4.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Risk sentence output from AI Call B or fallback
```

**Expected output:**
String ends with exactly one sentence-terminating character (`.`). No internal periods that would indicate a multi-sentence output.

**Pass condition:** `sentence.split('.').filter(s => s.trim()).length === 1`

**Fail condition:** Sentence contains two or more complete sentences, or ends without a period.

**Trust risk if untested:** A two-sentence risk description implies more complexity than the primary risk framework supports, and the second sentence often contains the most general (least grounded) content.

---

## Section 10 — Evidence System

**Spec reference:** Section 9 (Evidence System)  
**Constitution laws:** Law 11, Law 16, Law 17

---

#### AT-LAYER2-001: Every first-screen signal card has a corresponding ExpandableCard

**Purpose:** Verify that the Evidence Layer has produced an ExpandableCard for every signal card shown on the first screen.  
**Law / Spec:** Law 16 (Explainability Over Simplicity), Spec §9.4  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Any complete analysis result
```

**Expected output:**
For every signal_id in the three first-screen signal cards, an ExpandableCard with the same signal_id exists in the expandable_cards map.

**Pass condition:** `firstScreenSignals.every(s => expandableCards.has(s.id))`

**Fail condition:** Any first-screen signal has no ExpandableCard — its expand control would show nothing.

**Trust risk if untested:** A founder taps to see the evidence behind a claim and sees an empty panel. The auditability promise is broken at the moment it's exercised.

---

#### AT-LAYER2-002: ExpandableCard contains 2–4 data points with context labels

**Purpose:** Verify that each ExpandableCard provides the required number of labeled data points.  
**Law / Spec:** Spec §9.2, §9.3  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
ExpandableCard for the demand signal from a complete analysis
```

**Expected output:**
`card.data_points.length >= 2 && card.data_points.length <= 4`
Each data point has a non-empty `label` and non-empty `value`.

**Pass condition:** Length between 2 and 4, all data points labeled.

**Fail condition:** Empty data_points array, or data point with empty label.

**Trust risk if untested:** Evidence cards show raw numbers without context ("45200") instead of labeled data ("Monthly search volume: 45,200") — founders cannot interpret what they're looking at.

---

#### AT-LAYER2-003: LIMITED confidence ExpandableCard includes a limitation note

**Purpose:** Verify that signals with LIMITED confidence include an explanation of the limitation in their expanded view.  
**Law / Spec:** Law 14 (Failure Is Transparent), Spec §9.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
ExpandableCard for a signal with confidence = LIMITED
```

**Expected output:**
`card.limitation` is a non-empty string.

**Pass condition:** Limitation note present.

**Fail condition:** `card.limitation === null` for a LIMITED confidence signal.

**Trust risk if untested:** Founders expand a LIMITED signal card and see data points without any explanation of why the data is insufficient — the badge says LIMITED but the expansion provides no context.

---

#### AT-LAYER2-004: Primary risk expansion includes condition for removal

**Purpose:** Verify that the expanded primary risk view includes the condition that would change or remove the risk.  
**Law / Spec:** Law 16, Spec §9.2  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Complete analysis where primary_risk.type = 'THIN_CONSUMER_DATA'
```

**Expected output:**
The primary risk expansion contains text indicating that the risk is reducible — e.g., "This risk would be resolved by collecting more customer reviews."

**Pass condition:** Expansion content explicitly states what would change or remove the risk.

**Fail condition:** Expansion only restates the risk without specifying what would change it.

**Trust risk if untested:** Founders see a risk with no path forward — they cannot take action, cannot validate the condition, and cannot assess whether the risk is addressable in their situation.

---

## Section 11 — Missing Data and Failure Handling

**Spec reference:** Section 11 (Failure Handling)  
**Constitution laws:** Law 14, Law 1

---

#### AT-MISS-001: Missing demand data causes fatal error, not partial analysis

**Purpose:** Verify that when all demand providers fail, the system returns an error state rather than producing a partial analysis.  
**Law / Spec:** Law 14 (Failure Is Transparent), Spec §11.3  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
DataForSEO provider returns null AND Keepa provider returns null
```

**Expected output:**
Error state returned. No verdict, no AI generation, no first screen rendered. Error message: "We were unable to collect demand data for this query."

**Pass condition:** Response contains error state. No analysis fields (verdict, causal_paragraph, etc.) are populated.

**Fail condition:** Partial analysis produced with demand signal excluded — verdict generated without any demand data, possibly appearing valid to a founder.

**Trust risk if untested:** A verdict of VALIDATION_REQUIRED is produced with no demand data and weight redistributed to remaining signals. A founder sees a verdict that implies "this market has some evidence of demand" when no demand data was collected.

---

#### AT-MISS-002: Manufacturing provider failure excludes signal without fatal error

**Purpose:** Verify that manufacturing provider failure is a non-fatal, handled exclusion.  
**Law / Spec:** Spec §11.1  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
Manufacturing provider (Apify/Alibaba) returns null
```

**Expected output:**
1. `manufacturing_context = null` in SynthesisInput
2. `manufacturing_feasibility` signal excluded from scoring
3. Weight redistributed to remaining signals
4. `excluded_signals` includes `{ signal_id: 'manufacturing_feasibility', reason: 'PROVIDER_FAILURE' }`
5. Analysis completes without manufacturing data

**Pass condition:** All five conditions met.

**Fail condition:** Analysis crashes, or manufacturing signal is included with estimated data, or exclusion is not recorded.

**Trust risk if untested:** Manufacturing failure causes analysis crash, or worse — manufacturing score is estimated at a default value (e.g., 5/10) without disclosure, silently inflating or deflating the overall score.

---

#### AT-MISS-003: SERP provider failure excludes market_accessibility signal

**Purpose:** Verify non-fatal handling of SERP provider failure.  
**Law / Spec:** Spec §11.1  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
junglee amazon-crawler returns null (HTTP error or timeout)
```

**Expected output:**
1. `competitor_context = null` in SynthesisInput
2. `market_accessibility` excluded from scoring
3. Confidence qualifier displayed (verdict_confidence = LOW or MODERATE)
4. No competitor data shown on first screen

**Pass condition:** All four conditions met.

**Fail condition:** market_accessibility scored at a default value, or SERP failure causes the analysis to crash.

**Trust risk if untested:** A market with no SERP data gets an accessibility score of 5/10 by default — appearing as a neutral accessibility signal when it's actually unknown.

---

#### AT-MISS-004: Thin corpus triggers confidence qualifier on first screen

**Purpose:** Verify that thin_corpus = true causes the confidence qualifier to be displayed, even if other signals are strong.  
**Law / Spec:** Law 1, Law 14, Spec §10.5  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
Analysis with corpus_size = 35 (thin_corpus = true) but 4 other CONFIRMED signals
```

**Expected output:**
1. `verdict_confidence = 'LOW'`
2. Confidence qualifier rendered adjacent to verdict
3. Consumer pain signal excluded or marked LIMITED

**Pass condition:** All three conditions met.

**Fail condition:** Verdict confidence is HIGH (ignoring thin_corpus), confidence qualifier not shown.

**Trust risk if untested:** A founder receives a HIGH confidence BUILD verdict when consumer pain — the most important differentiator signal — couldn't be validated.

---

#### AT-MISS-005: Excluded signal labeled in confidence qualifier

**Purpose:** Verify that when consumer_pain is excluded, the specific exclusion is named in the confidence qualifier, not just a generic "limited data" message.  
**Law / Spec:** Law 14, Spec §6.4  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Analysis where Consumer Opportunity exclusion triggers (thin corpus + cross-validated demand)
```

**Expected output:**
Confidence qualifier reads approximately: "Consumer pain assessment was not possible with available data."

**Pass condition:** The specific exclusion is named. Generic "limited data" language alone fails.

**Fail condition:** Qualifier says "Based on limited signals" without identifying which signal was excluded.

**Trust risk if untested:** A founder reads "limited signals" and guesses that demand data was weak, when actually consumer pain couldn't be validated — a materially different limitation with different implications for their next step.

---

## Section 12 — Weak Evidence and Conflicting Signals

**Spec reference:** Section 11.4 (Conflicting Signals), Section 10.5 (Edge Cases)  
**Constitution laws:** Law 1, Law 13, Law 14

---

#### AT-WEAK-001: All-LIMITED analysis produces LOW verdict confidence

**Purpose:** Verify the edge case where all signals are LIMITED tier.  
**Law / Spec:** Spec §10.5  
**Type:** Automated  
**Priority:** Edge Case

**Input scenario:**
```
Analysis where every scored signal has confidence = LIMITED
```

**Expected output:**
`verdict_confidence = 'LOW'`

**Pass condition:** LOW produced despite all signals being present (but all limited).

**Fail condition:** MODERATE or HIGH produced because signals are present (ignoring tier quality).

**Trust risk if untested:** A verdict is produced with apparent confidence when no signal met its quality threshold — the platform's confident-looking output is built on entirely unconfirmed data.

---

#### AT-WEAK-002: HIGH severity risk does not downgrade verdict confidence

**Purpose:** Verify that a HIGH severity primary risk doesn't cause verdict_confidence to be artificially lowered.  
**Law / Spec:** Spec §10.5  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Analysis where verdict_confidence = HIGH (4 CONFIRMED signals) AND primary_risk.severity = 'HIGH'
```

**Expected output:**
`verdict_confidence = 'HIGH'`

**Pass condition:** Verdict confidence remains HIGH.

**Fail condition:** Verdict confidence reduced to MODERATE due to the HIGH severity risk.

**Trust risk if untested:** Verdicts with strong evidence but real risks appear as MODERATE confidence, conflating evidence quality with risk severity — two different dimensions that should be communicated independently.

---

#### AT-WEAK-003: Conflicting demand signals produce INDICATED tier

**Purpose:** Verify that when DataForSEO and Keepa disagree on demand strength, INDICATED is assigned (not CONFIRMED).  
**Law / Spec:** Law 13, Spec §5.2, §11.4  
**Type:** Automated  
**Priority:** Edge Case

**Input scenario:**
```
DataForSEO monthly_volume = 15,000 (above 10,000 threshold)
Keepa monthly_units = 3,000 (below 5,000 threshold)
```

**Expected output:**
Demand signal confidence = INDICATED (not CONFIRMED — Keepa is below threshold)

**Pass condition:** INDICATED returned.

**Fail condition:** CONFIRMED returned because DataForSEO alone is above its threshold.

**Trust risk if untested:** Demand is marked CONFIRMED when only one of two required independent sources confirms the threshold — the "two independent providers" requirement of CONFIRMED exists precisely to prevent single-source overconfidence.

---

## Section 13 — UI and First-Screen Requirements

**Spec reference:** Section 7 (First-Screen Specification)  
**Constitution laws:** Law 17, Law 18, Law 16

---

#### AT-UI-001: First screen renders exactly six elements

**Purpose:** Verify that the first-screen layout contains exactly the six specified elements and no others.  
**Law / Spec:** Law 17 (Progressive Disclosure), Spec §7.1  
**Type:** Manual  
**Priority:** Must-Pass

**Input scenario:**
```
A complete analysis rendered in the browser for the first time (not scrolled, no elements expanded)
```

**Expected output:**
Visible elements:
1. Verdict display text (+ confidence qualifier if applicable)
2. Causal paragraph
3. Signal card A
4. Signal card B
5. Signal card C
6. Primary risk sentence
7. Product thesis headline

**Pass condition:** Exactly these elements are visible above the fold. Conditions/Next Steps are not visible by default.

**Fail condition:** More than six primary elements visible, or any of the six is absent, or Conditions/Next Steps are shown without being requested.

**Trust risk if untested:** Scope creep on the first screen gradually adds elements until the cognitive load prevents founders from understanding the verdict in 20 seconds.

---

#### AT-UI-002: Primary risk has equal visual weight to verdict

**Purpose:** Verify that the primary risk is not visually subordinated to the verdict.  
**Law / Spec:** Law 17, Spec §7.4  
**Type:** Manual  
**Priority:** Must-Pass

**Input scenario:**
```
Any complete analysis rendered in the browser
```

**Expected output:**
The primary risk sentence is rendered at the same visual level as the verdict text — not smaller, not lighter, not indented below it.

**Pass condition:** A naive observer looking at the first screen would identify both the verdict and the risk as equally prominent conclusions.

**Fail condition:** Risk is rendered smaller, lighter, grayed out, or visually subordinate to the verdict in any way.

**Trust risk if untested:** Founders anchor to the BUILD verdict and dismiss the primary risk as fine print — the risk that defines the entry challenge is invisible in practice.

---

#### AT-UI-003: Causal paragraph does not exceed 130 words

**Purpose:** Verify max length enforcement for the causal paragraph.  
**Law / Spec:** Spec §7.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
AI or fallback output for causal paragraph
```

**Expected output:**
Word count ≤ 130.

**Pass condition:** `causalParagraph.split(/\s+/).length <= 130`

**Fail condition:** Word count exceeds 130.

**Trust risk if untested:** A lengthy causal paragraph converts the first screen into a wall of text that founders stop reading — the product fails its 20-second clarity test.

---

#### AT-UI-004: Risk sentence does not exceed 30 words

**Purpose:** Verify max length enforcement for the risk sentence.  
**Law / Spec:** Spec §7.2, §4.2  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Risk sentence from AI Call B or fallback
```

**Expected output:**
Word count ≤ 30.

**Pass condition:** `riskSentence.split(/\s+/).length <= 30`

**Fail condition:** Word count exceeds 30.

**Trust risk if untested:** A lengthy risk sentence turns the primary risk into a paragraph that founders skim rather than absorb.

---

#### AT-UI-005: Confidence badges are rendered on all three signal cards

**Purpose:** Verify that every signal card on the first screen has a visible confidence badge.  
**Law / Spec:** Law 1, Spec §10.4  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Analysis rendered with at least one LIMITED signal among the three first-screen cards
```

**Expected output:**
All three signal cards display a confidence badge. The LIMITED badge is visually distinct from CONFIRMED and INDICATED.

**Pass condition:** Three badges rendered. LIMITED badge is identifiably different from the others.

**Fail condition:** Any signal card missing a badge, or LIMITED badge identical to INDICATED.

**Trust risk if untested:** A founder cannot tell which signals are well-supported vs. which are based on thin data — the confidence system is invisible in practice.

---

## Section 14 — Progressive Disclosure Behavior

**Spec reference:** Section 7.5 (Progressive Disclosure Behavior)  
**Constitution laws:** Law 17, Law 16

---

#### AT-DISC-001: Signal card expands inline without navigation

**Purpose:** Verify that expanding a signal card does not navigate to a new page or open a modal.  
**Law / Spec:** Law 17, Spec §7.5  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Tap/click a signal card on the first screen
```

**Expected output:**
Card expands inline within the first screen. No navigation. No modal overlay. URL does not change.

**Pass condition:** Card content appears inline below the card header. Browser URL is unchanged.

**Fail condition:** New page loaded, modal appears, or URL changes.

**Trust risk if untested:** Navigation-on-expand breaks the mental model of layered disclosure, feels like a page load, and discourages founders from exploring evidence.

---

#### AT-DISC-002: Only one signal card can be expanded at a time

**Purpose:** Verify that expanding a second signal card collapses the first.  
**Law / Spec:** Spec §7.5  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Expand signal card A, then expand signal card B
```

**Expected output:**
Card A collapses when Card B is expanded. Only one card's expanded content is visible at any time.

**Pass condition:** One expanded card visible after second expansion.

**Fail condition:** Both cards remain expanded simultaneously.

**Trust risk if untested:** Two simultaneously expanded cards create a dense information wall that violates the progressive disclosure principle — more content than a collapsed first screen but without the structure of the full evidence view.

---

#### AT-DISC-003: Conditions and Next Steps are not visible by default

**Purpose:** Verify that Conditions for Success/Failure and Decision-specific Next Steps are not shown on first render.  
**Law / Spec:** Law 17, Spec §7.1  
**Type:** Manual  
**Priority:** Standard

**Input scenario:**
```
Fresh render of a complete analysis — no interactions performed
```

**Expected output:**
Neither "Conditions for Success / Failure" nor "Decision-specific Next Steps" is visible.

**Pass condition:** Neither section appears in the initial DOM render or visible viewport.

**Fail condition:** Either section is visible without user interaction.

**Trust risk if untested:** The first screen's six-element hierarchy is violated before a user takes any action, creating information overload on first impression.

---

## Section 15 — Auditability Requirements

**Spec reference:** Section 9.4 (Evidence Auditability Principles)  
**Constitution laws:** Law 11, Law 16

---

#### AT-AUDIT-001: Every first-screen signal card has a corresponding ExpandableCard

*(Listed in Critical Path above — defined here for completeness)*

**Purpose:** Verify that no signal card is shown without Layer 2 evidence backing.  
**Law / Spec:** Law 16, Spec §9.4  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:** Any complete analysis result.

**Pass condition:** `firstScreenSignalIds.every(id => expandableCardMap.has(id))`

---

#### AT-AUDIT-002: No first-screen claim lacks a Layer 2 evidence card

**Purpose:** Verify that every factual claim on the first screen can be expanded to see its specific evidence.  
**Law / Spec:** Law 16, Spec §9.4  
**Type:** Manual  
**Priority:** Must-Pass

**Input scenario:**
```
Complete analysis rendered. Reviewer reads each sentence of the causal paragraph and the risk sentence. 
For each factual claim, they attempt to find it in a Layer 2 expansion.
```

**Expected output:**
Every factual claim in the causal paragraph (e.g., "45,200 monthly searches") is visible in a signal card expansion. Every evidence reference in the risk sentence is visible in the risk expansion.

**Pass condition:** Reviewer confirms every claim is traceable to a Layer 2 card with no unmatched claims.

**Fail condition:** Any first-screen claim has no corresponding Layer 2 evidence — it is asserted but not backed.

**Trust risk if untested:** The platform claims to be auditable but in practice some claims cannot be verified — eroding the trust advantage that auditability is supposed to provide.

---

#### AT-AUDIT-003: Scoring engine version is stored with every analysis result

**Purpose:** Verify that every persisted analysis record includes the engine version that produced it.  
**Law / Spec:** Law 20 (Engine Versioning), Spec (SCORING_ENGINE_VERSION constant)  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
Complete analysis run that persists results to Supabase
```

**Expected output:**
Stored record includes `scoring_engine_version: '2.4.0'` (or current version).

**Pass condition:** Field is present and non-empty in the persisted record.

**Fail condition:** Field is absent or null.

**Trust risk if untested:** When the scoring engine is updated and existing analyses are reviewed, there is no way to know which version produced which result — historical analyses cannot be contextualized.

---

## Section 16 — Regression Tests for Existing Scoring Behavior

**Spec reference:** SCORING_ENGINE_VERSION = '2.4.0'  
**Constitution law:** Law 9 (Single Source of Truth)

---

#### AT-REG-001: v2.4.0 scoring produces identical results to pre-change baseline

**Purpose:** Verify that no implementation work on the AI Interpretation Layer has altered the scoring engine's numerical outputs.  
**Law / Spec:** Law 9, existing validate_v230.ts script  
**Type:** Automated  
**Priority:** Must-Pass

**Input scenario:**
```
Run scripts/validate_v230.ts against the existing v2.4.0 baseline fixtures
```

**Expected output:**
All scores match the baseline within floating-point tolerance (< 0.001 difference).

**Pass condition:** Validation script exits with zero differences.

**Fail condition:** Any score differs from baseline.

**Trust risk if untested:** AI Interpretation Layer work accidentally touches a shared utility in the scoring pipeline — a subtle regression that changes numerical outputs without surfacing as a type error.

---

#### AT-REG-002: Manufacturing cache does not alter engine outputs

**Purpose:** Verify that a cache HIT for manufacturing data produces identical scoring to a live provider call.  
**Law / Spec:** Law 9  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
Run analysis on a product twice:
A: No cache — live manufacturing provider call
B: Cache populated — cache HIT
```

**Expected output:**
`score_A === score_B` for manufacturing_feasibility signal.

**Pass condition:** Scores are identical.

**Fail condition:** Any scoring difference between cached and uncached runs.

**Trust risk if untested:** Cached manufacturing estimates from older provider calls produce different scores than current calls, causing the same product to score differently based on cache state — non-deterministic behavior.

---

#### AT-REG-003: SERP depth reduction (20→10) does not alter signal confidence rules

**Purpose:** Verify that the MAX_ITEMS=10 change preserved confidence tier behavior.  
**Law / Spec:** Law 13  
**Type:** Automated  
**Priority:** Standard

**Input scenario:**
```
10 results with 10 items having reviews → expected: CONFIRMED (withReviews.length >= 10)
10 results with 9 items having reviews → expected: INDICATED
```

**Pass condition:** Both produce the expected tier.

**Fail condition:** Tier thresholds were adjusted when MAX_ITEMS changed, silently inflating confidence.

---

## Section 17 — End-to-End Report Generation

**Spec reference:** Section 2 (Complete Data Flow)  
**Constitution laws:** All

---

#### AT-E2E-001: Full pipeline runs to completion on a known valid query

**Purpose:** Verify that the full pipeline — from query submission to first-screen render — completes successfully on a real-world query.  
**Law / Spec:** Spec §2.1 (Step 1–10)  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
Query: "magnesium glycinate" (a query with known, stable market data)
All providers enabled, no mocks
```

**Expected output:**
1. All steps 1–10 complete without error
2. Verdict is one of three valid VerdictLabel values
3. Three signal cards rendered with confidence badges
4. Primary risk sentence rendered
5. Product thesis headline rendered
6. Analysis persisted with scoring_engine_version
7. Total pipeline time < 120 seconds

**Pass condition:** All seven conditions met.

**Fail condition:** Any condition fails, or pipeline exceeds 120s.

---

#### AT-E2E-002: Full pipeline handles complete provider failure gracefully

**Purpose:** Verify that if all providers fail simultaneously, the system returns a clean error state with no partial or invalid analysis.  
**Law / Spec:** Law 14, Spec §11.3  
**Type:** Integration  
**Priority:** Must-Pass

**Input scenario:**
```
All providers return null (mocked for this test)
```

**Expected output:**
Clean error state returned. No partial verdict. No empty signal cards. No AI calls attempted.
Error message consistent with Spec §11.3.

**Pass condition:** Error state returned, no analysis fields populated, no AI calls made.

**Fail condition:** Partial analysis generated with default/empty values, or uncaught exception.

---

#### AT-E2E-003: Three analyses with different verdict outcomes produce correct behavior

**Purpose:** Verify that the three different verdict types each produce the correct first-screen behavior.  
**Law / Spec:** Spec §5.3, §6.2, §7.1  
**Type:** Integration + Manual  
**Priority:** Standard

**Input scenario:**
```
Three queries chosen to produce each verdict type:
A: ENTRY_SUPPORTED — well-validated market
B: VALIDATION_REQUIRED — mixed signals
C: ENTRY_NOT_SUPPORTED — clearly difficult market
(Actual queries selected after initial scoring runs confirm the verdict)
```

**Expected output:**
- A: Top 3 highest-scored signals on first screen, positive framing
- B: Mixed signal card selection (highest + two lowest)
- C: Three failure-condition signal cards

**Pass condition:** Each analysis produces the verdict-conditional signal selection.

**Fail condition:** All three analyses show the same signal cards regardless of verdict.

---

#### AT-E2E-004: Fallback triggers and is recorded in a real analysis run

**Purpose:** Verify that the fallback mechanism works end-to-end in a realistic scenario, not just in unit test conditions.  
**Law / Spec:** Law 15, Spec §12 Step 5  
**Type:** Integration  
**Priority:** Standard

**Input scenario:**
```
Override the AI model response for Call A (causal paragraph) to return a forbidden pattern string.
Run a complete analysis.
```

**Expected output:**
1. Validation Step 3 detects the pattern
2. Retry triggered
3. (For this test: configure retry to also fail)
4. Fallback template used
5. `causal_paragraph_is_fallback: true` in stored result
6. Fallback output rendered to client — not an error

**Pass condition:** All five conditions verified in the stored analysis record and rendered output.

**Fail condition:** Error returned to client, or fallback not recorded, or fallback not triggered.

---

#### AT-E2E-005: Manual qualitative review — three complete analyses

**Purpose:** Human review of three complete analysis outputs to assess whether the AI synthesis quality meets the standard of "specific, earned insight — not generic summarization."  
**Law / Spec:** Constitution Founding Assessment (execution risk of constraint-expressiveness tradeoff)  
**Type:** Manual  
**Priority:** Must-Pass before beta

**Input scenario:**
```
Three complete analyses on real queries. Reviewer reads the full first screen.
```

**Reviewer checklist (all must pass):**

For each analysis:
- [ ] The causal paragraph references numbers specific to this query (not generic category descriptions)
- [ ] The risk sentence names a specific value from the evidence (not "competition is intense")
- [ ] The product thesis headline describes a specific product gap (not "create a better version")
- [ ] The confidence badges make sense given the data quality
- [ ] The primary risk feels specific to this market, not boilerplate
- [ ] No sentence could apply unchanged to a different product in the same category

**Pass condition:** All six items pass for all three analyses.

**Fail condition:** Any item fails — triggers AI prompt refinement before beta.

**Trust risk if untested:** The platform is architecturally sound but experientially generic. Founders read one analysis, feel it could have been written for any product, and stop trusting the intelligence claim.

---

## Tests by Type — Implementation Guide

### Automated (can be written as unit/integration tests in CI)

| Count | Category |
|-------|----------|
| 22 | SynthesisInput contract, access boundaries, hallucination regexes |
| 8 | Verdict and confidence threshold tests |
| 12 | Risk taxonomy classification tests |
| 6 | Signal taxonomy and selection tests |
| 8 | Validation pipeline behavior tests |
| 6 | Evidence card structure tests |
| 4 | Missing/failure handling tests |
| 3 | Regression tests |
| **Total ~69** | Can be written as Jest/Vitest tests |

### Integration (require real or mocked provider calls)

| Count | Category |
|-------|----------|
| 8 | Full pipeline flow tests |
| 6 | Provider failure scenarios |
| 4 | Validation pipeline trigger tests |
| **Total ~18** | Require test environment with Supabase + mocked Anthropic |

### Manual (require human judgment)

| Count | Category |
|-------|----------|
| 6 | First-screen visual requirements |
| 4 | Progressive disclosure behavior |
| 3 | Auditability review |
| 3 | End-to-end qualitative review |
| **Total ~16** | Require a browser and a reviewer who did not write the code |

---

## Edge Cases Most Likely to Break Trust

These scenarios are the highest-priority edge cases. Each one has been identified as a specific failure mode that would cause a founder to distrust the platform after a single encounter.

**1. The "clean BUILD with no consumer data" failure**
corpus_size < 20, but four other signals are CONFIRMED. The platform produces an ENTRY_SUPPORTED verdict with HIGH confidence. A founder commits to a product concept that no consumer has validated.
→ Protected by: AT-CONF-004, AT-CONF-005, AT-MISS-004

**2. The "generic risk" failure**
Primary risk sentence contains no specific number — "Competition is strong in this category." Founder recognizes it as boilerplate, loses trust in all platform outputs.
→ Protected by: AT-RISK-005, AT-E2E-005

**3. The "silent redistribution" failure**
Three signals fail (manufacturing, SERP, keywords). Overall score computed from 4 remaining signals with redistributed weights. Verdict appears to be based on comprehensive analysis. Founder never knows 3 signals are missing.
→ Protected by: AT-SIG-003, AT-MISS-002, AT-MISS-005

**4. The "hallucinated regulatory warning" failure**
AI generates "FDA regulatory pressure is mounting in this category" when no regulatory signal exists in SynthesisInput. Founder spends weeks on legal research.
→ Protected by: AT-ACCESS-002, AT-HALL-002, AT-VAL-001

**5. The "threshold boundary flip" failure**
A product scores 64.9 on one run and 65.1 on another due to floating-point handling. Founder sees different verdicts on consecutive runs without any change in data.
→ Protected by: AT-VERDICT-002, AT-CONTRACT-004

**6. The "confident partial analysis" failure**
Two providers fail but the analysis proceeds. Verdict is ENTRY_SUPPORTED at 78/100. But the 78 was computed from 5 signals, not 7, with weights redistributed. The confidence qualifier is not shown because the remaining 5 signals are all CONFIRMED.
→ Protected by: AT-CONF-005 (thin_corpus check), AT-MISS-001 (demand provider failure is fatal)

**7. The "specific-sounding but ungrounded product thesis" failure**
Product thesis says "consumers specifically cite issues with the magnesium-to-glycine ratio in competing products" when consumer_clusters[0].label is simply "effectiveness." The AI used general supplement knowledge to make the thesis sound specific.
→ Protected by: AT-VAL-005, AT-HALL-002, AT-E2E-005

---

## Definition of Done — Product Intelligence v1.0

The system is ready for beta deployment when all of the following conditions are satisfied. This is not a checklist to be reviewed once and filed — it is the final gate.

### Gate 1: All Automated Tests Pass

- [ ] All 69+ automated tests pass in CI with zero failures
- [ ] All tests have been run against the production build (not just development mode)
- [ ] `npx tsc --noEmit` returns zero errors
- [ ] Import graph analysis confirms no provider imports in the AI Interpretation Layer module

### Gate 2: All Integration Tests Pass

- [ ] Full pipeline integration test completes on the "magnesium glycinate" baseline query (AT-E2E-001)
- [ ] Complete provider failure returns clean error state (AT-E2E-002)
- [ ] Fallback mechanism triggers and records correctly (AT-E2E-004)
- [ ] All three verdict types produce correct signal card selection (AT-E2E-003)

### Gate 3: All Manual Tests Pass

- [ ] First screen renders exactly six elements with correct hierarchy (AT-UI-001)
- [ ] Primary risk has equal visual weight to verdict (AT-UI-002) — reviewed by someone who did not write the UI code
- [ ] All three signal cards show confidence badges with correct visual differentiation (AT-UI-005)
- [ ] Progressive disclosure behavior confirmed in browser (AT-DISC-001 through AT-DISC-003)
- [ ] No first-screen claim lacks a Layer 2 evidence card — reviewed manually (AT-AUDIT-002)

### Gate 4: Qualitative AI Output Review

- [ ] Three complete analyses reviewed for specificity and evidence grounding (AT-E2E-005)
- [ ] All six qualitative checklist items pass for all three analyses
- [ ] Reviewer is not the person who wrote the AI prompts

### Gate 5: Trust-Critical Verification

- [ ] The validation pipeline has demonstrably triggered at least once in an integration test and used the fallback
- [ ] `is_fallback` logging is confirmed working in the stored analysis record
- [ ] Scoring engine version is present in every stored analysis record
- [ ] Revenue pattern regex test covers all seven documented variants (AT-HALL-001)
- [ ] Confidence qualifier is confirmed displaying on at least one test analysis with LOW confidence

### Gate 6: Regression Confirmation

- [ ] `scripts/validate_v230.ts` passes with zero scoring differences (AT-REG-001)
- [ ] No existing functionality from pre-AI-layer codebase is broken
- [ ] Manufacturing cache behavior confirmed identical to live call (AT-REG-002)

### Gate 7: Non-Goal Audit

- [ ] Manual review confirms no revenue figure appears in any rendered UI element, including debug output, hover states, or tooltips
- [ ] Manual review confirms no ROI, probability, or personal directive language appears in any rendered output
- [ ] Manual review confirms the verdict display text matches exactly the three approved strings

---

*This document is complete when all 25 test categories have at least one test, all seven Definition of Done gates are specified, and all tests reference a specific Constitution law or Technical Specification section. It is current as of v1.0.0 of the TECHNICAL_SPEC_V1.md. If the spec changes, this document updates in the same PR.*
