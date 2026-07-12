# PRODUCT INTELLIGENCE ENGINE — V2 BLUEPRINT

**Status:** ADOPTED — official long-term blueprint and source of truth for all future development decisions.
**Adopted:** 2026-07-10
**Authority:** This document may not be simplified, reinterpreted, or replaced with a different architecture without explicit owner approval. It sits alongside CONSTITUTION.md and TECHNICAL_SPEC_V1.md; where V2 direction and V1 documents conflict, this blueprint governs future work while V1 documents continue to describe the current implementation.
**Companion document:** `PRODUCT_INTELLIGENCE_V2_ROADMAP.md` (execution checklist with milestones, dependencies, acceptance criteria).

**Design doctrine:** Evolve, don't rebuild. The provider → signal → decision → synthesis layering, the evidence-gating philosophy, and the Keepa exploitation layer are correct and stay. What changes is the *question* the engine answers, the *shape* of the decision layer, and the addition of the two layers the current system lacks entirely: **time** and **memory**.

---

## 1. The Core Question

The V1 engine answers: *"How attractive is this market?"*

The V2 engine answers:

> **"Is there an open entry window in this market — how wide is it, how long will it stay open, and what specifically would win it?"**

This decomposes into four sub-questions, which become the four scoring pillars (§2), plus one meta-question that sits above all four: **Where is this market in its lifecycle?** (§3). The verdict is no longer a scalar score with a label — it is a **position on a lifecycle curve plus an entry thesis**.

Rationale: market attractiveness does not predict entrant success — *timing* does. Attractive-today markets are attractive to everyone today; a snapshot engine systematically routes users into red oceans with good fundamentals. The thing that actually predicts a winning product launch is how fast demand is diverging from supply, measured before Amazon reflects it.

---

## 2. The Four Scoring Pillars

| Pillar | Weight prior | Question it answers |
|---|---|---|
| **Demand Reality** | 30 | Is demand real, and is it accelerating or decelerating — measured across independent channels? |
| **Supply Response** | 25 | Has competition responded yet, and how fast is it responding *right now*? |
| **Entry Economics** | 25 | Can a new entrant profitably serve this demand at the current fee/price structure? |
| **Differentiation Opening** | 20 | Is there a specific, evidenced angle (unmet need, formulation gap, science story) a newcomer can own? |

Weight priors are versioned opinions until the Verdict Ledger (§11) produces outcome labels; they are then re-fitted from data (§12). The heuristic weights remain the fallback.

### Pillar inputs

**Pillar 1 — Demand Reality (30)**
- Amazon units level + YoY growth + 3-month momentum (Keepa `monthlySoldHistory` — built)
- Search volume level + slope + acceleration (DataForSEO time series)
- Social / TikTok Shop demand where available
- Science momentum (publication velocity) as an *early-demand* proxy
- Gate: the pillar cannot exceed "moderate" on one channel alone

**Pillar 2 — Supply Response (25)** — mostly new signals, mostly from data already collected
- New-listing velocity: share of the competitive set with `listedSince` < 12/24 months, and its trend
- Trademark filing velocity in the niche (USPTO)
- Review-moat depth (median review count of incumbents — exists)
- Price compression trend (exists), seller-count trend (exists)
- Amazon direct presence: buy-box share + OOS% (built — these move here)

**Pillar 3 — Entry Economics (25)**
- Fee burden, margin, realistic price (exists — the strongest current pillar; unchanged)
- Market accessibility composite (review velocity ratio, keyword difficulty — exists)
- Paid-media viability: Meta ad density as CAC proxy

**Pillar 4 — Differentiation Opening (20)**
- Consumer pain clusters with frequency and severity (exists)
- Unserved-claim gap: pains mentioned in reviews that no top-10 competitor's bullets address (uses the bullets/ingredients competitor enrichment already shipped)
- Science angle availability: emerging evidence not yet reflected in incumbent positioning

**Meta-layer — Lifecycle stage.** Not weighted; it *gates and reframes* the verdict (§7–8).
**Override — Safety gate.** Stays exactly as designed in V1: deterministic, never additive.

---

## 3. The Lifecycle Stages

Every analyzed market is classified into one of six stages. The stage classifier reads the **signature of channel disagreement** — divergence across channels is not noise, it is the highest-value information in the system:

| Stage | Science | Search | Social/Ads | Amazon demand | Supply velocity | Meaning |
|---|---|---|---|---|---|---|
| **Latent** | ↑ | flat | quiet | absent | none | Problem exists, product doesn't |
| **Emerging** | ↑ | ↑↑ (accelerating) | igniting | small/absent | low | Demand forming ahead of supply |
| **Window Open** | — | ↑ | ↑ | ↑, thin moats | rising but lagging | *The* entry moment |
| **Contested** | — | ↑ flattening | peaking | ↑↑ | ↑↑ (listings surge) | Window closing; only differentiated entries |
| **Saturated** | — | flat | fading | high, flat | high, price compression | Red ocean with good fundamentals |
| **Declining** | — | ↓ | gone | ↓ | exits | Avoid |

"Hot on TikTok, cold on Amazon" is not a data-quality problem; it is the definition of Emerging.

---

## 4. The Eleven-Stage Pipeline

```
ACQUIRE → NORMALIZE → COMPUTE SIGNALS → CROSS-VALIDATE → CLASSIFY LIFECYCLE
   → SCORE PILLARS → DECIDE → SYNTHESIZE → REPORT → SNAPSHOT → RE-MEASURE
                                                          ↑___________|
                                                       (learning loop)
```

1. **Acquire.** Providers fire in parallel with per-provider timeouts and honest nulls (current behavior, unchanged). Two tiers: *fast tier* (Keepa, DataForSEO time series, cached science/trademark data — sub-10s) and *slow tier* (Apify reviews, TikTok, Meta Ads — up to 60s). The fast tier alone can produce a preliminary lifecycle read; the slow tier upgrades it.
2. **Normalize.** Every provider output becomes a typed signal with: value, sample size, timestamp, provider ID, and a **channel tag** (`amazon-market`, `search-intent`, `social-attention`, `paid-media`, `science`, `supply-side`, `consumer-voice`). Channel tags are what the independence math consumes.
3. **Compute Signals.** The current computation layer, plus first and second derivatives wherever a time series exists. Every level metric gains a velocity twin (`search_volume_slope_12m`, `sold_growth_yoy` — already built, `ad_count_delta_90d`).
4. **Cross-Validate.** Each demand channel emits a directional read: `accelerating / stable / decelerating / absent`. The engine builds a **concordance matrix** across channels. Agreement raises confidence; *patterned disagreement routes to lifecycle classification*.
5. **Classify Lifecycle.** Maps the concordance pattern + supply velocity onto one of the six stages (§3).
6. **Score Pillars.** Four pillar scores (0–10), evidence-gated exactly as today, with weight redistribution when a pillar has no verified evidence.
7. **Decide.** Verdict = f(pillar scores, lifecycle stage, safety gate). Two-axis, not one (§7–8).
8. **Synthesize.** The AI writing layer, unchanged in role: it narrates evidence, it never generates evidence.
9. **Report.** The Investor Report (§13).
10. **Snapshot.** Every analysis writes an immutable **Verdict Ledger** row (§11). The single most important new component in the system.
11. **Re-measure.** A scheduled job re-pulls the fast tier for every ledgered niche and records what actually happened (§12). Outcome labels feed calibration.

---

## 5. The Provider Strategy

### Mandatory providers (six channels — that is the point; V1 has effectively one channel with satellites)

| Provider | Channel | Role |
|---|---|---|
| **Keepa** | amazon-market + supply-side | Ground truth for Amazon economics, demand levels, growth (`monthlySoldHistory`), and — repurposed — supply velocity via the `listedSince` distribution |
| **DataForSEO (time series)** | search-intent | Demand acceleration: 12–48 month volume series, slope and second derivative per term cluster |
| **Apify reviews** | consumer-voice | Differentiation pillar: pain clusters, unmet needs, repurchase context |
| **Meta Ads Library** | paid-media | Revealed economic preference: sustained ad spend on a niche means someone's unit economics work. Free. The cheapest mandatory upgrade in the whole design |
| **PubMed** | science | Leading indicator native to the vertical: publication velocity per ingredient. Free |
| **ClinicalTrials.gov** | science | Trial registrations per ingredient/condition. Free |
| **USPTO trademarks** | supply-side | Smart-money entry detector: filing velocity in a niche class. Free |

### Optional providers (fire when available, never block)

- **TikTok Shop / Kalodata** (social-attention → transaction) — add when budget allows; upgrades TikTok from attention proxy to GMV fact
- **TikTok hashtags** — corroboration
- **Reddit** — repointed to scheduled problem-cluster mining, not per-query virality
- **Google Trends** — corroboration only, never a pillar input (rate-limit fragility, relative units)
- **Alibaba (Apify)** — report enrichment only (supplier lists in the memo)
- **ImportGenius / Panjiva** (supply-side) — Phase 3; real supply foresight, real cost
- **Storeleads** — DTC storefront visibility, Phase 3+
- **Similarweb** — institutional-stage DTC traffic; not before Phase 3

---

## 6. Provider and Signal Changes (binding decisions)

- **Keep Keepa as the Amazon ground-truth layer** — best-in-class for that job; it is a floor, not the foundation.
- **Add channel tags** to every signal; independence math operates on channels.
- **Confidence must be based on independent channels, not signal count.**
- **Ten Keepa-derived metrics count as one witness.** Signals sharing a channel tag count once, at their max reliability.
- **Top verdicts require at least two independent demand channels** confirming demand direction. One-witness verdicts cap at the "investigate" tier regardless of score.
- **Remove manufacturing feasibility from scoring.** Nearly every supplement is manufacturable; a signal with near-zero variance carries near-zero information.
- **Remove seasonality from scoring.** Seasonality is a planning parameter, not a quality dimension. The improved history-based computation survives — its output informs, it does not score.
- **Remove AI judgment from weighted scoring.** When providers return null, redistribute the weight; never let an LLM's qualitative guess occupy a weighted seat.
- **Keep seasonality, manufacturing, supplier data, and repurchase data as report enrichment only.**
- **Delete the Amazon Ads stub.**
- **Repurpose Reddit toward problem-cluster discovery** (scheduled pipeline; productizes what VOC research proved manually).
- **Demote Google Trends to corroboration only.**

Rule of thumb: **if a signal returns roughly the same answer for every query in the vertical, it informs the reader and must not move the score.**

---

## 7. The Two-Axis Decision Model

The verdict is produced from two axes that are never blended into each other:

- **Axis 1 — Opportunity Quality (0–100):** weighted pillar blend, evidence-gated, weight-redistributing on missing pillars. Mechanically an evolution of the existing `computeGroundedScore`, not a rewrite.
- **Axis 2 — Timing (lifecycle stage + gap velocity):** never blended into the quality score. Blending timing into quality is exactly the mistake that makes saturated-but-healthy markets outscore emerging ones.

---

## 8. The Verdict Matrix

| | Emerging | Window Open | Contested | Saturated |
|---|---|---|---|---|
| **High quality** | WATCH_CLOSELY (early; set alert) | **BUILD_NOW** | BUILD_IF_DIFFERENTIATED | AVOID (red ocean) |
| **Mid quality** | WATCH | INVESTIGATE | AVOID | AVOID |
| **Low quality** | PASS | PASS | PASS | PASS |

(Latent and Declining stages resolve to WATCH/PASS and AVOID/PASS respectively.)

**BUILD_NOW additionally requires:** ≥2 independent demand channels confirming, Entry Economics pillar verified (not qualitative), and safety gate clear.

**WATCH_CLOSELY is a new verdict class and a new product surface** — it turns the platform from a one-shot query tool into a monitoring subscription, which is both the correct intelligence product and the correct business model.

Verdict vocabulary: `BUILD_NOW`, `BUILD_IF_DIFFERENTIATED`, `WATCH_CLOSELY`, `WATCH`, `INVESTIGATE`, `AVOID`, `PASS`.

---

## 9. The Demand–Supply Gap Velocity Model

The window metric:

```
gap_velocity = demand_acceleration (cross-channel composite)
             − supply_acceleration (new-listing velocity + trademark velocity)
```

- **Positive and rising** → window opening.
- **Positive but shrinking** → window closing; the report estimates urgency.
- **Negative** → the wave of competition is already on the water regardless of how attractive levels look.

Window-duration estimates start as honest heuristic bands ("niches with this profile historically stayed open 6–18 months") and become empirical once the Verdict Ledger has cohorts — which is the second reason (after calibration) the ledger must start immediately.

---

## 10. The Independence-Aware Confidence Model

Three multiplicative components per pillar:

1. **Sample sufficiency** — does each contributing signal meet its minimum n? (exists in V1; keep)
2. **Source reliability** — a per-provider prior (Keepa units ≈ 0.9, hashtag views ≈ 0.4), versioned, and eventually *updated from the ledger* (which providers' signals actually predicted outcomes).
3. **Channel independence** — the new core. Count **effective independent channels** confirming the pillar's direction. Signals sharing a channel tag count once, at their max reliability, no matter how many there are.

Pillar confidence ≈ `1 − Π(1 − rᵢ)` computed **across channels, not across signals**.

**Weakest-link composite:** verdict confidence is weakest-link-weighted, not averaged — a verdict is only as confident as its least-evidenced load-bearing pillar.

Cross-source confirmation surfaces as the **concordance matrix**: every demand channel's directional read, side by side, shown to the user — "Amazon ↑, Search ↑↑, Social ↑, Ads ↑" is itself the most persuasive artifact in the report. Divergent channels don't average away — they route to lifecycle classification.

---

## 11. The Verdict Ledger

An append-only, immutable record. The just-shipped BUILD_NOW Pattern Memory is the embryo; expand its schema rather than building parallel infrastructure.

**Every analysis freezes:**
- Full raw signal set (all provider outputs, channel-tagged)
- Pillar scores and Opportunity Quality
- Lifecycle stage and gap velocity
- Verdict and confidence (with channel count)
- Engine version
- Date

**Quarterly re-measurement per ledgered niche** (fast tier only, ~70 Keepa tokens):
- New-entrant count and their review traction at 3/6/12 months
- Price movement
- Incumbent share shift

**Outcome label:** "Did a new entrant launched near the verdict date achieve meaningful traction?" — measurable entirely from Keepa (`listedSince` + review accrual of newcomers). The market scores the engine; no user sales data required.

**Future calibration** flows from the ledger (§12). The ledger is the moat: everything else in the stack is commodity data any competitor can license next quarter; a longitudinal record of scored predictions versus realized market results compounds monthly and cannot be replicated without living through the same years.

---

## 12. The Memory and Learning Loop

1. **Save every verdict** (full snapshot, §11).
2. **Re-measure at 3, 6, and 12 months** where appropriate (quarterly worker).
3. **Track new-entrant traction** (Keepa `listedSince` + review accrual of newcomers).
4. **Track price movement** in the niche.
5. **Track listing velocity** (supply response after the call).
6. **Track review accrual** across the competitive set.
7. **Compare predictions to real outcomes** — calibration curves: "when we said Window Open, a window existed X% of the time."
8. **Recalibrate provider reliability priors and pillar weights over time** — annual, versioned refits from ledger data; heuristic weights remain the fallback. Eventually: the analog engine — signature matching against historical cohorts ("this niche resembles ashwagandha Q2-2019 at month 7 of its window").

Uses arrive in order: (1) honest track-record reporting; (2) calibration curves; (3) weight/reliability refits; (4) the analog engine.

---

## 13. The Investor Report Structure

1. **Verdict block** — matrix cell, lifecycle stage, window status, estimated urgency, confidence with *channel count shown* ("confirmed by 3 independent channels")
2. **The thesis** — three sentences: what's happening, why the window exists, what wins it
3. **Demand concordance matrix** — per-channel scorecard with the actual numbers
4. **Supply response** — new-listing velocity chart, trademark filings, moat depth, price trend
5. **Entry economics** — the existing fee/margin/price table (already strong)
6. **Differentiation brief** — top pain clusters with verbatim quotes, the unserved-claim gap, science angle
7. **Risk & timing** — what closes the window, safety gate result, seasonality as a planning note
8. **Kill criteria** — "what would change our mind": 3–4 falsifiable conditions ("if new-listing velocity exceeds X," "if search slope turns negative for 2 quarters"). This separates an intelligence memo from content marketing and wires each report into the monitoring loop.
9. **Track-record footer** (once the ledger matures): calibration stats for this verdict class.

---

## 14. The User Experience

1. **Query → 10-second preliminary read** from the fast tier: lifecycle stage, gap direction, top-line demand. Progressive disclosure — don't hold the verdict hostage to the 60s slow tier.
2. **Full analysis** (~60–90s) → complete report with concordance matrix and thesis.
3. **One-click Watch** → the niche joins the monitoring set; the user is alerted on **stage transitions** ("moved Emerging → Window Open") and **kill-criteria triggers**.
4. **Lifecycle pipeline view** → the leaderboard evolves into a pipeline: watched niches arranged by lifecycle stage — a market-timing kanban.
5. **Quarterly re-scores** arrive automatically for watched niches.

The retention loop falls out naturally: windows are temporal, so the product's core value recurs by definition.

---

## 15. Architecture Classification

| Component | Classification | Why |
|---|---|---|
| Provider framework (parallel fetch, timeouts, null discipline, registry) | **KEEP AS-IS** | Correct design; add channel tags only |
| Keepa provider (incl. all Sprint 1–3 work) | **KEEP WITH MINOR IMPROVEMENTS** | Best component in the system. One addition: emit the `listedSince` *distribution* (new-listing velocity), not just the median — the data is already fetched |
| DataForSEO provider | **KEEP WITH MINOR IMPROVEMENTS** | Add historical volume series + slope/acceleration; same provider, one more endpoint |
| Apify review corpus + consumer-pain pipeline | **KEEP AS-IS** | Real differentiation; feeds Pillar 4 unchanged |
| TikTok provider | **KEEP WITH MINOR IMPROVEMENTS** | Honest nulls already; upgrade path to Shop/GMV data later |
| Reddit provider | **REDESIGN (repoint)** | From per-query virality to scheduled problem-cluster mining — the code largely survives, the job changes |
| Google Trends provider | **KEEP WITH MINOR IMPROVEMENTS** | Demote to corroboration; never load-bearing |
| Meta Ads provider | **REDESIGN (from stub to real)** | Free, high-value, channel-diversifying; the single cheapest upgrade available |
| Amazon Ads stub | **REMOVE** | Dead weight |
| Apify Alibaba / manufacturing score | **REDESIGN (demote)** | Data → report enrichment; weight → removed (no variance, no information) |
| Seasonality scoring | **REDESIGN (demote)** | Computation survives (the history-based version is good); output moves to report-only |
| Decision Engine core (evidence gating, weight redistribution, qualitative labeling, SKIP protection) | **KEEP WITH MINOR IMPROVEMENTS** | The *mechanics* are exactly right; they get reorganized from 7 dimensions into 4 pillars — an evolution of `computeGroundedScore`, not a rewrite |
| 7-dimension weight structure | **REDESIGN** | → 4 pillars + lifecycle meta-layer + verdict matrix |
| Confidence arithmetic | **REDESIGN** | Must become independence-aware; current math overstates certainty from correlated Keepa-derived facts |
| Thin-corpus cross-validation logic | **KEEP + PROMOTE** | The embryo of the concordance system — generalize it |
| Safety gate | **KEEP AS-IS** | Deterministic override, never additive — exactly right |
| AI writing layer + output validator | **KEEP AS-IS** | Correct role separation (narrate, never generate); survives the verdict-format change with template updates |
| Memo display / First Screen / verdict UI | **KEEP WITH MINOR IMPROVEMENTS** | Add concordance scorecard, lifecycle position, kill criteria |
| Leaderboard | **REDESIGN** | → lifecycle pipeline view (Watch kanban) |
| BUILD_NOW Pattern Memory | **KEEP + EXPAND** | Already append-only analytics — the seed of the Verdict Ledger; expand its schema rather than building parallel infrastructure |
| Review Engine (built, unwired) | **KEEP + WIRE** | Finished work generating zero value is the worst ROI state |
| Verdict Ledger + re-measurement worker | **ADD NEW** | The moat; nothing exists beyond the pattern-memory seed |
| Lifecycle classifier + gap velocity | **ADD NEW** | The correct question |
| PubMed/ClinicalTrials provider | **ADD NEW** | Free, leading, vertical-native, uncopied |
| USPTO trademark provider | **ADD NEW** | Free supply-side foresight |
| Watchlist + alerting | **ADD NEW** | The retention loop windows make inevitable |
| Billing | **ADD NEW** | A product with no way to be paid is a research project |

---

## 16. The Roadmap (summary — full execution checklist in PRODUCT_INTELLIGENCE_V2_ROADMAP.md)

### Phase 1 — Critical before beta ("start the clock + stop the lies")
*Priority: things that compound with calendar time, and things that would embarrass the beta.*
1. **Verdict Ledger v1** — expand BUILD_NOW Pattern Memory into full analysis snapshots. Ship first; every week of delay is moat not accruing.
2. **Independence-aware confidence + two-channel gate** on top verdicts.
3. **Scoring honesty pass** — remove manufacturing/seasonality weights, remove AI-judgment fallbacks from weighted seats (redistribute instead), delete the Amazon Ads stub.
4. **Wire Meta Ads Library** (real provider, new channel) and **DataForSEO time series** (first-derivative signals).
5. **Wire the Review Engine; add billing.**

### Phase 2 — Major improvements after beta ("answer the right question")
1. **Lifecycle classifier v1** + gap velocity + the verdict matrix — heuristic signatures initially, honestly labeled as such.
2. **PubMed/ClinicalTrials + USPTO pipelines** — nightly batch into a science/trademark cache the fast tier reads.
3. **Reddit problem-cluster pipeline** — scheduled, systematic.
4. **Watchlist, stage-transition alerts, kill-criteria monitoring.**
5. **Quarterly re-measurement worker** writing outcome labels into the ledger.

### Phase 3 — Long-term strategic advantages ("learn")
1. **Calibration reporting** — publish window-call accuracy; first refit of pillar weights and provider reliability priors from ledger data.
2. **Entrant cohort analysis** — "products launched into our Window Open calls achieved X."
3. **The analog engine** — signature matching against historical cohorts.
4. **TikTok Shop (Kalodata) and import records (Panjiva)** — paid providers, justified by revenue.
5. **Adjacent-vertical expansion** (pet supplements → personal care) reusing the pillar/lifecycle machinery with vertical-specific science layers.

### Phase 4 — Institutional-grade platform ("Bloomberg")
1. **Track record as product** — auditable, versioned prediction history with calibration curves.
2. **API + data feed** for PE/CPG innovation teams; the Investor Report becomes literally that.
3. **Multi-vertical lifecycle database** — labeled market-lifecycle histories nobody else recorded: the proprietary asset.
4. **Panel partnerships** (transaction data, retail availability) once institutional pricing supports them.

---

## 17. The Non-Rebuild Principle

- **Preserve the existing provider → signal → decision → synthesis architecture.** It is correct.
- **Keep approximately 60% of the codebase as-is.**
- **Redesign approximately 25% in place.**
- **Add approximately 15% new capability.**
- **Do not perform a full rebuild.** No component may be rewritten from scratch when an in-place evolution reaches the same destination.

The current platform is roughly the bottom two-thirds of the ideal architecture, already built well: acquisition, signal computation, evidence-gated decisioning, and synthesis are sound and survive nearly intact. What's missing is the top third — validation-across-channels, time, and memory — and none of it requires touching what exists; it layers on top and in between.

---

## NON-NEGOTIABLE DESIGN PRINCIPLES

These principles bind all future development. A change that violates one of them requires explicit owner approval before implementation.

1. **Truth over confidence.** The engine reports what it knows and how well it knows it; it never manufactures certainty.
2. **Evidence over assumptions.** Verdicts derive from verified signals; assumptions are labeled as such and never occupy evidence slots.
3. **AI narrates evidence but never invents evidence.** The writing layer synthesizes and explains; it does not generate facts, numbers, or signals.
4. **Deterministic calculations remain deterministic.** Scores, gates, and thresholds are reproducible functions of their inputs — never model-sampled.
5. **Missing data must remain visibly missing.** Providers return null rather than estimates; the UI and reports show gaps rather than papering over them.
6. **Correlated signals must not create false confidence.** Confidence counts independent channels, not signal count. Ten Keepa-derived metrics are one witness.
7. **Timing must remain separate from market quality.** The two axes are never blended into a single scalar; a saturated market with great fundamentals must not outscore an emerging one by averaging.
8. **No BUILD_NOW without independent confirmation.** The top verdict tier requires at least two independent demand channels, verified entry economics, and a clear safety gate.
9. **The system must learn from its own past predictions.** Every verdict is ledgered, re-measured, and scored against reality; calibration flows back into weights and reliability priors.
10. **Preserve working infrastructure and avoid unnecessary rewrites.** Evolve in place; a rebuild requires proof that in-place evolution cannot reach the destination.
