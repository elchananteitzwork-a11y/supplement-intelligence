# PRODUCT INTELLIGENCE ENGINE — V2 UX BLUEPRINT

**Status:** ADOPTED — official UX blueprint for the project.
**Adopted:** 2026-07-10
**Companion documents:** `PRODUCT_INTELLIGENCE_V2_BLUEPRINT.md` (engine — source of truth for what the system knows), `PRODUCT_INTELLIGENCE_V2_ROADMAP.md` (execution order).
**Scope:** This document designs the complete customer experience from first visit to long-term paying customer. It does not design the engine. Every concept it surfaces (verdict matrix, lifecycle stages, concordance, channel-based confidence, kill criteria, Verdict Ledger) is defined by the engine blueprint; this document defines how a human meets them.

---

# Part 1: Design Philosophy

## The one governing idea

**The product is not a dashboard. The product is an answer.**

A founder does not want data. A founder wants to know: *should I build this, and how sure are you?* Every screen exists to move them toward that decision with the least cognitive effort — and every piece of evidence exists to be *summoned*, never *dumped*.

This produces the single structural rule of the entire experience:

> **Answer first. Proof on demand. Provenance on demand from the proof.**

Three altitudes, strictly ordered:

| Altitude | What lives here | Cognitive mode |
|---|---|---|
| **1 — The Verdict** | Verdict, window state, thesis, confidence-as-witnesses | Decide |
| **2 — The Evidence** | Concordance, gap chart, economics, pain clusters, kill criteria | Understand |
| **3 — The Provenance** | Raw signals, provider traces, sample sizes, timestamps, nulls | Verify |

A user can live their whole life at Altitude 1 and be well served. Nothing from a lower altitude ever forces itself upward. Nothing at a higher altitude is ever unsupported below.

## The eight commitments

1. **Extremely simple.** One primary action per screen. If a screen has two jobs, it is two screens.
2. **Evidence-first.** Every claim on every surface can be tapped to reveal the numbers that produced it. No orphaned adjectives ("strong demand" must open to *what* is strong, *measured how*, *by whom*).
3. **Premium.** Typography-led, restrained color, generous space, numbers as heroes. Premium is the absence of clutter, not the presence of decoration.
4. **Beautiful.** Beauty here means *legibility of thought* — the screen looks like a clear mind.
5. **Fast.** Perceived speed is designed: something meaningful appears within 2 seconds of every action, always.
6. **Minimal cognitive load.** The user never holds state in their head. Comparisons happen on screen, not in memory. Progress is always visible. Jargon is translated at point of use.
7. **No unnecessary dashboards.** There is no wall of widgets. There is a queue of decisions.
8. **Every screen helps a decision.** A screen that only informs is deleted or merged into one that decides.

## Honesty as a design feature (from the Non-Negotiable Principles)

- **Missing data is displayed, never hidden.** An empty evidence seat is drawn as an empty seat — a hollow channel chip labeled "No signal — TikTok returned no data," not omitted.
- **Confidence is people, not percentages.** "Confirmed by 3 independent sources" beats "83% confidence" — humans reason natively about witnesses, poorly about probabilities. The percentage exists at Altitude 3 for those who want it.
- **The engine keeps score on itself, publicly.** Track record isn't marketing copy; it is a screen (see Historical Predictions).

---

# Part 2: The Customer

## Primary persona — "The Operator"

A founder or operator of an Amazon-native or DTC consumer brand, roughly $300K–$10M revenue, deciding **what to launch next**. They have launched before. They have been burned before — usually by entering a market that looked great in Helium 10 and turned out to be a red ocean. They are time-poor, numerically literate but not statistical, and deeply skeptical of tools that feel confident without showing work.

**Their decision moment:** 3–5 candidate ideas, one launch budget, a spouse or partner asking "are you sure?" What they need is not more data — it is a *defensible reason to choose*, and an equally defensible reason to walk away from the others.

## Secondary persona — "The First-Timer"

Wants to launch their first product. Needs more explanation, more guardrails, and benefits most from the PASS/AVOID verdicts (the tool's greatest gift to them is the launches it prevents). The UX serves them through progressive explanation (every term has a tap-to-explain), never through a separate "beginner mode."

## Tertiary (Phase 4) — "The Institution"

CPG innovation teams, PE analysts. They arrive later, via the track-record screen and the API. The UX decisions below do not compromise for them, but the Investor Report is deliberately already in their dialect.

**Design target:** The Operator, always. When personas conflict, The Operator wins.

---

# Part 3: The Design System — Six Primitives

The entire product is built from six reusable primitives. Learn them once, read every screen forever.

## 3.1 The Verdict Card

The atomic unit of the product — the same object at every size, everywhere (search result, report header, watchlist row, alert, portfolio tile).

```
┌────────────────────────────────────────────────┐
│  magnesium glycinate                           │
│                                                │
│  BUILD IF DIFFERENTIATED                       │
│  Window: CONTESTED — closing                   │
│  ●●●○  3 of 4 sources confirm demand           │
│                                                │
│  "Demand is real and growing 23% YoY, but 41%  │
│  of listings are under 18 months old — the     │
│  easy window has closed. Entry now requires    │
│  owning the sleep-anxiety angle."              │
└────────────────────────────────────────────────┘
```

- **Line 1:** the market, in the user's own words.
- **Line 2:** the verdict, set in the largest type on the card. Verdict color is the *only* saturated color on the card.
- **Line 3:** lifecycle stage + window direction (opening / stable / closing).
- **Line 4:** confidence as witnesses — filled dots for confirming channels, hollow for silent/absent ones. Tapping the dots opens the Concordance Strip.
- **Body:** the three-sentence thesis. Written by the synthesis layer, grounded in ledgered evidence.

**Verdict color semantics** (the only chart-independent color in the product):
- `BUILD_NOW` — deep green
- `BUILD_IF_DIFFERENTIATED` — olive/amber-green
- `WATCH_CLOSELY` / `WATCH` — amber
- `INVESTIGATE` — slate blue
- `AVOID` — rust red
- `PASS` — neutral gray

Everything else on every screen is near-monochrome. When color appears, it *means* something.

## 3.2 The Window Arc (lifecycle visualization)

A single horizontal arc — rising, cresting, falling — with six labeled regions: Latent → Emerging → **Window Open** → Contested → Saturated → Declining. The market's position is a filled dot on the arc; a short motion-trail shows direction and speed of travel ("moved from Emerging 2 months ago").

Why an arc and not a pipeline/funnel: founders instantly read "where on the wave am I?" — the arc *is* the mental model of a trend, and position+direction on it answers "how much time do I have?" pre-verbally. The region under "Window Open" is subtly shaded: the arc literally shows the window.

Interactions: tap any region to see what defines it and which markets in your watchlist sit there. Tap the dot to see the channel signature that produced the classification (Altitude 3).

## 3.3 The Concordance Strip

The independence model, made visible. One row per demand channel, always the same order, always all rows shown:

```
Amazon market     ↑  +23% YoY units          ●
Search intent     ↑↑ accelerating 8 quarters ●
Paid media        ↑  41 active advertisers   ●
Social            —  no signal               ○
Science           ↑  publications 3× in 24mo ●
```

- Filled dot = confirming witness. Hollow = silent (data missing) — *drawn, not omitted*. A contradicting channel gets a down-arrow and its own filled dot in the rust tone: disagreement is information (it drives the lifecycle read) and is never averaged away visually.
- Tapping a row opens that channel's evidence panel: the time series, the sample size, the provider, the timestamp.

This strip is the most persuasive artifact in the product. It renders on the Verdict Card (as dots), the Report (full), and the Evidence Explorer (expanded).

## 3.4 The Gap Chart (demand vs supply)

One chart type, used everywhere timing is discussed. Two lines over time: **demand acceleration** (composite, warm tone) and **supply response** (new-listing + trademark velocity, cool tone). The vertical distance between them is shaded — **the shaded area is the window.**

- Demand above supply, gap widening → the shading grows: window opening.
- Lines converging → shading narrows: window closing. The projected crossing point, when estimable, is marked with a soft vertical band labeled honestly: "historically, similar profiles closed within 6–18 months."
- Supply above demand → no shading; a quiet annotation: "supply has already responded."

Why: "demand vs supply gap" is an abstraction; *an area that visibly shrinks* is a feeling. Urgency should be felt from geometry, not exclamation marks.

## 3.5 The Evidence Drawer

The universal Altitude-2→3 gesture. Any claim, number, or chart element can be tapped/clicked; a right-side drawer (desktop) or bottom sheet (mobile) slides in with: the raw values, the computation in one sentence ("median of 27 bestsellers' YoY unit growth from Keepa monthly-sold history"), sample size, provider, freshness timestamp, and the channel tag. Nothing on any screen is a dead end.

## 3.6 The Change Note

The unit of the monitoring loop: a single-sentence, evidence-linked statement of what changed. "New-listing velocity in *berberine* crossed your kill criterion: 19 listings under 6 months old (threshold: 15)." Every alert, every watchlist delta, every ledger entry renders as Change Notes. Never "your dashboard has updates."

---

# Part 4: The Screens

## 4.1 Landing Page

**Purpose:** Convert a skeptical operator into running their first analysis within 60 seconds.
**Layout:** One screen, one idea, one input. Centered headline, a search field, and beneath it a *live, real* example Verdict Card.
- Headline: **"Should you build it?"**
- Subline: "One question. Six independent evidence sources. A verdict you can defend."
- The search field is the hero — identical to the in-app search. Placeholder cycles through real queries: "magnesium glycinate… beef tallow moisturizer… creatine gummies…"
- Below the fold: three real (anonymized-query) Verdict Cards — one BUILD_NOW, one AVOID, one WATCH_CLOSELY — because showing an AVOID is the fastest possible proof that this isn't a hype machine. Then the track-record module (once ledger data exists): "Our Window Open calls, scored quarterly, in public."
**Actions:** Type a query (primary; one free full analysis, no signup for the preliminary read). Sign in (quiet, top right).
**Why:** The product's differentiation *is* the answer-first experience; the landing page must be a working sample of it, not a description of it. Showing negative verdicts on the landing page is the single highest-trust move available.

## 4.2 Onboarding

**Purpose:** Reach the first "whoa" (a completed verdict on the user's own idea) with near-zero friction; personalize only what changes the experience.
**Flow (three steps, skippable after step 1):**
1. "What are you deciding?" — *Choosing my next product / Validating one specific idea / Monitoring markets I care about.* This sets the default home surface (Search vs. Pipeline).
2. "Have you launched on Amazon before?" — calibrates explanation density (First-Timers get tap-to-explain hints pre-expanded the first three times).
3. Run their first query — onboarding *is* using the product; there is no tour. During the first loading experience, the loading narration (4.4) doubles as the product explanation.
**Why:** Tours are read by nobody and resented by everybody. The first analysis is the tour.

## 4.3 Search Experience

**Purpose:** Turn a founder's raw idea into a well-formed market query without making them feel corrected.
**Layout:** A single large input, centered, on an otherwise nearly empty screen. As they type, beneath the field: (a) interpreted market ("→ analyzing *magnesium glycinate supplements* on Amazon US"), (b) up to three refinement chips ("magnesium for sleep" / "magnesium gummies" / "kids magnesium"), (c) recent + watched queries.
**Interactions:** Enter runs it. Chips refine it. If a query is ambiguous ("magnesium"), the engine picks the dominant interpretation and *says so, changeably*, rather than blocking with a disambiguation quiz.
**Why:** Founders think in product ideas, not taxonomy. The system does the translation and shows its interpretation — visible, editable, never a gate.

## 4.4 Loading Experience

**Purpose:** Convert dead time into the trust-building moment. Loading is where the product proves it's doing real work with real sources.
**Behavior — the two-tier reveal (mirrors the engine's fast/slow tiers):**
- **0–2s:** The query echoes back with the interpreted market and the skeleton of a Verdict Card. Never a spinner; the card scaffold itself is the progress indicator.
- **2–10s (fast tier):** Evidence lines materialize one by one as they arrive, each a real, specific sentence: "Reading 27 bestsellers… 36 months of unit-sales history found… Search interest: accelerating for 8 quarters… Trademark filings: 14 in the last year." Then the **Preliminary Read** appears: lifecycle position on the Window Arc + gap direction, marked clearly *"Preliminary — 3 of 6 sources in."*
- **10–60s (slow tier):** The preliminary card stays interactive while the remaining channel dots fill in live on the Concordance Strip. When the verdict finalizes, the card resolves with a single, quiet transition — the verdict type sets, the color arrives (the only moment of animation ceremony in the product).
- If a slow-tier source fails: its dot stays hollow with an honest note; the verdict proceeds with the channels it has, and confidence says so.
**Why:** Watching six named sources report in *is* the pitch. A user who has watched the evidence assemble will never ask "where do these numbers come from?" — and the preliminary read means no one waits 60 seconds to learn something.

## 4.5 Opportunity Overview (the verdict screen)

**Purpose:** The decision surface. 80% of sessions can end here, well-served.
**Layout (top to bottom — strict hierarchy):**
1. **The Verdict Card**, full size.
2. **The Window Arc** with position + motion trail.
3. **The Concordance Strip**, full form.
4. **The Gap Chart.**
5. **Three headline numbers**, huge type, one line of context each: *Demand* ("41K units/mo across top sellers, +23% YoY"), *Entry economics* ("$14.20 margin headroom at the median price"), *Moat to beat* ("median incumbent: 56K reviews").
6. **Kill criteria preview** — "What would change this verdict" as three short falsifiable lines.
7. Two buttons, and only two: **Read the full report** · **Watch this market**.
**Interactions:** Everything drills via the Evidence Drawer. Nothing else competes for attention.
**Why this order:** Decision → time context → trust → urgency → magnitude → falsifiability → next action. It is the order in which a good advisor would speak.

## 4.6 Full Investor Report

**Purpose:** The defensible document — what the founder reads before committing money, and shows to a partner/spouse/investor. Linear, readable top-to-bottom in ~4 minutes, printable/exportable as a clean PDF with identical structure.
**Structure (fixed, per the engine blueprint §13):**
1. Verdict block (Verdict Card + arc, restated)
2. **The Thesis** — three sentences, set like a pull-quote. The most designed typography in the product.
3. Demand — full Concordance Strip with per-channel numbers and mini time-series
4. Supply response — new-listing velocity chart, trademark filings, review-moat depth, price trend
5. Entry economics — the fee/margin/price table; one worked example: "a $24.99 product nets ≈ $X after fees at today's structure"
6. Differentiation brief — top pain clusters with **verbatim customer quotes** (set in a distinct voice/style — real human words are the emotional core of the report), the unserved-claim gap ("2,300 reviews mention burping; no top-10 listing addresses it"), science angle
7. Risk & timing — what closes the window; safety gate result; seasonality as a *planning note*, visually de-emphasized (a fact strip, not a scored panel)
8. **Kill criteria** — 3–4 falsifiable conditions, each with its current reading vs. threshold, styled as commitments: "We would reverse this verdict if…"
9. Track-record footer (once ledger matures): "Verdicts of this class have been right X% of the time, n=Y" — small, factual, unmissable.
**Actions:** Watch · Export PDF · Compare (adds to tray, see 4.12) · Share link (read-only).
**Why linear:** A report you scroll is a report you finish. Tabs fragment the argument; an argument is sequential.

## 4.7 Evidence Explorer

**Purpose:** Altitude 3 as a place — for the skeptic, the analyst, and the moment before a five-figure commitment.
**Layout:** Left rail lists every signal grouped by channel (channel tag, provider, freshness). Main pane shows the selected signal: full time series, raw values, the computation sentence, sample size, and *what consumed it* ("feeds: Demand Reality pillar, lifecycle classifier").
**Special views:** a "nulls" filter showing everything that returned *no* data this analysis — the empty seats, first-class; and a "disagreements" filter isolating channels that contradict the majority read.
**Why:** Trust has a ceiling without auditability. This screen is visited rarely and relied upon always — its existence changes how the other screens are believed. (It also *is* the provider trace, productized.)

## 4.8 Provider Transparency

**Purpose:** Answer "where does this come from and how fresh is it?" as a standing page, not a support ticket.
**Layout:** One row per provider: name, channel(s), what it contributes in plain words, reliability prior (shown as the same witness-dot vocabulary), freshness of last successful fetch, and current status. Optional providers appear with "adds when available" framing. A short section explains the independence rule in one paragraph: *"Ten numbers from one source count as one witness. We only raise confidence when independent sources agree."*
**Why:** This page converts the engine's most sophisticated idea (channel independence) into the product's most quotable trust asset.

## 4.9 Dashboard / Home (signed-in)

**Purpose:** Not a dashboard — a **decision queue**. Answers exactly one question: *"What needs my judgment today?"*
**Layout:**
1. The search field (always the top element — the product's core loop is always one keystroke away).
2. **Needs attention** — Change Notes since last visit (stage transitions, kill-criteria trips), each with its mini Verdict Card and a one-tap "see what changed."
3. **Your pipeline at a glance** — a single compressed Window Arc with a dot per watched market (tap → Portfolio view).
4. Recent analyses (plain list).
**What is deliberately absent:** aggregate vanity metrics, activity feeds, charts without decisions attached.
**Why:** The Operator opens the app either to ask about a new idea or to check on watched ones. Those two intents, in that order, are the whole screen.

## 4.10 Watchlist

**Purpose:** The monitoring loop's home — the list form of watched markets.
**Layout:** Rows of compact Verdict Cards, each with: verdict, stage + direction arrow, sparkline of gap velocity, witness dots, and the most recent Change Note. Sort defaults to "most urgent" (windows closing first, then recent transitions).
**Row actions:** open · compare (adds to tray) · edit kill criteria (view engine-proposed criteria; tighten/relax thresholds within allowed bounds) · unwatch.
**Empty state:** teaches the loop: "Watch a market and we'll re-check it on schedule — you'll hear from us only when the evidence moves."
**Why:** The watchlist is the retention product. Its unit is the Change Note: the promise is *silence until something real happens*.

## 4.11 Alerts

**Purpose:** Deliver exactly two kinds of news — **stage transitions** and **kill-criteria triggers** — with the evidence attached.
**Form:** An alert is a Change Note wherever it lands (email, push, in-app): one sentence of what changed, the number that crossed, the threshold it crossed, and a deep link to a **diff view** — the Opportunity Overview with before/after states of the affected primitive (the arc dot moved; the gap shading narrowed; the criterion line breached), changes highlighted, everything else dimmed.
**Cadence rules:** Never bundled into digests by default (urgency is the product); a weekly "nothing moved" one-liner is opt-in, because silence must be distinguishable from breakage.
**Why:** Alert fatigue is death for a monitoring product. Two alert types, both inherently decision-relevant, both falsifiable, means every notification is worth opening — which is the only sustainable notification strategy.

## 4.12 Portfolio View (the pipeline)

**Purpose:** Compare and time multiple opportunities — the evolved leaderboard, and the screen where the launch decision actually gets made among candidates.
**Layout:** The full-width Window Arc as the organizing axis; every watched/analyzed market is a dot on it, sized by Opportunity Quality, colored by verdict. Beneath: the same markets as rows, grouped by lifecycle region.
**The Compare Tray:** select up to 4 markets → a side-by-side of their Verdict Cards, Concordance Strips aligned row-for-row, gap charts on a shared time axis, and headline numbers in a common grid. One highlighted line at top: the engine's ranked read — "Of these four: *creatine gummies* has the wider window; *berberine* has the better economics but 6–18 months less time."
**Why:** Comparison in memory is cognitive load; comparison on a shared axis is perception. Arranging opportunities on the *time* axis (rather than by score alone) enforces the product's core belief: timing separates from quality.

## 4.13 Historical Predictions (the Track Record)

**Purpose:** The engine keeping score on itself, in public — the screen that makes this an intelligence product rather than an opinion generator.
**Layout:**
1. Headline calibration stats per verdict class ("Window Open calls: a real window existed in 78% of re-measured cases, n=41"), engine-version segmented.
2. A ledger table: every past verdict (the user's own; global stats aggregated) with: verdict-at-the-time, what the market did since (new entrants, their traction, price movement), and an outcome mark — *held / partially held / missed* — each mark expandable to the evidence.
3. Per-market **verdict timeline**: a market's successive ledger snapshots as a strip of mini Verdict Cards along a time axis — watch a market travel the arc across quarters.
**Honest states:** Early on, this screen says so: "Track record requires time. Ledger began [date]; first quarterly re-measurements land [date]." A countdown, not a hidden page.
**Why:** No competitor can copy this screen without living the same years. It is also the institutional persona's front door.

## 4.14 Lifecycle & Confidence Visualizations (system-wide rules)

*(These are primitives — 3.2, 3.3 — but their usage rules are contractual:)*
- The Window Arc is the **only** lifecycle visualization. One mental model, everywhere, at three sizes (full/compact/sparkline).
- Confidence is **always** witness dots + count sentence at Altitudes 1–2. Numeric confidence appears only in the Evidence Explorer. **Confidence improving over time is shown as dots filling in** — on a watched market, "Search intent joined the consensus this quarter" is a Change Note and a newly filled dot, which reads as the product getting *more sure in front of you*.
- Uncertainty is explained in the grammar of missing witnesses and disagreeing witnesses — never as bare percentages, never as error bars on Altitude-1 surfaces.

## 4.15 Settings

**Purpose:** Rarely visited, instantly navigable.
**Sections:** Account · Notifications (per-alert-type toggles, delivery channels, the opt-in weekly heartbeat) · Defaults (marketplace, category preferences) · Data & privacy (export all my analyses/ledger entries; deletion) · API keys (Phase 4, hidden until entitled).
**Why:** One screen, plain lists, no cleverness. Settings earn trust by being boring.

## 4.16 Billing

**Purpose:** Price the value moment, not the seat. Zero-surprise, self-serve.
**Model surface:** Plans framed around the two units users understand — **analyses per month** and **watched markets** ("watch slots"). Overage handled by honest prompts, never silent charges.
**Layout:** Current plan + usage as two simple meters ("7 of 15 analyses," "4 of 10 watch slots") · plan comparison in one table · invoices · payment method. Upgrade moments happen *in context* (out of watch slots → the Watch button itself offers the upgrade, one tap, no navigation exile).
**Why:** Watch slots monetize the retention loop; analyses monetize the discovery loop. Both map to the exact moments the user feels value, which is where willingness to pay lives.

## 4.17 Mobile Experience

**Purpose:** The companion, not the workstation. Mobile is where alerts land and verdicts are checked; analysis authoring is desktop-first (but never blocked).
**Design:** The Verdict Card *is* the mobile app: home is the decision queue (Change Notes + watchlist cards), full-screen swipeable cards, the Window Arc and Concordance Strip render natively at compact size, Evidence Drawer becomes a bottom sheet. Reports render as clean single-column reading with the same fixed structure. Push notifications are Change Notes verbatim.
**Why:** The mobile moment is "an alert arrived — do I care?" Optimizing that moment (glanceable card → one thumb-tap to the diff view) is worth more than porting every screen.

---

# Part 5: The Complete Journey

**Minute 0 — Arrival.** Lands on "Should you build it?" Types the idea that's been keeping them up at night. No signup wall before the preliminary read.

**Minute 1 — The reveal.** Watches six named sources report in during loading; gets the preliminary read at ~10 seconds, the resolved verdict inside a minute. The verdict is, say, AVOID — with three sentences that articulate *why* better than the founder could. Trust event #1: *it told me no, and showed me why.*

**Minute 3 — The second query.** (This is where conversion actually happens.) They test the tool against a market they already know well. The verdict matches their hard-won intuition — and adds a number they didn't know. Trust event #2: *it knows what I know, plus more.* Signup to save results.

**Day 1 — The report.** Runs their real candidate list (3–5 queries). Reads one full Investor Report. Exports the PDF; shows a partner. The kill criteria land: *this thing tells me in advance what would prove it wrong.* Watches two markets. Hits the free-tier watch limit → first pricing contact, in context, at a value moment.

**Week 1 — The subscription.** Converts to paid for analyses + watch slots. Uses the Compare Tray to make the actual launch choice among three candidates. Decision made — the product has now paid for itself once.

**Month 2 — The first alert.** A Change Note arrives: a watched market moved Emerging → Window Open. The diff view shows the arc dot moved and which channel tipped it. Whether or not they act, trust event #3: *it watches while I build.*

**Month 4 — The save.** A kill criterion trips on the market they *chose*: new-listing velocity crossed threshold. They accelerate their launch timeline in response. The product has now changed a real-world decision mid-flight — this is the moment a subscriber becomes a permanent customer.

**Month 6+ — The habit.** Every new idea goes through the engine first, by reflex. The pipeline view is their planning meeting. The track-record screen fills in; their own verdict timelines become their private market history. Renewal is not a decision.

**Year 2 — The advocate / the institution.** The Operator quotes the concordance strip in an investor deck. The track record screen — now with real calibration curves — becomes the front door for institutional users arriving via Phase 4.

---

# Part 6: If Apple Designed It

It would ship with fewer features than any competitor — and feel inevitable.

- **One input, one answer.** The entire surface area would collapse toward the search field and the Verdict Card, the way the iPhone collapsed the phone into one screen. Everything else would be discovered progressively, never presented simultaneously.
- **The verdict would have a moment.** The resolve — evidence lines assembling, dots filling, then the verdict settling with its color — would be choreographed once, subtly, perfectly, and never elsewhere. Animation as meaning (the evidence *became* a decision), not decoration.
- **Typography would carry the interface.** Like Apple's product pages: enormous, confident numbers; one typeface family; weight and size as the entire hierarchy; color reserved for the one thing that means something (the verdict).
- **It would say no beautifully.** AVOID and PASS screens would be as designed as BUILD_NOW — because a product confident enough to be beautiful while declining your hopes is a product you believe when it says yes.
- **Honesty as luxury.** The hollow witness dot, the "no signal" row, the "track record requires time" countdown — rendered so deliberately that missing data reads as integrity rather than failure. Apple would understand that in an AI-saturated market, *restraint is the premium signal*: the product that refuses to hallucinate confidence is the Vertu among toys.
- **It would be fast the way hardware is fast.** The 2-second rule enforced everywhere; the preliminary read as the "instant on."
- **And it would be silent.** Two alert types. No badges begging for attention. It would speak only when the market moved — and therefore be listened to every time.

The Apple test for every future screen: *remove one more thing. Does the decision get harder? If not, it wasn't helping.*

---

# Part 7: Anti-Patterns (never build these)

1. **The wall of widgets** — no grid of KPI tiles without decisions attached.
2. **Gauges, donuts, radar charts** — score-theater. Numbers deserve type, trends deserve lines, comparisons deserve shared axes.
3. **Confidence percentages at Altitude 1** — witnesses, not probabilities.
4. **Hidden nulls** — an omitted channel is a lie of silence; draw the empty seat.
5. **Blended timing-quality scores anywhere in the UI** — the two axes stay visually separate (arc position ≠ quality size), per Non-Negotiable Principle 7.
6. **Digest emails by default** — urgency diluted is the product diluted.
7. **Onboarding tours, tooltips-on-everything, mascots, celebration confetti** — the user's win is a good decision, not a badge.
8. **A separate "beginner mode"** — one interface, progressive explanation.
9. **Infinite customization** — the report structure is fixed because the argument structure is fixed; a rearrangeable report is a weaker argument.
10. **Any screen that informs but cannot lead to a decision** — merge it or delete it.

---

# Appendix: Direct answers index

For traceability, the 25 design questions map to: ideal customer (§Part 2) · first thing seen (§4.1, §4.5) · immediate vs. on-request information (§Part 1 altitudes) · search-to-decision flow (§4.3–4.6, §Part 5) · confidence communication (§3.3, §4.14) · uncertainty explanation (§4.14, §3.5) · evidence presentation (§3.5, §4.7) · report structure (§4.6) · chart usage (§3.4, §Part 7 anti-patterns) · opportunity visualization (§3.1, §3.4) · lifecycle display (§3.2) · timing display (§3.2, §3.4) · gap visualization (§3.4) · comparison (§4.12) · watched opportunities (§4.10) · alerts (§4.11) · historical predictions (§4.13) · confidence over time (§4.14) · homepage (§4.9) · search feel (§4.3) · loading (§4.4) · missing data (§Part 1 honesty, §3.3, §4.7) · mobile (§4.17) · premium feel (§Part 1 commitments, §Part 6).
