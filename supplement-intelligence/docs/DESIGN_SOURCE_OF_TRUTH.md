# Design Source of Truth

Compiled 2026-07-22 at the owner's request, after a full audit of every design artifact, prototype, memory record, and line of real implementation touched across this project. Purpose: **stop re-deriving decisions that already exist.** Before designing or redesigning anything, check this document first. If it's not here, it isn't decided yet.

This is a living document — update it whenever a screen moves between states (prototyped → approved → implemented) or a new locked decision is made. It is a record of ground truth, not a plan or a pitch.

**Extended 2026-07-22, second pass**, with an explicit element-by-element inventory (§0) after the owner asked for every specific design element to be individually located — not just screens, the actual atmosphere/lighting/component pieces. Nothing below is new work; every row is a pointer to something that already exists, with an honest note where "approved" really means "baked into a chosen photo" rather than "a separate reusable system."

**Extended again 2026-07-22, third pass — the governing rule.** Owner's exact words: "The application must be treated as one continuous cinematic world. Do not think in terms of separate pages. Think in terms of one environment that the user moves through." This is the single most important rule in this document and every rule below serves it.

---

## The One World principle (read this before anything else)

**Landing, Login, Dashboard, Discover, and Candidate Detail are not five pages. They are five locations inside one continuous environment.** A user moving between them should feel like they're walking through different rooms of the same building at different times of day — never like they clicked into a different product.

**The Cathedral of Palms is not a Landing background. It is the visual identity of the entire product.** (2026-07-22 amendment: Landing/Login's *specific pixels* changed to a video — see §0 — but the identity this paragraph describes is the shared grammar below, which the video still honors: same palette, same particle system, same glass, same motion language. Home and Candidate Detail still render the photo itself.) Every screen inherits the same:

- **Lighting** — the same warm, directional, source-and-destination light logic (see §0 "Lighting"), whether it's the photographic grade on a hero image or the rotor's self-emissive material.
- **Depth** — the same layered glass/scrim/particle stack, never a flat page.
- **Cream/gold language** — the exact `pi.*` tokens in §4, never a screen-specific palette variation.
- **Glass philosophy** — the exact `GlassPanel.tsx` recipe in §0/§4, reused verbatim, never reinvented per screen.
- **WebGL identity** — see below.
- **Cinematic motion** — the `ease-cine`/`duration-cine-*` vocabulary, extended to Layer 2 screens as they're brought into this world rather than left on plain Framer Motion defaults.
- **Ambient particles** — the exact `AmbientParticles.tsx` recipe, reused verbatim.
- **A sense of immersion** — no screen should read as "a UI placed in front of the world"; the environment and the content should feel inseparable.

**`components/pi/candidate-core/` — the real WebGL rotor — is the heart of the application.** It is not one component among many; it is the center everything else is designed around. Where a future screen needs a data-bound visual centerpiece (a score, a verdict, a confidence read), the default assumption is that it belongs to the same rotor/Evidence-Core system, not a new invented instrument — extend or reuse `candidate-core`'s real geometry/data-adapter/physics before ever considering something new.

**Verification gate, before implementing any future screen:** does it visually feel like it belongs to the same world as Landing and the approved Candidate Detail direction? Same light, same glass, same particles, same palette, same motion vocabulary. If the honest answer is "it could be mistaken for a different product," it is not ready — this check happens before implementation, not after.

---

## Two design registers (formalized 2026-07-22)

The owner asked to "start building our design language" using "pretty much the same as we have now with the cream colors" — this section is that language, stated once so it stops getting rediscovered per screen.

**The product has exactly two visual registers, sharing one token system:**

1. **Cinematic register** — an immersive hero moment. Full-bleed photo or video, dark color-grade scrim, `AmbientParticles`, glass panels (`GlassPanel`/`GlassInstrument`/`ProofCard`), cine motion tokens. **Currently: Landing only.** (Candidate Detail's prototype is exploring this register too, pending implementation approval — see §2.)
2. **Cream register** — everything else. Plain `bg-pi-cream` page, light `bg-pi-card`/`border-pi-hairline` panels, no hero photo/video, no dark glass, no particles. **Currently: Login (redesigned 2026-07-22), and every existing pi-\* screen (Dashboard, Discover, Compare, Pipeline, Watchlist, Alerts, Leaderboard, Settings, History) — those were already in this register; Login just joined it.**

**What makes both registers the same product, not two products:** the same tokens (§4 — cream/gold/ink/verdict hexes, Inter/JetBrains Mono/serif), the same `RotorMark`, the same gold-gradient CTA button recipe, the same type scale and voice, the same motion easing curve (`ease-cine`) where either register animates at all. A screen never gets a *new* palette or a *new* button recipe — only a choice of which of these two registers it's staged in.

**Which register a screen gets is a real, per-screen decision, not automatic:**
- Landing earns the cinematic register because it's the emotional first-contact moment — the thing that has to feel like "the future" in one second.
- Login *could* have stayed cinematic (Phase 2 did exactly that) but the owner explicitly moved it to cream on 2026-07-22 for simplicity — a real, considered choice, not a default.
- Dashboard/Discover (Phases 4-5, still pending) inherit whichever register their approved mockup lands on — nothing here presumes they must become cinematic just because they're getting a redesign pass. Given today's decision, **cream is the more likely default for both** unless a specific mockup makes the case for cinematic.

---

## 0. Element-by-element inventory

One row per element the owner asked to locate. "Where" is always a real file path, commit, or Artifact URL — never a description of what should exist.

| Element | Where the approved version actually lives | Status |
|---|---|---|
| **Cathedral of Palms Hero** | `public/ambient/landing-cathedral-of-palms.jpg` (day) + `public/ambient/candidate-detail-cathedral-of-palms-night.jpg` (night companion). **Superseded as Landing/Login's live background, 2026-07-22** — see "Landing/Login hero video" row below. Remains the Home foundation image (Canonical Home Architecture) and the Candidate Detail identity. | Still locked for Home + Candidate Detail. No longer what Landing/Login actually render. |
| **Landing/Login hero video** | `public/ambient/video/landing-hero-bamboo.mp4` + poster `landing-hero-bamboo-poster.jpg` — a real generated video (Higgsfield, job `hf_20260718_141322_cae9594b...`, originally prompted as "the permanent living hero background," predates the Cathedral of Palms photo pipeline by several days). Owner explicitly reviewed the source link, confirmed its subject (a bamboo grove with water/mist/god-rays, not palms) via direct evidence, and chose it anyway, 2026-07-22 — scope explicitly "Landing + Login" only, not Home. Rendered via the new `AmbientVideo` client component (`components/cine/AmbientVideo.tsx`): autoplay/muted/loop/playsInline, `prefers-reduced-motion` gates autoplay entirely (poster-only otherwise), same poster used as the pre-hydration/loading frame. | **Implemented, verified live** (video confirmed playing, `readyState 4`, both routes) — tsc/vitest/build all clean. |
| **Landing Page** | `app/page.tsx` | Implemented, approved, live. |
| **Login** | `app/login/page.tsx` | **Redesigned 2026-07-22, cream register** — owner: "different and simple... without any background picture, just the design language we have now with the cream colors." No AmbientWorld, no video, no dark glass — plain `bg-pi-cream` page, a `bg-pi-card`/`border-pi-hairline` panel (the same light-card recipe already used elsewhere in pi-*), same RotorMark/serif/mono/gold-gradient-button tokens as the cinematic register. Auth logic untouched. See "Two design registers" below §0. |
| **Dashboard / Home** | IA authority: `docs/CANONICAL_HOME_ARCHITECTURE.md` (owner decision 2026-07-22 resolving the two-route conflict — see §6.6 for the history). Implementation resources: `app/dashboard/page.tsx` (quota awareness, portfolio aggregates, `computeCardIntelligence`, card content model) + `app/pipeline/page.tsx`/`components/pi/PipelineView.tsx` et al. (stage-grouped IA, anchor sentence, "What changed" strip, frozen vocabulary, honesty footer). Canonical URL: `/dashboard`; `/pipeline` deleted after the merge. Cinematic visual design: not yet — Phase 4's mockup gate. | **Architecture defined; visual design pending** (background candidates → mockup → owner approval). |
| **Discover** | Real: `app/analyze/page.tsx` (Layer 2 pi-\*, 1267 lines). Cinematic version: **does not exist yet** — Phase 5 hasn't started. | Layer 2 only. Not a missed artifact — genuinely not designed yet. |
| **Candidate Detail** | Real content/data: `app/memo/[id]/page.tsx` + `components/memo/MemoDisplay.tsx` (14 real sections) + `components/pi/candidate-core/` (real WebGL hero, see below). Cinematic presentation: `design-prototypes/candidate-detail-night.html` — reviewed, polished, background bug found and fixed live, **awaiting your approval to implement.** | Prototype exists and is close to done. Not yet implemented into the real route. |
| **Glass components** | `components/cine/GlassPanel.tsx` (the shared recipe — border, gradient, `backdrop-blur-2xl backdrop-saturate-150 backdrop-brightness-75`, corner sheen, reflection streak, optional 3D hover tilt), `GlassInstrument.tsx`, `ProofCard.tsx` — all built on `GlassPanel`. Refined once already this session (asymmetric sheen, edge-bevel, second streak) in the Candidate Detail prototype. | **This is the one and only approved glass system.** Reuse it verbatim everywhere; do not write a second glass recipe for Dashboard/Discover. |
| **3D components / WebGL / React Three Fiber** | `components/pi/candidate-core/`: `CandidateCoreCanvas.tsx`, `CandidateCoreRotor.tsx` (~20KB, the real mesh/materials), `buildRotorGeometry.ts`, `coreDataAdapter.ts`, `corePullPhysics.ts`, `useCorePullGesture.ts`, `motionEasing.ts`. This is the **only real R3F code in the repo** — confirmed via `package.json` (three/@react-three/fiber/@react-three/drei installed) and direct file inspection. Live today in `/memo/[id]`. | **Real, live, locked.** The scratchpad sandbox at `hero3d-prototype/` (a standalone Vite app, 7 rounds of iteration per the design-DNA memory) is almost certainly this component's origin — file dates line up (sandbox last touched Jul 20–21, `candidate-core/` files dated Jul 21) — but I have not diffed them line-by-line, so treat that as strong inference, not a verified fact. Either way: **`components/pi/candidate-core/` is the real one to reuse; the sandbox's job is done.** |
| **Motion system** | Three separate real systems, not yet unified (a real open item, not an oversight): (1) `tailwind.config.ts` `ease-cine`/`duration-cine-*`/`animate-cine-*` tokens — Layer 3 (Landing/Login/Candidate Detail prototype) only. (2) Framer Motion, used directly per-component in Layer 2 pi-\* screens, no shared token vocabulary. (3) `components/pi/candidate-core/motionEasing.ts` — the rotor's own locked easing (constant-velocity spin, no overshoot). | All three are real and approved in their own context. Unifying (1) and (2) into one shared vocabulary is a legitimate future task, not started. |
| **Navigation** | Real/current: `components/shell/SideNav.tsx` (Home/Compare/History/Track Record/Settings — Layer 2, used everywhere except Landing/Login). Cinematic: `components/cine/CineShell.tsx`'s nav (Layer 3, Landing/Login only, missing the "History" link — a real one-line gap, not fixed yet). | Both real. `CineShell`'s nav needs a one-line fix before it's a perfect match. |
| **Cream / warm gold palette** | `tailwind.config.ts` `pi.*` tokens — see §4 below for exact hex values. Confirmed identical across Layer 2 and Layer 3 (not a conflict — the cinematic redesign correctly evolved the existing tokens rather than inventing new ones). | Locked, consistent, no action needed. |
| **Lighting** | Two genuinely different technical systems, both real: (1) The rotor's lighting model (`components/pi/candidate-core/`) — self-emissive material, no hidden point-light, diagonal off-canvas beams via real geometry+shader (explicitly locked per the design-DNA memory, two rejected alternatives on record). (2) The photographic/CSS "lighting" of the cinematic world — baked into the chosen hero photographs plus `AmbientWorld.tsx`'s color-grade filter and scrim gradient. Not the same system; don't conflate them. | Both real and locked in their own domain. |
| **Palm trees** | Exist only inside the approved hero photographs (`landing-cathedral-of-palms.jpg`, the night companion) — **not a separate reusable component or SVG asset.** Other palm-tree photo variations exist in the scratchpad from earlier exploration rounds but were **not chosen** — see §6 addition below on rejected alternates. | Real, but only as pixels in the two locked photos — nothing to extract as a standalone asset. |
| **Water reflections** | Same as palm trees — baked into the two locked hero photographs, not a separate system. | Baked into the photos only. |
| **Atmospheric fog** | **No dedicated component exists.** The closest real things: the soft haze baked into the chosen photographs themselves, and `AmbientWorld.tsx`'s scrim gradient (a dark vignette, which reads as depth/atmosphere but is not literal fog). Being honest rather than inventing a match: if you're picturing a specific fog *effect* beyond what the photos already show, that hasn't been built. | Partially real (baked into photos), not a separate reusable system. |
| **Floating particles** | `components/cine/AmbientParticles.tsx` — soft blurred motes, center-biased spawn, wandering non-linear drift with an opacity shimmer (fixed twice this session: once for a dust→humidity look, confirmed still correct when mirrored into the Candidate Detail prototype's own inline script). | **Real, implemented, locked recipe.** Reuse verbatim. |
| **Light rays** | Two real forms, not the same thing: (1) baked into the hero photographs themselves (god-rays through the palm canopy). (2) the rotor's own real shader-based diagonal light beams (`components/pi/candidate-core/`, locked, see Lighting row above). No separate standalone "light ray" CSS/SVG effect exists outside those two. | Real in two different technical contexts; nothing separate to build. |
| **Background compositions** | **A deliberate, owner-scoped divergence exists as of 2026-07-22 — not an inconsistency to "fix":** Landing and Login now render a real video (`landing-hero-bamboo.mp4`, see above); Home and Candidate Detail still render the static Cathedral of Palms day/night photos. This means Login and Home — despite both being described elsewhere as sharing "the same foundation" — currently present *different media* (video vs. photo) behind the same glass-panel/particle system. The shared visual grammar (palette, scrim math, particle system, motion tokens) is what still makes them read as one world; the literal pixels no longer match between Login and Home. Everything generated during exploration and not chosen (round 1: lagoon/rainforest/solar-horizon; round 2 runner-ups; the golden-dusk Home round) remains unapproved scratchpad history. **No new environment composition for any screen without an explicit owner-approved replacement — this row itself is the record of the one that was just approved.** | Video: Landing + Login. Photo: Home + Candidate Detail. Divergence is intentional, scoped, and owner-confirmed — flag, don't silently unify. |
| **Typography** | Inter (`--font-inter`) and JetBrains Mono (`--font-jbmono`) are locked and consistent everywhere. Serif is a **real unresolved question** (see §6) — `font-serif` is used broadly for headlines in both layers, but a stale-until-recently-broken `--font-serif-pi` variable and the original V2 spec ("serif for quotes only") both cut against that. Not resolved here — needs your call. | Sans/mono locked. Serif genuinely undecided, not an oversight. |
| **Cards** | Two real systems for two real contexts, not a conflict yet: `GlassInstrument`/`ProofCard` (Layer 3, cinematic) vs. the real pi-\* cream cards inside `MemoDisplay.tsx`'s sections (Layer 2). When Candidate Detail's cinematic version ships, the glass system re-skins these — the real content stays. | Both real; reconciliation happens naturally when Phase 3 implements. |
| **Charts** | Three real, parallel things: hand-rolled `SparklineChart.tsx` (Layer 2, small row sparklines), Recharts (Layer 2, general analytics), and `GlassInstrument.tsx`'s own `buildTracePath` SVG comet-trace (Layer 3). Not yet unified — a real open item, listed here rather than silently picking one. | All real, not yet unified. |
| **Score visualization** | The real WebGL rotor (`components/pi/candidate-core/`) is **the approved score visualization** — full stop. The static SVG rotor inside `design-prototypes/candidate-detail-night.html` is explicitly documented in its own comments as a temporary stand-in for prototyping purposes, never a competing design. | One approved answer; a documented placeholder exists around it, not a rival. |
| **WebGL / React Three Fiber components** | Same entry as "3D components" above — `components/pi/candidate-core/` is the only real one. | See above. |

---

## 1. The three layers (read this first)

Design work on this product happened in three passes. They are **not** competing directions — each one is the foundation the next builds on. Confusing them is the single biggest risk to consistency.

| Layer | What it is | Status | Scope |
|---|---|---|---|
| **1. V2 Blueprint** | `docs/PRODUCT_INTELLIGENCE_V2_*.md`, adopted 2026-07-10. Engine behavior, data contracts, and an early design-system spec (Inter-only, serif for quotes only, 4px spacing scale, banned chart types). | Behavioral/data authority still stands. Its **design-system doc specifically has been superseded in practice** by Layer 2 and Layer 3 (see §6, open question). | Whole product |
| **2. pi-\* warm-cream production skin** | Real, shipped Stitch-derived implementation. Commits `b50e5d6` (foundation) → `7db3583` (Pipeline/Dashboard/Watchlist/Alerts/Leaderboard/Settings/Candidate Detail) → `7ee2b87` (Compare) → `3c1003e` (Login, since superseded — see Layer 3). | **Currently live in production** for every screen except Landing/Login. | Pipeline, Dashboard, Watchlist, Alerts, Leaderboard, Settings, Candidate Detail (MemoDisplay sections + CandidateCoreHero WebGL rotor), Compare, `/analyze` (Discover) |
| **3. "One World" cinematic redesign** | This session's presentation-layer-only redesign: warm gold/cream on a dark cinematic world (glass panels, ambient particles, the locked "Cathedral of Palms" hero identity). | Landing + Login **implemented**. Candidate Detail **prototyped, mid-polish, not yet implemented**. Dashboard + Discover **not yet started** (planned Phases 4–5). | Eventually all screens except those explicitly out of scope (see below) |

**The standing rule for Layer 3, stated explicitly by the owner at the start of this redesign and reaffirmed today: it is a presentation-layer treatment applied ON TOP of Layer 2's real, working information architecture and data bindings — never a wholesale layout replacement.** Candidate Detail's prototype already follows this correctly (every real `MemoDisplay` section id/order/content preserved verbatim; the real WebGL `CandidateCoreHero` referenced as the thing to keep, not replace — see §3). Dashboard and Discover must follow the same rule when their turn comes: the real pi-* implementation is the IA/content source of truth; Phase 4/5 only re-skins its presentation.

**Explicitly out of scope for Layer 3** (stays on pi-\*/`AppShell` indefinitely, per the original approved redesign plan): Watchlist, Alerts, Leaderboard, Settings/Billing, History. **Compare** is also explicitly out of scope — it has its own frozen v1 mockup (approved 2026-07-21, see `docs/UI_POLISH_BACKLOG.md`) and was deliberately excluded from the cinematic plan from day one.

---

## 2. Screen-by-screen status

| Screen | Real route | Current live UI | Approved-not-implemented asset | Cinematic (Layer 3) status |
|---|---|---|---|---|
| Landing | `app/page.tsx` | **Layer 3, implemented** | — | Done. Hero background changed 2026-07-22: real bamboo video (`landing-hero-bamboo.mp4`), not the Cathedral of Palms photo — owner-reviewed and approved with full knowledge of the subject mismatch. |
| Login | `app/login/page.tsx` | **Cream register, implemented** | — | Redesigned 2026-07-22 — cream/light, no hero image or video, per owner request. No longer "the same world" visually; still the same tokens/typography/brand mark. |
| Dashboard / Home | Canonical URL: `/dashboard`. IA authority: **`docs/CANONICAL_HOME_ARCHITECTURE.md`** (owner-decided merge, 2026-07-22 — neither existing route is design authority; both are implementation resources; `/pipeline` deleted after the merge) | Layer 2 (pi-\*) `/dashboard` until Phase 4 ships | — | **Unblocked.** Phase 4 next: background candidates → mockup → owner approval → R&D doc → implement. |
| Discover | `app/analyze/page.tsx` (1267 lines) | Layer 2 (pi-\*, substantially matches `scratchpad/discover_merged.final.html` / the "Discover — redesign mockup" Artifact) | Known real gap (not a design question): no persistent nav chrome on this route today — flagged in `docs/STITCH_NARRATIVE_REMAPPING.md`, unresolved | **Not started.** Phase 5. Real `/analyze` page is the IA source of truth. |
| Candidate Detail | `app/memo/[id]/page.tsx` | Layer 2 body (`MemoDisplay.tsx`, 14 real sections) + Layer 2 hero (`CandidateCoreHero`, real WebGL 3D rotor — see §3) | `design-prototypes/candidate-detail-night.html` — reviewed, owner said "very close," currently in a world-class polish pass (in progress) | **Prototyped, not implemented.** This is the active phase. |
| Compare | `app/research/compare/page.tsx` | Layer 2, frozen v1 (approved 2026-07-21) | — | **Explicitly out of scope.** Do not redesign. |
| Watchlist / Alerts / Leaderboard / Settings / History | various | Layer 2 (pi-\*) | — | **Explicitly out of scope.** Stays on `AppShell`. |
| `/pipeline` | `app/pipeline/page.tsx` | Layer 2, chrome-less by design (no `AppShell`), never linked in nav | — | **Implementation resource for the canonical Home; route deleted after the Phase 4 merge** (per `CANONICAL_HOME_ARCHITECTURE.md`). Not out-of-scope, not a screen — a donor. |

---

## 3. The rotor — one mark, two real implementations (do not build a third)

The six-gold-blade rotor (`#D4A94A` blades, dark core) is the product's core visual identity. It exists in exactly two real, intentional forms — never invent a third:

1. **Brand mark** — `components/cine/RotorMark.tsx` (Layer 3). A simple static SVG, used small (nav, footer) wherever the cinematic system needs the logo. Not data-bound.
2. **The real hero instrument** — `components/pi/candidate-core/` (Layer 2, currently live in `/memo/[id]`). A genuine React Three Fiber / WebGL 3D scene: `CandidateCoreCanvas.tsx`, `CandidateCoreRotor.tsx` (the actual mesh/materials, ~20KB), `buildRotorGeometry.ts`, `coreDataAdapter.ts` (real score/confidence/blade-magnitude data binding), `corePullPhysics.ts` + `useCorePullGesture.ts` (the "Pull" interaction — see the frozen product-language memory), `motionEasing.ts`. Locked behavior per the design-DNA memory: blades rotate at constant linear velocity (never a "loading spinner" ease), hub shows the real score via a `drei <Html>` overlay, no ring/bezel around the core (explicitly rejected twice), self-emissive material (not a hidden point-light — explicitly rejected twice), diagonal off-canvas light beams.

**Consequence for the Candidate Detail cinematic implementation (Phase 3, active now):** the prototype's SVG rotor is correctly documented as a temporary stand-in (it says so in its own comments). When this ships, the *real* `CandidateCoreHero`/`CandidateCoreCanvas` component must be reused verbatim (geometry, physics, data adapter untouched) — only the stage/environment around it (background, glass panels, lighting) gets the cinematic treatment. This was already the plan's own stated rule; this document exists so it survives context resets.

---

## 4. Locked tokens (consistent across Layer 2 and Layer 3 — confirmed, not a conflict)

| Token | Value | Source |
|---|---|---|
| Cream | `#FBF7EE` | `tailwind.config.ts` `pi.cream` |
| Gold (deep) | `#D4A94A` | `pi.gold-deep` |
| Gold (bright) | `#C9971F` | `pi.gold-bright` |
| Ink | `#16171A` / `#16171C` (rotor core) | `pi.ink` |
| Build verdict | `#3FA36E` (line) / `#2E6B48` (solid) | `GlassInstrument.tsx` `TONE_LINE`/`pi.build` |
| Invest verdict | `#5B7FBB` / `#35507A` | `TONE_LINE`/`pi.invest` |
| Risk verdict | `#C9573F` / `#A13F2E` | `TONE_LINE`/`pi.risk` |
| Sans | Inter (`--font-inter`) | both layers |
| Mono | JetBrains Mono (`--font-jbmono`) | both layers |
| Serif | **Unresolved — see §6** | — |
| Cinematic motion | `ease-cine` = `cubic-bezier(.16,1,.3,1)`, `duration-cine` 450ms/`-fast` 200ms/`-slow` 600ms | `tailwind.config.ts`, Layer 3 only — Layer 2 components use Framer Motion directly, no shared token vocabulary yet |

Glass surface recipe (Layer 3): `components/cine/GlassPanel.tsx` — border + gradient (white-to-black mix, not white-only — this was a real legibility bug found and fixed this session, see git history), `backdrop-blur-2xl backdrop-saturate-150 backdrop-brightness-75`, corner sheen, reflection streak, optional 3D hover tilt. `GlassInstrument.tsx`/`ProofCard.tsx` build on it. This is the canonical glass recipe going forward — reuse it, don't reinvent per screen.

---

## 5. Navigation — real ground truth vs. a stale memory record

**`components/shell/SideNav.tsx` is the real, current navigation** (Layer 2, used by every pi-\* screen): **Home** (`/dashboard`) · **Compare** (`/research/compare`) · **History** (`/research/history`) · **Track Record** (`/leaderboard`) · **Settings** (`/settings/billing`), plus a separate "New Analysis" CTA to `/analyze`.

Two things this audit found and is flagging rather than silently fixing:

1. An old memory record ("brand identity locked") describes the topnav IA as "Pipeline · Discover · Track Record · Settings" — **this is stale**, from before routes were renamed/consolidated. The real IA above supersedes it. That memory should be corrected.
2. `components/cine/CineShell.tsx`'s nav (Layer 3, used by Landing/Login) has **Home / Compare / Track Record / Settings — missing History**, a real one-line gap versus the current SideNav. Not fixed here since this pass is audit-only; flag for the next time CineNav is touched.

---

## 6. Open questions — real conflicts, not resolved here on purpose

1. **Does the Layer 3 cinematic visual language now supersede Layer 1's `PRODUCT_INTELLIGENCE_V2_DESIGN_SYSTEM.md`?** That doc specifies Inter-only headlines (serif for customer quotes only), a 4px spacing scale, and bans several chart types. The actual shipped product (both Layer 2 and Layer 3) uses `font-serif` broadly for headlines and doesn't follow the 4px scale literally. This was already flagged once (missing-serif-font-var memory) and never resolved. Given today's instruction that "the Cathedral of Palms hero and the cinematic landing experience... must remain the foundation of the design system," the practical answer appears to be yes — but this is exactly the kind of standing-doc supersession that the V2 blueprint's own authority chain says requires explicit owner approval, not a unilateral call. **Needs an explicit answer.**
2. **The `--font-serif-pi` CSS variable bug** (referenced by `font-serif` everywhere, never actually defined in `app/layout.tsx` before this session — since fixed to load `Source_Serif_4`, per git history). Given open question #1, worth confirming the fix itself was the right call, or whether serif headlines should be replaced with Inter to match the original V2 spec.
3. **Discover's real gap** (no persistent nav chrome on `/analyze` today) — does Phase 5's cinematic redesign inherit and fix this, or is it a separate Layer 2 fix that should happen independently first?
4. Whether Compare ever gets a cinematic pass, or is permanently pi-\*-cream by design (currently the plan says permanently out of scope — confirm this is still true before Phase 5, since Discover and Compare are adjacent in the product).
5. **Rejected hero-background alternates exist in the scratchpad** from both exploration rounds (round 1: an immersive lagoon, a rainforest with god-rays, a solar-horizon composition; round 2: two runner-ups alongside the chosen Cathedral of Palms). Listed here only so a future session doesn't mistake "it exists in scratchpad" for "it's approved" — none of these were picked. Cathedral of Palms (day + night) are the only two locked background compositions.
6. ~~Which route is the real Dashboard/Home~~ — **RESOLVED by owner decision, 2026-07-22:** *neither* route is the design authority. The canonical Home is a new cinematic experience continuing from Landing under the One World principle; `/dashboard` and `/pipeline` are **implementation resources only** — the strongest IA and functionality from both are merged (stage-grouped IA + anchor sentence + "What changed" + frozen vocabulary from `/pipeline`; quota awareness + portfolio aggregates + per-card intelligence from `/dashboard`). Canonical URL stays `/dashboard`; the `/pipeline` route is deleted after the merge. Full merge definition: `docs/CANONICAL_HOME_ARCHITECTURE.md`. Phase 4 is unblocked and proceeds through the standing gate (background candidates → mockup → owner approval → R&D doc → implementation).

---

## 7. Working rule from here forward

Before designing any screen: **check this document's §0 and §2 tables first.** If a real Layer 2 implementation exists, it is the information architecture and content source of truth — the only job of a new cinematic pass is the presentation layer on top of it (background, glass, motion, hierarchy), never a fresh layout invented from scratch. If an approved-but-unimplemented mockup exists, compare it against the current real implementation before starting anything new — the real implementation usually already absorbed the mockup's decisions (as happened with Dashboard, Discover, and Compare), so re-reading the old mockup in isolation can be actively misleading.

If two versions of anything are found that this document doesn't already reconcile, stop and compare them explicitly rather than picking one silently.

Last check before calling any screen done: re-read "The One World principle" above and confirm the screen actually passes its verification gate.
