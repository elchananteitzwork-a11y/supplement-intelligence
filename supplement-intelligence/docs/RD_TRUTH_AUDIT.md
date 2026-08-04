# R&D: Truth Audit — displayed numbers vs. their real provider sources

Owner-initiated 2026-07-30 ("make sure the results we're getting are 100%
accurate"). Scope framing agreed in-session: accuracy splits into three
distinct questions — (a) is the math computed correctly, (b) are displayed
numbers faithful to their real provider sources and honestly labeled, and
(c) does a high score predict a real opportunity. This milestone attacks
(b) directly and (a) opportunistically; (c) is a non-goal (it requires
real outcome data over calendar time — Verdict Ledger / M3.2, already
built and waiting).

The audit's deliverable is a FINDINGS REPORT, not code changes. Every
mismatch found becomes its own follow-up fix with its own scope; this
milestone does not fix anything it finds.

## 1. Reuse audit

- **Every raw provider result is already persisted on the memo itself** —
  no re-fetching needed for source-vs-displayed comparison:
  `memo.signal_evidence = signals` (`app/api/generate/route.ts:804`, the
  full ProviderSignals object per dimension), `memo.concordance_matrix`
  (:810), `memo.evidence_depth_score` (:833), `memo.keyword_intelligence`
  (:861), `memo.consumer_intelligence` (:866), `memo.manufacturing_estimate`
  (:876). This is the audit's ground truth layer: stored raw values vs.
  what the display layer renders from them, both readable offline from the
  `analyses` table with zero provider spend.
- **The display transformation layer is small and centralized**:
  `lib/partner-copy-record.ts` — `fmtMeasuredMonthly` (:58-61, $k/$M
  rounding), search volume `toLocaleString` (:74), leader-share
  `Math.round(×100)` (:102), niche revenue total (:123), coverage %
  (:183, :254), growth `toFixed(0)` (:247), competitor-row price/units/
  revenue (:262-264). Plus `lib/partner-copy.ts` for the Hunt/verdict
  surfaces. VM builders are pure functions of the stored memo — the audit
  can recompute them offline and diff.
- **The 'measured' | 'judgment' marker system already exists**
  (`lib/partner-copy-record.ts:24`) — the audit's honesty check has a
  concrete, enumerable target: every row marked `measured` must trace to
  a real provider field. Known suspect precedent already on record:
  `cogs_estimate` marked `measured` at :127 despite being an AI-prompt
  field (`types/index.ts` `product_recommendation.cogs_estimate`);
  `retail_price` (:128) same class; `biggest_competitor` rows (:89-90)
  marked `measured` but the underlying field is model-generated unless
  `competitor_revenue_verified` is set (`types/index.ts:127-130`,
  `lib/real-competitor.ts` server-side override); `dominant_brands` (:94)
  sourced from AI `market_saturation`. These become the audit's seeded
  checklist, cross-referenced with the ~13 dormant fee-honesty items
  already catalogued.
- **Real-vs-estimate flags already exist in the signal types** and must be
  honored by the audit's expectations: `revenue_is_category_estimate`
  (`lib/signal-engine/types.ts:88-91`), `revenue_sample_count` (:83-87),
  fee fields documented as Amazon's real schedule mirrored by Keepa
  (:75-82), monthlySold floor semantics disclosed at
  `lib/partner-copy-record.ts:55-56, 268`.
- **Script tooling precedent**: `scripts/` already holds one-off
  validation scripts run with `npx tsx` against production via
  service-role reads — `scripts/_tmp_pre_validate.ts` (enumerates owner
  analyses + walks `memo_data.signal_evidence`, the exact read pattern
  this audit needs), `scripts/validate_production.ts`,
  `scripts/replay_v220_all.ts`, and a `scripts/audit-outputs/` directory
  for findings artifacts. No new infrastructure needed.
- **Cache TTLs don't constrain the offline tier** (signal_evidence is
  persisted on the memo forever); they only matter for the optional live
  tier (keyword cache 7d, `lib/keyword-engine/dataforseo.ts:291`; science
  30h, `lib/science-engine/pipeline.ts:22`).

## 2. Existing architecture touched (read-only)

- `analyses` table via service-role (same read pattern as
  `_tmp_pre_validate.ts`) — memo JSON per analysis.
- `lib/partner-copy-record.ts` / `lib/partner-copy.ts` — imported by the
  audit script to recompute the real VMs from stored memos (never
  reimplemented, so the audit tests the actual production code path).
- `lib/scoring.ts` recompute path (`computeGroundedScore`) for the
  deterministic-math spot-checks.
- No production route, component, or engine module is modified.

## 3. Files to change

1. `scripts/truth-audit.ts` (new, read-only): loads the N most recent
   owner analyses with non-empty `signal_evidence` (target 3-5, including
   the two 2026-07-30 ashwagandha analyses and the creatine analysis with
   the stored competitive-review report), then runs three check families:
   - **Family 1 — displayed vs stored (free, offline)**: recompute
     `buildRecordChapters` / `buildEvidenceAppendix` VMs from the stored
     memo; for every numeric row, parse the displayed string back and diff
     against the raw stored provider value it claims to represent
     (revenue rows vs `top_competitor_revenues[]` price×monthly_sold, fee
     rows vs `avg_referral_fee_pct`/`avg_fba_pick_pack_fee`, search volume
     vs `keyword_intelligence`, leader share vs
     `revenue_concentration_top1`, coverage vs `evidence_depth_score`).
     Tolerance: exact up to the disclosed rounding of each formatter.
   - **Family 2 — marker honesty (free, offline)**: every `measured` row
     must map to a real provider field present on this memo; every row
     that maps to an AI-prompt field (`product_recommendation.*`,
     `biggest_competitor.*` without `competitor_revenue_verified`,
     `market_saturation.*`) flagged as a mislabel finding. Seeded with the
     known-suspect list from §1.
   - **Family 3 — external spot-check (bounded, split by cost)**:
     free sub-checks first — displayed science counts vs a fresh PubMed/
     ClinicalTrials.gov call (free APIs, same endpoints the pipeline
     uses). Real-money sub-checks (Keepa/Apify against live Amazon pages
     for 2-3 audited ASINs) are OFF by default behind an explicit
     `--live-spend` flag and only run with owner say-so; comparisons use
     drift tolerance (Amazon numbers move daily — only order-of-magnitude
     or unit errors are findings, not small drift).
2. `scripts/audit-outputs/truth-audit-2026-07-30.md` (generated): the
   findings report — one entry per mismatch: analysis id, displayed value,
   stored source value, file:line of the transformation, severity.
3. This document.

## 4. Risks

- **Time-drift false positives** (live tier): mitigated by drift
  tolerance + comparing only against stored raw values by default.
- **Memo schema variance across engine versions**: older analyses lack
  newer fields; mitigated by selecting recent analyses only and by the
  audit skipping (and logging) absent fields rather than flagging them.
- **The audit script must never write**: service-role client used for
  SELECT only; no upsert/update anywhere in the script. Caught by review
  of the single new file.
- **Marker-honesty judgments need care**: a row can be legitimately
  `measured` via a server-side override (e.g. `biggest_competitor` when
  `competitor_revenue_verified` is true) — the audit must check the flag,
  not just the field name, or it will report false mislabels.

## 5. Testing plan

- Dry-run the script against ONE analysis first; verify zero writes
  (no mutation calls exist in the file) and sane output.
- Full run against the 3-5 selected analyses; findings report generated.
- `npx tsc --noEmit` stays clean (script is type-checked, app untouched).
- No vitest changes — nothing in `lib/`/`app/` is modified.
- Findings report reviewed with the owner; each confirmed finding is
  turned into its own follow-up item (fixes are separate milestones).

## 6. Smallest-correct-scope

One read-only script, one generated findings report, this document.
Three check families (displayed-vs-stored, marker honesty, bounded
external spot-check with real-money checks owner-gated off by default).
No fixes applied, no production code touched, no new tables, no UI.

## 7. Non-goals

- **No fixing of findings in this milestone** — each confirmed mismatch
  becomes its own scoped follow-up (some may land in the existing
  fee-honesty list).
- **No predictive-validity calibration** — that is M3.2, gated on real
  Verdict Ledger outcome data accumulating over calendar time.
- **No auditing of LLM prose quality** (market_size wording, gap
  narratives) beyond whether such fields are mislabeled `measured` —
  prose accuracy is a different problem with a different method.
- **No recurring/CI automation of the audit** — this is a one-off deep
  pass; automating it is a possible future milestone once the check
  families prove their worth.
- **No auditing of legacy analyses** (pre-current engine versions) —
  schema variance makes them noise; the point is whether TODAY's engine
  is truthful.
