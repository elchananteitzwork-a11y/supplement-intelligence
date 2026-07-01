# The Intelligence Lab — Design System

**Status:** Foundation complete. No pages have been redesigned. No backend logic, API, or Decision Engine code has been touched — this document and its accompanying token files (`app/design-tokens.css`, `lib/design-tokens.ts`, the `lab.*` additions in `tailwind.config.ts`) are purely additive and sit alongside the existing brass/ink system, which remains live until pages are migrated one at a time.

---

## 0. Philosophy

**The product is a research instrument, not a media app.**

Picture a secret laboratory at night: a vessel docked off the edge of the known market, where an AI continuously draws evidence from hundreds of sources — Amazon sell-through, search demand curves, TikTok virality signals, FDA recall feeds, supplier networks — and distills it into a single, defensible verdict. The room is dark. The only light comes from instruments. Every glow means something. Nothing is decorative.

That is the room this design system builds.

**Reference points, never destinations.** Apple Vision Pro's spatial glass and restraint. Linear's precision and hairline discipline. Stripe's typographic confidence. Bloomberg Terminal's conviction that density is not the enemy of clarity. High-end scientific instrumentation's belief that a number is only as trustworthy as its calibration is visible. We borrow *principles* from each — never a single visual signature from any of them.

**Three non-negotiable rules that follow from the philosophy:**

1. **Color encodes meaning before it encodes brand.** This product's entire value proposition is "know what's real and what's inferred." The palette's most important job is making that distinction instantly legible — see §1's provenance mapping and §16. A redesign that made the app prettier but blurred verified-vs-synthesized would be a regression, not an upgrade.
2. **Instruments don't bounce.** Motion in this system decelerates; it does not oscillate, overshoot, or bounce (one narrow exception in §7). Confidence reads as stillness arriving precisely, not as something performing for attention.
3. **Darkness is the canvas, not the absence of design.** Every surface is a step of elevation in true darkness — there is no "light mode" concept here, no muddy gray mid-tones. The void itself (§1) is tuned as carefully as any accent color.

---

## 1. Color System

### Why a new palette, not an extension of brass/ink

The existing system (`brass` accent, warm `ink` background, italic serif "eyebrow" accents) reads as **premium editorial** — closer to a luxury print magazine than a research instrument. That's a legitimate, well-executed aesthetic, but it's the wrong one for "secret lab distilling evidence into verdicts." The Intelligence Lab palette is deliberately **colder** (bluer blacks, no warm undertone), **more desaturated at rest**, and reserves saturation entirely for moments that mean something.

### Void scale — surfaces

| Token | Hex | Use |
|---|---|---|
| `--lab-void-0` | `#050507` | Page background |
| `--lab-void-1` | `#0a0a0d` | Base surface (sections, panel backgrounds) |
| `--lab-void-2` | `#0f0f13` | Card / panel |
| `--lab-void-3` | `#15161b` | Elevated state, hover surface |
| `--lab-void-4` | `#1b1c23` | Modal, overlay, popover |
| `--lab-void-5` | `#21222b` | Highest elevation — tooltip, command palette |

Each step is roughly +2.5% lightness over the last. The eye should read elevation as "closer to the light source," never as a discrete color change.

### Borders — hairline system

| Token | Value | Use |
|---|---|---|
| `--lab-border-faint` | `rgba(255,255,255,.05)` | Dividers inside an already-bordered container |
| `--lab-border-soft` | `rgba(255,255,255,.08)` | Default card/panel border |
| `--lab-border-default` | `rgba(255,255,255,.12)` | Inputs, interactive elements at rest |
| `--lab-border-strong` | `rgba(255,255,255,.18)` | Hover/active state |

**Rule:** never place two `strong` or `default` borders on adjacent edges. A card with a `soft` border containing a divider uses `faint` for that divider — elevation should compound by *darkness*, not by *border weight*.

### Text

| Token | Hex | Use |
|---|---|---|
| `--lab-text-primary` | `#f2f3f5` | Headlines, primary data |
| `--lab-text-secondary` | `#9b9fac` | Body copy, supporting text |
| `--lab-text-tertiary` | `#686c78` | Captions, metadata, AI-judgment labels (see §16) |
| `--lab-text-disabled` | `#44474f` | Disabled controls |
| `--lab-text-inverse` | `#08090b` | Text on light/filled surfaces (rare — e.g. solid Photon buttons) |

### Signature accent — Photon

The "scanning beam" — the AI's gaze across a marketplace. Primary accent; reserved for the system's own confident actions and for **verified** data (see provenance mapping below).

| Token | Hex |
|---|---|
| `--lab-photon-dim` | `#2e84d9` |
| `--lab-photon` | `#4fa8ff` |
| `--lab-photon-bright` | `#7fc4ff` |

### Secondary accent — Spectrum

Violet. Represents synthesis — the AI's own inference, as distinct from a directly observed fact. Used for `CATEGORY_CREATION_CANDIDATE` (an inferred verdict) and for `synthesized` provenance.

| Token | Hex |
|---|---|
| `--lab-spectrum-dim` | `#6c5ce0` |
| `--lab-spectrum` | `#8b7cff` |
| `--lab-spectrum-bright` | `#aba0ff` |

### Semantic — verdict

The existing emerald/amber/red traffic-light convention for `BUILD_NOW` / `VALIDATE_FURTHER` / `SKIP` is **preserved as a concept** (changing it would cost users a learned mental model for no benefit) and **refined in hue** to sit naturally in the cooler palette.

| Verdict | Token | Hex |
|---|---|---|
| `BUILD_NOW` | `--lab-verdant` | `#34d9a0` |
| `VALIDATE_FURTHER` | `--lab-amber` | `#f5b947` |
| `SKIP` | `--lab-ember` | `#ff6259` |
| `CATEGORY_CREATION_CANDIDATE` | `--lab-spectrum` | `#8b7cff` |

### Semantic — provenance tier (the system's most important color mapping)

This product's entire credibility rests on distinguishing *real, sourced data* from *AI judgment*. Every existing provenance level (`verified` / `estimated` / `synthesized` / `unsupported` / `unknown` — see `lib/provenance.ts`) gets a fixed, reused color. This is not decoration: it is the visual encoding of epistemic status, used everywhere a claim or number appears (badges, evidence-card accent bars, chart line styles — see §16).

| Tier | Token | Resolves to | Meaning |
|---|---|---|---|
| `verified` | `--lab-provenance-verified` | Photon `#4fa8ff` | Pulled directly from a real external source |
| `estimated` | `--lab-provenance-estimated` | Amber `#f5b947` | Real data given to the model as grounding; model wrote the text |
| `synthesized` | `--lab-provenance-synthesized` | Spectrum `#8b7cff` | Pure model pattern-matching, no external data |
| `unsupported` | `--lab-provenance-unsupported` | Ember `#ff6259` | Checked against evidence and contradicted, or no qualifying match found |
| `unknown` | `--lab-provenance-unknown` | text-tertiary `#686c78` | Provenance not determinable |

JS-side mapping lives in `lib/design-tokens.ts` as `labProvenanceColor`.

### Glow

Ambient light-bleed for hero numbers, focus rings, and "this just became true" moments. Used sparingly — a page where everything glows is a page where nothing does.

`--lab-glow-photon`, `--lab-glow-spectrum`, `--lab-glow-verdant`, `--lab-glow-amber`, `--lab-glow-ember` — see `app/design-tokens.css` for exact shadow values (soft, 60–80px spread, 14–18% opacity).

### Data visualization — categorical & sequential

8-color categorical palette (`labChartCategorical` in `lib/design-tokens.ts`): Photon, Spectrum, Verdant, Amber, Ember, then Teal `#3fd3c6`, Rose `#f178b6`, Slate-blue `#6e84b8` for series beyond the core five. The first five intentionally match the semantic accents, so a legend stays meaningful even in a chart with exactly one verdict or provenance series.

**Sequential** (intensity/evidence-strength ramps): single-hue Photon, from `rgba(79,168,255,.08)` at the dim end to `#cfe9ff` at the bright end.

**Diverging** (risk ↔ opportunity spectrums): Ember → `--lab-void-3` (neutral midpoint) → Verdant.

---

## 2. Typography

### Faces

| Role | Face | Loaded as | Status |
|---|---|---|---|
| Display / headlines | **Space Grotesk** (500/600/700) | `--font-space-grotesk`, Tailwind `font-display` | Loaded, not yet wired into any page |
| Body / UI | **Inter** (400/500/600/700) | `--font-inter`, Tailwind `font-sans` | Active, kept |
| Data / evidence numbers | **JetBrains Mono** (400/500/600) | `--font-jbmono`, Tailwind `font-mono` | Active, kept |

**Why Space Grotesk replaces Fraunces as the display face:** Fraunces is a warm, editorial serif — exactly right for the brass/ink "luxury magazine" identity, exactly wrong for "research instrument." Space Grotesk is geometric with just enough character to feel engineered rather than corporate; it reads as precision tooling, not as a content brand. Fraunces remains loaded (pages still use `.eyebrow`) until cut over.

**Why Inter and JetBrains Mono are kept:** both already do their jobs well. Inter is the right choice for dense UI body text at any sophistication level — changing it would be re-skinning for its own sake. JetBrains Mono already gives "evidence visualization language" (§16) its monospace-numbers convention; the Lab system formalizes and leans into that rule rather than replacing it.

### The one hard rule: **numbers are mono, inferences are italic sans**

Any number that represents a real, measured quantity (price, percentage, unit count, date, score) renders in JetBrains Mono. Any text that is the model's own judgment or narrative voice renders in Inter italic, colored `text-tertiary`. This single typographic rule communicates "is this real or inferred" even in grayscale, even to a colorblind reader, with zero reliance on color. See §16.

### Type scale

A modular scale (~1.25 ratio) anchored at a 14px UI base:

| Token | Size / line-height / tracking | Face | Use |
|---|---|---|---|
| `display-2xl` | 64px / 1.05 / -0.02em | Space Grotesk 700 | Hero opportunity scores |
| `display-xl` | 48px / 1.08 / -0.015em | Space Grotesk 600 | Page-level hero numbers |
| `display-lg` | 36px / 1.1 / -0.01em | Space Grotesk 600 | Section heroes |
| `display-md` | 28px / 1.15 / -0.005em | Space Grotesk 500 | Card-level heroes |
| `heading-lg` | 22px / 1.3 | Inter 600 | Page titles |
| `heading-md` | 18px / 1.4 | Inter 600 | Panel titles |
| `heading-sm` | 15px / 1.4 | Inter 600 | Card titles, optional uppercase + tracking |
| `body-lg` | 16px / 1.6 | Inter 400 | Lead paragraphs |
| `body-md` | 14px / 1.6 | Inter 400 | Default UI text |
| `body-sm` | 13px / 1.5 | Inter 400 | Secondary text, table cells |
| `caption` | 12px / 1.4 | Inter 500 | Metadata, timestamps |
| `micro` | 11px / 1.3, tracking +0.08em, uppercase | Inter 600 | Labels, eyebrows (existing `.label` pattern, kept) |
| `data-lg` | 32px / 1.1 | JetBrains Mono 600 | Hero metric readouts |
| `data-md` | 18px / 1.3 | JetBrains Mono 500 | Inline evidence numbers |
| `data-sm` | 13px / 1.4 | JetBrains Mono 400 | Table figures |

---

## 3. Grid System

- **Base unit:** 4px. Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64 / 80 / 96.
- **Content width:** max 1280px for reading-width content (executive summary, thesis prose); up to 1440px for dashboard/console layouts with a persistent side panel.
- **Columns:** 12-column grid at `lg`+; gutters 24px desktop / 16px mobile.
- **The "Lab Console" pattern:** primary content + a persistent instrument sidebar (already present informally as the memo page's "At a Glance" panel) is the system's signature layout for any analysis/detail view — not a generic two-column layout, but specifically: main content scrolls, sidebar instruments stay fixed, sidebar always shows score + verdict + evidence-coverage at a glance regardless of scroll position.
- **Breakpoints (kept at Tailwind defaults, behavior documented):** `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280 / `2xl` 1536. The console sidebar collapses below `lg` (see §18).

---

## 4. Glassmorphism

**"Lab Glass"** — a single, precise recipe in three tiers, not a generic blur-everything aesthetic. Over-blurred glass looks cheap; restraint is what makes it look expensive.

| Tier | Class | Blur | Use |
|---|---|---|---|
| Thin | `.lab-glass-thin` | 12px | Sticky nav bars, section headers |
| Regular | `.lab-glass` | 20px | Cards, panels |
| Heavy | `.lab-glass-heavy` | 32px | Modals, command palette |

Recipe (constant across tiers, only blur radius changes): background `rgba(255,255,255,.045)`, border `rgba(255,255,255,.08)`, inset highlight `inset 0 1px 0 rgba(255,255,255,.06)` to simulate a top edge catching light. Glass always sits in front of a void surface, never in front of another glass layer (no double-blur).

**Mobile Safari fallback:** `backdrop-filter` is expensive on older iOS and can drop frames. `.lab-glass` includes an `@supports not (backdrop-filter: blur(1px))` fallback to a solid `--lab-void-3` background — legibility never depends on blur succeeding.

---

## 5. Shadows

Soft, large-radius, low-opacity, cinematic — never the default sharp-edged Tailwind shadow shapes.

| Token | Value |
|---|---|
| `--lab-shadow-xs` | `0 1px 2px rgba(0,0,0,.4)` |
| `--lab-shadow-sm` | `0 4px 12px -4px rgba(0,0,0,.5)` |
| `--lab-shadow-md` | `0 12px 32px -8px rgba(0,0,0,.6)` |
| `--lab-shadow-lg` | `0 24px 56px -16px rgba(0,0,0,.7)` |
| `--lab-shadow-xl` | `0 40px 96px -24px rgba(0,0,0,.75)` |

Plus the accent-tied glow shadows from §1, used only on hero/focus/active elements — never as a default card treatment.

---

## 6. Borders

(Color values in §1.) Radius scale:

| Token | Value | Use |
|---|---|---|
| `--lab-radius-xs` | 6px | Chips, tags |
| `--lab-radius-sm` | 8px | Inputs, buttons |
| `--lab-radius-md` | 12px | Cards |
| `--lab-radius-lg` | 16px | Panels |
| `--lab-radius-xl` | 20px | Modals, hero cards |
| `--lab-radius-full` | 9999px | Pills, avatars, badges |

**Rule:** a card's internal elements never exceed the card's own radius minus its border inset — nested radii should visually "fit inside" their parent, never compete with it.

---

## 7. Motion Language

**"Instruments don't bounce."** Standard easing decelerates smoothly with no overshoot. The existing `--ease-premium` (`cubic-bezier(.16,1,.3,1)`, which *does* overshoot slightly) is preserved as `--lab-ease-enter` and reserved for exactly one moment: the score count-up reveal, the system's single permitted celebratory beat. Everything else uses `--lab-ease-standard` (`cubic-bezier(.22,1,.36,1)`).

| Token | Value | Use |
|---|---|---|
| `--lab-duration-instant` | 100ms | Hover state changes |
| `--lab-duration-fast` | 200ms | Small UI transitions (focus rings, toggles) |
| `--lab-duration-base` | 350ms | Card reveals, panel expand/collapse |
| `--lab-duration-slow` | 600ms | Page-level reveals, hero score count-up |
| `--lab-duration-cinematic` | 900ms+ | Reserved for onboarding/empty-state hero moments only |

**Stagger:** when revealing a list or grid (evidence cards, discovery results), children stagger by 40–60ms each (`labMotion.staggerMs = 50` default). Never stagger more than ~8 items — past that, the cascade reads as lag, not intention.

**Named keyframe vocabulary** (implemented in `app/design-tokens.css`):

- `lab-fade-up` — the base reveal: opacity 0→1, translateY 8px→0. The system's default "this just appeared" motion.
- `lab-scan-in` — a left-to-right clip-path reveal, evoking a scanning beam passing over content. Reserved for hero moments (a verdict resolving, a new evidence card landing) — not a default-everywhere transition.
- `lab-glow-pulse` — a slow opacity breathe (2.4s, ease-in-out, infinite) for "live/processing" indicators.
- `lab-scan-sweep` — the loading-skeleton sweep (see §14).

All motion respects `prefers-reduced-motion: reduce` (already a strong existing convention — kept and extended to every new keyframe).

---

## 8. Card System

Cards are tiered by **semantic purpose**, not just visual variant:

| Tier | Class | Recipe | Use |
|---|---|---|---|
| Surface | `.lab-card` | void-2 bg, soft border, radius-md, shadow-xs | Flat containers — table wrappers, simple grouping |
| Evidence | `.lab-card` + `.lab-card-evidence` + `.lab-provenance-{tier}` | adds a 3px left accent bar colored by provenance tier, shadow-sm | Any card presenting a data-backed claim — see §16 |
| Glass | `.lab-glass` | see §4 | Premium hero panels, dossier summaries |
| Interactive | `.lab-card` + `.lab-card-hover` | border brightens to Photon, lifts -2px, shadow-md | Anything clickable |

The existing tilt-on-hover treatment (`.opportunity-tile`'s `perspective(900px) rotateX(1.4deg)`) is a genuinely good detail — kept conceptually, retuned to `--lab-ease-standard` and an accent-aware border color (Photon by default, or the relevant verdict/provenance color when the card represents one) rather than always brightening to brass.

---

## 9. Button System

| Tier | Recipe | Use |
|---|---|---|
| Primary | solid `text-inverse` on `text-primary` (white-on-dark inverted) | The single highest-priority action per view |
| Accent | solid Photon, `text-inverse` label | "System-confident" actions — Run Analysis, Generate |
| Secondary | translucent white `bg-white/[.06]`, soft border | Default secondary actions (kept from existing `.btn-dark`) |
| Ghost | text-only, `text-secondary`, hover bg `bg-white/[.06]` | Tertiary/navigation actions |
| Destructive | Ember-tinted, outline at rest, filled on confirm | Delete, abandon, irreversible actions — does not currently exist as a distinct tier |

**Sizes:** sm (32px height) · md (40px, default) · lg (48px, hero CTAs).

**States:** default → hover (background lift, `--lab-duration-instant`) → active (slight scale 0.98) → focus-visible (2px ring in the button's own accent color, never the browser default outline) → disabled (40% opacity, no pointer events) → loading (spinner replaces label; button width is fixed/preserved via `min-width` so loading never causes layout shift).

---

## 10. Status Badges

**Two families, deliberately distinguished** so they never compete for attention:

1. **Verdict badges** — filled pill, semantic color, bold text. One per analysis, always paired with the score. `BUILD_NOW` / `VALIDATE_FURTHER` / `SKIP` / `CATEGORY_CREATION_CANDIDATE` (kept from existing `.chip-*`, extended with Spectrum for the fourth verdict which didn't previously have a distinct treatment).
2. **Provenance badges** — outline style (not filled), small dot + label, lower visual weight. Used profusely throughout evidence panels (`Verified` / `Estimated` / `Synthesized` / `Unsupported`). Outline-vs-filled is the deliberate signal that these are frequent and informational, not rare and decisive — prevents the badge-fatigue that would result from giving every provenance tag the same visual weight as a verdict.

---

## 11. Charts

**Principle: charts show uncertainty, not just values.** A line representing verified data is solid; estimated data is dashed; synthesized/projected data is dotted. This is the single most distinctive idea in the chart system and ties directly to §16.

- **Sparklines:** 1.5px stroke, Photon for verified segments, dash pattern `4 3` for estimated/projected segments, drawn in with the existing `sparklineDraw` stroke-dashoffset technique (kept, it's good).
- **Bar charts:** rounded top corners (4px), categorical palette from §1, single baseline gridline at zero only — no gridline clutter.
- **Evidence Breadth / radar-style charts:** rendered as a soft glass disc with a glowing Photon fill proportional to coverage, rather than a busy multi-axis radar grid (the underlying data — `evidenceBreadth.contributingProviders / totalScoreEligibleProviders` — is simple enough that a glowing-disc treatment communicates it faster than a radar plot).
- **Axis labels:** caption-size Inter. **Data labels:** always mono (§2's hard rule applies inside charts too).

---

## 12. Tables

Formalizing the existing "ledger" pattern, which is already correct and stays:

- Hairline row dividers (`--lab-border-faint`), never nested boxes, never zebra striping (too noisy for the palette's restraint).
- Row hover: background lifts one void step (`void-2` → `void-3`); if the row is clickable, a left accent-bar previews in at 0 → full opacity.
- Numeric columns always right-aligned, always mono.
- Sortable headers show a small chevron that fades in on hover, not a permanently-visible sort icon.
- Sticky header on scroll for any table taller than ~6 rows.
- Two density variants: comfortable (56px row height) and compact (40px) — compact for dense evidence tables, comfortable for primary content tables.

---

## 13. Inputs

Kept and refined from the existing `.field` treatment:

- Default: `--lab-border-default`, `--lab-void-2`-adjacent translucent background (`bg-white/[.03]`).
- Focus: border → Photon, ring `Photon at 20% opacity`, `--lab-duration-fast` transition.
- Placeholder: `text-tertiary`.
- Error: border → Ember, helper text in Ember below the field, error icon leading.
- Labels: always `micro` scale, uppercase, positioned above the field — never floating/animating into the field.
- Search inputs: leading search icon, trailing keyboard-shortcut hint (e.g. `⌘K`) where applicable — fits the command-driven "console" feel without requiring an actual command palette to exist yet.

---

## 14. Loading States

**Reject the generic spinner as the default.** A blank spinner during a 50–70 second multi-provider generation pipeline (the real backend latency this app already has) wastes an opportunity to reinforce the entire product metaphor.

- **Primary pattern — "scan sweep" skeleton** (`.lab-skeleton`, implemented): a soft Photon-tinted gradient band sweeps left-to-right across void-3 placeholder shapes, on a 1.8s loop. Reads as "the lab is actively scanning," not "something is broken."
- **Staged narration for long operations:** for the actual generate pipeline, surface the real provider stages as they complete — "Scanning Amazon marketplace… Checking search demand… Cross-referencing safety data…" — turning genuine backend latency into transparency about what's actually happening. This narrates *existing* async stages; it does not add new ones or touch the Decision Engine.
- **Secondary — inline spinners:** 1.5px stroke, Photon, reserved for button-loading states only (where a skeleton doesn't make sense).

---

## 15. Empty States

Never blank. Every empty state: one illustrative element (from the existing custom icon set, or a new instrument-motif icon), one sentence explaining *why* it's empty, one primary action.

- Framing matters: "Your lab is ready" beats "No analyses yet." Empty states in this product should feel like potential, not absence.
- **Exception — evidence-level empty states:** "No real data" / "AI judgment only" appears *constantly* throughout every report (by design — this is the product's honesty mechanism, not a failure state). These render small, inline, `text-tertiary`, no icon — visually quiet on purpose, since they're expected and frequent, not exceptional.

---

## 16. Evidence Visualization Language

The most domain-specific section, and the one with the highest leverage: a single, consistent visual grammar for "is this real or inferred," reused everywhere a claim appears.

1. **Every claim or number carries one of five provenance treatments** (§1's color mapping): a small colored dot + label (`Verified` / `Estimated` / `Synthesized` / `Unsupported` / `Unknown`).
2. **Typography encodes provenance independently of color** (§2's hard rule): real, measured numbers are always JetBrains Mono; AI-judgment text is always italic Inter in `text-tertiary`. This means the verified/inferred distinction survives grayscale printing, colorblindness, or a glance from across the room — color is reinforcement, not the only signal.
3. **Source attribution renders as a lab sample tag:** small monospace chip naming the actual provider (`keepa`, `dataforseo`, `tiktok`, `openfda`...) — never hidden in a tooltip alone, always visible at a glance next to the claim it backs.
4. **The Evidence Strength meter** (`.lab-evidence-meter`, implemented): 8 small segments, one per possible real-data provider, Photon-filled for contributing providers and outline-empty for the rest. A direct, honest visualization of the existing `evidenceBreadth.contributingProviders / totalScoreEligibleProviders` value from `computeGroundedScore` — visualizes existing Decision Engine output, computes nothing new, changes no scoring logic.
5. **Confidence bands on every chart type** (§11): solid = verified, dashed = estimated, dotted = synthesized, applied consistently whether the chart is a sparkline, bar, or projection line.

---

## 17. Design Tokens — implementation reference

All tokens follow `--lab-{category}-{name}[-{variant}]` and exist in three synchronized forms:

| Form | Location | Use |
|---|---|---|
| CSS custom properties + utility classes | `app/design-tokens.css` | Direct CSS/Tailwind arbitrary-value usage (`var(--lab-photon)`), and ready-made classes (`.lab-card`, `.lab-glass`, `.lab-evidence-meter`, animation utilities) |
| Tailwind theme extension | `tailwind.config.ts` (`theme.extend.colors.lab`, plus `lab-*` shadow/radius/duration/easing/animation keys) | Utility-class usage (`bg-lab-void-2`, `text-lab-photon`, `shadow-lab-md`, `rounded-lab-lg`, `duration-lab-base`, `ease-lab-standard`) |
| TypeScript constants | `lib/design-tokens.ts` | JS-side values for charts, canvas/SVG drawing, and the `ProvenanceTier`/verdict color maps |

All three are additive — none rename or remove an existing `brass`/`ink` token, and no existing component's class list was changed as part of building this foundation.

---

## 18. Responsive Rules

- **Console sidebar:** the Lab Console pattern's instrument sidebar (§3) collapses to a bottom accordion below `lg`; above `lg` it's a persistent fixed-position panel.
- **Dense tables:** below `md`, table rows degrade to a stacked card-per-row layout (label/value pairs) rather than horizontal scroll — horizontal scroll on a data table is a last resort, not a default.
- **Sticky decision strip:** on mobile, the score + verdict strip stays sticky-visible at the top of the viewport on scroll through a report — it's the one piece of information that should never require scrolling back up to recheck.
- **Touch targets:** minimum 40px height for any interactive element below `md`.
- **Glass on mobile:** see §4's `@supports` fallback — blur degrades to a solid surface rather than risk dropped frames on older iOS Safari.
- **Type scale step-down:** display sizes drop one scale step at `sm` (e.g. `display-2xl` 64px → effectively renders at `display-xl` 48px below `sm`) — a 64px hero number is unusable on a 375px viewport and should never be reached for below `sm`.

---

## What's next (not part of this foundation)

This document and its token files are the complete foundation. Applying it — migrating `MemoDisplay.tsx`, the dashboard, the analyze flow, login, and the leaderboard from brass/ink to the Lab system — is explicitly out of scope here and should happen page-by-page, starting wherever the brass/ink and Lab systems would otherwise visually clash most (likely the memo report page, given its density of evidence-driven UI that §16 was designed around).
