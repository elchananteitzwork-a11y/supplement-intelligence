# R&D: Entry Proof → scoring input (bounded marketAccessibility bonus)

Owner decision 2026-08-03: Entry Proof should influence the score, not
just the report. This doc shapes that decision into the smallest honest
scoring change. The owner's earlier "very high weight" framing was
discussed and the risks accepted as real (survivorship bias, zero
calibration data, ad-spend blindness, sparse-binary noise) — so the
design is a MODEST, POSITIVE-ONLY, TIER-SCALED bonus with disclosed
uncalibrated constants, upgradeable to a calibrated weight once real
Verdict Ledger outcomes exist (M3.2).

## 1. Reuse audit

- **The natural home already exists**: `computeMarketAccessibility`
  (`lib/scoring.ts:709`) — the dimension whose whole job is "how hard is
  it to enter", already blending review_velocity (0.45), competition
  (0.30), keyword difficulty (0.25), review moat (0.10). Entry proof is
  direct counter-evidence to the moat those sub-signals measure.
- **The data is already on the memo**: `signal_evidence.revenue.value
  .entry_proof` (ladder shape, commit 2969a2c) — members list ranked,
  every member already passed disproportion/established-brand/volume
  bars. Zero new fetches, zero new persistence.
- **The gate precedent**: the same function's own `gateTier` block is
  "a disclosed judgment call over real arithmetic, calibratable once
  real outcomes exist" — this bonus follows the identical convention.
- **Version discipline**: `SCORING_ENGINE_VERSION = '2.11.0'`
  (`lib/scoring.ts:277`); Verdict Ledger stores `scoring_version` per
  verdict, so cross-version comparisons stay disclosed. Bump → 2.12.0.

## 2. Existing architecture touched

- `lib/scoring.ts` — `computeMarketAccessibility` only, plus the version
  constant. No other dimension, no verdict-matrix, no kill-criteria, no
  confidence model changes.
- Reads `MemoData.signal_evidence.revenue.value.entry_proof` (existing).

## 3. Files to change

1. `lib/scoring.ts`:
   - New disclosed constants (uncalibrated, same convention as the gate
     thresholds beside them):
     `ENTRY_PROOF_BONUS_SINGLE = 0.5`, `ENTRY_PROOF_BONUS_DUAL = 1.0`,
     `ENTRY_PROOF_BONUS_PATTERN = 1.5` (members ≥ 3).
   - After the existing sub-signal blend: `rawScore = min(10, blended +
     bonus)` when entry_proof members exist; **absence adds nothing and
     never subtracts** (absence is a coverage gap, not evidence the
     market is closed — the engine's own standing principle).
   - `sourceLabel` appends `+ entry proof (N low-review seller[s])` so
     the boost is visible wherever the dimension's sources are shown.
   - The existing gateTier thresholds read the boosted score — coherent:
     entry proof is precisely evidence the market is not closed, so it
     may legitimately lift a market out of a SKIP/VALIDATE cap.
   - `SCORING_ENGINE_VERSION` → '2.12.0' (real scores change for new
     analyses; stored memos keep their stored scores + version).
2. Tests (`lib/__tests__/` scoring suite): bonus applied per tier;
   capped at 10; absence = byte-identical score to today; sourceLabel
   disclosure; version bump asserted where the suite pins it.

## 4. Risks

- **Uncalibrated influence on real verdicts** — bounded deliberately:
  max +1.5 on a 0-10 dimension at 18% weight ⇒ max ~+2.7 points on the
  0-100 opportunity score (and usually less after weight
  redistribution). Enough to move borderline cases, not enough to
  manufacture a BUILD_NOW from nothing. The constants are the knob.
- **Legacy-memo comparability** — handled by the version bump (existing
  discipline; Verdict Ledger stores scoring_version).
- **Double-counting** — reviewMoat (0.10 sub-signal) measures the
  moat's HEIGHT from avg review counts; entry proof measures observed
  CROSSINGS of it. Related but not the same measurement; the bonus's
  small size keeps any residual overlap immaterial. Disclosed in the
  code comment.
- **Replay/regression surface** — `scripts/replay_v220_all.ts`-style
  replays compare versions; the bump keeps that honest.

## 5. Testing plan

- Unit tests per §3.2; `npx tsc --noEmit`; full vitest; build.
- Deterministic spot-check: recompute one real stored memo's
  marketAccessibility with and without an injected entry_proof and
  confirm the delta equals the tier bonus exactly.

## 6. Smallest-correct-scope

Three disclosed constants, one bounded post-blend addition in one
dimension function, one sourceLabel suffix, one version bump, tests.

## 7. Non-goals

- **No "very high" weight and no new dimension** — the ceiling stays
  +1.5/10 until real outcome data justifies more (M3.2 calibration is
  the upgrade path, not another judgment call).
- **No penalty for absence** (coverage gap ≠ closed market).
- **No verdict-matrix / kill-criteria / confidence-model coupling.**
- **No retroactive rescoring of stored analyses.**
