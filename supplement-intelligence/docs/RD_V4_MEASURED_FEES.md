# R&D: Measured Amazon Fees in the Record's Economics Chapter

Item (א) of the owner-approved core-economics plan (2026-07-27, after two
self-critique rounds + live DB/Keepa verification). Surfaces the real,
already-persisted Amazon fee data in the one place a founder judges unit
economics — the Record's Economics chapter — which today shows only
AI-judged figures.

## 1. Reuse audit

Everything this milestone needs already exists and is already persisted:

- **Fee data is already fetched and stored per analysis.**
  `lib/signal-engine/providers/keepa.ts:1109-1112` reads Amazon's own
  published fee schedule per product (`fbaFees.pickAndPackFee`,
  `referralFeePercentage` — Keepa mirrors Amazon's real fee schedule;
  provenance comment at `lib/signal-engine/types.ts:75-80`, "CONFIRMED VIA
  LIVE CALL 2026-06-26"). Averaged at `keepa.ts:1234-1235`, formatted into
  the revenue signal at `keepa.ts:1496-1497`:
  - `avg_fba_pick_pack_fee?: string` (e.g. `"$4.53"`)
  - `avg_referral_fee_pct?: number` (e.g. `15`)
- **The typed path from a stored analysis to those fields exists.**
  `MemoData.signal_evidence?: AggregatedSignals` (`types/index.ts:225`) →
  `AggregatedSignals.revenue?: AggregatedDimension<RevenueSignal>`
  (`lib/signal-engine/types.ts:521`) → the two fee fields
  (`lib/signal-engine/types.ts:81-82`). No new fetch, no new storage, no
  new types.
- **The render path exists.** The Economics chapter is built in
  `lib/partner-copy-record.ts:93-107` as `RecordRow[]` (`claim` / `value` /
  `marker: 'measured' | 'judgment'`), rendered by the shared
  `RecordCardRow` (`components/partner/record/RecordCard.tsx`) — the same
  dotted measured/judgment language every other row already uses. Zero new
  UI components, zero new Tailwind classes.
- **Real-world coverage verified empirically (2026-07-27, direct DB
  query over the owner's 100 most recent analyses):** 53/100 analyses have
  both fee fields (all 53 that have the `revenue` dimension at all); the
  other 47 predate the fields or ran while Keepa was down. For those, the
  rows simply don't render — the Record's existing "empty fields render
  nothing" rule (V4_PRODUCT_ARCHITECTURE.md §3, T4).

## 2. Existing architecture touched (read-only dependencies)

- `types/index.ts` — `MemoData.signal_evidence` (read only, already typed).
- `lib/signal-engine/types.ts` — `RevenueSignal` fee fields (read only).
- `components/partner/record/ChapterPage.tsx` / `RecordCard.tsx` — render
  the new rows with zero changes (they map over `chapter.rows`).
- The signal engine, scoring, confidence, and verdict pipelines are not
  touched in any way.

## 3. Files to change

1. `lib/partner-copy-record.ts` — insert two conditional rows into
   `econRows`, after the `retail_price` row and before the `gross_margin`
   row (reading order: cost → price → what Amazon takes → margin):
   - `{ claim: 'Amazon referral fee', value: '15% of price', marker: 'measured' }`
     (formatted from `avg_referral_fee_pct`)
   - `{ claim: 'Fulfillment fee (FBA, category average)', value: '$4.53', marker: 'measured' }`
     (verbatim `avg_fba_pick_pack_fee` string)
2. `lib/__tests__/partner-copy-record.test.ts` — new test file (none
   exists today; `buildRecordChapters` currently has zero direct tests).

Nothing else.

## 4. Risks

- **Averages are category-node-level, not the user's exact product.** The
  FBA fee is averaged across the category's top sellers ($4.53 for
  supplements vs $11.76 observed for a heavy pet-powder category) — a
  founder shipping a lighter/heavier product pays differently. Mitigated
  in the claim label itself ("category average"), not hidden in a tooltip.
- **False-precision adjacency.** Sitting next to `gross_margin`
  (AI judgment) these measured rows could make the margin row look more
  grounded than it is. Deliberately NOT computing a fee-adjusted margin
  number (see Non-goals) — the measured rows and the judgment row keep
  their own markers, per the one-provenance-language principle.
- **Missing-field regression.** 47% of existing analyses lack the fields;
  one legacy shape (`signal_evidence` absent entirely) must not crash.
  Covered by optional chaining + an explicit test case.
- **Stored-string trust.** `avg_fba_pick_pack_fee` is rendered verbatim
  (already `"$X.XX"`-formatted at write time by `keepa.ts:1496`). If a
  future provider version changes the format, the row shows it as-is —
  acceptable; it is a display of a stored string, same convention as every
  other verbatim memo field in this file.

## 5. Testing plan

- New unit tests (`lib/__tests__/partner-copy-record.test.ts`):
  1. Memo with both fee fields → Economics rows contain both, marker
     `'measured'`, positioned between `retail_price` and `gross_margin`.
  2. Memo with `revenue` dimension but no fee fields → no fee rows, no
     crash.
  3. Memo with no `signal_evidence` at all → Economics chapter unchanged
     from today's output.
- `npx tsc --noEmit` clean.
- Full `npx vitest run` green (1179 existing tests must stay green).
- Live spot-check after deploy: open the Record → Economics of one of the
  53 fee-bearing analyses (e.g. "Women's Creatine Collagen", verified in
  the DB probe) and one legacy analysis without fees; confirm rows
  appear/absent respectively.

## 6. Smallest-correct-scope

Two conditional `RecordRow` pushes in one existing function, plus their
tests. No new components, routes, types, fetches, migrations, or classes.
If `avg_referral_fee_pct` alone is present, its row renders alone (and
vice versa) — each row gates on its own field.

## 7. Non-goals

- **No fee-adjusted margin computation.** Deriving "real margin =
  price − fees − COGS" would blend a measured number with an AI-guessed
  COGS into a new number with no honest single marker, and would create a
  second answer next to the existing `gross_margin` row (forbidden:
  V4_PRODUCT_ARCHITECTURE.md §3, "never two answers to one question").
  Revisit only as part of item (ב)'s measured economics.
- **No change to scoring/confidence/verdict** — fees stay display-only.
- **No backfill** of the 47 legacy analyses (would require re-running
  real provider calls; absence renders as absence).
- **No Brief changes** — the Brief's economics driver is out of scope.
- **Not fixing the pre-existing `cogs_estimate` marker** (`'measured'` at
  `lib/partner-copy-record.ts:95` despite being an AI-prompt field —
  observed during this audit, tracked with the deferred fee-honesty items,
  separate decision).
- **Not item (ב)** (niche-scoped competitor set / revenue table) — its own
  R&D document follows after this ships.
