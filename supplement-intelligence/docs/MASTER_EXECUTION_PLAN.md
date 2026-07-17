---
Title: Master Execution Plan
Version: 1.10
Status: Approved
Last Updated: 2026-07-17
Supersedes:
  - Commerce Intelligence Strategy
  - Roadmap Integration Plan
  - Supplements-First Master Plan
Amendment Log:
  - "v1.1 (2026-07-13): Adopted the Complex Engine, Simple Experience execution philosophy as company-wide, non-negotiable UX doctrine (§12). Added the Analyst Experience Consolidation milestone (M2.23). Declared the roadmap frozen for execution — no further strategic pivots without new evidence from real users or real data (§13)."
  - "v1.2 (2026-07-14): M2.10 and M2.11 shipped (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for full completion write-ups). Added a mandatory Research & Design gate to the execution discipline (§13): every milestone must produce and get explicit approval on an R&D document — architecture reuse, exact files touched, risks, and why the proposed scope is the smallest correct implementation — before any code is written."
  - "v1.3 (2026-07-14): M2.12 and M2.23 shipped (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for full completion write-ups). M2.23's R&D pass found the real codebase has four verdict vocabularies, not the two this plan originally assumed, and that the 'FirstScreen' component §12 referenced no longer exists — M2.23 was narrowed at implementation time to the one confirmed violation (components/memo/CurrentSignal.tsx) rather than the full front-door/vocabulary unification originally described; that larger scope remains open, unassigned, for a future milestone."
  - "v1.4 (2026-07-14): M2.13 shipped (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). Re-sourced the weekly VOC pipeline from Reddit onto YouTube comments + DataForSEO problem-aware keywords, both real production data sources; Amazon Q&A (also named in the original scope) deferred — no existing pattern to reuse, needs its own vetting pass first. Requires a new YOUTUBE_API_KEY to be provisioned in production before this pipeline produces real data live; code is fully built and tested against mocks in the meantime."
  - "v1.5 (2026-07-14): M2.14 shipped as a build+validate phase, deliberately not a cutover (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). New DataForSeoTrendsProvider built, registered disabled by default, live-validated with the feature briefly enabled (real cost confirmed: ~$0.011/call), then disabled again per explicit instruction. google-trends.ts remains the sole live search_intent Trends source; making the new provider the default is an explicit, separate future decision, not bundled into this milestone."
  - "v1.6 (2026-07-14): M2.15 shipped — the first Evidence Depth Cluster milestone (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). New lib/ingredient-registry/ with real alias/canonical-search-term profiles for the 3 tracked ingredients, wired into science-engine/pipeline.ts's real PubMed/ClinicalTrials.gov calls. Narrowed at the R&D stage from 'aggregate demand across every product variant' to just the registry foundation, since no real consumer for that aggregation exists anywhere in the codebase yet. Live-validated via a real science-pipeline cron trigger, zero regression."
  - "v1.7 (2026-07-14): M2.16 shipped — the second Evidence Depth Cluster milestone (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). Extended the science pipeline with real PubMed pubtype[] classification (strongest study type across a bounded sample, reusing existing lib/news-engine/providers/pubmed.ts logic) and real ClinicalTrials.gov studyType/phases breakdown. First deploy's live validation surfaced and fixed two real defects a mocked test suite couldn't catch: a broken EUTILS_BASE reference that silently 404'd the pre-existing publication-count fetcher, and a fictitious ClinicalTrials.gov field path that 400'd. Re-validated clean after the fix, zero regression to the existing publication_counts_by_year/trial_registrations_count fields."
  - "v1.8 (2026-07-15): M2.17 shipped — the third Evidence Depth Cluster milestone (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). Added a real, observed market-dosing signal (median/min/max mg, real sample size) sourced from NIH's Dietary Supplement Label Database (DSLD), reusing the M2.15 ingredient registry for real displayName/alias row-matching. Narrowed at the R&D stage from 'dose-adequacy analysis against clinical literature' to real market dosing for all 3 ingredients plus a real, cited RDA-range comparison for magnesium only — no honest clinically-effective-dose benchmark exists for creatine or berberine. Live-validated via a real science-pipeline cron trigger, zero regression."
  - "v1.9 (2026-07-17): M2.18 shipped — the fourth Evidence Depth Cluster milestone (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). Wired the existing, already-live lib/regulatory-engine (real openFDA CAERS adverse events + enforcement recalls) into the nightly science pipeline for the 3 tracked ingredients — zero new fetch logic, pure reuse. Narrowed at the R&D stage, confirmed directly with the owner, from 'interaction/safety' to safety only: NLM's real drug-interaction API was discontinued 2024-01 and DailyMed has no full-text search, so no honest structured interaction-checking source exists. Data is explicitly documented and treated everywhere as a regulatory/safety signal only, never medical advice, clinical proof, causation, or a definitive safety conclusion — per the owner's explicit requirement. Live-validated via a real science-pipeline cron trigger, zero regression."
  - "v1.10 (2026-07-17): M2.19 shipped — the fifth Evidence Depth Cluster milestone (see docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md for the full completion write-up). Added a deterministic DSHEA claim-risk language scanner (named-disease + treatment-verb co-occurrence, sourced directly from real, live-fetched 21 CFR 101.93 text and FDA's Small Entity Compliance Guide) applied to real competitor marketing copy already fetched by the Keepa/Apify providers, surfaced as a new, purely additive field on top_competitors[]. Narrowed at the R&D stage from the milestone's headline scope after an architecture-agent fork was confirmed directly with the owner: the nightly ingredient-only ScienceSignal pipeline that M2.15–M2.18 all extended has no real marketing copy to check (bare ingredient-name strings only), so this milestone targets the one place real, checkable copy actually exists — the on-demand competitor-listing path — instead. Zero changes to scoring, verdict logic, the existing separate AI-driven FDA_CLEARANCE_REQUIRED kill switch, AI interpretation, or UI. Live-validated against real Keepa data with both a true-positive and true-negative example, zero regression."
---

> **This document is the single source of truth for execution. In the event of any conflict with older planning documents, this document takes precedence unless explicitly superseded.**

# Master Execution Plan

*One engine, three layers, one category, until we've earned the right to a second.*

This is the execution source of truth. It consolidates the Commerce Intelligence redesign, the Supplements-First pivot, and the TikTok/Discovery challenge into one plan, and adds the one new first-class subsystem that discussion surfaced: a Discovery Intelligence Engine that finds opportunities before a founder thinks to ask about them.

**Supersedes:** Commerce Intelligence Strategy · Roadmap Integration Plan · Supplements-First Master Plan. Where milestone numbers conflict across those documents, this document's numbering is authoritative. The V2 Blueprint and its ten non-negotiable design principles remain locked and unmodified by anything below.

| | |
|---|---|
| **Vision — fixed** | Bloomberg Terminal for Consumer Products. Category-agnostic architecture, forever. |
| **Execution — Supplements First** | Every hour, dollar, and roadmap slot optimizes for the best Supplement Intelligence platform in the world, until Stage 1 (§9) objectively clears. |

**Contents**

1. [The operating model: Discovery, Commerce, Evidence](#1-the-operating-model-discovery-commerce-evidence)
2. [Discovery Intelligence Engine — full design](#2-discovery-intelligence-engine--full-design)
3. [Decision Engine: what changes, what doesn't](#3-decision-engine-what-changes-what-doesnt)
4. [Unified roadmap (supersedes prior numbering)](#4-unified-roadmap-supersedes-prior-numbering)
5. [Supplement-specific moat (recap)](#5-supplement-specific-moat-recap)
6. [Data provider priority (recap, unchanged)](#6-data-provider-priority-recap-unchanged)
7. [Calibration: two loops, not one](#7-calibration-two-loops-not-one)
8. [Benchmark strategy (recap, unchanged)](#8-benchmark-strategy-recap-unchanged)
9. [Stage gates (updated — one new Stage 1 criterion)](#9-stage-gates-updated--one-new-stage-1-criterion)
10. [What this document overturns — honestly, not diplomatically](#10-what-this-document-overturns--honestly-not-diplomatically)
11. [The 24-month roadmap](#11-the-24-month-roadmap)
12. [Execution philosophy: Complex Engine, Simple Experience](#12-execution-philosophy-complex-engine-simple-experience)
13. [Execution mode: the roadmap is now frozen](#13-execution-mode-the-roadmap-is-now-frozen)

---

## 1. The operating model: Discovery, Commerce, Evidence

Refined from the version proposed mid-discussion. These are not three separate pipelines with their own data sources — they are **three questions asked of the same shared signal collectors**. The correction that matters: Discovery isn't "the TikTok layer." Discovery is the *rate-of-change* question applied to sources that already exist for other purposes.

**`Discovery` — what's accelerating?**  **`Commerce` — what's actually selling?**  **`Evidence` — does it really work?**

| Layer | Sources | Answers |
|---|---|---|
| **Layer 1 — Discovery** | TikTok hashtag velocity (live), YouTube video velocity (planned), search-intent inflection, VOC cluster growth rate | What should we even look at? |
| **Layer 2 — Commerce** | Keepa, DataForSEO demand level, TikTok Shop GMV (bake-off gated) | Is real money already behind this? |
| **Layer 3 — Evidence** | Clinical literature, dosage adequacy, interaction/safety, regulatory risk, manufacturing credibility | Is it legitimate, safe, and differentiated enough to build? |

Concretely: the live TikTok provider and the planned YouTube provider each feed *two* layers at once — their **level** (raw video/view count, comment volume) is a Commerce/Evidence-adjacent VOC input; their **rate of change over time** is a Discovery input. Building two separate collectors for the same API would be waste. One collector, two readings taken from it.

---

## 2. Discovery Intelligence Engine — full design

The one new first-class subsystem. Its job: proactively surface accelerating candidates before a founder queries them, using signal sources that mostly already exist or are already planned — no new infrastructure category, no new vendor contract required for v1.

### Step 1 — Candidate Universe

The bounded set of things being watched for acceleration — not infinite. Seeded from: (a) existing benchmark/tracked ingredients, (b) emerging terms surfaced by VOC clustering that don't yet map to a canonical ingredient, (c) a periodic broad scan of trending wellness/supplement hashtags via the already-live TikTok API, generalized from single-lookup to category-scan, (d) YouTube trending terms in supplement-adjacent topics.

> Reuses: M2.13 VOC clustering output, live `tiktok.ts` provider

### Step 2 — Signal Collectors

No new providers for v1. TikTok hashtag video/view counts (live), YouTube video velocity/comments (planned, M2.13), search-intent trajectory (DataForSEO/Trends, existing + M2.14), VOC cluster size/velocity (M2.13's clustering, read as a growth-rate signal instead of just a ranked list).

> Zero new vendor cost — same accounts already contracted

### Step 3 — Velocity Store

The append-only `niche_timeseries` table (`niche_key, source, metric, value, observed_at`) — every collector above writes its observation here on its normal batch cadence. This table is now load-bearing infrastructure for Discovery, not just a long-term nice-to-have.

> Reuses M2.11 (renumbered from prior M2.12), moved earlier in sequence — see §4

### Step 4 — Velocity Detector

Pure statistics over `niche_timeseries`, no ML: percent-change of this week's value against a trailing baseline window, per candidate per source. Disclosed, versioned thresholds — same discipline as every other heuristic in this codebase (independence-aware confidence, divergence patterns). A v1 with a fixed absolute threshold ships immediately; a rolling-baseline version activates once ~3–4 weeks of real history exists in the store.

> Sibling design to M2.16's Divergence Detector — both are pattern detectors over stored time-series; worth a shared internal utility module rather than two bespoke implementations

### Step 5 — Cross-Source Confirmation

A candidate accelerating on exactly one source is weak (could be a meme reusing a hashtag, bot-inflated views, an unrelated trend). A candidate accelerating on 2+ independent channels — TikTok + YouTube, or TikTok + a growing VOC cluster — is strong. This reuses the **existing** independence-aware confidence model (M1.4) and concordance matrix (M2.1) applied to acceleration instead of level. No parallel confidence system is invented.

> Reuses M1.4 + M2.1 verbatim

### Step 6 — Signal Confidence / Hype Filter

Real-vs-hype is handled by three disclosed checks, not a black box: cross-source confirmation (step 5), a sustained-window requirement (a spike must still be elevated after a second observation window — a real limitation, disclosed rather than hidden: nothing can be confirmed on day one of a spike), and VOC corroboration (organic conversation growth, not just mechanical view counts).

> Honest limitation: minimum one full data cycle before any alert can be confirmed, not detected same-day

### Step 7 — Alert System

Crossing the velocity + confirmation threshold generates a Discovery Alert. Delivered through the already-shipped M2.8 watchlist/alerts infrastructure — no new notification system built.

> Reuses M2.8 verbatim

### Step 8 — Discovery Ledger (new, small, append-only)

`discovery_alerts(candidate_key, first_detected_at, sources_confirmed, velocity_score, status)` — same immutability discipline as the Verdict Ledger. This is what makes the engine calibratable later, not just a live feed with no memory.

> New table; append-only, mirrors verdict_ledger's trigger-enforced immutability pattern

### Step 9 — Handoff to the Decision Engine

A Discovery Alert is **not a verdict** and never produces one directly. It's an "investigate this" flag. When a candidate is formally analyzed — by a founder or, later, an automated nightly sweep — it flows through the unmodified Decision Engine: Commerce confirmation, Evidence Depth Cluster, concordance, confidence, verdict. Thin-evidence-but-real-momentum cases correctly land on the **existing** `CATEGORY_CREATION_CANDIDATE` verdict — no third verdict vocabulary is introduced.

> Zero changes to verdict architecture — see §3

### Step 10 — Calibration Integration

A new periodic worker (same shape as M2.9's re-measurement worker) checks, weeks after each alert, whether the candidate showed real subsequent Commerce confirmation and/or a positive formal verdict. Produces a Discovery precision metric — "of N alerts, M were later confirmed real" — additive to, not a replacement for, M3.1's verdict calibration.

> See §7 — dual calibration loop

**Honest cold-start disclosure:** the Engine's full value — proactive alerts on genuinely novel candidates — cannot exist until `niche_timeseries` has accumulated a real baseline (roughly 3–4 weeks). This is why §4's roadmap moves the time-series store to the very front of the sequence: every week it's delayed is a week added to the cold-start period, for free.

---

## 3. Decision Engine: what changes, what doesn't

**Doesn't change:** the verdict architecture, the two existing verdict vocabularies, the independence-aware confidence model, the concordance matrix, the append-only Verdict Ledger. All of it is load-bearing and locked.

**Changes:** the Decision Engine gains exactly one new input channel — a Discovery Alert, arriving as context, not as a scoring input. It can raise a candidate's investigation priority and label it "early signal, unconfirmed" in the UI, but it cannot by itself move a verdict to `BUILD_NOW`. Only Commerce-layer confirmation (real revenue) and Evidence-layer clearance (real safety/efficacy) can do that — Discovery only ever earns a candidate a look, never a verdict.

Supplement Depth Cluster capabilities (Evidence layer, §5) plug into the Decision Engine exactly as designed previously: deep, opinionated, hard-coded-where-it-helps logic *inside* the supplement category module, a generic contract preserved *at* the module boundary — so Stage 2 expansion is still a plug-in, not a rewrite.

---

## 4. Unified roadmap (supersedes prior numbering)

Shipped milestones (`M1.1`–`M1.7`, `M2.1`–`M2.9`, plus the 5 ad hoc UI integrations) are unchanged and not relisted here. Below is the authoritative numbering and order for everything proposed across all three prior strategy sessions, reconciled into one sequence. Layer tag shown for each.

| Order | Milestone | Layer | What changed from prior docs |
|---|---|---|---|
| 1 | `M2.10` Channel taxonomy extension | — | Unchanged, still first — everything downstream needs correct tagging |
| 2 | `M2.11` Niche time-series store | Discovery (backbone) | **Moved up** — was M2.12 in the last document; now second, because the Discovery Engine's cold-start clock only starts once this is live |
| 3 | `M2.12` Discovery Intelligence Engine v1 | Discovery | **New, this document.** The centerpiece addition — full design in §2 |
| 4 | `M2.13` VOC source diversification (YouTube, question keywords, Amazon Q&A) | Discovery + Evidence | Was M2.11; renumbered, unchanged scope. Its YouTube collector is explicitly shared with M2.12 |
| 5 | `M2.14` Google Trends → DataForSEO migration | Commerce | Was M2.13; renumbered, unchanged scope |
| 6 | `M2.15`–`M2.21` Evidence Depth Cluster (ingredient canonicalization, clinical evidence, dosage adequacy, interaction/safety, regulatory intelligence, manufacturing credibility, proprietary score) | Evidence | Was M2.15–M2.21; renumbering unchanged, content unchanged — still the moat, still runs after Discovery/VOC infrastructure lands |
| 7 | `M2.22` Divergence detector | Commerce/Evidence | Was M2.14; moved later in sequence (not urgency) since it benefits from more channels existing first; content unchanged |
| 8 | `M3.5` TikTok Shop GMV (Kalodata/FastMoss) | Commerce | Unchanged position — still last, still bake-off-gated. Reconsidered explicitly during the TikTok discussion and deliberately kept here: Discovery-layer TikTok value is already captured earlier via M2.12; GMV is a confirmation signal, not a discovery one |
| 3.5 | `M2.23` Analyst Experience Consolidation *(new, v1.1)* | UX enforcement | **New.** Inserted between `M2.12` (Discovery Engine v1) and `M2.15` (start of the Evidence Depth Cluster) — not a new number reflecting new position, same convention already used for `M3.5`'s resequencing. Scope: collapse the three user-facing entry points (simple analyze→memo flow, 4-stage research pipeline, standalone thesis generator) into one front door; pick exactly one verdict vocabulary to surface in the UI (the other stays internal/backend only); enforce the result screen shape from §12 (verdict → 2–3 reasons → biggest risk → evidence-on-demand) across every flow. Zero backend/engine logic changes — this is a UI/IA consolidation pass over already-shipped flows and the already-locked UX Blueprint, not new capability. Effort: 10–15 days. Cost: $0. Impact: this is what makes every engine milestone before and after it actually land with users instead of accumulating as invisible backend sophistication. |

Full 8-field detail (scope, dependencies, acceptance criteria, effort, cost, verdict/moat impact, risks) for each milestone above was established in the prior two artifacts and carries forward unchanged except where this table notes a difference. `M3.1`–`M3.4`, `M3.6`–`M3.7`, and Phase 4 remain exactly where they were: unchanged, still gated on real outcome-data timelines that no amount of reprioritization moves.

---

## 5. Supplement-specific moat (recap)

The Evidence Depth Cluster remains the hardest-to-copy layer: a generic multi-category competitor has no reason to build PubMed evidence grading, dose-adequacy analysis against clinical literature, interaction/safety signal detection, or DSHEA claim-risk language checks. The Discovery Intelligence Engine adds a second, complementary moat: compounding, calibrated proof of *early detection accuracy* that a reactive competitor (one that only analyzes what a user types) structurally cannot replicate without building the same proactive infrastructure. Together: we don't just judge opportunities well, we find them first and judge them well.

---

## 6. Data provider priority (recap, unchanged)

| Priority | Source | Feeds |
|---|---|---|
| 1 | PubMed / ClinicalTrials.gov | Evidence layer (M2.16) |
| 2 | FDA CAERS, NIH ODS, DailyMed | Evidence layer (M2.18) |
| 3 | TikTok public hashtag API *(already live)* | Discovery layer (M2.12) — generalized from per-query to category-scan |
| 4 | DataForSEO | Commerce + Discovery (search-intent trajectory) |
| 5 | Keepa | Commerce layer |
| 6 | YouTube Data API | Discovery + Evidence-adjacent VOC (M2.13) |
| 7 | Apify (Amazon Q&A) | Evidence-adjacent VOC (M2.13) |
| Later | Kalodata / FastMoss | Commerce layer (M3.5), bake-off gated |

---

## 7. Calibration: two loops, not one

The Discovery Engine adds a second calibration axis. Both are outcome-driven, both append-only, neither replaces the other:

| | Verdict calibration (existing) | Discovery calibration (new) |
|---|---|---|
| **Ledger** | `verdict_ledger_outcomes` | `discovery_alerts` (new, §2 step 8) |
| **Question answered** | Were our verdicts (`BUILD_NOW` / `SKIP` / etc.) right? | Did the candidates we flagged as accelerating actually go on to become real, confirmed opportunities? |
| **Owning milestone** | `M3.1` / `M3.2`, unchanged | New re-measurement worker, same shape as `M2.9`'s |
| **Gate** | ≥2 real quarters of outcomes (calendar-fixed, unchanged) | Shorter cycle possible — Discovery outcomes (did it show Commerce confirmation?) resolve faster than full product-launch outcomes |

---

## 8. Benchmark strategy (recap, unchanged)

The ~15–20 query supplement benchmark panel (berberine, creatine, magnesium plus sleep/gut-health/women's-health/safety-edge-case additions) stands as designed previously. One addition: the Discovery Engine needs its own small fixture set — a handful of historically-known real breakouts (berberine's actual 2023 trajectory is the obvious first case) replayed against synthetic time-series to verify the velocity detector would have caught it, and at least one known false-positive case (a meme-driven single-source spike that fizzled) to verify the hype filter correctly suppresses it.

---

## 9. Stage gates (updated — one new Stage 1 criterion)

### STAGE 1 — ACTIVE NOW
**Become the best Supplement Intelligence platform**

- All criteria from the prior Supplements-First plan, unchanged: full Depth Cluster shipped and passing the expanded benchmark suite, `M3.1` calibration report published, `M3.2`'s learned weights beating heuristic baseline, real paying customers making real decisions
- **New:** the Discovery Intelligence Engine has a real, calibrated precision metric (§7) — not just "it's live," but "we know how often its alerts are right"

### STAGE 2 — LOCKED — Beauty
**Unchanged from prior plan**

- All Stage 1 criteria met, architecture health-check, a Beauty Readiness Memo written before any Beauty code, real unprompted customer demand for Beauty

### STAGE 3 — LOCKED — Pets
**Unchanged from prior plan**

- Stage 2 complete with a real Beauty launch proving the playbook repeats, Pets Readiness Memo, real demand signal

### STAGE 4 — LOCKED — Home
**Unchanged from prior plan**

- Stage 3 complete with two proven expansions, Home Readiness Memo, real demand signal

---

## 10. What this document overturns — honestly, not diplomatically

### Reversed

- The "three layers" framing proposed mid-discussion implied three separate pipelines. That was wrong. They're three questions asked of overlapping collectors — building three parallel pipelines would have meant duplicating TikTok/YouTube integration work for no reason.
- `niche_timeseries` was framed in the last document as a nice-to-have long-term asset, low urgency. It's now understood to be critical-path infrastructure — the Discovery Engine's cold-start clock doesn't start until it's live, so it moved from position 3 to position 2 in the sequence.
- The Evidence Depth Cluster was previously the very next thing after the Commerce Intelligence items. It no longer is — the Discovery Engine (cheap, reuses shipped infrastructure) now runs ahead of it, because finding candidates early is a prerequisite to the Depth Cluster mattering at all.

### Deliberately not reversed

- TikTok Shop GMV (`M3.5`) stays demoted and bake-off-gated. This was reconsidered a second time during the TikTok discussion and the answer held: the valuable early signal from TikTok is already captured by the live provider feeding the Discovery Engine; GMV is a confirmation signal and doesn't need to move earlier just because "TikTok" is in its name.
- No third verdict vocabulary. Discovery Alerts hand off to the existing Decision Engine and existing verdict states, including reusing `CATEGORY_CREATION_CANDIDATE` for thin-evidence/high-momentum cases. Inventing a new vocabulary here would have violated the same discipline that's protected the verdict architecture through every prior round of this discussion.
- The category-agnostic architecture, the Supplements-First execution focus, and the Stage 1–4 expansion gates all hold exactly as designed. Nothing about the Discovery Engine reopens the multi-category question — its candidate universe is supplement-scoped like everything else right now.

---

## 11. The 24-month roadmap

### Months 0–3 — Foundation + Discovery cold start

- `M2.10` channel taxonomy, then `M2.11` niche time-series store — start the cold-start clock as early as physically possible
- `M2.12` Discovery Engine v1 ships with a fixed-threshold detector while real baseline history accumulates
- Benchmark suite expands to ~15–20 supplement queries plus the Discovery fixture set (§8)

### Months 3–9 — Depth Cluster + real customers + Discovery matures

- `M2.13` VOC diversification, `M2.14` Trends migration, then `M2.15`–`M2.21` Evidence Depth Cluster ship in full
- Discovery Engine's rolling-baseline velocity detector activates once real history exists; cross-source confirmation (§2 step 5) goes live
- Customer acquisition targets supplement founders exclusively; every new verdict is now evidence-backed, not just demand-backed

### Months 9–15 — Both calibration loops mature

- `M3.1`'s ≥2-quarter verdict calibration gate clears; publish the report externally as a checkable claim
- `M3.2`'s learned weight refit ships
- Discovery calibration produces its first real precision number — "of N alerts, M were later confirmed"
- `M2.22` Divergence detector, `M3.5` Kalodata/FastMoss bake-off execute here

### Months 15–20 — Confirm Stage 1 for real

- Verify every Stage 1 criterion including the new Discovery-precision one and the revenue/usage floor — no expansion talk until all of it is genuinely true, not mostly true
- If real, begin the Beauty Readiness Memo as research only

### Months 20–24 — First real test of the playbook

- Architecture health-check executed for real
- Beauty begins only if Stage 2 genuinely clears, including real unprompted demand
- If it doesn't clear by month 24, that's the plan working as designed, not a failure of it

**The bet, stated once, plainly:** a platform that can prove — with a calibrated track record — that it finds real opportunities early and judges them rigorously, in one category, is worth more than one that plausibly claims breadth across five. Everything in this document optimizes for that one sentence being true and checkable before anything else gets built.

---

## 12. Execution philosophy: Complex Engine, Simple Experience

*Added in v1.1. This section governs every future milestone in this document and is not itself subject to the "no pivots" freeze in §13 — it's the interpretive lens for how everything else gets built.*

The engine described in §1–§11 is intentionally sophisticated. The product must never look like it. **The user should feel like they're talking to the smartest supplement analyst in the world — not operating a terminal.** This isn't a new decision; the V2 UX Blueprint (adopted 2026-07-10) already mandated an answer-first, three-altitude model. This section exists because engine-focused planning had quietly stopped referencing it, and drift — not a single bad decision — is the actual risk.

### Non-negotiable UX principles

- **The verdict is the interface.** Every screen either delivers a verdict, explains one, or is the track record. Anything else must justify its existence.
- **Engine vocabulary never reaches the UI.** No "channels," "concordance," "divergence," "signal providers," "layers," "Discovery/Commerce/Evidence" in user-facing copy. If a term wouldn't come out of a human analyst's mouth in a client meeting, it doesn't render.
- **Words before numbers.** A number appears only when it *is* the evidence (price, review count, search volume) — never as a score the user must interpret. Confidence is shown in words and witness dots, never percentages, per the existing Design System.
- **Depth is pulled, never pushed.** Nothing expands itself. Sophistication is available on demand (the evidence drawer) and invisible otherwise.
- **One front door. One visible verdict vocabulary. Progressive disclosure. Users buy decisions, not data.**

### What stays completely invisible to users

Channel taxonomy, the independence-aware confidence model, the concordance matrix, the divergence detector's pattern table, `niche_timeseries`, both the Verdict Ledger and the Discovery Ledger, ingredient canonicalization, calibration workers, and every provider name. These are why the answer is trustworthy — the user should never see *how*.

### What users actually touch

Five things: ask a question (one input) → get a verdict → read why, progressively → get alerted when something is accelerating → check the track record page. Everything else is plumbing.

### What appears immediately after an analysis

Not Discovery/Commerce/Evidence as visible sections — those are engine layers, and surfacing them would be shipping the org chart. The screen answers exactly the question the user asked ("should I build this?"):

1. The verdict, in plain words, instantly legible.
2. The 2–3 strongest reasons, written as a smart analyst would say them ("Search demand doubled in 6 months, but 40 competitors entered in the same window" — never "concordance: 0.72").
3. The one biggest risk.
4. Everything else behind a single "show me the evidence" expansion.

### The standing rule

**No engine milestone ships new UI by default.** Engine milestones (everything in §4 except `M2.23`) make the analyst smarter; only a UX milestone decides what the user sees. This is the rule that keeps "Complex Engine, Simple Experience" true for the next 24 months instead of the next 24 days.

### The one new milestone this section adds

`M2.23` — **Analyst Experience Consolidation.** Full detail in §4's roadmap table. Positioned between the Discovery Engine (`M2.12`) and the start of the Evidence Depth Cluster (`M2.15`): collapse the three current entry points into one front door, surface exactly one verdict vocabulary, and enforce the verdict-first result shape above across every flow — before the Depth Cluster adds more evidence that a fragmented UI would only bury.

---

## 13. Execution mode: the roadmap is now frozen

*Added in v1.1.*

Strategy work is done. From this point forward: **no further major strategic pivots unless something fundamental is discovered through real users or real data.** The three-layer model, the Discovery Intelligence Engine, the Supplements-First sequencing, and the Complex-Engine-Simple-Experience doctrine are all settled — they are inputs to execution now, not open questions.

**Execution discipline, one milestone at a time, per the roadmap in §4:**

1. Exactly one milestone active at a time, taken in the order in §4 (`M2.10` → `M2.11` → `M2.12` → `M2.23` → `M2.13` → `M2.14` → `M2.15`–`M2.21` → `M2.22` → `M3.5`).
2. **Research & Design gate (added v1.2, 2026-07-14) — no code until this is approved.** Before any implementation begins, produce a short R&D document for the active milestone covering exactly four things: (a) how existing, already-shipped architecture will be reused rather than duplicated; (b) the exact list of files that will change; (c) real risks and regression points; (d) why the proposed scope is the *smallest correct* implementation, not a maximal one. Implementation starts only after this document is explicitly approved.
3. On completion of each milestone: validate against its acceptance criteria, run the full benchmark regression suite (§8), confirm a green typecheck, and confirm nothing else regressed — the same gate this codebase has applied to every milestone since Phase 1.
4. Documentation and the roadmap (`docs/PRODUCT_INTELLIGENCE_V2_ROADMAP.md`) are updated with a full completion write-up, and the milestone is recorded complete.
5. Only then does the next milestone become active — and step 2 begins again for it.

This section, not §1–§11, is what should be consulted week to week going forward. §1–§11 remain the reference for *why*; §12–§13 govern *how* we build starting now.

---

*This document is the execution source of truth as of 2026-07-13. It does not modify the locked V2 Blueprint's design principles, the verdict architecture, the independence-aware confidence model, or any KEEP-AS-IS component. No roadmap file or code has been changed — this remains a proposal pending review. Milestone numbers here are authoritative and supersede conflicting numbers in the three prior artifacts; full 8-field detail (scope/dependencies/acceptance criteria/effort/cost/impact/risk) for milestones not restated above carries forward from those documents unchanged.*
