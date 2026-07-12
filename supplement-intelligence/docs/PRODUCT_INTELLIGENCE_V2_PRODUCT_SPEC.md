# PRODUCT INTELLIGENCE ENGINE — V2 PRODUCT SPECIFICATION

**Status:** ADOPTED — official product specification. Engineers, designers, and AI agents build directly from this document.
**Adopted:** 2026-07-10
**Authority chain:** `PRODUCT_INTELLIGENCE_V2_BLUEPRINT.md` (what the system knows) → `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` (experience philosophy) → **this document** (buildable screen-level specification) + `PRODUCT_INTELLIGENCE_V2_DESIGN_SYSTEM.md` (visual language and components). Where documents conflict, the earlier document in the chain governs and the later one must be corrected.

**Reading rule — precision through inheritance:** §3 defines the **Universal Screen Contract**: default loading, empty, error, transition, responsive, accessibility, and disclosure behavior for every screen. Each screen specification states only its *deltas* from the contract. If a screen does not mention an attribute, the contract's behavior is the specification — nothing is undefined.

---

# §1. Product Philosophy (binding)

The product is NOT a dashboard. **The product is an answer.**

Three altitudes, strictly ordered (from the UX Blueprint):
- **Altitude 1 — Verdict** (decide): verdict, window, thesis, witnesses.
- **Altitude 2 — Evidence** (understand): concordance, gap chart, economics, pain, kill criteria.
- **Altitude 3 — Provenance** (verify): raw signals, providers, sample sizes, timestamps, nulls.

Nothing from a lower altitude forces itself upward. Nothing at a higher altitude is unsupported below.

# §2. Interaction Principles (binding on every screen and every future feature)

1. **One primary action per screen.** Exactly one `btn-primary` may render per screen at a time.
2. **Never overwhelm.** New information enters by user request (scroll, tap, drawer) — never by ambush (no popovers that open themselves, no auto-playing anything).
3. **Evidence before explanation.** Show the number, then the sentence about the number. Never an adjective without a tappable number behind it.
4. **Confidence is earned, never exaggerated.** Witness dots at Altitudes 1–2; numeric confidence only at Altitude 3. Missing data is drawn (hollow dot / "No signal" row), never omitted.
5. **Every chart answers one question**, stated as its caption. A chart that answers two questions becomes two charts or one chart and one sentence.
6. **Every click reduces uncertainty.** If an interaction does not reveal evidence, change scope, or commit a decision, it does not ship.
7. **Every screen ends with a decision** — a screen's bottom-most interactive element is always a decision action (Watch, Compare, Read report, Upgrade, Dismiss), never a settings link or filler.
8. **Timing and quality never blend visually.** Lifecycle position (Window Arc) and Opportunity Quality (card size / number) are separate encodings, always (Non-Negotiable Principle 7).
9. **Silence is a feature.** The product speaks only when evidence moves. No badges, counters, or nags outside the two alert types.
10. **Jargon translates at point of use.** Every term of art (gap velocity, concordance, kill criterion) carries a tap-to-explain affordance on first render per session.

# §3. Universal Screen Contract

Every screen inherits the following. Screens specify only deltas.

## 3.1 Layout defaults
- **Desktop:** 12-column grid, max content width 1200px; long-form reading columns 720px. Left nav rail 64px (icons) expanding to 220px on hover/pin. Content top-padding 48px.
- **Mobile (<768px):** single column, bottom tab bar (Home · Watchlist · Alerts · Account), content padding 16px. Drawers become bottom sheets.
- **Persistent element:** the global search field is reachable on every signed-in screen — desktop: `/` focuses the nav-rail search; mobile: search icon in the top bar.

## 3.2 Loading states (default)
- **Rule of 2 seconds:** something meaningful renders within 2s of every navigation or action.
- Skeletons mirror the final layout exactly (per Design System §Skeletons); never spinners on full screens. Spinners (16px) are allowed only inside buttons awaiting a sub-second confirm.
- Data that arrives progressively renders progressively (list rows appear as fetched; charts draw axes first, series on arrival).

## 3.3 Empty states (default)
- One sentence of what belongs here + one sentence of how it gets here + the single action that starts it. Rendered in `text-secondary`, centered, max-width 480px. No illustrations (see Design System §Empty states). Empty states never celebrate emptiness ("All clear! 🎉" is banned); they teach the loop.

## 3.4 Error states (default)
- **Partial failure** (a provider, a panel): the failed region renders its honest-null form ("No signal — [source] returned no data") inline; the rest of the screen proceeds. Never a full-screen error for a partial failure.
- **Full failure** (route data unavailable): the screen's skeleton remains, with a centered one-sentence explanation + `Retry` (secondary button) + auto-retry with backoff. Error copy names the failing thing specifically ("Couldn't reach the analysis service"), never "Something went wrong."
- Errors never lose user input: query text, compare selections, and settings edits survive any failure.

## 3.5 Transition defaults
- Route changes: content cross-fade 200ms, `ease-standard`; nav rail static.
- Drawers (desktop, 480px right-side) and bottom sheets (mobile): slide 320ms `ease-standard`, scrim 40% ink. Dismiss: Esc, scrim tap, or X.
- List → detail: the tapped card morphs (shared-element scale/position, 320ms) into the detail header where technically feasible; otherwise cross-fade.
- The **only animation ceremony** in the product is the Verdict Resolve (§4.7); nothing else may exceed 320ms.
- `prefers-reduced-motion`: all transitions become 80ms opacity fades; the Verdict Resolve becomes a fade.

## 3.6 Progressive disclosure defaults
- Altitude 1 renders immediately; Altitude 2 renders on scroll; Altitude 3 renders only in the Evidence Drawer / Evidence Explorer.
- The **Evidence Drawer** is universal: any number, claim, chart point, or witness dot is clickable and opens the drawer with: raw values → computation sentence → sample size → provider → freshness → channel tag. Drawer content is generated, never hand-authored per screen.

## 3.7 Accessibility defaults (WCAG 2.2 AA)
- All meaning encoded in color is duplicated in text (verdict badges always carry the verdict word; witness dots carry an sr-only "3 of 5 sources confirm").
- Full keyboard operability; visible focus ring (Design System §Focus); drawers trap focus; charts expose data tables via "View as table" (ghost button under every chart).
- Touch targets ≥44px; text contrast ≥4.5:1.

## 3.8 Mobile defaults
- Screens reflow to single column preserving hierarchy order. The Verdict Card, Window Arc (compact), Concordance Strip, and Gap Chart all have specified compact forms (Design System §Charts). Tables become stacked key-value cards. Hover interactions have tap equivalents. Analysis authoring is permitted on mobile but the layout optimizes for reading and alert triage.

---

# §4. Screen Specifications

Routes are canonical. Screen numbering matches the commissioned list.

## 4.1 Landing Page — `/`

**Purpose:** Convert a skeptical operator into running a first analysis within 60 seconds.
**User goal:** "Find out if this tool is real without giving it anything."
**Why it exists:** The product's differentiation *is* the answer-first experience; the landing page must be a working sample, not a description.

**Layout & hierarchy (desktop):** Single centered column, 720px. (1) Headline `display-1`: **"Should you build it?"** (2) Subline `text-lg secondary`: "One question. Six independent evidence sources. A verdict you can defend." (3) The search field — visually identical to the in-app search, 56px tall, autofocused. Placeholder cycles real queries every 4s (fade, 200ms). (4) Below the fold: three real anonymized Verdict Cards — one BUILD_NOW, one AVOID, one WATCH_CLOSELY, static (non-interactive except a "run your own" hover hint). (5) Track-record module (renders only when ledger has ≥1 quarter of outcomes; otherwise the honest countdown line). (6) Footer: pricing link, sign in, provider transparency link, legal.
**Mobile:** identical order; cards swipe horizontally.

**Actions & click behavior:**
| Element | Click result |
|---|---|
| Search field + Enter | Starts analysis immediately → route `/a/new?q=…` (Loading Experience). No auth wall. One anonymous full analysis per device; further analyses trigger the deferred signup sheet at the *moment of second value*, not before. |
| Example Verdict Card | Expands in place to show its full thesis + witness dots (read-only). Second click collapses. |
| "Sign in" | → `/signin`. |
| Pricing link | Scrolls to a single pricing table on the same page (no separate marketing site page in v1). |

**States:** Loading — static page, no data dependencies except track-record module (skeleton line if slow). Error — track-record module fails silent to the countdown line.
**Animation:** placeholder cycle only. No parallax, no scroll-triggered effects.
**Disclosure:** the entire page is Altitude 1; the example cards' expansion is its only reveal.

## 4.2 Sign Up / Sign In — `/signin`

**Purpose:** Identity with near-zero friction, *deferred* until the user has already received value.
**User goal:** "Save what I just found."
**Why it exists:** Auth is a save mechanism, not a gate. The first preliminary read is always free and anonymous.

**Layout:** Centered card, 400px: (1) one-line context ("Save your analyses and watch markets"), (2) Google/Apple OAuth buttons, (3) email field → magic-link (no passwords in v1), (4) legal line. When invoked mid-flow (e.g., clicking Watch while anonymous), it renders as a **sheet over the current screen**, preserving all state beneath; completing auth returns the user to the exact pre-auth state with the intended action executed.

**Actions:** OAuth buttons → provider flow → return. Email + Continue → "Check your email" state with resend (disabled 30s, countdown shown). Wrong-email recovery: "use a different email" link resets the form.
**States:** Error — provider failure renders inline under the button ("Google sign-in couldn't complete — try email"), never a dead end. Magic-link expiry → the link target page offers one-tap resend.
**Mobile:** full-screen sheet.
**Animation:** sheet slide only.

## 4.3 User Onboarding — `/welcome` (first sign-in only)

**Purpose:** Personalize the two things that change the experience; reach the user's own first verdict immediately.
**User goal:** "Get to my answer."
**Why it exists:** The first analysis is the tour. Anything that delays it must justify itself; only two questions do.

**Layout:** Two single-question steps, then straight into Search. Step 1: "What are you deciding?" (three large option cards: *Choosing my next product / Validating one idea / Monitoring markets*) — sets default home surface (Search-forward vs Pipeline-forward). Step 2: "Launched on Amazon before?" (Yes / Not yet) — sets explanation density (First-Timers get tap-to-explain hints pre-expanded for their first three analyses). Both steps skippable ("Skip" ghost button, top right → defaults: next-product / launched-before).
**Actions:** option card click → selects + auto-advances (no Next button). Skip → defaults.
**States:** none meaningful (no data).
**Animation:** step cross-fade 200ms.
**Never:** progress dots, mascots, tours, checklists.

## 4.4 Dashboard / Home — `/home`

**Purpose:** The decision queue. Answers "what needs my judgment today?"
**User goal:** Triage what changed; start the next question.
**Why it exists:** The Operator arrives with one of two intents — ask about a new idea, or check watched ones. This screen is those two intents in priority order, and nothing else.

**Layout & hierarchy:** (1) Search field, top, always. (2) **Needs attention** — Change Notes since last visit, newest first, each rendered as: one-sentence note + mini Verdict Card + "See what changed →". Maximum 5 shown; "View all in Alerts" beyond. (3) **Your pipeline at a glance** — one compact Window Arc with a dot per watched market (dots sized by Opportunity Quality, colored by verdict). (4) **Recent analyses** — plain text list (query · verdict badge · date), 10 rows, "View all".
**Deliberately absent:** aggregate metrics, usage stats, activity feeds, news.

**Actions:**
| Element | Click result |
|---|---|
| Search field (or `/`) | Focus; Enter → new analysis. |
| Change Note | → diff view of that market (`/a/:id?diff=latest`). |
| Mini Verdict Card | → `/a/:id` (Opportunity Overview). |
| Arc dot | Tooltip (name + verdict + stage); click → `/a/:id`. |
| Arc background | → `/pipeline` (Portfolio). |
| Recent-analysis row | → `/a/:id`. |

**Empty state:** first-visit form: search field + "Run your first analysis — ask about any product idea" + three example query chips (clicking one runs it).
**Loading:** sections skeleton independently; search field is interactive at 0ms.
**Mobile:** same order; pipeline arc compact; this screen is the mobile home tab.

## 4.5 Search Experience — global + `/home` focus state

**Purpose:** Turn a raw idea into a well-formed market query without making the user feel corrected.
**User goal:** "Ask in my own words."
**Why it exists:** Founders think in product ideas, not taxonomies. The system translates, shows the translation, and keeps it editable — visible interpretation, never a gate.

**Layout:** On focus, the field elevates (shadow-2) and shows beneath it, live per keystroke (debounced 150ms): (a) **interpretation line** — "→ analyzing **magnesium glycinate supplements** · Amazon US" in `text-secondary`; (b) up to three refinement chips (sub-niches the classifier detects); (c) recent + watched matching queries with their existing verdict badges (re-open, don't re-run).
**Actions:** Enter → run (route `/a/new?q=`). Chip click → replaces the query text, keeps focus, does not auto-run. Recent-query row → opens the existing analysis with a "Re-run (last run 34 days ago)" secondary button in its header. Esc → collapse.
**Ambiguity rule:** the engine picks the dominant interpretation and *states it changeably* on the loading screen and the Overview header ("Interpreted as: magnesium glycinate supplements — change"). "Change" opens the refinement chips inline. Never a blocking disambiguation dialog.
**Error:** interpretation service down → field still works; interpretation line reads "We'll interpret this during analysis."
**Mobile:** full-screen search takeover from the top bar icon.

## 4.6 Search Results / Interpretation — transient section of `/a/new`

**Purpose:** The 0–2 second resolution surface between query and analysis: confirm what is being analyzed, offer the fork before spend.
**User goal:** "Yes, that's what I meant."
**Why it exists:** There is no list of ten blue links — a query resolves to ONE market analysis (per UX Blueprint). This surface is where the singular interpretation is confirmed or redirected, and where an existing recent analysis short-circuits a duplicate run.

**Layout:** Renders as the first frame of the Loading Experience: interpreted market as an H1, marketplace tag, refinement chips, and — if this user analyzed this market within 30 days — an interrupt card: "You analyzed this on June 12 — verdict WATCH. Open it, or re-run with fresh data?" (Open = free; Re-run = spends an analysis credit; both buttons labeled with that fact.)
**Actions:** Chip → re-interprets, restarts (before token spend, this is free). "Open existing" → `/a/:id`. "Re-run" → proceeds.
**Why alternatives rejected:** a results *list* would import the search-engine mental model and defer the decision the product exists to make; disambiguation *dialogs* gate momentum. A stated-changeable interpretation preserves both speed and control.

## 4.7 Loading Experience — `/a/new` (analysis in progress)

**Purpose:** Convert dead time into the trust-building moment; deliver a preliminary read at ~10s.
**User goal:** "Show me you're actually doing something real."
**Why it exists:** Watching six named sources report in *is* the pitch; a user who watches evidence assemble never asks where numbers come from.

**Behavior spec (two-tier reveal, mirrors engine fast/slow tiers):**
- **0–2s:** Query echoes as H1 + interpreted market + skeleton Verdict Card. The skeleton *is* the progress indicator; no bar, no percent.
- **2–10s (fast tier):** Evidence lines materialize one by one, each a real sentence from real fetches ("Reading 27 bestsellers…", "36 months of unit-sales history found", "Search interest: accelerating for 8 quarters", "Trademark filings: 14 in the last year"). Each line fades in (120ms) and settles into a check row. Then the **Preliminary Read** renders: compact Window Arc with position + gap direction + the label `PRELIMINARY — 3 of 6 sources in`, in amber.
- **10–60s (slow tier):** Preliminary card is fully interactive (drawer works). Remaining Concordance dots fill live as channels land. Failed channel → dot stays hollow + one-line honest note; analysis proceeds.
- **Verdict Resolve (the one ceremony, ≤600ms):** when the engine finalizes — evidence lines compress upward, the verdict word sets in its final size, the verdict color arrives as a 400ms ease-in wash on the badge only, witness dots do a single 150ms settle. Then the screen *is* the Opportunity Overview (no navigation; the URL updates to `/a/:id`).
**Actions during load:** Cancel (ghost, top right) → returns home, run is abandoned (credit not charged if before slow tier). All rendered evidence is clickable into the drawer even mid-load.
**Error states:** fast tier entirely fails → full-failure contract with specific naming ("Couldn't reach market data — retrying"); partial slow-tier failures → hollow dots, verdict proceeds with reduced witnesses and says so.
**Mobile:** identical sequence, single column.

## 4.8 Opportunity Overview — `/a/:id`

**Purpose:** THE decision surface. 80% of sessions may end here, well-served.
**User goal:** "Decide, or know exactly why I can't yet."
**Why it exists:** It is the order in which a good advisor would speak: decision → time context → trust → urgency → magnitude → falsifiability → next action.

**Layout & information hierarchy (strict, top to bottom):**
1. **Verdict Card**, full size (interpretation line above it, changeable).
2. **Window Arc**, full width, position + motion trail ("moved from Emerging 2 months ago").
3. **Concordance Strip**, full form (all channels, always).
4. **Gap Chart** with its one-question caption: "Is demand outrunning supply?"
5. **Three headline numbers** (`display-2` numerals): Demand / Entry economics / Moat to beat — each with one context line.
6. **Kill criteria preview** — "What would change this verdict": three falsifiable lines with current-vs-threshold readings.
7. Exactly two buttons: **Read the full report** (primary) · **Watch this market** (secondary).

**Actions & click behavior:**
| Element | Click result |
|---|---|
| Any number/claim/dot/chart point | Evidence Drawer (universal). |
| Witness dots on card | Scrolls to + flashes (1× 200ms highlight) the Concordance Strip. |
| Arc region | Explainer popover: stage definition + which of my watched markets sit there. |
| Kill criterion row | Drawer: criterion, threshold, current reading, which signal feeds it. |
| Read the full report | → `/a/:id/report`, scroll position top. |
| Watch this market | Instant optimistic toggle to "Watching ✓" + slot count toast ("4 of 10 watch slots"). If out of slots → in-place upgrade sheet (§4.21). If anonymous → auth sheet (§4.2), then executes. |
| Overflow menu (⋯) | Compare (adds to tray) · Export PDF · Share read-only link · Re-run analysis. |

**States:** Loading — arrives pre-rendered via §4.7 (never cold-loads with spinners; deep links replay a fast skeleton fill). Stale (>30 days) — quiet banner: "Data from June 12 — Re-run". Partial data — hollow dots + reduced-witness confidence, per contract.
**Mobile:** identical order; headline numbers stack; the two decision buttons dock as a bottom bar on scroll.
**Disclosure:** this screen is Altitudes 1–2 only; Altitude 3 exists exclusively via drawer and the Evidence link inside it.

## 4.9 Lifecycle Visualization — the Window Arc (component contract)

**The business question it answers:** "Where on the wave is this market, and how much time do I have?"
**The decision it enables:** enter now / prepare / walk away / set an alert and wait.
**Why an arc is the best choice:** founders' mental model of a trend *is* a wave; position + motion trail on an arc answers stage AND direction pre-verbally, in one glance, with zero legend-reading. The Window Open region is subtly shaded — the arc literally shows the window.
**Alternatives rejected:** *Funnel/pipeline* (implies inevitable progression left-to-right and conversion semantics — markets regress and skip); *radar charts* (score theater, unreadable deltas); *labeled step tracker* (ordinal without shape — loses the crest/decline intuition); *bare text stage badge* (loses direction and proximity-to-transition).
**Spec:** six labeled regions (Latent → Emerging → Window Open → Contested → Saturated → Declining); market dot 12px; motion trail = 3 fading ghost dots at prior quarterly positions; direction chevron when velocity ≥ threshold. Sizes: full (overview/report), compact (dashboard/watchlist rows), sparkline (16px tall, tables). Interactions: region tap → definition + occupants; dot tap → the channel signature that produced the classification (Altitude 3). Never encodes quality (size/color of dot on the arc encodes verdict only in multi-market views; single-market arc dot is ink).

## 4.10 Demand vs Supply Visualization — the Gap Chart (component contract)

**Business question:** "Is demand outrunning supply — and for how much longer?"
**Decision enabled:** urgency — accelerate, schedule, or deprioritize the launch.
**Why this is the best choice:** the window is *defined* as the distance between two accelerations; drawing exactly those two series and shading exactly that distance makes the abstraction physically visible. A shrinking shaded area is *felt* as urgency without a single exclamation mark.
**Alternatives rejected:** *two separate charts* (the relationship IS the message; separation forces mental subtraction); *a single "gap score" line* (hides which side moved — demand falling and supply rising look identical); *bar-chart quarters* (loses continuity and projection); *gauges* (banned; no time axis).
**Spec:** x = time (24–48 months + optional projection band); y = normalized acceleration. Demand line: warm sienna. Supply line: cool slate. Gap shading: warm at 12% opacity, only when demand > supply. Projected-crossing band: vertical soft band labeled honestly ("similar profiles historically closed within 6–18 months") — renders only when the engine emits an estimate. Annotations: max 2 (e.g., "TikTok surge", "listing wave begins") — engine-emitted, never decorative. Caption is mandatory and is the chart's one question. Compact form: 48px-tall sparkline pair with shading, no axes, for watchlist rows.

## 4.11 Confidence Visualization — Witness Dots (component contract)

**Business question:** "How many independent sources agree, and who's missing?"
**Decision enabled:** whether to trust the verdict enough to act, and what evidence to wait for.
**Why this is the best choice:** humans reason natively about witnesses and poorly about probabilities; dots-with-names make the independence model (the engine's deepest idea) legible in half a second, and hollow dots make *missing data a visible object* (Non-Negotiable Principle 5).
**Alternatives rejected:** *percentages at Altitude 1* (false precision, invites misreading 83% as accuracy); *confidence bars/gauges* (continuous encoding for what is structurally discrete — channels); *stars* (rating semantics); *hiding low confidence* (dishonest by omission).
**Spec:** one dot per demand channel, fixed order, always all channels. Filled = confirming; hollow = silent/no data; rust-filled + down-arrow = contradicting (never hidden — disagreement is the lifecycle signal). Always accompanied by the count sentence ("3 of 5 sources confirm demand"). sr-only text mandatory. Numeric confidence + reliability priors live only in the Evidence Explorer / drawer. **Confidence over time** renders as dots filling in across ledger snapshots ("Search intent joined the consensus this quarter" — a Change Note).

## 4.12 Evidence Explorer — `/a/:id/evidence`

**Purpose:** Altitude 3 as a place. For the skeptic, the analyst, and the night before a five-figure commitment.
**User goal:** "Let me verify everything myself."
**Why it exists:** trust has a ceiling without auditability; this screen changes how every other screen is *believed*, even by users who never open it.

**Layout:** Left rail: every signal grouped by channel (channel tag chip, provider, freshness). Main pane, per selected signal: full time series (View-as-table available), raw values, the computation sentence ("median of 27 bestsellers' YoY unit growth from Keepa monthly-sold history"), sample size, and consumers ("feeds: Demand Reality pillar; lifecycle classifier").
**Filters (the only two):** **Nulls** — everything that returned no data this run, first-class; **Disagreements** — channels contradicting the majority read.
**Actions:** signal row → renders pane. Provider name → `/providers`. "Copy citation" → clipboard text of value+source+date. Export JSON (Power tier).
**Empty state:** n/a (an analysis always has signals; a fully-null channel shows in Nulls filter).
**Mobile:** rail becomes a dropdown; panes stack.

## 4.13 Provider Transparency — `/providers`

**Purpose:** Answer "where does this come from and how fresh is it?" as a standing page.
**User goal:** "Can I trust the sources?"
**Why it exists:** converts the independence rule into the product's most quotable trust asset.

**Layout:** One row per provider: name · channel chip(s) · plain-words contribution ("Amazon unit sales and pricing history") · reliability shown in witness-dot vocabulary · last successful fetch time · live status dot. Optional providers sit in a second group labeled "Adds when available." Above the table, one paragraph, verbatim: *"Ten numbers from one source count as one witness. We only raise confidence when independent sources agree."*
**Actions:** row expand → what fields it contributes, what happens when it's down (which UI goes hollow). Status dot → status history (30 days).
**States:** provider down → status row renders it plainly; no drama.

## 4.14 Opportunity Comparison — `/compare` (+ the Compare Tray)

**Purpose:** The screen where the launch choice among candidates is actually made.
**User goal:** "Of these, which — and in what order?"
**Why it exists:** comparison in memory is cognitive load; comparison on shared axes is perception.

**The Tray:** adding to compare (from any Verdict Card's ⋯ or `c`) drops the market into a bottom-docked tray (max 4; adding a 5th prompts replacement — hard cap, not a setting). Tray persists across navigation. "Compare →" activates at 2+.
**Layout (`/compare`):** (1) **The engine's ranked read**, one highlighted sentence: "Of these four: *creatine gummies* has the wider window; *berberine* has better economics but 6–18 months less time." (2) Verdict Cards side by side. (3) One shared Window Arc with all dots. (4) Concordance Strips row-aligned (same channel on the same line across columns). (5) Gap Charts on a **shared time axis**. (6) Headline numbers in a common grid, best-in-row subtly marked (500-weight, not color). (7) Screen-ending decision: per-column Watch buttons + "Open report".
**Actions:** remove column (x) · reorder (drag) · any cell → drawer · export comparison PDF.
**Empty state:** "Add markets to compare from any verdict card — you can hold up to four."
**Mobile:** columns become horizontally swipeable full-width panels; the shared arc stays fixed above.
**Why alternatives rejected:** a sortable mega-table (dimension soup, invites score-shopping); spider charts (banned); sequential viewing (defeats the purpose).

## 4.15 Investor Report — `/a/:id/report`

**Purpose:** The defensible document — read before committing money, shown to partners/investors.
**User goal:** "Own this argument well enough to defend it."
**Why it exists:** a report you scroll is a report you finish; an argument is sequential, so the structure is fixed and linear (~4 minutes).

**Structure (fixed, non-rearrangeable — per engine blueprint §13):**
1. Verdict block (Verdict Card + arc restated) → 2. **The Thesis** (three sentences set as a pull-quote — the most designed typography in the product) → 3. Demand (full Concordance + per-channel mini-series) → 4. Supply response (new-listing velocity, trademarks, moat depth, price trend) → 5. Entry economics (fee/margin/price table + one worked example: "a $24.99 product nets ≈ $X after fees") → 6. Differentiation brief (pain clusters with **verbatim customer quotes** in the quote style; unserved-claim gap; science angle) → 7. Risk & timing (window-closers; safety gate; seasonality as a de-emphasized planning strip) → 8. **Kill criteria** ("We would reverse this verdict if…" — each with current-vs-threshold) → 9. Track-record footer (calibration for this verdict class; countdown state until data exists).
**Reading affordances:** a 2px reading-progress hairline at the viewport top (no TOC sidebar, no tabs). Section headers are anchor-linkable.
**Actions:** Watch (primary, in header and at end) · Export PDF (print CSS mirrors screen structure exactly) · Share read-only link (tokenized URL; viewer sees report + drawer, no account actions) · Compare · every claim → drawer.
**States:** section-level partial failure renders that section's honest-null block; the report never blocks on one section.
**Mobile:** single-column reading; quotes full-bleed; bottom bar: Watch · Export.

## 4.16 Watchlist — `/watchlist`

**Purpose:** The monitoring loop's list form. The promise: *silence until something real happens.*
**User goal:** "Is anything I care about moving?"

**Layout:** rows of compact Verdict Cards: verdict badge · stage + direction chevron · gap-velocity sparkline · witness dots · most recent Change Note (or "Quiet since [date]" in tertiary text). Default sort: most urgent (windows closing → recent transitions → quiet). No folders, no tags in v1.
**Actions:**
| Element | Result |
|---|---|
| Row | → `/a/:id`. |
| Change Note | → diff view. |
| ⋯ → Edit kill criteria | Drawer listing engine-proposed criteria; thresholds adjustable within engine-allowed bounds (slider + numeric); "Reset to engine defaults" always present. |
| ⋯ → Compare | Adds to tray. |
| ⋯ → Unwatch | Immediate, with 8s undo toast (no confirm modal). |

**Empty state:** "Watch a market and we'll re-check it on schedule — you'll hear from us only when the evidence moves." + button to run an analysis.
**Loading:** rows skeleton; counts render first.
**Mobile:** this is a bottom tab; rows are swipe-actionable (left = unwatch w/ undo, right = compare).

## 4.17 Portfolio View — `/pipeline`

**Purpose:** All opportunities on the time axis — the market-timing kanban; the evolved leaderboard.
**User goal:** "See my whole pipeline in time, then pick."
**Why it exists:** arranging opportunities by *time* (not score) enforces the core belief: timing separates from quality.

**Layout:** (1) Full-width Window Arc as the organizing axis; every watched/analyzed market is a dot — **sized by Opportunity Quality, colored by verdict** (the one multi-encoding exception, per §2.8 both encodings remain separate: position=timing, size=quality). (2) Below: the same markets as rows **grouped by lifecycle region**, each group collapsible, ordered Window Open first. (3) Screen-ending: Compare tray affordance.
**Actions:** dot hover → name/verdict/stage tooltip; dot click → row highlight + scroll; row → `/a/:id`; group header → collapse; multi-select checkboxes → "Compare selected".
**Empty state:** the arc renders unpopulated with region labels + "Your analyzed markets will appear here in time order."
**Mobile:** arc compact + horizontally scrollable groups.

## 4.18 Alerts Center — `/alerts`

**Purpose:** The archive and control surface for the only two alert types: **stage transitions** and **kill-criteria triggers**.
**User goal:** "What moved, and does it change my plans?"

**Layout:** chronological Change Notes, grouped by day. Each: the sentence · the number that crossed and its threshold · mini Verdict Card · "See what changed →" (the diff view: Opportunity Overview with before/after states of the affected primitive — arc dot moved, gap shading narrowed, criterion line breached — changes highlighted, everything else dimmed 40%). Read state: auto-marked on view; no unread-count management UI.
**Controls (top right, quiet):** per-type delivery toggles (in-app/email/push) — a shortcut into Settings §Notifications. Opt-in weekly "nothing moved" heartbeat lives there too.
**Empty state:** "Nothing has moved. Alerts fire only on stage transitions and kill-criteria triggers — when you hear from us, it matters."
**Cadence rules (binding):** never digest-bundled by default; one alert per market per event; a market alerting 3+ times in 7 days collapses into a single "volatile" note with history inside.
**Mobile:** this is the push-notification landing tab; notification tap deep-links to the specific diff view.

## 4.19 Historical Predictions — `/track-record`

**Purpose:** The engine keeping score on itself, in public — what makes this an intelligence product rather than an opinion generator.
**User goal:** "Have you been right?"

**Layout:** (1) headline calibration stats per verdict class ("Window Open calls: a real window existed in 78% of re-measured cases, n=41"), engine-version segmented, each stat → drawer with methodology. (2) Outcomes table: past verdicts (user's own; global stats aggregated/anonymized) — verdict-at-the-time · what the market did since (new entrants, traction, price movement) · outcome mark **held / partially held / missed**, each expandable to evidence. (3) Per-market **verdict timeline**: successive ledger snapshots as a strip of mini Verdict Cards on a time axis — watch a market travel the arc across quarters.
**Honest pre-data state (mandatory):** "Track record requires time. Ledger began [date]; first quarterly re-measurements land [date]." — a countdown, not a hidden page. This page is publicly linkable (marketing surface).
**Actions:** stat → methodology drawer · outcome row → evidence · timeline card → that ledger snapshot (§4.20).
**Mobile:** stats stack; table becomes cards.

## 4.20 Verdict Ledger Viewer — `/ledger` and `/ledger/:snapshotId`

**Purpose:** Altitude 3 of history — the immutable snapshot browser. (Distinct from §4.19: Track Record is *interpretation* of history; the Ledger Viewer is the *raw record*.)
**User goal:** "Show me exactly what the engine knew and said on that date."
**Why it exists:** auditability of past claims is the institutional trust primitive; "we never edit the past" must be demonstrable, not asserted.

**Layout:** (1) index: filterable list (market, date range, verdict, engine version) of snapshot rows — date · market · verdict badge · confidence · engine version · immutability mark (⛓ "recorded [timestamp], never modified"). (2) Snapshot detail: a **frozen, read-only Opportunity Overview** rendered from ledger data, visually distinguished by a persistent top banner: "Snapshot — July 10, 2026 · engine v2.7 · as recorded" (sepia-shifted neutrals per Design System §Snapshot mode). All drawers work against frozen data. A "View this market today" button links to the live analysis if one exists.
**Actions:** row → detail · "diff against today" → the diff view · export snapshot JSON (Power).
**Empty state:** "Every analysis you run is recorded here permanently — verdict, evidence, and confidence, exactly as issued."
**Mobile:** read-only, fully supported.

## 4.21 Billing — `/settings/billing`

**Purpose:** Price the value moments (analyses + watch slots) with zero surprise.
**User goal:** "Know what I pay, what I get, what happens when I run out."

**Layout:** (1) current plan + two usage meters ("7 of 15 analyses this month," "4 of 10 watch slots") — meters are plain bars, no gauges. (2) plan comparison: one table, 3 tiers, rows = analyses/mo, watch slots, seats (future), export, API (future). Annual/monthly toggle (annual default, discount stated plainly). (3) invoices list (download PDF) + payment method.
**In-context upgrade contract (binding):** hitting any limit surfaces the upgrade *at the point of intent* — the Watch button itself becomes "Watch — needs a slot → Upgrade" opening a sheet with exactly: current tier, next tier, the delta ("$X/mo more for 25 slots"), one confirm button. Post-confirm, the original action executes automatically. No navigation exile, ever.
**Actions:** change plan → prorated confirm sheet (shows the exact charge before commit) · cancel → one honest retention screen (what they lose: watch slots go read-only, ledger stays theirs) → confirm · update card → Stripe element inline.
**Error states:** payment failure → banner on `/home` + email, 7-day grace, watch slots never silently deleted (go read-only).
**Empty/first state:** free tier shown as a real plan, not a nag.

## 4.22 Account Settings — `/settings`

**Purpose:** Rarely visited, instantly navigable, boring on purpose.
**Layout:** single page, four plain sections (anchor nav): **Account** (name, email, delete account — typed-confirm modal, the product's only destructive modal) · **Notifications** (per-alert-type × per-channel toggle grid; weekly heartbeat opt-in) · **Defaults** (marketplace, home surface preference from onboarding, explanation density) · **Data & privacy** (export all analyses + ledger entries as JSON/CSV; data policy link). **API keys** section renders only when entitled (Phase 4).
**Actions:** every toggle saves optimistically with a 2s "Saved" inline confirm; failures revert the toggle + inline error.
**Mobile:** Account tab.

## 4.23 Mobile Experience (cross-cutting spec)

**Purpose:** The companion, not the workstation — where alerts land and verdicts are checked.
**Bottom tabs:** Home (decision queue) · Watchlist · Alerts · Account. Search via top-bar icon on all tabs.
**The Verdict Card is the mobile app:** full-width cards, swipeable where listed; Window Arc and Concordance render compact; Evidence Drawer = bottom sheet (drag to 2 detents: half/full); reports = single-column reading with docked action bar; push notifications are Change Notes verbatim and deep-link to diff views.
**Permitted but not optimized:** running new analyses, compare (2 columns max side-by-side, else swipe).
**Not on mobile (v1):** kill-criteria threshold editing (view-only + "edit on desktop" note), ledger JSON export.

---

# §5. The User Journey (emotional states + friction ledger)

| Stage | What happens | Emotional state | Friction point | How the product removes it |
|---|---|---|---|---|
| **Landing** | "Should you build it?" + a working search field; a real AVOID card visible | Skeptical, curious | "Another AI hype tool" | Real example verdicts incl. negative ones; no signup wall; provider names visible |
| **First search** | Types the idea that keeps them up at night | Hopeful, guarded | Fear of a 60s black box | 2s echo; evidence lines with real numbers by 4s |
| **First "wow"** | Preliminary read at ~10s; verdict resolves; it's an AVOID *with reasons better than their own* | Surprised → respect | Disappointment at a "no" | The no is beautiful, evidenced, and falsifiable — trust event #1 |
| **The proving query** | They test a market they already know | Testing the tool | "Does it know what I know?" | Verdict matches their intuition + adds a number they didn't have — trust event #2. Signup happens here, as *saving*, not gating |
| **First saved opportunity** | Runs the real candidate list; reads one full report; exports PDF | Engaged, armed | Report length anxiety | 4-minute linear read; thesis up front; progress hairline |
| **First watchlist** | Watches 2–3 markets; hits free watch-slot limit | Invested | Paywall resentment | Upgrade appears in the Watch button at the value moment, one tap, action auto-completes |
| **First alert** | Change Note: a watched market moved Emerging → Window Open | Alerted, gratified | Alert skepticism ("is this spam?") | The note carries the number, the threshold, and a diff view — trust event #3: *it watches while I build* |
| **First returning session** | Opens to the decision queue; something needs judgment | Habitual | Re-orientation cost | Home = Change Notes first; zero dashboard archaeology |
| **The save** (month ~4) | Kill criterion trips on the market they *chose*; they accelerate their launch | Rescued | Doubt about acting on it | Criterion was pre-committed and falsifiable — acting on it feels like executing their own plan |
| **First renewal** | Quarter of quiet competence; track record filling in | Dependent, calm | "Did I use it enough?" | Watchlist value is continuous even when silent; renewal email shows *their* markets' movement summary |
| **Long-term power user** | Every idea goes through the engine by reflex; pipeline view is their planning meeting; quotes the concordance strip in decks | Advocacy, identity | Feature hunger | Power tier: shortcuts, ledger exports, API (Phase 4) — depth without new clutter |

---

# §6. Navigation Map

## 6.1 Route inventory
```
/                      Landing (public)
/signin                Auth (page or sheet-over-context)
/welcome               Onboarding (first sign-in only)
/home                  Dashboard / decision queue
/a/new?q=              Interpretation → Loading → resolves to /a/:id
/a/:id                 Opportunity Overview        (?diff=latest → diff mode)
/a/:id/report          Investor Report
/a/:id/evidence        Evidence Explorer
/compare               Comparison (tray-fed)
/watchlist             Watchlist
/pipeline              Portfolio view
/alerts                Alerts Center
/track-record          Historical Predictions (publicly linkable)
/ledger                Ledger index
/ledger/:snapshotId    Frozen snapshot
/providers             Provider Transparency (publicly linkable)
/settings              Account Settings
/settings/billing      Billing
/r/:token              Shared read-only report (public, tokenized)
```

## 6.2 Persistent chrome
Desktop: left nav rail — Home, Watchlist, Pipeline, Alerts, Track Record, (divider), Providers, Settings. Mobile: 4 bottom tabs (§4.23); Pipeline/Track Record/Providers reachable from Home/Account.

## 6.3 Breadcrumbs
Only within an analysis: `magnesium glycinate ▸ Report` / `▸ Evidence`. Clicking the market name returns to Overview. Nowhere else — the hierarchy is otherwise flat by design.

## 6.4 Modal / drawer / sheet / popup inventory (complete — nothing else may be added without spec amendment)
| Surface | Type | Trigger |
|---|---|---|
| Evidence Drawer | right drawer / bottom sheet | any claim, number, dot, chart element |
| Kill-criteria editor | drawer | watchlist ⋯ / criterion row |
| Auth | sheet over context | any save-action while anonymous |
| Upgrade | sheet over context | any limit hit at point of intent |
| Plan-change confirm | sheet | billing |
| Unwatch undo | toast (8s) | unwatch |
| Save confirms | inline text (2s) | settings toggles |
| Delete account | typed-confirm modal | settings (the only destructive modal) |
| Arc region explainer | anchored popover | arc region tap |
| Share link | small popover with copy field | ⋯ → Share |
**Banned:** notification-permission begging on load, cookie-consent theater beyond legal minimum, NPS popups mid-task, "what's new" modals (release notes live behind Settings).

## 6.5 Keyboard shortcuts (desktop; discoverable via `?`)
`/` focus search · `Esc` close surface / collapse search · `Enter` run / open · `e` open Evidence Drawer on focused element · `w` watch/unwatch focused market · `c` add focused market to compare tray · `g h / g w / g p / g a` go Home / Watchlist / Pipeline / Alerts · `j / k` next/prev row in any list · `⌘P` export current report/comparison PDF · `?` shortcut sheet.

## 6.6 Search, filter, and comparison interactions (canonical)
- **Search** is always: type → live interpretation → Enter runs one analysis. It never returns link lists; it may surface an existing analysis as an interrupt card (§4.6).
- **Filtering** exists in exactly three places, each with fixed vocabularies: Evidence Explorer (Nulls, Disagreements), Ledger index (market, date, verdict, version), Alerts (type, market). No user-defined filter builders anywhere.
- **Comparison** is always tray-mediated: collect (≤4) → `/compare` → shared axes. There is no in-table side-by-side toggling.

---

# §7. Feature Inventory

**Core (v1 — the product is incomplete without these):** search + interpretation · two-tier loading with preliminary read · Verdict Card · Window Arc · Concordance Strip · Gap Chart · witness-dot confidence · Opportunity Overview · Investor Report + PDF export · Evidence Drawer · Watch + watchlist · the two alert types + diff view · decision-queue Home · billing with in-context upgrades · onboarding (2 questions) · honest-null states everywhere · Verdict Ledger recording (invisible but core).

**Advanced (fast follow — deepen the core loops):** Compare Tray + `/compare` · Portfolio/pipeline view · kill-criteria threshold editing · Evidence Explorer (full page) · Provider Transparency page · share read-only report links · stale-analysis re-run flows · weekly heartbeat opt-in.

**Power User:** keyboard shortcuts · ledger viewer + snapshot diffs · signal/citation copy + JSON export · engine-version filters on track record · volatile-market alert collapsing controls.

**Future (Phase 3–4 alignment):** analog-engine surfaces ("resembles ashwagandha Q2-2019") · multi-vertical switching · API keys + data feed · team seats/shared watchlists · institutional track-record certificates · TikTok Shop / import-records evidence rows (appear automatically as new channels in existing primitives — no new UI needed, which is the point of the primitive system).

---

# §8. The Brutal Simplification Pass (applied; deltas are binding)

Every screen was re-asked: *"Can this be simpler? Does each element improve a decision?"* The following were **removed from earlier drafts** and are banned from re-entry without spec amendment:

| Screen | Removed | Why |
|---|---|---|
| Landing | feature grid, testimonials, logo wall, demo video | The live search field and a real AVOID card out-persuade all of them |
| Sign up | passwords, username, profile fields | Magic link + OAuth; identity is a save mechanism |
| Onboarding | tour, checklist, progress dots, sample-data playground | The first analysis is the tour |
| Dashboard | KPI tiles, usage stats, streaks, news module | Not decisions. The queue, the arc, the list — nothing else |
| Search | disambiguation dialogs, category dropdowns, advanced-query syntax | Interpretation is stated and changeable, never gated |
| Overview | score breakdown widget at Altitude 1, social share, related-markets carousel | Score anatomy lives in the drawer; carousels are ambush |
| Report | tabs, TOC sidebar, comments, customizable sections | An argument is sequential; a rearrangeable report is a weaker argument |
| Evidence Explorer | user-defined filter builder, chart annotation tools | Two filters answer the two real questions (what's missing, what disagrees) |
| Compare | 5+ columns, user-pickable metrics, radar chart | 4 is a decision; 5 is a spreadsheet |
| Watchlist | folders, tags, notes fields | Sort-by-urgency serves the actual job; organization theater deferred until proven needed |
| Alerts | digests-by-default, read/unread management, snooze matrices | Two alert types, auto-read, volatile-collapse — done |
| Portfolio | custom columns, score-sort default | Time is the organizing axis; sorting by score would un-teach the product's core belief |
| Track record | cherry-picked highlights module | Calibration stats only — the honesty is the feature |
| Settings | theme customization, layout density options | System-follow dark mode + one toggle; density is the designer's job, not the user's |
| Billing | seat management UI (v1), coupon field (hidden until URL param) | Deferred to team plans |
| Global | notification permission prompts on load, confetti, badges, mascots, NPS mid-task | The user's win is a good decision, not a celebration |

**The standing test for every future proposal:** remove one more thing — does the decision get harder? If not, it wasn't helping.
