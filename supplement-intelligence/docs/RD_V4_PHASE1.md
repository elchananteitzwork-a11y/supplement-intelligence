# R&D — V4 Phase 1: Stream · Hunt · Brief · Pull

Milestone: first production increment of the frozen V4 architecture
(docs/V4_PRODUCT_ARCHITECTURE.md). Status: awaiting owner approval before
implementation, per the standing R&D gate.

---

## 1. Reuse audit

Backend and pure logic are reused verbatim; **zero UI components are reused** (Final
Directive: complete frontend reset — legacy is a bridge shell, not a component
library).

Reused as-is (real files, verified this session):
- `app/api/generate/route.ts` — the full analysis pipeline; writes `analyses` with
  real `memo_data`. The Hunt/Brief consume its output unchanged.
- `lib/scoring.ts` (`computeGroundedScore`, `ScoreDimension`, gates,
  `verdictOverrideReasons`), `lib/confidence/*` (`computeConfidenceAssessment`,
  weakest-link, witnesses), `lib/kill-criteria.ts`, `lib/verdict-matrix.ts` — all
  Brief content derives from these, byte-identical computations.
- `components/memo/field-derivations.ts` — deliberately JSX-free pure derivations
  (`deriveKillCriteriaItems`, `deriveLifecycleDisplay`, `formatGapVelocity`,
  `deriveConfidenceDisplay`, `deriveVerdictCrossCheck`); reused as logic, not UI.
- `MemoData.writer_output` (`causal_paragraph`, `risk_sentence`), `build_explanation`,
  bull/bear case fields, validation budget + success-metrics derivations
  (`components/memo/shared.tsx` pure exports) — the Brief's sentences and the Pull
  plan are these real fields, re-presented.
- `app/api/watchlist/**`, `app/api/alerts/**`, `lib/watchlist/{enrich,recheck,
  alerts-display}.ts` — the Stream's "what moved" is real alert/re-check output.
- Verdict words: the existing frozen labels (`Entry Supported` / `Validation
  Required` / `Not Supported` / `Category Creation`) are reused as the canonical
  plain-language verdict vocabulary — no new vocabulary invented.
- Auth/middleware/Supabase clients, Tailwind, LazyMotion/framer conventions,
  `useReducedMotion` discipline — infrastructure, unchanged.

## 2. Existing architecture touched (read-only dependencies)

`analyses` table shape; `watchlist_entries`/`watchlist_alerts` read paths; quota
(`analyses_used/limit`) enforcement in `/api/generate`; Landing/Login (locked,
untouched); the legacy routes (`/dashboard`, `/memo/[id]`, `/analyze`, …) keep
working unmodified as the bridge shell for the duration of Phase 1.

## 3. Files to change / create (smallest set)

New namespace — no imports from `components/{pi,memo,shell,ui,cine}` (enforced via
an ESLint `no-restricted-imports` rule so the reset survives future contributors):

- `app/app/page.tsx` — the Stream (new authenticated home at `/app`).
- `app/app/brief/[id]/page.tsx` — the Brief (+ Hunt state while its run is pending).
- `components/partner/*` — Stream, Hunt, Brief, Case, ReversalConditions,
  PullBar/PullSheet, InterrogationSheet (templated grounded lookups), Vocabulary
  subtitle primitive. All new, all per the normative anatomy in
  V4_PRODUCT_ARCHITECTURE.md §5.
- `lib/positions.ts` + `supabase/migrations/0XX_positions.sql` — position state
  (`validating | watching | killed`), chosen-at, pre-agreed success metrics
  snapshot, optional kill reason. RLS owner-only. (Watching reuses/links the
  existing watchlist mechanism rather than duplicating it.)
- `supabase/migrations/0XX_product_events.sql` + a minimal write path — the Phase-1
  gate metrics require instrumentation that does not exist: a small owner-scoped
  event log (`verdict_viewed`, `claim_tapped`, `pull_committed`, `returned_after_trip`).
  No third-party analytics.
- ESLint config addition (the import ban above).

## 4. Risks

1. **Hunt granularity (the real engineering constraint).** `/api/generate` is a
   single request — no per-provider progress events exist. An honest Phase-1 Hunt
   therefore shows the checked-set + true batch completion (per the frozen honesty
   rule: a batch that completes together is shown completing together), NOT
   per-provider arrivals. True streamed arrivals require backend progress events
   (SSE or a progress table) — a separate backend milestone, explicitly out of
   Phase 1. Caught by: this document; the Hunt spec accepts both forms.
2. **Schema additions** (positions, product_events) touch RLS →
   security-compliance-agent review is mandatory before merge.
3. **Recommended-primary mapping** (decision → recommended Pull verb) is new
   deterministic product copy: `BUILD_NOW→Validate (execute the entry plan)`,
   `VALIDATE_FURTHER→Validate`, `SKIP→Kill (recorded as a save)`,
   `CATEGORY_CREATION_CANDIDATE→Watch`. Unit-tested; no new judgment computed.
4. **Top-3 drivers / 2-against selection** is a new pure derivation over real
   `ScoreDimension`/bear-case/risk fields — must never fabricate a driver when
   fewer than 3 strong ones exist (renders fewer, honestly). Unit-tested.
5. **Regression risk to legacy bridge:** zero — no legacy file is edited except the
   ESLint config; verified by `git diff` scope at review.
6. Vocabulary-subtitle seen-counts are client-local (localStorage) — acceptable
   loss on device switch; not worth schema for Phase 1.

## 5. Testing plan

`tsc --noEmit` · full vitest (new unit tests: driver selection, recommended-verb
mapping, verdict-word mapping, freshness stamp) · `npm run build` · live Playwright
on a real authenticated account: hunch → hunt → reveal → brief anatomy (3 items
above the fold) → claim tap → grounded lookup → Pull commit → position state
persisted → stream reflects it; mobile 390×844 + desktop 1440×900; reduced-motion
(one-beat reveal instant); zero console errors; security review (migrations), then
independent review, then QA gate — the standing chain.

**Phase-1 validation gates (measured on real usage before Phase 2 begins):**
- Pull rate: ≥40% of fresh verdicts receive an explicit Pull within 48h
  (stop-and-rethink below 15%).
- Interrogation: ≥25% of Briefs get ≥1 claim tap (below 10% = the conversational
  layer's premise is rejected before it is built).
- Return-after-trip: ≥50% of users return within 7 days of a tripped-condition
  stream line.

## 6. Smallest-correct-scope

The four screens at `/app`, bound to real analyses and real re-checks from day one,
with tap-interrogation as templated grounded lookups, position persistence, the
event log for the gates above — and nothing else. Legacy remains the untouched
bridge; no cutover, no redirects, no deletions in Phase 1.

## 7. Non-goals

Compare, Desk, full Record chapters, Calibration, free-text conversational layer,
adaptive memory (removed from the architecture), backend streaming progress, any
engine/scoring/provider change, any billing change, Landing/Login changes, legacy
route removal or redirects, shared one-pager export (Phase 2+ growth artifact).
