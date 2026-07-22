# Design Source of Truth — Consistency Audit

**Date:** 2026-07-22 · **Subject:** `docs/DESIGN_SOURCE_OF_TRUTH.md` (all sections, as of the fourth-pass revision) · **Method:** hostile self-review. Premise: an intelligent engineer joins in six months with **zero historical context** and this document as their only source of truth. Every place they could still build the wrong thing is treated as a defect — including a 1% chance of misreading.

**Verdict: the document is not complete.** 20 defects found: **5 Critical** (the engineer *will* build the wrong thing), **7 High** (the engineer will likely build the wrong thing in a specific realistic scenario), **8 Medium/Low** (the engineer could waste days or introduce a known-but-undocumented regression). Every factual claim below was re-verified against the repo before being written down — none are hypothetical.

Proposed fix text is included for every defect but **not yet applied** — per the standing approval process, the owner approves before the SoT doc is amended.

---

## CRITICAL

### D1 — The per-screen background rule is missing; the document actively invites the exact mistake the owner corrected

1. **Ambiguous section:** "The One World principle" — *"The Cathedral of Palms is not a Landing background. It is the visual identity of the entire product."* Plus §0 "Background compositions": *"Two locked compositions."*
2. **Why it misleads:** the owner's binding mid-Phase-1 correction — *"I don't want the exact same background image on every page… each major screen should have its own composition and atmosphere while keeping the same visual language"* — exists only in `components/cine/AmbientWorld.tsx`'s code comment and a session plan file. The SoT doc never states it. Read in isolation, "it is the visual identity of the entire product" says the opposite: reuse this photo everywhere.
3. **Realistic wrong implementation:** the engineer builds cinematic Dashboard with `landing-cathedral-of-palms.jpg` as its background — a faithful-feeling reading of the document that directly violates an explicit owner decision. (This is not speculative: the component's `image` prop was made mandatory precisely because this mistake was already made once, by the author of this document.)
4. **Exact fix — add to "The One World principle," after the inheritance list (AMENDED 2026-07-22, see below):**
   > Every major screen has an owned background composition, chosen deliberately rather than defaulted — `AmbientWorld`'s `image` prop stays required for exactly this reason, never a hardcoded default. That composition is **not automatically a new photograph** for every screen: **Landing, Login, and Home share `landing-cathedral-of-palms.jpg`** (owner decision, 2026-07-22 — "do not replace the approved palm-world background… use the previously approved background as the foundation for the Home"), differentiated by treatment (crop/`imagePosition`/intensity/scrim), not a distinct image. Candidate Detail has its own night composition. Dashboard/Discover's exact treatment (new photo vs. shared-photo-with-different-treatment) is an explicit owner call each time, decided per screen — **never generate or adopt a new environment composition without the owner explicitly approving the replacement first.**
   >
   > *(This entry originally read "every major screen gets its own composition, different image" — that was correct as of 2026-07-21 but was explicitly superseded for Home on 2026-07-22. Kept here, struck through in spirit rather than deleted, so a future reader sees the rule changed and why, rather than silently inheriting a stale version.)*

### D2 — Normative references point to sources a future engineer cannot access

1. **Ambiguous section:** §3 (*"per the design-DNA memory," "see the frozen product-language memory"*), §0 Dashboard row and §1 (*"scratchpad/dashboard_v1.final.html," "hero3d-prototype/"*), §0 (*"Artifact 'Product Intelligence — Home'"*), §5 (*"That memory should be corrected"*).
2. **Why it misleads:** "memories" are Claude-session records on one machine; "scratchpad" is an undefined term that resolves to a session-temporary directory under `/private/tmp` (already partially garbage-collected between sessions once); Artifact URLs are private to the owner's claude.ai account. A future engineer can follow **none** of these references. Worse, load-bearing rules (the rotor's locked behavior, the frozen vocabulary) live *only* behind them.
3. **Realistic wrong implementation:** the engineer, unable to read "the design-DNA memory," reasonably re-derives rotor behavior from scratch — adds an eased spin-up (explicitly rejected: "never a loading spinner"), or a bezel ring (explicitly rejected twice). The rejection record is invisible to them.
4. **Exact fix — add a "References and their reliability" note to the header, and inline every load-bearing rule:**
   > **Reference classes:** (a) repo paths — durable, authoritative; (b) claude.ai Artifact URLs — visual review snapshots, accessible only to the owner, never implementation specs; (c) "scratchpad"/"memory" — session-temporary working files on the maintainer's machine; assume they no longer exist. **No rule in this document may live only behind a class-(b) or class-(c) reference.** The rotor's locked behavioral rules and the frozen product vocabulary are therefore inlined in full below (see §3a and §8).
   Then actually inline them (§3a: constant-velocity spin, no ease within a state, hover slows to ~35% never stops, no ring/bezel — rejected twice, self-emissive core — hidden-point-light rejected twice, diagonal off-canvas beams, score always real DOM; §8: see D3).

### D3 — The frozen five-word product language is absent from the document entirely

1. **Ambiguous section:** none exists — the doc says only "frozen 'Hunch' vocabulary" in passing (§0 Dashboard row) without defining it.
2. **Why it misleads:** UI copy is a design decision, and this product's copy rules are unusually strict: exactly five owned words (**Hunch, Verdict, Conviction, Trace, Pull**), everything else deliberately plain English, "copy that violates the freeze is a bug, not a style choice" (owner, 2026-07-21). An engineer who has never heard this will name things by convention.
3. **Realistic wrong implementation:** the engineer labels the Dashboard CTA "New Analysis," the Discover feed "Insights," the confidence metric "Grounded 84%" — all specifically ruled out. (This is already live: `SideNav.tsx`'s CTA reads "+ New Analysis" — see D16.)
4. **Exact fix — add a new §8 "Frozen product language (locked 2026-07-21)":**
   > Five owned words, everything else plain English. **Hunch** — untested promising suspicion; belongs to the user *or the engine* (the Discover feed is engine-hunches, never "insights"). **Verdict** — the machine's judgment (machine-only). **Conviction** — belief the human recorded (human-only). **Trace** — the interrogation verb: any number opens backward to its raw signals; nothing may refuse a Trace; the metric is "Traced 84%," never "Grounded." **Pull** — the signature test gesture (drag the verdict, evidence resists; implemented in `corePullPhysics.ts`/`useCorePullGesture.ts`; the only approved drag interaction — do not invent others). Kill-criteria content stays but in plain English ("What would kill this"). Intake CTA is "Log a hunch," not "New/Analyze." Copy violating this list is a bug. No new interaction verbs or owned nouns without owner approval.

### D4 — The honesty rules that govern every design decision are not in the document

1. **Ambiguous section:** none exists. Fragments appear incidentally ("honest ghost-stages," "never fabricated") but the rules themselves are only in component comments spread across the repo.
2. **Why it misleads:** these are the least-guessable rules in the project because they *oppose* common practice: most designers would add a placeholder sparkline to an empty metric tile without a second thought.
3. **Realistic wrong implementation:** Dashboard cards get decorative trend-lines with invented shapes ("it's just visual texture"); a kill criterion shows a green "Not triggered" chip for a non-watchlisted analysis (fabricating a state that's only ever computed on the watchlist re-check path); confidence appears only on hover.
4. **Exact fix — add a new §9 "Honesty rules (non-negotiable, inherited from the data-integrity audits)":**
   > 1. Never render a data point, trend, or state that does not exist in the real data model. `GlassInstrument.trace` is omitted — not flat-lined, not faked — when no real series exists. 2. Illustrative/example data is always labeled as such, visibly, on the surface that shows it (Landing's preview cards are the pattern). 3. Every value is always-visible real text — never hover-only, and color is never the sole signal. 4. Kill criteria for a non-watchlisted analysis show only the flat `valueAtGeneration` statement — triggered/not-triggered states exist solely in the watchlist re-check path and may not be simulated. 5. Missing data is shown as honestly missing ("No real social signal available — AI judgment only"), never silently dropped or filled. 6. Verdicts/scores/confidence are read from the single computation path (`computeGroundedScore` / `computeConfidenceAssessment`) — never re-derived per-screen.

### D5 — The mandatory design-approval process is not in the document

1. **Ambiguous section:** §7 "Working rule" — tells the engineer to *check tables*, never how a design becomes implementable.
2. **Why it misleads:** the actual standing process (owner-declared, permanent) is: ui-ux-pro-max design-system query → 21st pattern search → **high-fidelity mockup → explicit owner approval → only then production code**, plus live-browser verification before reporting done. The doc's own history proves the gate matters (every phase went through it), but the doc never states it.
3. **Realistic wrong implementation:** the engineer reads "Phase 5. Real `/analyze` page is the IA source of truth," concludes the design is fully determined, and implements cinematic Discover straight into `app/analyze/page.tsx` — skipping mockup and approval entirely. Nothing in the document says they can't.
4. **Exact fix — add to §7:**
   > **Process gate (permanent, owner-declared, never skip):** no major screen or redesign goes to production code without, in order: (1) a ui-ux-pro-max `--design-system` query for that screen; (2) 21st pattern research; (3) a complete high-fidelity mockup; (4) **explicit owner approval of that mockup**; (5) implementation matching the approved mockup with pixel-level fidelity; (6) live-browser verification (real rendering, computed-style checks, mobile width, reduced-motion) before reporting done. Decision authority for every approval and every §6 open question is the **product owner** — "needs a call" in this document never means the implementing engineer's call.

---

## HIGH

### D6 — One World and the out-of-scope list contradict each other, and the doc pretends they don't

1. **Ambiguous section:** "The One World principle" (*"No page should ever feel like it belongs to a different product"*) vs §1 (*"Explicitly out of scope … stays on pi-\*/AppShell indefinitely: Watchlist, Alerts, Leaderboard, Settings/Billing, History"* + Compare).
2. **Why it misleads:** a user navigating cinematic-dark Dashboard → cream-light Watchlist experiences precisely the "different product" jump the top rule forbids. The engineer must guess which rule wins.
3. **Realistic wrong implementation:** either the engineer "fixes" Watchlist by cinematizing it (violating the out-of-scope decision), or treats the One World gate as aspirational fluff and stops applying it to the five in-scope screens too.
4. **Exact fix — add to the One World section:**
   > **Known, accepted exception:** the out-of-scope screens listed in §1 (Watchlist, Alerts, Leaderboard, Settings, History, Compare) remain on the pi-\* cream system for now. The visual seam between the two worlds is a *known accepted debt*, owner-approved, not a defect for an engineer to fix on their own initiative. The One World verification gate binds the five named screens (Landing, Login, Dashboard, Discover, Candidate Detail) and any newly created screen — extending it to the exception list is an owner decision, not an engineering one.

### D7 — Two glass recipes exist and the doc's "reuse verbatim" points at the older one

1. **Ambiguous section:** §0 "Glass components" — *"the one and only approved glass system. Reuse it verbatim"* naming `GlassPanel.tsx`, while the same row admits the recipe was *"refined once already … in the Candidate Detail prototype"* (asymmetric sheen, edge bevel, second streak — which live only in the prototype's CSS, not in `GlassPanel.tsx`).
2. **Why it misleads:** "verbatim" and "refined elsewhere" cannot both be followed. Which pixels are canonical?
3. **Realistic wrong implementation:** during Phase 3 implementation the engineer creates `GlassPanelNight.tsx` with the refined recipe alongside the old `GlassPanel.tsx` — permanently forking the "one and only" glass system; Landing and Candidate Detail drift apart from that day on.
4. **Exact fix — replace the row's status text:**
   > One glass system, one component. When prototype-stage refinements are approved (as the Candidate Detail polish-pass refinements now are), they are **folded back into `GlassPanel.tsx` itself** as part of that phase's implementation — never shipped as a parallel component. Landing/Login inherit the upgrade automatically in the same change; a visual diff of both is part of that phase's verification. If the two-recipe state exists (it does today), `GlassPanel.tsx` + the approved prototype's refinements together define the target; the merge is the first task of Phase 3 implementation.

### D8 — "Reused verbatim" vs "re-skin its stage": §3 contradicts itself at the file level

1. **Ambiguous section:** §3 — *"the real `CandidateCoreHero`/`CandidateCoreCanvas` component must be reused verbatim (geometry, physics, data adapter untouched) — only the stage/environment around it … gets the cinematic treatment."*
2. **Why it misleads:** the "stage" (the boxed `bg-[#14130f]` backdrop the approved prototype explicitly replaces) is markup *inside* `CandidateCoreHero.tsx`. Verbatim reuse of that file and restyling its stage are mutually exclusive; the doc doesn't say which files are actually untouchable.
3. **Realistic wrong implementation:** an engineer taking "verbatim" literally ships the cinematic page with the old boxed dark stage inside it (two nested competing backgrounds); or, taking "re-skin" broadly, edits `CandidateCoreRotor.tsx`'s materials to "fit the night mood" — touching the locked 3D core.
4. **Exact fix — replace the sentence with a file-level touchability table:**
   > **Never modify** (locked): `CandidateCoreRotor.tsx`, `buildRotorGeometry.ts`, `coreDataAdapter.ts`, `corePullPhysics.ts`, `useCorePullGesture.ts`, `motionEasing.ts`, and `CandidateCoreCanvas.tsx`'s mount/perf-tier logic. **May be modified with an approved mockup:** `CandidateCoreHero.tsx`'s surrounding stage markup/classes only (the wrapper, backdrop, and layout around the canvas) — the DOM-first score/legend elements inside it keep their content and accessibility behavior verbatim even when restyled.

### D9 — Navigation ownership for cinematic in-app screens is undefined (three real nav patterns, zero rules)

1. **Ambiguous section:** §0 "Navigation" + §5 — they inventory `SideNav` (Layer 2) and `CineShell`'s nav (Layer 3) and note a missing History link, but never say **which nav a cinematic in-app screen uses**. The approved Candidate Detail prototype meanwhile carries a *third* pattern (its own glass sticky breadcrumb bar + section pills).
2. **Why it misleads:** the original plan's rule ("CineShell replaces AppShell for the in-scope routes") is not in this document — it lives in a session plan file (class-(c) reference, see D2).
3. **Realistic wrong implementation:** cinematic Dashboard ships wrapped in `AppShell`+`SideNav` (a fixed cream sidebar slicing into the dark world), because that's what every other in-app screen does and nothing says otherwise.
4. **Exact fix — add to §5:**
   > **Ownership rule:** screens inside the cinematic world (the five named screens) use `CineShell`/`CineNav` — never `AppShell`/`SideNav`. `AppShell`/`SideNav` remains the shell for the out-of-scope pi-\* screens only. Per-screen additions (Candidate Detail's breadcrumb + section-pill bar) sit *inside* `CineShell`, they do not replace it. Before Dashboard implements: add the missing History link to `CineNav` and change its CTA copy per §8 (frozen language). The two shells must never appear on the same route.

### D10 — Motion timing tiers and the reduced-motion mandate are missing; the one documented duration is wrong for most uses

1. **Ambiguous section:** §4's motion row documents only `ease-cine` + 450/200/600ms, and the One World section says "the `ease-cine`/`duration-cine-*` vocabulary" with no usage rules. `prefers-reduced-motion` appears nowhere in the entire document.
2. **Why it misleads:** the approved interaction tiers (hover-subtle 150–200ms/≤2px; hover-standard 200–300ms/−4px+scale 1.02; scroll-reveal 300–400ms/8–16px fade, reveal-once; stagger 20–40ms/item; exactly **one** "magnetic" complex interaction per screen, currently spent on the rotor) exist only in the prototype's CSS comments and a session review. And every existing motion system in the repo treats reduced-motion as a hard gate — a convention invisible to a new reader.
3. **Realistic wrong implementation:** hovers animated at `duration-cine` (450ms — reads as sluggish, violates the 150–300ms micro-interaction rule the project itself audited against); parallax/scroll choreography with no reduced-motion path; three "magnetic" cards competing on one screen.
4. **Exact fix — extend §4 with a motion-usage table:**
   > **Timing tiers (locked by the approved polish pass):** hover micro 150–200ms, ≤2px, opacity ≥0.9; hover standard 200–300ms, −4px + scale ≤1.02 + shadow; scroll-reveal 300–400ms, 8–16px translate, fires once, never re-triggers on scroll-up; stagger 20–40ms/item; page-level/ceremony 450–600ms max. At most **one** complex/"magnetic" pointer-tracked interaction per screen — on Candidate Detail it is spent on the rotor; a screen without a comparable single centerpiece gets none. The rotor's own constant-velocity spin is a deliberate exception to easing rules and is not a precedent. **`prefers-reduced-motion` is a hard gate on every animation and transition, DOM and WebGL alike: content must be fully present and legible with all motion off (no permanently-hidden `opacity:0` reveals).** No new page-transition system exists or is approved; do not add one without owner approval.

### D11 — WebGL scope is unbounded in both directions (when the rotor must appear, and when it must not)

1. **Ambiguous section:** One World (*"where a future screen needs a data-bound visual centerpiece … extend or reuse `candidate-core` … before ever considering something new"*) + §0 Score visualization (*"the approved score visualization — full stop"*) + §3 (*"never invent a third"* form).
2. **Why it misleads:** read maximally, every score number on every screen needs the WebGL rotor (Dashboard has 30 cards…); read minimally, a static SVG rotor variant for Dashboard's header is "a third form" and forbidden. Neither boundary is drawn. The performance-tier system that makes the rotor shippable (poster ≤640px static replica / reduced ≤1024px DPR-clamped / full) is also absent from the doc.
3. **Realistic wrong implementation:** 30 WebGL canvases in a Dashboard grid (kills the page), or a from-scratch "mini rotor gauge" per card (invents the forbidden third form). Both are defensible readings of the current text.
4. **Exact fix — replace the One World WebGL paragraph:**
   > **Where the WebGL rotor lives:** as of today, exactly one place — the Candidate Detail hero (one canvas per page, ever). Inline scores elsewhere (rows, cards, tiles) are plain text numbers or existing lightweight components (`GlassInstrument`, `SparklineChart`) — a numeric score display is **not** a "score visualization" in the §0 sense and does not summon the rotor. The static `RotorMark` SVG is the only non-WebGL rotor rendering and is brand-mark-only (never data-bound). Giving any additional screen a WebGL centerpiece is an owner decision requiring its own approved mockup, and inherits `CandidateCoreCanvas`'s existing perf tiers (poster: ≤640px/low-power → static replica, no WebGL; reduced: ≤1024px → DPR-clamped, heavy effects off; full: desktop). No screen ships WebGL without all three tiers working.

### D12 — "Implemented, approved, live" describes work that is not committed to git

1. **Ambiguous section:** §0 Landing/Login rows ("Implemented, approved, live"), §1 Layer 2 row ("currently live in production").
2. **Why it misleads:** as of this audit, the entire Layer 3 implementation — `app/page.tsx`, `app/login/page.tsx`, `components/cine/` (untracked!), `public/ambient/` (untracked!), `tailwind.config.ts`, `design-prototypes/` — exists **only as uncommitted working-tree changes**. "Live" also conflates "in the repo" with "deployed."
3. **Realistic wrong implementation:** an engineer runs `git checkout .`/`git clean -fd` to get a clean slate before starting, and permanently deletes the only copy of the approved Landing, Login, the entire cine component system, and both locked hero photographs.
4. **Exact fix — add a status banner to the header, and commit the work:**
   > **Repo status warning (2026-07-22):** everything described as Layer 3 "implemented" exists as uncommitted working-tree changes on `main` — including untracked directories `components/cine/`, `public/ambient/`, and `design-prototypes/`. Until these are committed, `git clean -fd` destroys the approved design system and both locked hero images. Committing this work is the highest-priority housekeeping task in this document. ("Live" in this document means "the current working-tree behavior when running the app locally," not "deployed to production.")

---

## MEDIUM / LOW

### D13 — The token table omits the third gold, and the trap is real

1. **Ambiguous section:** §4 lists `pi.gold-deep #D4A94A` and `pi.gold-bright #C9971F` only.
2. **Why it misleads:** `tailwind.config.ts` actually defines **three** golds: `pi.gold` = `#8D6A16` (a dark bronze for text-on-cream contexts), plus the two listed. The unlisted one has the most grabbable name.
3. **Realistic wrong implementation:** `text-pi-gold` on the dark cinematic background — a muddy brown that reads as a rendering error, shipped because the doc implied the gold list was complete. Also missing: `pi.sand/sub/faint/hairline`, the glass tone palettes (`TONE_TEXT/TONE_LINE/TONE_GLOW`), and any note that the cinematic dark surfaces (`#0b0a08` etc.) are deliberately *not* tokenized yet.
4. **Exact fix:** extend the §4 table with all `pi.*` tokens verbatim from `tailwind.config.ts`, the three-gold distinction with usage notes ("`pi-gold` is for text on cream only; on dark, use `gold-deep`/`gold-bright`"), the `GlassInstrument` tone maps, and a line: "dark-world surface colors are currently hard-coded per component; do not invent new near-blacks — copy from `AmbientWorld`/`GlassPanel`."

### D14 — A known, already-shipped Tailwind opacity trap is undocumented

1. **Ambiguous section:** none — that's the defect.
2. **Why it misleads:** this project's Tailwind config has no extended opacity scale: arbitrary opacity modifiers that aren't multiples of 5 (`text-pi-cream/72`, `/68`, `/82`) **silently generate no CSS**, and the element falls back to inherited color. This actually shipped once — hero text rendered near-black on gold until caught in live-browser verification.
3. **Realistic wrong implementation:** the identical regression, re-introduced by the first engineer who writes `/65`→`/68` while fine-tuning.
4. **Exact fix — add to §4:** "**Opacity modifiers must be multiples of 5** (`/70`, not `/72`). Non-multiples silently produce no CSS with this config — this exact bug shipped once (see commit history around the Phase 2 legibility fix). If finer steps are ever needed, extend the Tailwind opacity scale explicitly; never assume arbitrary values work."

### D15 — Top-level confidence percentage conflicts with the still-standing V2 UX rule, unflagged

1. **Ambiguous section:** §1 says the V2 *design-system* doc is superseded "in practice" — but the V2 **UX blueprint** (a different doc, same family) mandates "witness-dot confidence, never percentages at top level," and §6 never mentions it. The approved Candidate Detail prototype shows "**58%**" as the hero confidence readout.
2. **Why it misleads:** the engineer cannot tell whether the prototype overrides the blueprint or violates it.
3. **Realistic wrong implementation:** either the engineer "corrects" the approved prototype back to dots-only (unauthorized design change), or propagates big top-level percentages to every screen (possibly cementing a rule violation the owner never consciously waived).
4. **Exact fix — add §6 item 7:** "The approved Candidate Detail direction shows confidence as a top-level percentage; `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` says witness dots, never percentages at top level. Owner ruling needed: (a) percentage display is the new standard, or (b) Candidate Detail is a one-screen exception, or (c) it should be changed before implementation. Until ruled: implement the approved mockup as-is, do not propagate the pattern to other screens."

### D16 — The live SideNav CTA violates the frozen language and the doc doesn't say so

1. **Ambiguous section:** §5 documents SideNav's links "plus a separate 'New Analysis' CTA" neutrally, as ground truth.
2. **Why it misleads:** documenting it without comment reads as endorsement. The frozen language (D3) makes "+ New Analysis" wrong — `/pipeline`'s "Log a hunch" is the compliant label.
3. **Realistic wrong implementation:** the engineer copies "New Analysis" into `CineNav` for cinematic screens "for consistency with the existing nav," spreading the violation into the new world.
4. **Exact fix — add to §5:** "Known copy defect: `SideNav`'s '+ New Analysis' CTA predates the language freeze and violates it ('Log a hunch' is the compliant label, already used by `PipelineView`). Do not propagate this string anywhere new; fix it in `SideNav` opportunistically (one-line change) or at the Dashboard-IA resolution (§6.6), whichever comes first."

### D17 — The §2 Pipeline row is factually wrong and collides with open question 6

1. **Ambiguous section:** §2's last row lists "Pipeline" among screens that are "Explicitly out of scope. Stays on `AppShell`."
2. **Why it misleads:** twice wrong: `/pipeline` uses no `AppShell` (verified — it renders its own chrome-less shell), and per §6.6 it is a live candidate to *become* the Dashboard — the least out-of-scope screen imaginable. §0 and §2 currently contradict each other about the same route.
3. **Realistic wrong implementation:** the engineer resolves §6.6 toward `/pipeline`, then wraps it in `AppShell` "as documented," producing exactly the wrong shell (see D9).
4. **Exact fix:** remove "Pipeline" from the §2 out-of-scope row and add a dedicated row: "`/pipeline` — chrome-less by design (no `AppShell`), not linked in nav; status = frozen pending §6.6. If chosen as the Dashboard IA it enters the cinematic scope under `CineShell`; if not, it is deleted, not left orphaned."

### D18 — Typography and spacing have inventory but zero usage rules

1. **Ambiguous section:** §0 Typography (families only, serif "unresolved" with no interim rule); spacing appears nowhere except as a superseded V2 4px scale with no replacement.
2. **Why it misleads:** an engineer must set type and space *today*; "unresolved" without an interim rule forces improvisation.
3. **Realistic wrong implementation:** body copy in JetBrains Mono ("it's the brand font, it's everywhere"); serif expanded to buttons and labels; ad-hoc spacing that matches neither world.
4. **Exact fix — extend the Typography row and add a Spacing row:**
   > **Interim typography rule (until §6.1–2 are ruled):** follow current production behavior — serif (`Source Serif 4` via `--font-serif-pi`) for page-level headlines and pull-quotes only; Inter for all body/UI; JetBrains Mono for data values, uppercase eyebrow labels (with letter-spacing), and code — never for body prose. Numbers that align in columns use `tabular-nums`. Do not extend serif to any new element class. **Spacing:** no locked numeric scale exists (the V2 4px scale is superseded without replacement); the approved mockup for each screen is the spacing reference of record — match it, don't re-derive. Cinematic screens err toward generous breathing space; density is a per-screen owner decision, not an engineering preference.

### D19 — Responsive rules exist in practice but not in the document

1. **Ambiguous section:** none exists.
2. **Why it misleads:** verified-in-practice rules — no page-level horizontal scroll ever; horizontally scrollable *strips* allowed only as contained, intentional components (section-pill nav); blade/tile grids collapse 3→2 columns ≤640px; the WebGL tier system (D11) — all live only in prototype comments and session verification runs.
3. **Realistic wrong implementation:** a Dashboard grid that overflows the viewport on mobile, or full WebGL mounted on a low-power phone; both pass a desktop-only review.
4. **Exact fix — add a §10 "Responsive baseline":** the four rules above, plus "every phase's verification includes 390px-width screenshots and a `scrollWidth === clientWidth` check — this exact check has caught real bugs in this project twice."

### D20 — Deixis: "this session," "today," "your call," "awaiting your approval" are unreadable in six months

1. **Ambiguous section:** throughout — §0 ("generated this session," "fixed twice this session," "awaiting **your** approval"), §6 ("needs **your** call"), header ("today's instruction").
2. **Why it misleads:** a future reader doesn't know when "this session" was, or who "you" is — and might conclude *they* are the approver (compounding D5).
3. **Realistic wrong implementation:** the engineer treats "awaiting your approval" as addressed to themselves, approves, and implements.
4. **Exact fix:** replace every deictic reference with dates and roles: "this session" → "2026-07-22 (see git history)"; "your approval/call" → "the product owner's approval." Add one line to the header: "**Decision authority:** every approval, ruling, and open question in this document belongs to the product owner. No reader of this document self-approves anything."

---

## Closing statement

The document survived none of its own claims unscathed: its strongest section (§0's honest inventory) is also where the most dangerous defect lives (D1 — it inventories the two photos perfectly while omitting the rule about who may use them). The five Critical defects share one root cause: **rules that were enforced by living context rather than by the document** — owner corrections, frozen vocabulary, honesty norms, and approval gates that everyone "just knew" this month and nobody will know in six.

Recommended order of repair: D12 first (commit the uncommitted world — everything else is moot if it's deleted), then D1–D5 (the Critical text additions), then the High items, then Medium/Low. All fixes are text-only amendments to `DESIGN_SOURCE_OF_TRUTH.md` plus two one-line code fixes (D9's History link, D16's CTA label) that should ride along with already-planned work. Awaiting owner approval to apply.
