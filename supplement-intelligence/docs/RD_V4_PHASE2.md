# R&D — V4 Phase 2: Implementing the Claude Design Prototype

**Status:** DRAFT — awaiting owner approval. No implementation before approval (standing R&D gate).
**Design source of truth:** the Claude Design prototype (project `cca54f8b-0a5d-48b6-a63f-6df4b24fce51`, files `Product Intelligence.dc.html` + `Landing Page.dc.html`), frozen as of 2026-07-24. It supersedes nothing engine-side; it is the presentation spec on top of the V4 Phase 1 engine/copy layer.
**Prototype audit trail:** full-detail audit completed 2026-07-24 (vocabulary, states, charts, a11y, tag balance — one markup defect found and fixed).

---

## 1. Reuse audit

The single most important finding: **V4 Phase 1 already shipped most of the hard parts.** The prototype is largely a richer skin plus new read-only surfaces over data and copy generators that already exist.

### Already-shipped V4 Phase 1 code (reused as-is or extended, never rewritten)

| Prototype element | Existing implementation |
|---|---|
| Stream screen | `components/partner/Stream.tsx` (191 lines) + `app/app/page.tsx` |
| Hunt (in-stream, real sources) | `components/partner/Hunt.tsx` |
| Positions strip + status vocabulary | `components/partner/PositionsStrip.tsx`; `lib/positions.ts:10-14` (`PositionState = 'validating' \| 'watching' \| 'killed'`); label mapping `lib/partner-copy.ts:84` (`positionVerdictLabel`) |
| Brief page (auth, data, view model) | `app/app/brief/[id]/page.tsx` — already composes `computeGroundedScore` (`lib/scoring.ts`), `computeConfidenceAssessment` (`lib/confidence`), `deriveKillCriteriaItems`/`deriveLifecycleDisplay`/`formatGapVelocity` (`components/memo/field-derivations.ts`), `listWatches` (`lib/watchlist/store.ts`) |
| **The why-sentence with confidence folded in** | **Already exists: `lib/partner-copy.ts:237` (`buildWhySentence`) + `:137` (`buildConvictionSentence`)** — the gap previously assumed to be the biggest blocker is already shipped |
| Verdict vocabulary (List A) | `lib/partner-copy.ts:58` (`VERDICT_WORD`), `:65` (insufficient-evidence verdict), `:68` (`verdictWord`) — matches `PILL_CFG` labels in `components/memo/CurrentSignal.tsx:57-62`; enum at `types/index.ts:18` |
| Case for/against rows | `lib/partner-copy.ts` `selectForDrivers` / `buildAgainstCase` / `buildClaimEvidence` + `components/partner/brief/CaseRow.tsx` |
| Reversal conditions | `components/partner/brief/ReversalConditions.tsx`; data from `lib/kill-criteria.ts:20-28` (`KillCriterion`, `valueAtGeneration`) |
| The window (in words) + freshness | `lib/partner-copy.ts` `windowInWords` / `freshnessStamp`; divergence shape `lib/pattern-detection/divergence.ts:30-45` |
| Interrogation sheet | `components/partner/brief/InterrogationSheet.tsx` |
| Pull bar/sheets (Validate/Watch/Kill) | `components/partner/brief/PullBar.tsx`, `PullSheet.tsx`; `buildValidationPlan`, `killRedirectionLine`, `RECOMMENDED_PULL` (`lib/partner-copy.ts:92-112`) |
| Auth (login/signup incl. `?signup=1`) | `app/login/page.tsx` — state machine reused verbatim, only re-hosted in a modal |

### Real memo_data fields powering the prototype's new sections (verified live on analysis `b615c65f…` 2026-07-24; no new engine generators needed)

`market_gaps`, `product_recommendation` (formula/format/avoid/dosing), `brand_opportunities`, `customer_language` → gap chapter · `why_now` → Why-now block · `concordance_matrix` → channel-agreement line · `financial_projections`, `manufacturing_estimate` → economics rows · `biggest_competitor`, `market_saturation.dominant_brands` → named leader · `keyword_intelligence` → appendix keyword table · `signal_metadata` (providers_used, fetch flags, overall_confidence) → appendix sources + confidence · `evidence_depth_score.coverage` → appendix coverage line · `lifecycle_classification.stage` → lifecycle arc · regulatory/claim-risk/recall scans (M2.18–M2.20 outputs in memo_data) → safety block · writer `product_thesis_full` (`types/index.ts:299-303` area) → Record thesis.

### Infra reused

Tailwind config `tailwind.config.ts` (tokens added here, not inline) · Supabase clients `lib/supabase/{client,server}.ts` · watchlist re-check path `lib/watchlist/recheck.ts` (`evaluateKillCriterion` — the only legitimate source of a real "tripped"/"moved" signal) · `divergence_alerts` (M2.22, built; migration still pending in `supabase/PENDING_MIGRATIONS.sql` — 18 references).

## 2. Existing architecture touched (read-from, unchanged)

- Scoring/confidence/verdict pipeline: `lib/scoring.ts`, `lib/confidence/*`, `lib/kill-criteria.ts` — byte-identical, presentation reads only.
- `lib/partner-copy.ts` — extended with new pure functions (gap-letter copy, channel-agreement sentence); existing functions untouched.
- `app/login/page.tsx` auth state machine — reused verbatim inside the Landing modal; Supabase calls unchanged.
- `app/memo/[id]/page.tsx` + `components/memo/*` (old memo) — untouched; remains reachable until the v4 Record fully replaces it (owner decision on retirement is out of scope here).
- Middleware/GUARDED list, RLS, billing-adjacent surfaces — untouched (no billing exists; Upgrade stays non-functional, see Non-goals).

## 3. Files to change (smallest set, per milestone)

**Milestone A — Brief uplift (smallest-correct-scope, §6):**
- `components/partner/brief/BriefView.tsx` — add Why-now block, lifecycle half-arc, channel-agreement line, numeric end-labels on the window, per-condition threshold markers. **Correction found in deep-research pass (2026-07-24): the prototype's arc shows 4 invented stage labels (Growing/Contested/Saturated/Declining); the real enum has 6 different stages — `LIFECYCLE_STAGES` at `components/memo/field-derivations.ts:65` (`Latent · Emerging · Window Open · Contested · Saturated · Declining`). The implementation uses the real 6-stage enum, not the prototype's labels.**
- `components/partner/brief/ReversalConditions.tsx` — ledger-row layout + threshold marker (marker only when a numeric pair exists).
- NEW `components/partner/brief/LifecycleArc.tsx`, `ThresholdMarker.tsx` (pure SVG, no deps).
- `lib/partner-copy.ts` — add `channelAgreementLine(concordance)` (renders only when `agreement === 'Mixed'`), `whyNowBlock(m.why_now)`.
- `app/app/brief/[id]/page.tsx` — thread the new view-model fields.
- `tailwind.config.ts` — token additions extracted from the prototype (spacing/radius/colors already largely present as pi-*).

**Milestone B — Record (index → chapter pages) + gap letter + appendix:**
- NEW `app/app/record/[id]/page.tsx` (index), `app/app/record/[id]/[chapter]/page.tsx` (chapter), `app/app/appendix/[id]/page.tsx` — real routes (deep-linkable, back-button correct), not client-state screens.
- NEW `components/partner/record/{ChapterIndex,ChapterPage,GapLetter,EvidenceAppendix}.tsx`; chapter mapping module `lib/partner-copy-record.ts` (memo_data → Demand/Competition/Economics/Customers/Gap/Signals&Safety, incl. "My read" lines sourced from existing `scores.*.notes` fields — no invented benchmarks).

**Milestone C — Landing + auth modal:**
- `app/page.tsx` (Landing) — new composition per `Landing Page.dc.html`; replace `background-attachment:fixed` with a fixed-position layer (iOS); `prefers-reduced-motion` on all ambient motion; supplement positioning copy.
- NEW `components/landing/AuthModal.tsx` — hosts existing login state machine; `?auth=login|signup` URL state, `history.pushState`, focus trap (all as prototyped).
- Fix the standing `--font-serif-pi` gap in `app/layout.tsx` (Source Serif 4 actually loaded).

**Milestone D — corpus surfaces (needs D-blockers, §4):**
- NEW `components/partner/Opportunities.tsx` + corpus query with supersede rule (same normalized category → highest `scoring_version`, then latest `created_at`); Stream integration; "Not Supported" fallback link.
- `lib/positions.ts` — add `'moved'` state + DeltaBanner wiring to `divergence_alerts` (only after the pending migration is applied).

## 4. Risks

1. **Regression on shipped V4 Phase 1** — BriefView/Stream are live. Mitigation: additive view-model fields only; `npm run lint:v4` + full Vitest + Playwright on /app routes before/after.
2. **Honesty regressions** — every new section must render only when its real field exists (gap chapter ↔ `market_gaps`; channel line ↔ `agreement === 'Mixed'`; window numbers ↔ real divergence data; threshold markers ↔ numeric pairs). A "tripped/moved" state must come only from watchlist re-check / divergence_alerts — never computed ad-hoc in the view.
3. **Keepa outage** — marketplace-derived values (supply-side window numbers, price bands, listing counts) are unavailable for new runs; sections must degrade to the honest-empty states the prototype already defines. Historical analyses render with their dated freshness stamp.
4. **`divergence_alerts` migration applied (2026-07-24), but a deeper blocker was found underneath it** — the migration itself is confirmed live (4 real rows, verified directly against production). But `divergence_alerts.niche_key` is populated only from `TRACKED_INGREDIENTS` (`lib/science-engine/tracked-ingredients.ts`: `['berberine', 'creatine', 'magnesium']` — 3 fixed ingredient names), never from a user's watched `analyses.category_name` (e.g. "Magnesium Sleep Gummy"). There is no real, already-established mapping from a specific watched position to one of these 3 keys — this is the same unresolved gap already tracked as "Dynamic ingredient coverage (deferred)." Building `'moved'`/DeltaBanner now would require inventing a fuzzy category↔ingredient match with no real precedent in this codebase — exactly the kind of invented-precision shortcut this project's honesty principle rejects. **Milestone D therefore ships without `'moved'`/DeltaBanner** — Opportunities + the supersede rule (which have no such blocker) are the full real scope of this milestone. `'moved'`/DeltaBanner is deferred to whenever dynamic ingredient coverage (or an equivalent real per-category mapping) is solved.
5. **Duplicate/conflicting analyses** (10 confirmed conflicting category groups, cause diagnosed 2026-07-24: scoring_version drift 2.2.0→2.11.0 + same-version pipeline variance) — Opportunities list must apply the supersede rule or it will display contradictory verdicts.
6. **Tab bar vs frozen unlock ladder** — the prototype's persistent 4-tab bar contradicts "zero structural nav day one; Compare unlocks at 2+, Desk at 3+". OPEN QUESTION for owner. **Recommendation (deep-research pass, 2026-07-24): progressive-hybrid — no tab bar at 0–1 positions (pure Stream; Settings lives in the avatar menu per the FDP's "AvatarMenu is the only chrome"); the tab bar appears at the first unlock (2+ positions), announced by a partner line in the Stream ("You're tracking two ideas now — Compare is open →"); once visible it never re-hides.** Rationale: NN/g research shows hiding *needed* navigation roughly halves discoverability — but for a 0-idea user, Compare/Desk are non-functional, so deferring them is progressive disclosure (measured 30–50% faster initial task completion; ~40% fewer "can't find X" tickets when applied properly), not hiding. Permanently-disabled ghost tabs are rejected: locked-looking chrome contradicts the calm/honest register, and disabled states are only legitimate when the user can act to enable them right now.
7. **A11y/perf debt from prototype idioms** — clickable divs become real `<button>`/`<a>`; app-wide `prefers-reduced-motion` (prototype only covers the Landing hero); charts stay inline SVG (no chart lib).

## 5. Testing plan

Per milestone, before merge: `tsc --noEmit` · full Vitest (existing `field-derivations.test.ts` and partner-copy tests must pass untouched) · `npm run build` · `npm run lint:v4` · Playwright: Brief renders for (a) a real analysis with full fields, (b) one with missing gap/window/why_now fields (honest-empty states), (c) insufficient-evidence, (d) stale · axe/keyboard pass on new routes (focus ring, tab order, roles) · reduced-motion emulation renders instantly · decision-engine spot-check: verdict word, score, confidence byte-identical before/after on 3 real analyses · Milestone C: login E2E (login + signup + `?auth=` deep link + Back closes modal) · Milestone D: supersede-rule unit tests over the 10 known conflicting groups (fixtures from the 2026-07-24 diagnostic).

## 6. Smallest-correct-scope

**Milestone A alone.** The Brief is the product's core; every Milestone A change is additive presentation over fields and generators that already exist in production. No new routes, no schema changes, no new dependencies, no engine changes. A is shippable and independently valuable; B–D each gate on their own approval.

## 7. Non-goals

- **Billing/Stripe** — Upgrade screen remains informational; no payment code.
- **Keepa restoration or replacement** — engine/provider work, separate effort.
- **Personalized "build this instead" recommendations** — corpus browsing only (Milestone D); similarity-based redirection is future engine R&D.
- **Calibration / Track Record** — stays gated on ~10 real closed outcomes (frozen rule).
- **3D rotor hero, Compare/Desk uplift, Methodology/Settings/One-pager reskins, Terms/Privacy/404, forgot-password flow** — deferred; current pages keep functioning.
- **Retiring `app/memo/[id]`** — needs its own owner decision after the v4 Record proves out.
- **Fixing scoring-version drift / re-scoring old analyses** — engine governance work; only the display-side supersede rule is in scope (Milestone D).
