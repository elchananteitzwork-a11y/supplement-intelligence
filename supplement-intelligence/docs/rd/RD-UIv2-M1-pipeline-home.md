# R&D — UIv2-M1: Pipeline Home (`/pipeline`)

Owner-directed milestone (2026-07-20 directive: "begin building the next generation… permanent development standard"). First screen of the approved UX Architecture v1 build order, built to Screen Definition S1 and Design Spec v2 (warm cream).

## 1. Reuse audit
- **Auth + data pattern**: `app/dashboard/page.tsx:50-54` — `createClient()` from `lib/supabase/server.ts`, `redirect('/login')` on no user, `analyses` select scoped by `user_id` + `is_archived=false`. Reused verbatim.
- **Honest derivations (data-integrity audit lineage)**: `computeGroundedScore` (`lib/scoring.ts`), `computeConfidenceAssessment` (`lib/confidence`), `deriveV2VerdictDisplay` (`components/memo/field-derivations`) — the Pipeline reuses these, never raw re-derivation.
- **Watchlist = Shortlisted stage**: `lib/watchlist/store.ts` (M2.8) — active rows keyed `user_id, analysis_id`. Read-only join in v1.
- **`cn`**: `lib/cn.ts`. **Icons**: brand set `components/icons.tsx` + Lucide (installed 2026-07-20). **Motion**: framer-motion 11 via `LazyMotion`. **shadcn**: initialized; add `card badge button skeleton` only.
- **21st discovery performed**: kanban components (rejected pattern per S1) and generic stat dashboards only — no close match to the stage-grouped candidate-row anatomy; built on shadcn primitives instead.
- **Detail navigation**: rows link to existing `/research/[signal_id]/memo`.

## 2. Existing architecture touched (read-only)
`analyses` and `watchlist` tables via RLS-scoped client; `types/index` `Analysis` type; existing routes untouched.

## 3. Files to change
- `tailwind.config.ts` — add namespaced `pi.*` color tokens (cream/ink/gold/verdicts, Design Spec v2). Additive only.
- `app/pipeline/page.tsx` — new server route (auth, fetch, stage grouping, anchor sentence from real counts).
- `app/pipeline/preview/page.tsx` — dev-only (`notFound()` in production) render of the same view fed by the 3 real stored sample analyses, for browser verification without a login session.
- `components/pi/PipelineView.tsx`, `CandidateRow.tsx`, `StageGroup.tsx`, `WhatChangedStrip.tsx` — new, namespaced under `components/pi/` so the legacy visual system is untouched.
- `components/ui/{card,badge,button,skeleton}.tsx` — shadcn adds.

## 4. Risks
- shadcn `add` may pull Radix deps → verify `npm ls` clean + `tsc` after.
- Tailwind token collision → prevented by `pi-` namespace.
- Stage semantics overreach: only Analyzed (all analyses) and Shortlisted (active watchlist) are real today; Captured/Committed/Killed have no backend — rendered as honest ghost stages per S1 first-run definition, never fabricated.
- "What changed" strip: no last-visit tracking exists → v1 shows only truly-derivable events (analyses completed ≤48h; shortlisted evidence older than 21 days as stale). No divergence (migration pending), no stall notes (deferred post-beta per approved amendment).

## 5. Testing plan
`tsc --noEmit`; `npm run build`; dev-server + Playwright screenshots of `/pipeline/preview` at 1440/768/375; UI/UX Pro Max pre-delivery checklist pass (contrast, focus states, reduced motion, cursor, hover 150-300ms).

## 6. Smallest-correct-scope
Read-only Pipeline home: stage-grouped list (real stages only + ghosts), candidate rows (name, verdict chip, grounded score, confidence, freshness, → memo link), anchor sentence from real counts, honest "what changed" strip, empty/first-run state. No stage-transition actions.

## 7. Non-goals
No Shortlist/Kill/Commit mutations (rituals are their own milestone); no nav/IA cutover (existing `AppShell` untouched; `/pipeline` reachable by URL only until staged cutover); no thesis capture; no divergence/stall events; no backend schema changes; no restyling of any existing route.
