# PRODUCT INTELLIGENCE ENGINE — V2 DESIGN SYSTEM

**Status:** ADOPTED — official design system. All UI work implements these tokens and components; deviations require spec amendment.
**Adopted:** 2026-07-10
**Companions:** `PRODUCT_INTELLIGENCE_V2_PRODUCT_SPEC.md` (screens and behavior), `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` (philosophy).
**Character target:** Apple's restraint × Linear's precision × Stripe's clarity × Bloomberg's data seriousness. Premium is the absence of clutter. Color means something or it isn't there.

---

# 1. Foundations

## 1.1 Typography

**One family carries the interface:** `Inter` (variable), with `tabular-nums` enforced on every numeric surface (tables, headline numbers, charts, meters). **One exception:** verbatim customer quotes render in `Source Serif 4` italic — real human words get a human voice; nothing else may use the serif.

| Token | Size/Line | Weight | Usage |
|---|---|---|---|
| `display-1` | 56/64 | 700, -2% tracking | Landing headline, verdict word on full Verdict Card |
| `display-2` | 40/48 | 700, -1.5% | Headline numbers (Overview), report thesis |
| `h1` | 28/36 | 650 | Screen titles, interpreted market |
| `h2` | 20/28 | 600 | Section headers |
| `h3` | 16/24 | 600 | Card titles, table headers |
| `body` | 15/24 | 400 | Default text |
| `body-strong` | 15/24 | 550 | Inline emphasis (never bold-700 in body) |
| `text-sm` | 13/20 | 400 | Secondary context lines, chart captions |
| `text-xs` | 12/16 | 450, +2% tracking, uppercase optional | Badges, channel tags, timestamps |
| `quote` | 17/28 Source Serif 4 italic | 400 | Verbatim customer quotes only |

Hierarchy is expressed through **size and weight only** — never through additional colors or decoration. Max two weights per screen region.

## 1.2 Color palette

**Neutrals (light mode)** — near-monochrome; the interface is ink on paper:

| Token | Value | Usage |
|---|---|---|
| `ink-900` | #111214 | Primary text |
| `ink-700` | #3F4247 | Secondary text |
| `ink-500` | #6E7278 | Tertiary text, placeholders, timestamps |
| `ink-300` | #C9CCD1 | Borders, dividers, hollow dots |
| `ink-100` | #EEF0F2 | Fills, skeletons, table stripes |
| `paper-0` | #FCFCFD | App background |
| `paper-1` | #FFFFFF | Card/raised surfaces |

**Verdict colors** — the ONLY saturated colors at Altitude 1. Each has a `-bg` tint (8% opacity fill for badges):

| Token | Light | Dark | Verdict |
|---|---|---|---|
| `verdict-build` | #157F3D | #34C069 | BUILD_NOW |
| `verdict-build-diff` | #5C7A29 | #93B84E | BUILD_IF_DIFFERENTIATED |
| `verdict-watch` | #B7791F | #E3A63C | WATCH_CLOSELY, WATCH |
| `verdict-investigate` | #3B5B8C | #6E93C9 | INVESTIGATE |
| `verdict-avoid` | #B3452C | #E07B5F | AVOID |
| `verdict-pass` | #6E7278 | #9BA0A6 | PASS |

**Data colors** (charts only, never UI chrome):

| Token | Value | Usage |
|---|---|---|
| `data-demand` | #C2622E (warm sienna) | Demand series, gap shading @12% |
| `data-supply` | #4A6B8A (cool slate) | Supply series |
| `data-neutral` | #6E7278 | Single-series lines, sparklines |
| `data-contradict` | = `verdict-avoid` | Contradicting witness dots/arrows |

**Functional:** `focus` #4A6B8A (2px ring) · `danger` = `verdict-avoid` · `success` = `verdict-build` (confirmation text only, never celebratory fills).
**Hard rules:** no gradients except the Verdict Resolve wash; no color communicates alone (text label always present); maximum one verdict color visible per card.

## 1.3 Spacing & grid

- Base unit **4px**. Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96 (`space-1…space-9`).
- Desktop grid: 12 columns, 24px gutters, max 1200px; reading measure 720px. Nav rail 64px (expanded 220px).
- Card padding 24px; compact card 16px; section vertical rhythm 48px; related elements 8–12px, unrelated 24–32px. When in doubt, add space — density is Bloomberg's job only inside tables.

## 1.4 Elevation, borders, radius

- `radius-sm` 6px (inputs, badges) · `radius-md` 10px (cards, drawers) · `radius-lg` 16px (sheets). Never fully-rounded pills except channel tags.
- Borders: 1px `ink-300` is the default separation tool. Shadows are rare: `shadow-1` (0 1px 2px @6%) resting cards; `shadow-2` (0 4px 16px @10%) focused search, drawers, tray. Nothing floats without a reason to be above the page.

## 1.5 Iconography

Lucide, 1.5px stroke, 16/20/24px, `ink-700` default. Icons never appear without labels except in the nav rail (tooltips mandatory) and universally learned symbols (×, ⋯, ↑↓ trends). No emoji in UI chrome; no filled/duotone styles.

## 1.6 Motion

| Token | Value | Usage |
|---|---|---|
| `ease-standard` | cubic-bezier(0.2, 0, 0, 1) | Everything |
| `dur-fast` 120ms | hovers, fades-in of list items |
| `dur-med` 200ms | route cross-fades, popovers |
| `dur-slow` 320ms | drawers, sheets, card morphs |
| **Verdict Resolve** | ≤600ms total, once per analysis | The only ceremony: evidence compress (200) → verdict word sets (200) → color wash on badge (400, overlapping) → witness-dot settle (150) |

Rules: nothing loops; nothing autoplays; nothing bounces. `prefers-reduced-motion`: all transitions → 80ms opacity; Resolve → fade.

---

# 2. Components

## 2.1 Cards
- **Verdict Card** (the atomic unit — 3 sizes): *Full* (Overview/Report): market `h3` → verdict `display-1` in verdict color → stage+direction line `text-sm` → witness dots + count sentence → thesis `body`, 3 sentences max. *Compact* (rows): single row — verdict badge · market name · stage chevron · sparkline · dots. *Mini* (alerts/timelines): badge + name + one-line note. All sizes are the same object; information drops, never rearranges.
- **Generic card:** `paper-1`, 1px `ink-300` border, `radius-md`, `shadow-1`, 24px padding. Hover (interactive only): border → `ink-500`, 120ms. Never hover-lift transforms.

## 2.2 Buttons
| Variant | Style | Rules |
|---|---|---|
| `btn-primary` | ink-900 fill, paper-0 text, radius-sm, 40px | **One per screen, ever.** Never verdict-colored (verdicts are information, not actions) |
| `btn-secondary` | 1px ink-300 border, ink-900 text | Unlimited |
| `btn-ghost` | text only, ink-700 | Tertiary/inline actions, "View as table" |
| `btn-destructive` | verdict-avoid text, ghost style; fills only inside typed-confirm modal | Unwatch/cancel/delete |
States: hover +4% ink overlay · active +8% · focus ring · disabled 40% opacity + reason tooltip · loading: 16px inline spinner, label persists ("Watching…").

## 2.3 Inputs
48px (56px hero search), radius-sm, 1px `ink-300`, focus → `focus` ring, 15px text. Inline validation on blur, `text-sm` in `danger` under the field; errors never clear user input. Search input carries the interpretation line + chips per Product Spec §4.5. Sliders (kill-criteria editor) always pair with a numeric input.

## 2.4 Tables
Bloomberg discipline: 13px `tabular-nums`, right-aligned numerics, 8px vertical padding, header `text-xs` uppercase `ink-500`, row divider 1px `ink-100`, hover row fill `ink-100`. No zebra by default. Sort: header click, single-column, arrow indicator. Best-in-row marking (compare grid): weight 550 — never color. Every table ships "View as table"'s inverse: mobile stacks to key-value cards automatically.

## 2.5 Charts (global contract)
- Every chart has a **caption stating its one question** (`text-sm`, `ink-500`).
- Axes 1px `ink-300`; gridlines horizontal only, `ink-100`; labels `text-xs`.
- Series: max 2 lines + 1 shading per chart (the Gap Chart is the canonical form). Annotations: max 2, engine-emitted.
- Tooltips: crosshair + value chip, 120ms fade; tap on mobile.
- Every chart has a "View as table" ghost button (a11y + skeptic path).
- **Banned everywhere:** pie/donut, radar/spider, gauges, 3D, dual y-axes, stacked areas of more than 2 series.
- Named instances: **Window Arc** (full 96px / compact 48px / sparkline 16px heights), **Gap Chart** (full 240px / sparkline-pair 48px), **witness dots** (10px, 6px gap), sparklines (`data-neutral`, no axes).

## 2.6 Badges & tags
- **Verdict badge:** `text-xs` 550, verdict color text on `-bg` tint, radius-sm, always the full verdict word (never abbreviated, never icon-only).
- **Channel tags:** pill, `ink-100` fill, `ink-700` text (amazon-market · search-intent · paid-media · social · science · supply-side · consumer-voice).
- **State chips:** `PRELIMINARY` (watch-amber tint) · `SNAPSHOT` (ink) · `STALE` (ink, with date). No other badges may be invented ad hoc.

## 2.7 Witness dots (component)
10px circles, 6px gap, fixed channel order. Filled `ink-900` = confirming · hollow 1.5px `ink-300` = silent · filled `data-contradict` + ↓ = contradicting. Always adjacent to the count sentence; sr-only text mandatory ("3 of 5 independent sources confirm demand; TikTok returned no data"). Fill-in animation (dur-fast) only during live loading and Change Notes.

## 2.8 Drawers, sheets, popovers, toasts
Right drawer 480px / bottom sheet (2 detents: 50%, 92%) — Evidence Drawer is the canonical instance: title = the claim clicked; body = raw values → computation sentence → sample size → provider + freshness → channel tag → "Open in Evidence Explorer" ghost link. Popovers: anchored, 320px max, one per screen at a time. Toasts: bottom-left desktop / above tab bar mobile, 8s with undo where applicable, max 1 visible (queue).

## 2.9 Skeletons
Mirror final layout exactly (same boxes, same positions), `ink-100` with a 1.6s shimmer at 4% — text lines 60–90% width, charts as axis frame + empty plot, Verdict Card skeleton includes the badge slot. Skeletons never appear for >10s without being replaced by an honest progress sentence.

## 2.10 States (system-wide visual grammar)
- **Empty:** centered, max 480px, `ink-700` sentence + how-it-fills sentence + one action. No illustrations, no emoji, no celebration.
- **Error:** inline and specific ("Couldn't reach the analysis service") + Retry secondary; partial failures render honest-null blocks in place. Full-screen errors only when the route has nothing to show.
- **Success:** inline text confirm ("Saved", "Watching ✓") 2s fade; toasts only when the action's result isn't visible in place. **No confetti, no checkmark ceremonies.**
- **Honest-null (signature state):** hollow dot / "No signal — [source] returned no data" row / em-dash in tables (never 0, never blank). Missing data is drawn.
- **Snapshot mode** (Ledger viewer): neutrals shift warm ~4% (sepia hint), persistent top banner, all inputs disabled visibly.

---

# 3. Dark mode

Token-flipped, not inverted: `paper-0` → #101113 · `paper-1` → #17181B · text scales map to #F2F3F5 / #B7BBC2 / #83878E · borders #2A2C30 · fills #1E2023. Verdict/data colors use the dark-column values (§1.2) — brightened, desaturated ~10% to hold contrast on dark. Shadows are replaced by 1px borders + surface steps (elevation = lighter surface, never glow). Charts: gridlines #232529, gap shading 16%. Default: follow system; one toggle in Settings; both modes ship AA-verified — dark mode is a first-class citizen because operators work at night.

# 4. Accessibility (binding checklist)

WCAG 2.2 AA minimum. Text contrast ≥4.5:1 (≥3:1 for `display` sizes); verdict badges verified in both modes. All color-carried meaning duplicated in text. Focus visible everywhere (2px `focus` ring, 2px offset); drawers/sheets/modals trap focus and return it on close. Full keyboard paths for every action in the Product Spec's shortcut table + standard tab order. Charts: "View as table" + series described in sr-only summaries. Touch targets ≥44px. Motion respects `prefers-reduced-motion` (§1.6). Live regions: loading evidence lines and Change Note arrivals announce politely. Language: plain sentences; every term of art carries the tap-to-explain affordance on first render per session.

# 5. Responsive behavior

Breakpoints: `sm` <768 (single column, bottom tabs, sheets) · `md` 768–1024 (single column + rail, drawers) · `lg` >1024 (full grid). Rules: hierarchy order never changes across breakpoints — columns stack in reading order; compact component forms (§2.5) swap in below `md`; tables → key-value cards below `sm`; the two-button decision pair docks as a bottom bar on scroll below `md`; nothing is hidden at small sizes that affects the decision — it compresses instead.

# 6. Voice (micro-copy rules)

Sentences, not fragments. Numbers before adjectives. Specific over general ("Keepa returned no offer data" not "some data unavailable"). Never exclamation marks. Never "insights." The product says "we" only about its own predictions ("We would reverse this verdict if…") — everywhere else it states evidence impersonally. Verdicts are declared, uncertainty is quantified as witnesses, and the product never apologizes for honesty ("No signal" is a fact, not a failure).
