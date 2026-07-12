# Stitch Narrative Remapping — Canonical Architecture Map + Backend Field Mapping

Scope: the three highest-priority routes (`/memo/[id]`, `/analyze`, `/dashboard`) plus the shared patterns that appear on every page. The remaining 13 flows from the requested list are inventoried at the bottom as **not yet remapped** — deferred, not silently skipped.

All source citations are to files read directly this pass, not memory.

---

## Canonical pattern references (used everywhere, chosen explicitly, not averaged)

| Pattern | Canonical Stitch screen | Why this one |
|---|---|---|
| Full-app nav shell | `80f611873dbf4a5087134b00e73b9f31.html` (Investor Report) | Most complete: icon+label pairs, active-state treatment, "New Analysis" CTA position, Help/Logout footer — same vocabulary as the Pipeline and Preliminary Read screens, confirmed by direct re-read this pass |
| Search input | Pipeline screen (`3b79ae51...html`)'s own inline `<script>` | It's the only screen whose focus behavior is specified in *executable* code (`boxShadow` grows 2px→6px on focus), not just static markup — most authoritative source for this interaction |
| Verdict badge / pill | Investor Report Section 1 ("Current Signal") | Solid-fill color block, not an outlined badge — `bg-[#5C7A29] text-white px-4 py-2` |
| Report section header | Investor Report | `border-b-2 border-primary`, `label-mono` uppercase, secondary-gray text — used consistently across all 9 of its sections |
| Full-bleed callout | Investor Report Section 8 (Kill Criteria) | Only screen showing an inverted (black-bg/white-text) full-bleed section — reserved for this one purpose |
| Icons | Material Symbols Outlined, confirmed loaded via Google Fonts in every screen's `<head>` this session has read | Single consistent icon font across all 43 screens — never Stitch's inconsistency, purely an implementation gap on my side (already diagnosed) |

---

## 1. `/memo/[id]` — canonical reference: Investor Report (`80f611873dbf4a5087134b00e73b9f31.html`)

### Page composition (verified from the actual HTML, not inferred)

- **Not** a two-column layout with a sticky right rail. Stitch's Investor Report is a **single centered reading column**, `max-w-[720px] mx-auto`.
- A **2px reading-progress bar** fixed to the very top of the viewport, filling as the user scrolls (real `<script>`, trivial to reproduce).
- A **sticky top app-bar** (separate from the left nav) containing a breadcrumb (`Markets / Nutraceuticals / Magnesium Glycinate`) and two actions: "Watch this market" and "Export PDF."
- My current `MemoDisplay.tsx` uses `lg:grid lg:grid-cols-[1fr_272px]` with a sticky "At a Glance" rail + section-jump nav in the right column — **this is not what the canonical reference does at all.** It's a reasonable UI pattern, but it's not Stitch's, and it's the single biggest page-composition divergence on this route.

### Section-by-section map

| # | Stitch section (verbatim heading) | My current section | Real backend source | Verdict |
|---|---|---|---|---|
| 1 | **Current Signal** — verdict pill + circular phase gauge | *(scattered: verdict shown in `FirstScreenSummary`, no gauge)* | `memo.build_decision`, `memo.opportunity_score`. Stitch's "Phase 03/05" gauge has **no real backend equivalent** — no phase/lifecycle concept is ever computed per-analysis (see prior audit: `verdict_ledger.lifecycle_stage` is analysis-level, not phase-based, and always null). **Honest substitute:** a circular gauge driven by `groundedPct` or `evidenceBreadth.pct` (real, already computed) instead of a fabricated phase number. | Regroup + honest substitution |
| 2 | **The Thesis** — large pull-quote, no visible header | Embedded inside `InvestmentThesis.tsx`'s `AIAnalyst` sub-component, under an "AI Analyst" label, bundled with "Why Now" and a momentum badge | `memo.market_thesis` (exact same field, already rendered — just wrapped in the wrong section boundary today) | Extract, don't rebuild |
| 3 | **Demand Intensity / Concordance** — 5 metric rows, each with label + value + inline sparkline | Bundled inside `MarketIntelligence.tsx`'s `DemandEvidencePanel`/`RevenueEvidencePanel`/TikTok card, under "Market Intelligence" | `memo.signal_evidence.demand`, `.growth`, `.revenue`, `.virality` (all real, already fetched and rendered elsewhere in a card-grid format, not row+sparkline format) | Regroup, restyle as rows (sparkline fidelity deferred to Phase 4 per instruction — structure first) |
| 4 | **Supply Landscape** — 2-col: bar chart card + 3 stat tiles | Bundled inside `MarketIntelligence.tsx`'s `CompetitionEvidencePanel`/`MarketSaturationBlock`/`MeaningfulCompetitorsList` | `memo.signal_evidence.competition`, `.review_velocity` (top_competitors, review_concentration), `memo.market_saturation`. Stitch's "Trademark filings" stat has **no backend equivalent** — omit or substitute a real field (e.g. distinct brand count) | Regroup, one honest omission (trademark filings) |
| 5 | **Unit Economics** — literal 5-row COGS ledger (Sale Price / Referral Fee / FBA / COGS / Contribution Margin, highlighted total) + italic synthesis quote | `UnitEconomicsTable.tsx` currently shows Gross/Net Margin rows + traction band — **different rows entirely**, not Stitch's literal ledger | `memo.product_recommendation.retail_price`, `.cogs_estimate`; `memo.signal_evidence.revenue.avg_referral_fee_pct`, `.avg_fba_pick_pack_fee` (real fee data, already fetched, already partially used for a "cross-check" callout instead of the primary table). Contribution margin is a real, computable value from these four inputs. | Rebuild table shape from existing fields — no new data needed |
| 6 | **Differentiation Brief** — clustered real customer quotes + "unserved claim" callouts | `DifferentiationBrief.tsx` (AI-invented personas) + `ConsumerIntelligence.tsx` (real theme clusters) — currently two separate, differently-labeled sections | `memo.consumer_intelligence` theme clusters are the *real* analog of Stitch's clustered quotes (Stitch's own quotes are presented as if real but are mockup placeholder text) — `DifferentiationBrief`'s AI-invented personas are a **different, weaker-provenance thing** already disclosed as such | Regroup real content under this name; keep AI-invented personas clearly subordinate/labeled, not primary |
| 7 | **Strategic Readiness** — risk bullets + Seasonality/Safety Gate stat tiles | `StrategicReadinessChecklist.tsx` — already has budget/success-metrics/risk-assessment content **plus** kill criteria bundled together | Real: `computeGroundedScore` weak dimensions, `news_intelligence` recalls/sentiment | Mostly already correct — just needs Kill Criteria split out (see next row) |
| 8 | **Kill Criteria** — distinct, full-bleed **black** section, "we would reverse this verdict if…" | Rendered today via `KillCriteriaList` **immediately after** Strategic Readiness in the same file — content and position are already right; only the black full-bleed visual treatment is missing | `deriveKillCriteria(m)` — already exists, already real | Split into its own literal section boundary + black-bg treatment |
| 9 | **Footer** — track-record disclaimer | Not present | Low-value; can add a one-line real disclaimer (generation date, `generatedAt`) | Trivial addition |

### Real backend data with no Stitch section (extensions, not fabrications)

`keyword_intelligence`, `news_intelligence`, `manufacturing_estimate`, `review_narrative` have no home in Stitch's 9-section Investor Report — Stitch never designed a screen with this much real data density (same finding as the Category Signal panel from the prior pass). Per the explicit instruction from two turns ago ("extend the Stitch design naturally while keeping the exact same design language" for real data with no Stitch equivalent): these remain as **additional sections appended after the 9 core Stitch-mapped sections**, in the same visual language, honestly positioned as extensions rather than deleted or forced into a Stitch section they don't belong in.

---

## 2. `/analyze` — canonical reference: Pipeline - Opportunity Portfolio (`3b79ae51...html`) + Preliminary Read (`bef10a9a...html`)

Already substantially rebuilt in the prior pass (Opportunity Map, Opportunity Inventory, progress console). One confirmed, unaddressed structural gap:

| Element | Stitch | Mine | Verdict |
|---|---|---|---|
| Page chrome on the results screen | Full persistent left nav + sticky top header (search + Filters + Export) | **Zero chrome** — confirmed via grep, no `AppShell`/`SideNav` in any mode | The old `/analyze` was always a standalone, chrome-free flow; this was carried forward unexamined. Stitch's own reference screen for this exact content assumes persistent nav. |

Everything else on this route (Map, Inventory, Real Category Signal panel, progress bento-grid) was verified against literal Stitch HTML in the prior two passes and is not being re-litigated here.

---

## 3. `/dashboard` — canonical reference: Home - Decision Queue (Expanded) (`a2c44a65264e4f24a30ba58a3ecfecbd.html`)

| Element | Stitch | Mine | Verdict |
|---|---|---|---|
| "Needs Attention" | Real section (notifications) | Absent | Correctly omitted — no backend (alerts/notifications system doesn't exist) |
| "Decision Queue" card grid | Present | Present (`OpportunityCard` grid) | Matches |
| Stats row (Total Runs/Build Rate/Avg Score/Last Run) | **Not present anywhere in Stitch's Home heading structure** | Present, real data | This is not a Stitch pattern — it's a generic-dashboard convention I used to fill the gap left by omitting Stitch's fake "Needs Attention." Not fabricated data, but not a Stitch-sourced layout either. |

Lower priority per your own ordering ("after those [analyze, memo] are correct") — not restructured this pass beyond this documented finding.

---

## 4. Deferred — not remapped this pass (documented, not silently skipped)

Leaderboard, Research pipeline screens (Stage 1–4), History, Compare, Founder Profile, Authentication, plus the Opportunity Map/Inventory/Selected-detail sub-screens already covered under `/analyze` above. Per the confirmed scope from two turns ago ("deepen the search→results→report flow," Dashboard/Leaderboard/Login/Settings/Thesis left as previously verified) and this turn's explicit sequencing ("start with /analyze, /memo, /dashboard... after those are correct, continue"), these were not re-audited against literal Stitch HTML this pass. Known from the earlier compatibility audit: most of the research pipeline (`/research`, `/research/[signal_id]/evaluate`) has **no dedicated Stitch screen at all** — meaning their information architecture is, by construction, still backend-shape-driven, the same failure mode diagnosed for the memo page, just with nothing to remap onto without designing new Stitch-consistent screens from scratch (a design task, not a code task).
