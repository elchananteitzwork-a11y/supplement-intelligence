# Canonical Home — Architecture Definition

**Date:** 2026-07-22 · **Authority:** owner decision, verbatim: *"The canonical Home is the cinematic experience we already approved. Do not use either `/dashboard` or `/pipeline` as the final Home. Treat both of them as implementation resources only… Use the strongest information architecture, components, and functionality from both… Do not duplicate two Homes."*

This resolves `DESIGN_SOURCE_OF_TRUTH.md` §6 item 6 and unblocks Phase 4. This document defines the merge — **it is not a visual design.** The visual design follows the standing gate: background-composition candidates → owner pick → high-fidelity mockup → owner approval → R&D doc → implementation.

---

## 1. The decision, operationalized

- **Design authority:** neither existing route. The One World cinematic system (Landing's approved experience) + this merge definition + the upcoming owner-approved mockup.
- **Canonical URL:** `/dashboard` keeps the route (every auth flow and redirect already points there — `router.push('/dashboard')` on login, `SideNav`/`CineNav` "Home"). Only the URL survives; nothing about the current page's design is authoritative.
- **`/pipeline` is deleted after the merge** (route + `preview/`), once its donor elements are harvested. No orphaned second Home. Donor components under `components/pi/` (`PipelineView`, `StageGroup`, `CandidateRow`, `WhatChangedStrip`, `derive.ts`) are harvested or deleted with it — decided per-component during implementation, never left as a parallel system.

## 2. IA merge — what each implementation resource contributes

### From `/pipeline` (the IA donor — it matches the locked product model and frozen language)

| Element | Detail |
|---|---|
| **Anchor sentence** | The screen opens with one serif sentence stating the founder's true position, built from real counts ("7 candidates · 2 being watched."). This is the Home's emotional center — the cinematic equivalent of Landing's headline. |
| **Stage-grouped organization** | Shortlisted → Analyzed as the primary grouping (real stages backed by real data: active watchlist rows = Shortlisted, everything analyzed = Analyzed), plus the honest ghost stages (Hunches; Committed/Killed) rendered as structure-without-data, never fabricated content. |
| **"What changed" strip** | Only truly-derivable events (analyses completed ≤48h, stale shortlisted evidence). Real events or nothing — no invented activity feed. |
| **Frozen vocabulary** | "Log a hunch" as the intake CTA (fixes `SideNav`'s non-compliant "+ New Analysis" in the same stroke — Consistency Audit D16). Stage names stay in the frozen/plain-English register. |
| **Honesty footer** | The traceability statement (verdicts/scores/confidence never re-derived for display, confidence gated by weakest input, dashed stages = no data yet). |

### From `/dashboard` (the functionality donor — richer real data per analysis and per portfolio)

| Element | Detail |
|---|---|
| **Quota awareness** | `used/limit`, `canAnalyze` gating (with the dev-unlimited bypass), honest "No analyses left" state. |
| **Portfolio aggregates** | `computeV2BuildRate` / `computeAvgQuality` / `computeLifecycleCoverage` / `computeAvgConfidence` + total/avg-score/last-run — including their honest "—" behavior when no analysis has V2 data. Presented as glass instruments (real values, always-visible text; **no fabricated trend lines** — no real per-portfolio time series exists today). |
| **Per-card intelligence** | `computeCardIntelligence` (lifecycle, V2 verdict, confidence %, kill-criteria count, science flag) — computed once, reused for card + aggregates, exactly as today. |
| **Card content model** | `DashboardOpportunityCard`'s data density (rank, category, score, verdict, format, competitor, market size, recency) defines *what a candidate row/card shows* — not what it looks like. |
| **Empty state** | The "first run" teaching moment — re-voiced per the frozen language ("Log your first hunch"), presented in the world rather than as a boxed card. |
| **Fetch shape** | 30 analyses + profile, single server component, the same compute-once discipline. |

### Resolution where they conflict

- **Grouping beats grid-rank:** `/pipeline`'s stage grouping is the primary structure; `/dashboard`'s rank-ordered grid becomes the ordering *within* the Analyzed stage. Rank #1 badge survives only if the mockup earns it.
- **`/pipeline`'s "Discover — disabled" placeholder dies** — Discover is real (`/analyze`); the CTA row links it honestly.
- **`/dashboard`'s plain "Home" h1 dies** — the anchor sentence is the headline.
- **Neither shell survives:** not `AppShell`/`SideNav` (cream sidebar in a dark world), not `/pipeline`'s chrome-less page. The Home lives in `CineShell` — which gets its two pending one-line fixes at the same time (add History link; frozen-language CTA — Audit D9/D16).

## 3. One World presentation (constraints the mockup must satisfy)

1. **Background — owner correction (2026-07-22, supersedes this doc's first draft):** Home builds on the **already-approved palm-world background** (`public/ambient/landing-cathedral-of-palms.jpg` — the locked Cathedral of Palms identity, the image intended to become the animated environment), exactly as Login already does. Per-screen distinctiveness comes from **treatment** — crop/`imagePosition`, `AmbientWorld` intensity (`calm` register here, for data density), scrim depth — never from a different photograph. A golden-dusk candidate round was generated during this phase and explicitly set aside by the owner as *"useful exploration only"* — those images are **not adopted** and must not be mistaken for approved assets. **No new environment composition may be introduced for any screen without the owner explicitly approving a replacement.**
2. **Surfaces:** `GlassPanel`/`GlassInstrument` verbatim (post-Phase-3 fold-back recipe when that lands); `AmbientParticles` verbatim; scrim/grade via `AmbientWorld` at an intensity that keeps 30 cards of real data legible (`calm` register, not Landing's `full`).
3. **Motion:** cine tiers; card entrance per the ui-ux-pro-max grid-stagger finding (300–450ms, ~60ms each, wave from start, transform/opacity only), reveal-once, all reduced-motion gated. No magnetic element on this screen unless the mockup designates a single centerpiece that earns it.
4. **No WebGL here** by default — the rotor budget stays with Candidate Detail (SoT WebGL scope rule). If the mockup proposes a Home centerpiece, it's `RotorMark`/`GlassInstrument` territory, or an explicit owner decision.
5. **Verification gate:** the One World check — Landing → Home must read as walking deeper into the same place, not switching products.

## 4. What this unblocks and the order

1. High-fidelity Home mockup on the approved Cathedral of Palms background, implementing this IA → **owner approval**. (No background-generation step — resolved above.)
2. R&D doc (7-section, per standing policy) → implementation → `/pipeline` deletion in the same milestone.
3. Phase 3 (Candidate Detail) implementation remains a separate, still-pending approval — this document does not reorder it.
