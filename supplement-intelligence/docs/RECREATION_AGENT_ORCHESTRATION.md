# Agent & Skill Orchestration Plan — Recreating All Pages

**Date:** 2026-07-22 · **Scope:** every screen except Landing and Login (both approved, locked, untouched). **Method:** read every agent definition file in `.claude/agents/` and every skill definition in `.claude/skills/` + the user-level 21st family, directly from disk — not from memory of earlier descriptions. This document is the real roster, what each one is actually authorized to touch, and the order they fire in per screen.

This sits **under** the three governing documents already committed — it does not add new rules, it operationalizes the existing gate (`DESIGN_LANGUAGE_PLAN.md` §"Owner clarification" + `UX_EXPERIENCE_PLAN.md` §4) with names and a firing order.

---

## 1. The whole roster, and the verdict on each

### Agents that ARE in scope for this initiative

| Agent | What it actually owns (from its own file) | Role in the recreation |
|---|---|---|
| **`architecture-agent`** | Read-only reuse/architecture audit. Tools: Read, Bash, WebFetch, WebSearch, Skill. No edit rights, no Agent tool. | Runs first, per screen: audits the real current route/component/data-hook shape before any mockup is drawn, so the mockup is grounded in what actually exists (this is exactly the discipline that caught the two `/dashboard` vs `/pipeline` and `GlassPanel` structural bugs earlier this session). |
| **`ui-ux-design-agent`** | Owns flows/hierarchy/a11y/design system. Prototypes in isolation only — **cannot** touch `app/**` or `components/**` live. Tools include the Stitch MCP suite + Playwright screenshot/navigate/resize. **Currently dormant, activates now** — this is exactly the "explicitly-approved design milestone" its own file requires. | Builds each screen's mockup (what I've been doing directly this session) — can be delegated to this agent going forward for screens after Home, freeing the Planner seat for orchestration/review. |
| **`motion-3d-agent`** | Owns Three.js/R3F/GSAP/shaders. **Dormant**, activates "only if a future design milestone explicitly calls for it." | **Activates specifically for Candidate Detail** — the real WebGL rotor (`components/pi/candidate-core/`) needs its cream-stage treatment designed/verified, which is squarely this agent's domain, not `frontend-engineering-agent`'s. Stays dormant for every other screen (none of them use WebGL). |
| **`frontend-engineering-agent`** | Translates an **approved** design into production code. Owns `app/**`, most of `components/**`. Explicitly forbidden from integrating a still-under-review prototype into a live route. **Currently dormant, activates now.** | Implements each screen only after its mockup has your explicit approval and an R&D doc exists — exactly the gate already established. |
| **`independent-reviewer-agent`** | Fresh-context correctness/simplification review via the `code-review` skill. Read + Bash + Skill only, no edits. | Runs after every implementation, before QA — a genuinely independent second read (not the implementer grading itself), matching how I found the `GlassPanel`/video-positioning bugs by re-checking my own work — this makes that check structural instead of relying on me remembering to do it. |
| **`qa-production-agent`** | Full regression gate (tsc/vitest/build) + live Playwright verification. Validates only, never edits. | Runs after independent review — the same tsc/vitest/build/live-browser check I've been running by hand every screen, formalized as a gate a milestone can't skip. |
| **`security-compliance-agent`** | Exclusive review gate over `middleware.ts`, `app/api/billing/**`, RLS migrations, secrets. | **Only triggers if a recreated screen touches Settings/Billing** (the billing page is in the later rollout wave). No other screen in this initiative touches its territory. |
| **`Explore`** (built-in) | Fast read-only search for locating code/patterns. | Quick lookups mid-mockup (e.g. "where's the real `computeCardIntelligence` shape") — cheaper than a full `architecture-agent` dispatch for a single-question lookup. |

### Agents NOT in scope — real, but this initiative doesn't touch their territory

| Agent | Why it's excluded here |
|---|---|
| **`decision-engine-agent`** | Owns `lib/scoring.ts`/`verdict-matrix.ts`/Stage 1–4. This whole initiative is presentation-only — no screen recreation changes how a verdict is computed. |
| **`backend-agent`** | Owns the provider/pipeline engines (`lib/science-engine/**` etc.). Recreated screens *consume* existing data, never add a new provider. |
| **`data-database-agent`** | Owns schema/migrations/`provider_cache`. No recreated screen needs a new persistence primitive — they all read data that's already stored. |
| **`research-evidence-agent`** | Tests live external APIs for new data-source feasibility. Not needed — nothing here proposes a new data source. |

If any of the above turns out to be needed mid-recreation (e.g. a screen wants a field that doesn't exist yet), that's a **scope discovery**, not a silent workaround — it goes back to you as a real decision point, per every agent's own "no scope expansion" rule.

## 2. The skills, and the verdict on each

### In scope

| Skill | What it is | Use in the recreation |
|---|---|---|
| **`ui-ux-pro-max`** | 84 styles/192 palettes/98 UX guidelines/25 chart types, searchable. **Standing policy: query it before every screen** (reinforced twice this session). | Already run for Home; runs again for every remaining screen's mockup, exactly as before — structural/motion/a11y guidance adopted, generic palette outputs discarded in favor of the locked `pi-*` tokens. |
| **`21st-cli-use`** / **`21st-ai`** | Search/install/generate real component patterns from the 21st.dev catalog. | Pattern research step before each mockup (already run for Home — no close catalog match, confirming we build on our own primitives; worth re-checking per screen since the catalog changes). |
| **`artifact-design`** | Design guidance for building the mockup HTML itself well (typography, layout, honoring the brand). | Used for every mockup file (already implicitly followed for Home). |
| **`rd-document-generator`** | Enforces the 7-section R&D doc (reuse audit / architecture touched / files to change / risks / testing plan / smallest-correct-scope / non-goals). | One per screen, after mockup approval, before `frontend-engineering-agent` starts. |
| **`dataviz`** | Chart/stat-tile/sparkline design system — form heuristics, color-by-series rules, mark specs. | Directly relevant to Home's pulse line and any per-screen stat tiles/sparklines going forward — should be consulted explicitly (not yet run this session; a real gap to close before Home's mockup is finalized). |
| **`feature-flag-staged-cutover`** | Formalizes what must be recorded before a "built" milestone goes "live" (flag name, rollback, activation criteria, evidence). | **Applies specifically to the `/pipeline` deletion** — that's a real cutover (old route removed once Home ships), not a routine change. |
| **`simplify`** | Post-implementation reuse/simplification pass (quality only, not bug-hunting). | One pass per screen after `frontend-engineering-agent` finishes, before independent review. |
| **`security-review`** (plugin-provided, invoked by `security-compliance-agent`) | Its formal review checklist. | Only fires if/when Settings/Billing is recreated. |
| **`code-review`** (plugin-provided, invoked by `independent-reviewer-agent`) | Its formal review mechanism. | Fires every screen, via that agent. |

### Explicitly out of scope

`confidence-tiered-extraction`, `data-provider-integration-contract`, `llm-cost-rate-governance`, `claude-api` — all real, all reserved for backend/decision-engine work (extraction tiering, provider integration shape, Anthropic call-site governance). Nothing in a presentation-only recreation touches any of them.

## 3. The firing order, per screen (unchanged gate, now with names)

1. **`architecture-agent`** — real-data audit of the screen's current route/hooks (or `Explore` for a quick single-question version).
2. **Planner** (or delegated to **`ui-ux-design-agent`**) — `ui-ux-pro-max` query → `21st-cli-use` pattern check → `dataviz` if the screen has charts/tiles → mockup, using `artifact-design`.
3. **Owner approval** — the gate that never moves.
4. **`rd-document-generator`** → R&D doc.
5. **`frontend-engineering-agent`** implements (with **`motion-3d-agent`** handling any WebGL layer first, Candidate Detail only).
6. **`security-compliance-agent`** — only if the screen touches billing/auth/RLS/middleware.
7. **`simplify`** pass.
8. **`independent-reviewer-agent`** (via `code-review`).
9. **`qa-production-agent`** — tsc/vitest/build + live Playwright, the real bar every screen has already been held to by hand this session.
10. **`feature-flag-staged-cutover`** discipline recorded — only for the `/pipeline` deletion step.

## 4. What this changes about how the rest of this session runs

Nothing about the plan or the palette — this is purely a delegation option. Screens can continue being built directly (as Home was), or handed to `ui-ux-design-agent`/`frontend-engineering-agent` for the mockup/implementation legs respectively, with the Planner (this session) doing orchestration + the owner-approval checkpoints + final review coordination either way. The gate order in §3 applies regardless of who does the drawing.
