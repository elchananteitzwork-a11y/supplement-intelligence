# R&D — V4 Compare + Desk

**Status:** DRAFT — awaiting owner approval of this doc **and** of a design mockup (standing design-review gate) before any production code.
**Authority:** docs/V4_PRODUCT_ARCHITECTURE.md §4 (unlock ladder: "2+ positions → Compare unlocks (offered by the partner in-stream, not as chrome); 3+ positions → Desk unlocks as a view"), §3 ("The score (0–100) does not appear on the Brief. Its only surface is Compare — common scale over the user's own candidates"; "Positions live in a strip that grows into a desk only when the portfolio does").

## 1. Reuse audit
- **Compare engine already live on the new pipeline:** `app/api/research/compare/route.ts` + `/recommend` (real `analyses` + watchlist reads); `app/api/research/compare/buildComparisonItems.ts` (kill criteria via `components/pi/candidate-core/coreDataAdapter.ts`); `app/research/compare/metrics.ts` (`METRICS`, `findWinner`, `VERDICT_RANK` — pure, unit-tested); `app/research/compare/separationEngine.ts`. **None of this is rewritten — the V4 screens are a new presentation over these exact modules.**
- **Positions data:** `lib/positions.ts` (`fetchPositions`, `PositionState`) + `app/api/positions` — the Desk is a grown view of exactly this data; `PositionsStrip.tsx` is the seed it grows from.
- **V4 language/primitives:** `lib/partner-copy.ts` (`VERDICT_TONE`, `positionVerdictLabel`), ledger-row card pattern (`RecentHunts`/`Opportunities`), `AvatarMenu`, `/app/analyses` page shape.
- **Unlock counts:** positions come from the same `fetchPositions`/server read the Stream already uses — no new state.

## 2. Existing architecture touched (read-only)
Scoring/verdict pipeline, `/api/research/compare(+recommend)`, `/api/positions`, watchlist store — byte-identical. `computeGroundedScore` supplies the 0–100 score that Compare (and only Compare) may display.

## 3. Files to change
- NEW `app/app/compare/page.tsx` + `components/partner/compare/*` — V4 Compare: selection (user's own candidates) → side-by-side verdicts/score/metric winners, mobile-first, reusing `metrics.ts`/`separationEngine` verbatim.
- NEW `app/app/desk/page.tsx` + `components/partner/desk/*` — the Desk: the positions strip grown into a full view (states validating/watching/killed, success metrics, freshness, links to Briefs). No new data derivations — renders what `/api/positions` + existing copy fns return.
- `components/partner/Stream.tsx` — in-stream partner offer lines at the real unlock moments (2+ → "Compare is open →", 3+ → Desk), per §4 "offered by the partner in-stream, not as chrome".
- `AvatarMenu.tsx` — Compare row repoints `/research/compare` → `/app/compare`; add Desk row when unlocked (menu rows may render conditionally on real counts).
- `/research/compare` → redirect stub to `/app/compare` after the V4 screen ships (same pattern as /memo, /analyze); then delete `CompareContent`/`components/pi/compare` + now-orphaned pi files.
- `eslint.config.mjs`/`package.json` — no change needed (new dirs already covered by `app/app/**`, `components/partner/**`).

## 4. Risks
1. **Score exposure discipline** — the 0–100 score is allowed ONLY on Compare (§3). Desk must not show it.
2. **Unlock honesty** — Compare/Desk render only at real counts (2+/3+ positions); below that they don't exist (no ghost chrome). Deep-linking below the count → redirect to /app with the partner's plain line, not an error.
3. **coreDataAdapter dependency** — Compare API imports it; deleting `components/pi/compare` must not touch the adapter.
4. **Old-skin Compare retirement** — same redirect-stub pattern already proven on /memo//analyze.

## 5. Testing plan
tsc · full Vitest (metrics/separation tests must pass untouched) · lint:v4 · build · live: unlock ladder at 1/2/3 positions (real account), selection→result flow, deep-link below-count redirect, mobile widths, avatar-menu conditional rows.

## 6. Smallest-correct-scope
V4 Compare alone is shippable first (engine fully exists; it's presentation). Desk second (pure read of positions). Stream offer-lines land with each unlock's screen.

## 7. Non-goals
Calibration (frozen at ~10 real outcomes) · new metrics/scoring changes · personalization · retiring `metrics.ts`/`separationEngine` (they are the engine) · tab bar (panel-on-demand remains the nav model).
