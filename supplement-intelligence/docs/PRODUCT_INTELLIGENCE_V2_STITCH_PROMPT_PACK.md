# PRODUCT INTELLIGENCE ENGINE — GOOGLE STITCH PROMPT PACK

**Status:** ADOPTED — official UI-generation prompt pack.
**Adopted:** 2026-07-10
**Source of truth:** `PRODUCT_INTELLIGENCE_V2_BLUEPRINT.md` → `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` → `PRODUCT_INTELLIGENCE_V2_PRODUCT_SPEC.md` + `PRODUCT_INTELLIGENCE_V2_DESIGN_SYSTEM.md`. Where a Stitch output conflicts with those documents, the documents win and the output is regenerated.

---

## How to use this pack

1. Run prompts **in order, one at a time**, inside **one Stitch project** so Stitch retains the visual context of prior screens.
2. Every prompt begins with the same **STYLE HEADER** (§A) and uses only the **CANONICAL SAMPLE DATA** (§B). Paste both blocks exactly — they are the consistency mechanism, because Stitch cannot read our docs.
3. After each prompt, check the **acceptance criteria** before moving on. If a criterion fails, fix it with a follow-up edit prompt in Stitch ("Change X only; do not touch anything else") before proceeding — later prompts inherit earlier mistakes.
4. **Never ask Stitch to redesign a previous screen.** Additions only. If a previous screen must change, re-run its own prompt number with the change folded in.
5. Stitch output is design scaffolding, not the product: exported code/designs are then implemented against the Product Spec, which remains the behavioral authority (states, routes, click behavior).

---

## §A — STYLE HEADER (paste at the top of EVERY prompt, verbatim)

```
STYLE RULES (do not deviate, do not redesign existing screens):
Premium, calm, evidence-driven B2B intelligence tool. Think Apple restraint + Linear precision + Stripe clarity.
Font: Inter everywhere; numbers always tabular/monospaced-digits. Customer quotes only: elegant serif italic.
Background #FCFCFD, cards #FFFFFF with 1px #C9CCD1 border, radius 10px, very subtle shadow.
Text: #111214 primary, #3F4247 secondary, #6E7278 tertiary. Interface is near-monochrome.
The ONLY saturated colors are 6 verdict colors, used ONLY on verdict badges/words:
BUILD_NOW #157F3D, BUILD_IF_DIFFERENTIATED #5C7A29, WATCH_CLOSELY and WATCH #B7791F,
INVESTIGATE #3B5B8C, AVOID #B3452C, PASS #6E7278. Badges = colored text on 8% tint fill.
Charts use only: warm sienna #C2622E (demand), cool slate #4A6B8A (supply), gray #6E7278.
NEVER use: pie charts, donut charts, radar charts, gauges, gradients, emoji, illustrations,
stock photos, confetti, more than ONE solid dark primary button per screen.
Primary button: dark ink fill (#111214) white text, radius 6px. Secondary: 1px border, ink text.
Spacing generous: 24px card padding, 48px between sections. 4px base grid.
Confidence is ALWAYS shown as a row of small dots ("witness dots"): filled dot = confirming
source, hollow outlined dot = source with no data, plus a sentence like "3 of 5 sources confirm".
Never show confidence as a percentage or a gauge.
Missing data is always shown honestly as "No signal — [source] returned no data", never hidden.
```

## §B — CANONICAL SAMPLE DATA (use these exact markets everywhere; never invent new ones)

```
1) "magnesium glycinate" — verdict BUILD_IF_DIFFERENTIATED, lifecycle stage: Contested (window closing),
   3 of 5 sources confirm (filled: Amazon, Search, Paid media; hollow: Social; Science: up).
   Thesis: "Demand is real and growing 23% YoY, but 41% of listings are under 18 months old —
   the easy window has closed. Entry now requires owning the sleep-anxiety angle."
   Numbers: 41K units/mo (+23% YoY), $14.20 margin headroom at median price $18.97,
   median incumbent moat 56,020 reviews.
2) "creatine gummies" — verdict BUILD_NOW, stage: Window Open (opening), 4 of 5 sources confirm.
   Thesis: "Search interest has accelerated for 8 straight quarters while only 12% of listings
   are format-native. Supply has not caught up. First-mover pricing still holds."
3) "berberine supplement" — verdict AVOID, stage: Saturated, 4 of 5 sources confirm (down-trends).
   Thesis: "A great market to have entered in 2023. 38,475-review median moat, price compression
   underway, and new-listing velocity has tripled. The fundamentals are good; the window is gone."
4) "beef tallow moisturizer" — verdict WATCH_CLOSELY, stage: Emerging (early), 2 of 5 sources confirm
   (Search accelerating, Social igniting; Amazon still small — hollow: Paid media, Science).
Lifecycle stages, always in this order: Latent, Emerging, Window Open, Contested, Saturated, Declining.
Demand channels, always in this order: Amazon market, Search intent, Paid media, Social, Science.
```

---

# THE PROMPTS

## Prompt 1 — Foundation: Landing + Auth + Onboarding

**Goal:** Establish the design language in Stitch with the three lowest-complexity screens, so every later prompt inherits a correct foundation.
**Screens:** Landing page · Sign in (magic link + OAuth, incl. "check your email" state) · Onboarding (2 question steps).
**Depends on:** nothing (run first).

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]

Design 4 desktop screens (1440px) for a product intelligence tool called "Product Intelligence".

SCREEN 1 — LANDING PAGE. A single centered column (720px). Huge headline "Should you build it?"
(56px, bold). Subline in secondary gray: "One question. Six independent evidence sources.
A verdict you can defend." Below it, the hero: a large search input (56px tall, subtle shadow,
autofocus look) with placeholder "magnesium glycinate…". Below the fold: three "Verdict Cards"
side by side using sample markets 2, 3, 4 — each card shows: market name (small), the verdict
word HUGE in its verdict color, a line "Window: [stage] — [opening/closing/early]", a row of
5 witness dots with the count sentence, then the 3-sentence thesis in body text. Include the
AVOID card exactly as specified — showing a negative verdict is intentional. Under the cards,
one quiet line: "Track record requires time. Our ledger began July 2026; first quarterly
re-measurements land October 2026." Footer: Pricing, Sign in, Data sources, Legal.

SCREEN 2 — SIGN IN. Centered card 400px on the same background: title "Save your analyses and
watch markets", a "Continue with Google" button and "Continue with Apple" button (secondary
style), divider, email input + "Email me a sign-in link" (the one primary button). One legal
line. No passwords anywhere.

SCREEN 3 — CHECK YOUR EMAIL state of the same card: envelope-free, text only: "We sent a link
to elan@example.com", a disabled "Resend in 27s" secondary button, and "use a different email"
as a text link.

SCREEN 4 — ONBOARDING. Question 1 only: "What are you deciding?" with three large selectable
option cards: "Choosing my next product", "Validating one specific idea", "Monitoring markets
I care about". A quiet "Skip" text link top right. No progress dots, no illustrations.
```

**What Stitch should generate:** 4 desktop screens establishing type scale, verdict badge treatment, witness dots, card style, and the two button variants.
**Must remain consistent:** everything — this prompt *defines* the baseline.
**Acceptance criteria:** verdict words are the only saturated color on screen · witness dots render as filled/hollow circles with a count sentence (no percentages) · exactly one dark primary button per screen · no illustrations/emoji/gradients · the AVOID card looks as designed as the BUILD_NOW card.

---

## Prompt 2 — App Shell: Navigation + Home Decision Queue

**Goal:** The signed-in frame every later screen lives inside.
**Screens:** Left nav rail (collapsed + expanded) · Home/Dashboard (decision queue) · Home empty state.
**Depends on:** Prompt 1.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens using the same design language.

Design the signed-in app shell and home screen (1440px desktop).

APP SHELL: a slim left navigation rail (64px wide, icons only with tooltips): Home, Watchlist,
Pipeline, Alerts, Track Record, then a divider, Data Sources, Settings. Also show a variant
with the rail expanded to 220px with labels. Top of rail: a small search icon. No top navbar.

SCREEN — HOME "DECISION QUEUE". Content column max 1200px. From top:
(1) The global search field, full width, same style as the landing hero but 48px.
(2) Section "Needs attention" — two Change Note rows. Each row: one sentence in body text, e.g.
"beef tallow moisturizer moved Emerging → Window Open — Search intent crossed its threshold",
followed by a compact one-line verdict card (verdict badge + market name + stage + 5 witness
dots + tiny sparkline) and a "See what changed →" text link.
(3) Section "Your pipeline at a glance" — a wide, elegant arc/wave visualization: a single
smooth curve rising then falling, with six regions labeled beneath it: Latent, Emerging,
Window Open, Contested, Saturated, Declining. The "Window Open" region under the curve is very
subtly shaded. Place 4 dots on the arc for the 4 sample markets at their stages, each dot
colored by its verdict color and sized slightly differently.
(4) Section "Recent analyses" — a plain text list: query name, small verdict badge, date. 5 rows.
No KPI tiles, no stat widgets, no charts other than the arc, no activity feed.

SCREEN — HOME EMPTY STATE: same layout but sections empty: search field plus centered text
"Run your first analysis — ask about any product idea" and three example query chips:
"magnesium glycinate", "creatine gummies", "beef tallow moisturizer".
```

**What Stitch should generate:** nav rail (2 states), Home populated, Home empty.
**Must remain consistent:** card and badge styles, witness dots, button rules from Prompt 1.
**Acceptance criteria:** the arc reads instantly as a lifecycle wave with 6 labeled regions and a shaded window · Change Notes are sentences with evidence, not notification blobs · no dashboard widgets anywhere · search field is the topmost element.

---

## Prompt 3 — Search + Analysis Loading (the two-tier reveal)

**Goal:** The trust-building moment: interpretation, evidence arriving live, preliminary read, and the final resolve frame.
**Screens:** Search focus state · Loading at ~4s (evidence lines) · Loading at ~10s (preliminary read) · Resolve frame (verdict sets).
**Depends on:** Prompts 1–2.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language,
inside the same app shell with the left rail.

Design 4 desktop screens showing one analysis being created for "creatine gummies".

SCREEN 1 — SEARCH FOCUSED. Home screen with the search field focused and elevated (stronger
shadow). The user has typed "creatine gummies". Directly beneath the field: an interpretation
line in secondary gray: "→ analyzing creatine gummies · Amazon US", then three small refinement
chips: "creatine gummies for women", "creatine monohydrate gummies", "kids creatine". Below,
two recent queries with their small verdict badges.

SCREEN 2 — ANALYSIS LOADING, EARLY (~4 seconds in). Full content area. H1: "creatine gummies"
with subline "Interpreted as: creatine gummies · Amazon US — change". Below: a skeleton of a
verdict card (empty badge slot, gray bars). Under it, evidence lines appearing one by one, each
with a small check: "Reading 27 bestsellers…", "36 months of unit-sales history found",
"Search interest: accelerating for 8 quarters", and one still in progress with a subtle
shimmer: "Checking paid-media activity…". No progress bar, no percentage, no spinner.

SCREEN 3 — PRELIMINARY READ (~10 seconds in). Same screen, now showing: a compact lifecycle
arc with the dot on "Window Open" and an amber chip labeled "PRELIMINARY — 3 of 6 sources in".
Below the arc: the witness dot row with 3 filled and 2 hollow dots, plus the remaining evidence
lines still resolving. Everything already shown is normal weight (not skeleton).

SCREEN 4 — THE RESOLVE. The final frame: the full Verdict Card for creatine gummies (sample
market 2): "BUILD NOW" huge in #157F3D, "Window: WINDOW OPEN — opening", 4 of 5 witness dots
filled with count sentence, the 3-sentence thesis. The evidence lines are compressed into a
single quiet line above: "6 sources checked · 41 seconds". This frame should feel like the
moment the answer arrives — calm, not celebratory.
```

**What Stitch should generate:** the 4-frame loading narrative as separate screens.
**Must remain consistent:** skeleton style, chip style, arc from Prompt 2, verdict card anatomy from Prompt 1.
**Acceptance criteria:** no spinners/progress bars anywhere · evidence lines are real specific sentences · PRELIMINARY chip is amber and unambiguous · the resolve frame contains zero decoration beyond the verdict color itself.

---

## Prompt 4 — Opportunity Overview (THE decision screen)

**Goal:** The product's most important screen, in strict hierarchy order.
**Screens:** Opportunity Overview (populated) · same screen in stale-data variant.
**Depends on:** Prompts 1–3.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language,
inside the app shell.

Design the Opportunity Overview for "magnesium glycinate" (sample market 1), a single scrolling
desktop page, strict top-to-bottom order:

(1) Small interpretation line, then the FULL VERDICT CARD: market name small, verdict
"BUILD IF DIFFERENTIATED" huge in #5C7A29, "Window: CONTESTED — closing", witness dots
(filled: Amazon market, Search intent, Paid media; hollow: Social; Science shown filled with a
small up-arrow), sentence "3 of 5 sources confirm demand", then the 3-sentence thesis.

(2) The LIFECYCLE ARC, full width: dot on "Contested", with 3 small fading ghost dots trailing
behind it from "Window Open" (showing it moved), caption "moved from Window Open 2 months ago".

(3) The CONCORDANCE STRIP: a clean 5-row list, one per channel in canonical order, each row:
channel name, a trend arrow, one specific number, and a dot. "Amazon market ↑ +23% YoY units ●",
"Search intent ↑↑ accelerating 8 quarters ●", "Paid media ↑ 41 active advertisers ●",
"Social — No signal - TikTok returned no data ○" (hollow dot, honest), "Science ↑ publications
3× in 24 months ●".

(4) The GAP CHART: line chart, 36 months. Warm sienna #C2622E line "Demand acceleration" above
a cool slate #4A6B8A line "Supply response", with the area BETWEEN them shaded warm at low
opacity — the shaded area visibly narrowing toward the right. A soft vertical band near the
right edge labeled "similar profiles historically closed within 6–18 months". Caption under
the chart: "Is demand outrunning supply?". A small "View as table" text link.

(5) THREE HEADLINE NUMBERS in a row, huge tabular numerals with one context line each:
"41K units/mo — demand across top sellers, +23% YoY" · "$14.20 — margin headroom at the median
price" · "56,020 — median incumbent review moat".

(6) "What would change this verdict" — three short falsifiable lines, each with current vs
threshold, e.g. "New listings under 6 months old reach 15 (now: 11)".

(7) Exactly two buttons at the end: primary dark "Read the full report", secondary "Watch this
market". Nothing after them.

Also generate a second variant of the same screen with a quiet banner under the header:
"Data from June 12 — Re-run" (text link), everything else identical.
```

**What Stitch should generate:** the Overview + stale variant.
**Must remain consistent:** arc, dots, badge, chart palette; two-button ending.
**Acceptance criteria:** hierarchy order is exactly 1–7 · the gap chart's shaded area visibly narrows · hollow Social dot with honest-null sentence renders · exactly one primary button · no score breakdown widget, no related-markets carousel.

---

## Prompt 5 — Evidence Drawer + Evidence Explorer + Provider Transparency

**Goal:** Altitude 3 — the audit surfaces that make everything else believable.
**Screens:** Evidence Drawer (open over Overview) · Evidence Explorer page · Provider Transparency page.
**Depends on:** Prompts 1–4.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

SCREEN 1 — EVIDENCE DRAWER. The magnesium glycinate Overview from before, dimmed 40%, with a
480px right-side drawer open. Drawer content for the clicked claim "+23% YoY units": title
"+23% YoY unit growth", a small 12-month line chart in gray, a table of the raw monthly values
(tabular numbers), then a plain sentence in a bordered box: "Computed as the median of 27
bestsellers' year-over-year unit growth from Amazon monthly-sales history." Below: "Sample:
27 products · Source: Keepa · Updated 2 hours ago · Channel: Amazon market" as small labeled
rows, and a ghost link "Open in Evidence Explorer".

SCREEN 2 — EVIDENCE EXPLORER. Full page. Left rail (260px): signals grouped under channel
headings (Amazon market, Search intent, Paid media, Social, Science, Supply side, Consumer
voice), each signal a row with name + provider + freshness. Two filter chips at top: "Nulls (2)"
and "Disagreements (0)". Main pane for the selected signal "YoY unit growth": large time-series
chart, raw values table, the computation sentence, sample size, and a row "Feeds: Demand
Reality pillar · Lifecycle classifier". Show one signal in the rail marked with a hollow dot
(the null TikTok signal).

SCREEN 3 — PROVIDER TRANSPARENCY. A calm public page: intro paragraph in a bordered callout:
"Ten numbers from one source count as one witness. We only raise confidence when independent
sources agree." Then a table, one row per provider: Keepa (Amazon market + Supply side,
"Amazon unit sales and pricing history"), DataForSEO (Search intent), Meta Ads Library (Paid
media), TikTok (Social), PubMed + ClinicalTrials.gov (Science), USPTO (Supply side), Apify
reviews (Consumer voice). Columns: provider, channel tags as small gray pills, what it
contributes in plain words, reliability as 5 witness dots, last fetch time, status dot.
A second group beneath labeled "Adds when available": TikTok Shop, Import records.
```

**What Stitch should generate:** drawer overlay, explorer page, providers page.
**Must remain consistent:** channel names/order, dot vocabulary, table style.
**Acceptance criteria:** drawer shows raw values → computation sentence → sample/provider/freshness in that order · Nulls filter chip exists and a null signal is visible · reliability uses dots, not stars or percentages.

---

## Prompt 6 — Investor Report

**Goal:** The defensible linear document.
**Screens:** Full report page (long scroll) · its print/PDF variant.
**Depends on:** Prompts 1–5.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

Design the full INVESTOR REPORT for "magnesium glycinate" as one long scrolling page, reading
column 720px, with a 2px reading-progress hairline at the very top. No tabs, no table of
contents sidebar. Fixed section order:

(1) Verdict block: the full Verdict Card + compact lifecycle arc, restated.
(2) THE THESIS: the 3 sentences set large like a pull-quote (28px, generous line height) —
the most beautiful typography on the page.
(3) Demand: the 5-row concordance strip, each row followed by a small per-channel mini
time-series chart in gray.
(4) Supply response: a small chart "New listings under 12 months old" trending up, a line
"Trademark filings: 14 in the last year (+8 vs prior year)", "Median incumbent moat: 56,020
reviews", "Median price: $18.97, down 6% over 12 months".
(5) Entry economics: a clean fee table (Referral fee 15%, FBA pick & pack $5.38, Est. unit
cost $4.10, Median price $18.97, Margin headroom $14.20) plus one worked example sentence in
a bordered box: "A $24.99 product nets ≈ $9.80 after Amazon fees at today's structure."
(6) Differentiation brief: three pain clusters as rows ("Pill size complaints — 2,300 mentions",
"Sleep-onset expectations — 1,850 mentions", "Digestive discomfort — 900 mentions"), each with
ONE verbatim customer quote set in serif italic, e.g. "I want to take it for sleep but the
pills are horse-sized — I gave up after a week." Then a line: "Unserved claim: no top-10
listing addresses pill size."
(7) Risk & timing: bulleted window-closers, a quiet single-line strip "Seasonality: perennial —
no inventory timing risk" (visually de-emphasized), "Safety gate: clear".
(8) KILL CRITERIA, styled as commitments: header "We would reverse this verdict if…" and three
rows each with current reading vs threshold.
(9) Footer: "Verdicts of this class: track record accrues from October 2026." Small, factual.
Header row of the page: market name breadcrumb + two buttons: primary "Watch this market",
secondary "Export PDF".

Also generate a PRINT/PDF variant: same structure, white background, no app shell, page-width
report with a small header (product name, date, "Snapshot — as recorded July 10, 2026").
```

**What Stitch should generate:** the long report + print variant.
**Must remain consistent:** all primitives; serif is used ONLY inside customer quotes.
**Acceptance criteria:** section order exactly 1–9 · thesis is the typographic hero · quotes are serif italic and nothing else is · seasonality renders as a de-emphasized strip, not a scored panel · one primary button.

---

## Prompt 7 — Comparison (Tray + Compare screen)

**Goal:** The screen where the launch choice among candidates is made.
**Screens:** Compare Tray (docked, over any screen) · /compare with 3 markets.
**Depends on:** Prompts 1–4.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

SCREEN 1 — COMPARE TRAY. The Watchlist-style context with a bottom-docked tray bar: three
small market chips ("magnesium glycinate", "creatine gummies", "berberine supplement") each
with a tiny verdict badge and an ×, a capacity hint "3 of 4", and a primary "Compare →" button.

SCREEN 2 — COMPARISON. Three equal columns for those markets. From top:
(1) One highlighted sentence across the full width, in a bordered callout: "Of these three:
creatine gummies has the wider window; magnesium glycinate has better economics but 6–18
months less time; berberine's window has closed."
(2) The three Verdict Cards side by side (compact-full: verdict word 32px).
(3) ONE shared lifecycle arc, full width, with all three dots placed on it, colored by verdict.
(4) Concordance strips aligned row-for-row: the same 5 channels as rows, three columns of
arrow + number + dot, so each channel is compared on one line.
(5) Three gap charts on an identical time axis and identical y-scale.
(6) A common numbers grid: rows = Units/mo, YoY growth, Margin headroom, Median moat, Median
price; columns = the three markets; best value per row in slightly heavier weight (NOT color).
(7) Ending row: per-column secondary "Watch" buttons and ghost "Open report" links.
```

**What Stitch should generate:** tray + comparison screen.
**Must remain consistent:** shared-axis discipline; weight (not color) marks best-in-row.
**Acceptance criteria:** one shared arc (not three) · channel rows align across columns · gap charts share axes · max 4 capacity visible in tray · the ranked-read sentence is present at top.

---

## Prompt 8 — Watchlist + Alerts + Diff View

**Goal:** The monitoring loop.
**Screens:** Watchlist (populated) · Watchlist empty state · Alerts Center · Diff view.
**Depends on:** Prompts 1–4.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

SCREEN 1 — WATCHLIST. A list of 4 compact rows (the 4 sample markets), sorted by urgency.
Each row: verdict badge · market name · stage + a small direction chevron ("Contested ↘
closing") · a tiny two-line sparkline pair with shading (mini gap chart) · 5 witness dots ·
the latest Change Note sentence in secondary text, or "Quiet since May 30" in tertiary gray ·
a ⋯ menu. Top right: sort label "By urgency". No folders, no tags.

SCREEN 2 — WATCHLIST EMPTY STATE: centered text "Watch a market and we'll re-check it on
schedule — you'll hear from us only when the evidence moves." + secondary button "Run an
analysis".

SCREEN 3 — ALERTS CENTER. Chronological, grouped by day headers ("Today", "July 3"). Each
alert is a Change Note block: the sentence ("beef tallow moisturizer moved Emerging → Window
Open"), the number that crossed ("Search slope crossed +40%/qtr, threshold +35%"), a mini
verdict card, and "See what changed →". Include one kill-criteria alert: "berberine crossed
your kill criterion: 19 listings under 6 months old (threshold: 15)". Quiet top-right link
"Notification settings". No unread badges, no mark-all-read UI.

SCREEN 4 — DIFF VIEW. The Opportunity Overview layout for beef tallow moisturizer where ONLY
the changed elements are at full opacity and everything else is dimmed to 40%: the arc shows
the dot's previous position as a ghost and new position highlighted with a short arrow; the
concordance row "Search intent" is highlighted; a top banner reads "What changed since June 8".
```

**What Stitch should generate:** 4 screens of the monitoring loop.
**Must remain consistent:** compact verdict-card row anatomy; Change Note grammar (sentence + number + threshold).
**Acceptance criteria:** exactly two alert *types* appear (stage transition, kill criterion) · diff view dims unchanged content and shows before→after on the arc · empty state teaches the loop.

---

## Prompt 9 — Portfolio Pipeline + Track Record + Ledger

**Goal:** Time as the organizing axis; the engine keeping score on itself.
**Screens:** Portfolio/pipeline · Track Record (with pre-data variant) · Ledger index · Ledger snapshot.
**Depends on:** Prompts 1–4, 8.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

SCREEN 1 — PIPELINE. A full-width lifecycle arc as the hero, with the 4 sample markets as dots:
each dot colored by verdict and sized by opportunity quality (creatine gummies largest).
Beneath: the same markets as rows GROUPED under collapsible headers by stage region, ordered
"Window Open" first, then "Emerging", "Contested", "Saturated". Rows reuse the compact
watchlist row style with checkboxes; a "Compare selected" secondary button appears above.

SCREEN 2 — TRACK RECORD. (a) Top: headline calibration stats as three large statements with big
tabular numbers: "Window Open calls — a real window existed in 78% of re-measured cases,
n = 41", "BUILD NOW calls — new entrants gained traction in 71% of cases, n = 17", "AVOID
calls — 89% saw price compression within 2 quarters, n = 28". Each with a tiny "methodology"
text link. (b) An outcomes table: date, market, verdict-at-the-time badge, "what happened
since" sentence, and an outcome mark: "held" / "partially held" / "missed" as plain text chips.
(c) A verdict timeline for magnesium glycinate: 4 mini verdict cards left-to-right on a time
axis (Feb: WATCH_CLOSELY → April: BUILD_NOW → June: BUILD_IF_DIFFERENTIATED → today) each with
its stage label, connected by a thin line.
Also make a PRE-DATA VARIANT of this screen: stats replaced by "Track record requires time.
Ledger began July 2026; first quarterly re-measurements land October 2026." — a countdown
presented plainly, page otherwise intact.

SCREEN 3 — LEDGER INDEX. A dense, Bloomberg-calm table: Date, Market, Verdict badge,
Confidence (dots), Engine version (v2.7), and a chain icon with "recorded July 10, 2026 —
never modified". Filter chips: market, date range, verdict, version. 8 rows using sample data.

SCREEN 4 — LEDGER SNAPSHOT. The magnesium glycinate Overview rendered read-only with a warm
sepia-tinted background variant and a persistent top banner: "Snapshot — July 10, 2026 ·
engine v2.7 · as recorded", plus a "View this market today" secondary button. All content
identical to the Overview but visibly frozen (no primary button anywhere).
```

**What Stitch should generate:** 5 screens (incl. the pre-data variant).
**Must remain consistent:** dots-on-arc double encoding (position=timing, size=quality, color=verdict) appears ONLY here and on Home's mini arc; snapshot mode is visually distinct but structurally identical to the Overview.
**Acceptance criteria:** pipeline groups ordered Window Open first · outcome marks are text chips, not icons · pre-data variant is honest and undecorated · snapshot has a persistent banner and zero primary buttons.

---

## Prompt 10 — Settings + Billing + Upgrade Sheet

**Goal:** Boring on purpose; pricing at the value moment.
**Screens:** Settings · Billing · In-context upgrade sheet.
**Depends on:** Prompts 1–2.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing screens exactly as they are. Add new screens in the same design language.

SCREEN 1 — SETTINGS. One plain page, four sections with left anchor links: Account (name,
email, "Delete account" as a quiet red text link), Notifications (a simple toggle grid: rows =
"Stage transitions", "Kill-criteria triggers", "Weekly 'nothing moved' summary (off by
default)"; columns = In-app, Email, Push), Defaults (marketplace dropdown "Amazon US", home
surface preference, explanation density), Data & privacy ("Export all my analyses and ledger
entries" secondary button + policy link). No theme customizer, no density options.

SCREEN 2 — BILLING. (1) Current plan card: "Operator — $79/mo" with two plain usage meters:
"7 of 15 analyses this month" and "4 of 10 watch slots" as simple horizontal bars (no gauges,
no rings). (2) A 3-tier plan table: Starter $29 (5 analyses, 3 slots), Operator $79 (15
analyses, 10 slots), Professional $199 (50 analyses, 30 slots, exports, priority data); annual/
monthly toggle with annual default "2 months free". (3) Invoices list with download links,
payment method row. Exactly one primary button: "Change plan".

SCREEN 3 — IN-CONTEXT UPGRADE SHEET. The magnesium glycinate Overview dimmed behind a centered
sheet triggered by clicking Watch with no slots left: title "You're out of watch slots",
one line "Operator includes 10 — you're watching 10", the delta stated plainly: "Professional
adds 20 more slots for $120/mo more", and ONE primary button "Upgrade and watch this market"
plus a ghost "Not now". After-state implication: the action completes automatically.
```

**What Stitch should generate:** 3 screens.
**Must remain consistent:** meters are plain bars; one primary per screen; destructive action is quiet text, not a red button.
**Acceptance criteria:** upgrade sheet names the blocked action and completes it in one tap · no gauges/rings on meters · weekly heartbeat toggle is visibly off by default.

---

## Prompt 11 — Mobile (the companion)

**Goal:** The alert-triage companion: bottom tabs, compact primitives, sheets.
**Screens (390px width):** Mobile Home · Mobile Overview · Mobile Evidence bottom-sheet · Mobile Watchlist · Mobile Alert → diff.
**Depends on:** Prompts 1–8.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep all existing desktop screens exactly as they are. Now design the MOBILE versions
(390px wide) using the identical design language, compressed — never simplified in meaning.

Bottom tab bar on all screens: Home, Watchlist, Alerts, Account. Search icon in top bar.

SCREEN 1 — MOBILE HOME: search icon top bar, then "Needs attention" Change Notes as full-width
cards, then a compact lifecycle arc, then recent analyses list.
SCREEN 2 — MOBILE OPPORTUNITY OVERVIEW (magnesium glycinate): identical section order to
desktop, single column: verdict card, compact arc, concordance strip (5 rows), gap chart
(full-width, shorter), three headline numbers stacked, kill criteria, and the two decision
buttons docked as a fixed bottom bar above the tab bar.
SCREEN 3 — MOBILE EVIDENCE SHEET: the Overview dimmed with a bottom sheet at half height
showing the same drawer content (raw values, computation sentence, source, freshness) with a
drag handle.
SCREEN 4 — MOBILE WATCHLIST: the 4 compact rows adapted full-width; show one row mid-swipe
revealing an "Unwatch" action.
SCREEN 5 — MOBILE ALERT FLOW: a push-notification style Change Note at top, and beneath it the
mobile diff view: dimmed content, highlighted arc movement and the changed concordance row.
```

**What Stitch should generate:** 5 mobile screens.
**Must remain consistent:** hierarchy order identical to desktop; nothing decision-relevant hidden — only compressed.
**Acceptance criteria:** bottom tabs = exactly Home/Watchlist/Alerts/Account · decision buttons dock above the tab bar · evidence appears as a draggable bottom sheet · compact arc and dots remain legible at 390px.

---

## Prompt 12 — Final Polish: Dark Mode + States + Consistency Review

**Goal:** Dark mode, the remaining honest states, and a full-app consistency pass.
**Screens:** Dark-mode Home + Overview · error/partial-failure states · loading skeletons · final review checklist run.
**Depends on:** all previous.

**Exact Stitch prompt:**
```
[PASTE STYLE HEADER §A]
[PASTE SAMPLE DATA §B]
Keep every existing screen's layout exactly as it is. This prompt only adds dark mode versions
and system states — do not move, add, or remove any element from existing screens.

PART 1 — DARK MODE. Recreate the Home screen and the magnesium glycinate Overview in dark
mode: background #101113, cards #17181B with 1px #2A2C30 borders, text #F2F3F5 / #B7BBC2 /
#83878E. Verdict colors switch to brighter variants: BUILD_NOW #34C069, BUILD_IF_DIFFERENTIATED
#93B84E, WATCH #E3A63C, INVESTIGATE #6E93C9, AVOID #E07B5F, PASS #9BA0A6. Elevation via
lighter surfaces, never glows. Chart gridlines #232529.

PART 2 — STATES. Three additional screens:
(a) PARTIAL FAILURE: the Overview where the Paid media channel failed — its concordance row
reads "No signal — Meta Ads Library returned no data" with a hollow dot; witness sentence
updates to "2 of 5 sources confirm demand"; a PRELIMINARY-style honesty, everything else normal.
(b) FULL FAILURE: an analysis route where data couldn't load — the page skeleton stays visible
with a centered specific sentence "Couldn't reach the analysis service" and a secondary Retry
button. Not a sad-face illustration, not a generic error page.
(c) SKELETON SHEET: one screen showing the loading skeleton versions of: verdict card, compact
watchlist row, gap chart (axes only), concordance strip — each skeleton mirroring its final
layout exactly with soft gray blocks.

PART 3 — MICRO-INTERACTION SPEC FRAMES: a single reference screen showing component states
side by side: primary/secondary/ghost buttons in default, hover, focused (2px slate ring),
disabled, and loading (inline spinner + label); an input in default, focused, and error state
("This field is required" in rust below); a toast "Watching ✓ — 4 of 10 slots" with an Undo
link.
```

**What Stitch should generate:** 2 dark screens, 3 state screens, 1 component-states reference frame.
**Must remain consistent:** layouts pixel-identical to their light/populated counterparts; only tokens and states change.
**Acceptance criteria:** dark mode uses surface steps (no glows/shadows) · partial failure keeps the screen fully usable with honest-null rows · skeletons mirror final layouts · focus rings visible in both modes.

**Final review checklist (run manually against the whole Stitch project before export):**
1. Verdict colors appear ONLY on verdict badges/words — nowhere else.
2. One dark primary button per screen, across all screens.
3. Witness dots + count sentence everywhere confidence appears; zero percentages at Altitude 1.
4. Every chart has a one-question caption; zero pies/donuts/radars/gauges anywhere.
5. All hierarchy orders match desktop on mobile.
6. Hollow dots / "No signal" rows present wherever data is missing; nothing silently omitted.
7. Serif appears only inside customer quotes.
8. The lifecycle arc is the only lifecycle visualization, at 3 sizes.
9. No screen ends with anything other than a decision action.
10. Sample data matches §B verbatim across all screens.

---

# EXECUTION ORDER

| Run | Prompt | Screens | Depends on |
|---|---|---|---|
| 1 | Foundation | Landing, Sign in, Check email, Onboarding | — |
| 2 | App Shell | Nav rail ×2, Home, Home empty | 1 |
| 3 | Search & Loading | Search focus, Loading ×2, Resolve | 1–2 |
| 4 | Opportunity Overview | Overview, stale variant | 1–3 |
| 5 | Evidence & Transparency | Drawer, Explorer, Providers | 1–4 |
| 6 | Investor Report | Report, print variant | 1–5 |
| 7 | Comparison | Tray, Compare | 1–4 |
| 8 | Watchlist & Alerts | Watchlist ×2, Alerts, Diff | 1–4 |
| 9 | Portfolio & History | Pipeline, Track record ×2, Ledger ×2 | 1–4, 8 |
| 10 | Settings & Billing | Settings, Billing, Upgrade sheet | 1–2 |
| 11 | Mobile | 5 mobile screens | 1–8 |
| 12 | Polish | Dark ×2, States ×3, Component frame | all |

Prompts 5, 6, 7, 8 may run in any order among themselves after 4. Prompt 10 may run any time after 2. Prompts 11 and 12 must run last, in that order.
