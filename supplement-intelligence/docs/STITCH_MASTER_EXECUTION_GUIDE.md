# STITCH MASTER EXECUTION GUIDE

**Status:** ADOPTED — official execution manual for the entire UI build in Google Stitch.
**Adopted:** 2026-07-10
**Authority chain:** `PRODUCT_INTELLIGENCE_V2_BLUEPRINT.md` → `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` → `PRODUCT_INTELLIGENCE_V2_PRODUCT_SPEC.md` + `PRODUCT_INTELLIGENCE_V2_DESIGN_SYSTEM.md` → `PRODUCT_INTELLIGENCE_V2_STITCH_PROMPT_PACK.md` → **this guide**. This guide adds no product features, no UI ideas, and no design decisions. It defines *process only*: how to execute the Prompt Pack so the final product is consistent from Prompt 1 through Prompt 12.

**Definitions used throughout:**
- **§A / §B** — the Style Header and Canonical Sample Data blocks in the Prompt Pack. Pasted verbatim into every prompt, always.
- **Gate** — the mandatory QA checkpoint after each prompt. **No prompt may run while the previous gate is open.**
- **Scoped edit** — a Stitch follow-up instruction of the form: *"Change [one named thing] on [one named screen] only. Do not touch any other element, screen, color, font, or spacing."*
- **Reference screen** — the accepted output of Prompt 4 (Opportunity Overview). It contains every primitive (Verdict Card, Window Arc, Concordance Strip, Gap Chart, witness dots, buttons, drawer trigger targets) and is the visual yardstick for all later comparisons.

---

# SECTION 1 — EXECUTION ORDER

## 1.1 Per-prompt build table

| # | Objective | Inputs | Outputs | Depends on | Review time | Exit criteria |
|---|---|---|---|---|---|---|
| 1 | Establish the design language via lowest-complexity screens | §A, §B, Prompt 1 text | Landing, Sign in, Check-email, Onboarding (4 screens) | — | 45 min (longest — this review sets the baseline) | Gate 1 PASS; screens exported as baseline reference set |
| 2 | Signed-in frame all screens live inside | §A, §B, Prompt 2 text, accepted P1 | Nav rail ×2, Home, Home empty (4 screens) | 1 | 30 min | Gate 2 PASS; nav rail frozen (§3) |
| 3 | The two-tier loading narrative | §A, §B, Prompt 3 text | Search focus, Loading ×2, Resolve (4 screens) | 1–2 | 30 min | Gate 3 PASS; skeleton + evidence-line patterns frozen |
| 4 | THE decision screen — defines all primitives at full fidelity | §A, §B, Prompt 4 text | Overview + stale variant (2 screens) | 1–3 | **60 min (most important gate in the build)** | Gate 4 PASS; screen designated Reference Screen; all primitives frozen |
| 5 | Altitude-3 audit surfaces | §A, §B, Prompt 5 text, Reference Screen | Drawer overlay, Evidence Explorer, Providers (3 screens) | 1–4 | 30 min | Gate 5 PASS; drawer anatomy frozen |
| 6 | The linear defensible report | §A, §B, Prompt 6 text, Reference Screen | Report + print variant (2 screens) | 1–5 | 40 min | Gate 6 PASS; section order verified 1–9 |
| 7 | Comparison on shared axes | §A, §B, Prompt 7 text, Reference Screen | Tray, Compare (2 screens) | 1–4 | 30 min | Gate 7 PASS; shared-axis discipline verified |
| 8 | The monitoring loop | §A, §B, Prompt 8 text, Reference Screen | Watchlist ×2, Alerts, Diff (4 screens) | 1–4 | 30 min | Gate 8 PASS; Change Note grammar verified |
| 9 | Time + memory surfaces | §A, §B, Prompt 9 text, P8 row style | Pipeline, Track record ×2, Ledger ×2 (5 screens) | 1–4, 8 | 40 min | Gate 9 PASS; snapshot mode visually distinct, structurally identical |
| 10 | Settings + billing + upgrade moment | §A, §B, Prompt 10 text | Settings, Billing, Upgrade sheet (3 screens) | 1–2 | 20 min | Gate 10 PASS |
| 11 | Mobile companion | §A, §B, Prompt 11 text, all desktop screens | 5 mobile screens | 1–8 | 40 min | Gate 11 PASS; hierarchy parity verified against desktop |
| 12 | Dark mode + states + component reference | §A, §B, Prompt 12 text, entire project | Dark ×2, States ×3, Component frame (6 screens) | all | 45 min + Final Product Review (§7) | Gate 12 PASS **and** §7 audit PASS |

**Total: 12 prompts, ~34 screens, ~7.5 hours of review time.** Review time is not optional overhead; it is where consistency is actually manufactured.

## 1.2 Dependency graph

```
P1 (Foundation)
 └─▶ P2 (Shell) ────────────────────────────┬─▶ P10 (Settings/Billing)   [any time after P2]
      └─▶ P3 (Loading)                      │
           └─▶ P4 (Overview = REFERENCE) ───┤
                ├─▶ P5 (Evidence)           │   P5, P6, P7, P8 may run in any order after P4
                ├─▶ P6 (Report — needs P5 gate for drawer anatomy)
                ├─▶ P7 (Compare)            │
                └─▶ P8 (Watchlist/Alerts) ──┴─▶ P9 (Portfolio/History) [needs P8 row style]

P11 (Mobile)  — requires P1–P8 accepted
P12 (Polish)  — requires ALL accepted; always last
```

**Serialization rule:** even where parallel order is allowed (P5–P8), run them **one at a time** with their gates. Stitch consistency degrades when many screens are generated between reviews.

---

# SECTION 2 — QUALITY GATES

## 2.1 The Universal Gate (runs after EVERY prompt — all ten categories, every time)

A gate is a structured comparison of the new screens against (a) §A/§B, (b) the Reference Screen (from Gate 4 onward; against Prompt 1 output before that), and (c) the prompt's own acceptance criteria in the Prompt Pack.

| Category | Check |
|---|---|
| **Visual consistency** | Backgrounds #FCFCFD, cards #FFFFFF with 1px #C9CCD1 borders, radius 10px. Verdict colors appear ONLY on verdict badges/words. No gradients, illustrations, emoji, stock imagery anywhere on the new screens. |
| **Interaction consistency** | Exactly one dark primary button per screen. Secondary/ghost styles match Prompt 1's. Every screen's bottom-most interactive element is a decision action. Drawers/sheets match the frozen anatomy (post-Gate 5). |
| **Navigation consistency** | Nav rail identical (order: Home, Watchlist, Pipeline, Alerts, Track Record ÷ Data Sources, Settings). No new nav items, no top navbar, no breadcrumbs outside `market ▸ Report/Evidence`. |
| **Typography** | Inter only; tabular numerals on every number; serif only inside customer quotes; sizes match the Design System scale (spot-check: verdict word, H1, body, captions). Max two weights per region. |
| **Spacing** | 24px card padding, 48px section rhythm, 4px base grid alignment. Compare side-by-side with the Reference Screen at the same zoom. |
| **Component behavior** | Every reused primitive (Verdict Card, arc, dots, gap chart, badges, tags, meters) is pixel-comparable to its frozen version. Witness dots: filled/hollow/contradicting vocabulary + count sentence, never percentages. |
| **Accessibility** | Verdict meaning duplicated in text (the word is always present). Contrast spot-check on new text/badge combinations. Focus targets plausible at ≥44px. "View as table" present under every chart. |
| **Responsive behavior** | (Desktop prompts) content column ≤1200px, reading column 720px where specified. (Prompt 11) hierarchy order identical to desktop; nothing decision-relevant hidden. |
| **Acceptance criteria** | Every acceptance criterion listed for this prompt in the Prompt Pack, checked individually and literally. |
| **Sample-data fidelity** | Every market, number, thesis, and stage matches §B verbatim. A drifted number is a FAIL (it signals Stitch is hallucinating content and will hallucinate structure next). |

## 2.2 Go / No-Go decision

- **GO:** every category passes → export/snapshot the accepted screens (§4.1), mark newly created components as LOCKED (§3), proceed to the next prompt.
- **NO-GO:** any category fails → fix via scoped edits (§5), re-run the gate on the affected screens only. **Never proceed with an open gate** — later prompts inherit and amplify earlier defects.
- Maximum 3 scoped-edit attempts per defect; after 3 failures, apply the escalation ladder (§5.3).

## 2.3 Gate-specific emphases (in addition to the Universal Gate)

- **Gate 1:** the baseline gate — be strictest here; every later gate compares against what you accept now. Verify the AVOID card is as designed as the BUILD_NOW card.
- **Gate 2:** arc has 6 labeled regions with shaded Window Open; Home contains no widgets/KPIs.
- **Gate 3:** zero spinners/progress bars; PRELIMINARY chip amber; evidence lines are specific sentences.
- **Gate 4:** hierarchy order 1–7 exact; gap-chart shading visibly narrows; hollow Social dot + honest-null sentence present. **This gate creates the Reference Screen — do not accept it at 95%.**
- **Gate 5:** drawer order = raw values → computation sentence → sample/provider/freshness; Nulls filter visible.
- **Gate 6:** section order 1–9 exact; serif in quotes only; seasonality de-emphasized; no tabs/TOC.
- **Gate 7:** ONE shared arc; channel rows aligned across columns; best-in-row = weight, not color.
- **Gate 8:** exactly two alert types visible; diff view dims unchanged content to 40%.
- **Gate 9:** pipeline groups ordered Window Open first; snapshot has persistent banner + zero primary buttons; pre-data track-record variant is honest and undecorated.
- **Gate 10:** meters are plain bars; upgrade sheet names the blocked action; destructive action is quiet text.
- **Gate 11:** side-by-side desktop/mobile comparison per screen — same section order, compressed not simplified; tabs exactly Home/Watchlist/Alerts/Account.
- **Gate 12:** dark layouts pixel-identical to light counterparts (tokens only changed); skeletons mirror final layouts; then proceed to §7.

---

# SECTION 3 — LOCKED COMPONENTS

A component is **LOCKED** the moment the gate that created it passes. Locked = it may never be visually altered by a later prompt; later prompts may only *instantiate* it with different §B data.

| Component | Created in | Locked after | Notes |
|---|---|---|---|
| Color tokens (all) | P1 | Gate 1 | Includes the 6 verdict colors; dark variants lock at Gate 12 |
| Typography scale + serif-quote rule | P1 | Gate 1 | |
| Spacing scale / card padding / section rhythm | P1 | Gate 1 | |
| Buttons (primary/secondary/ghost/destructive-quiet) | P1 | Gate 1 | One-primary-per-screen is a rule, not a component, and is locked from P1 |
| Verdict Card (full anatomy) + verdict badges | P1 | Gate 1 | Compact/mini sizes lock at Gates 2/8 as they first appear |
| Witness dots + count-sentence grammar | P1 | Gate 1 | |
| Inputs / search field | P1 (hero), P2 (in-app) | Gate 2 | |
| Nav rail + tab order | P2 | Gate 2 | |
| Window Arc (full + dots-on-arc) | P2 | Gate 2 | Compact/sparkline sizes lock at Gates 3/8 |
| Change Note grammar (sentence + number + threshold + link) | P2 | Gate 2 | |
| Empty-state pattern | P2 | Gate 2 | |
| Skeletons + evidence-line loading pattern + PRELIMINARY chip | P3 | Gate 3 | |
| Concordance Strip | P4 | Gate 4 | |
| Gap Chart (palette, shading, caption rule, "View as table") | P4 | Gate 4 | |
| Headline-number treatment | P4 | Gate 4 | |
| Kill-criteria row format | P4 | Gate 4 | |
| Evidence Drawer anatomy | P5 | Gate 5 | Bottom-sheet form locks at Gate 11 |
| Channel tags / state chips | P5 | Gate 5 | |
| Table style (Bloomberg discipline) | P5 | Gate 5 | |
| Report section order + pull-quote thesis + quote style | P6 | Gate 6 | |
| Compare layout (shared axes, tray) | P7 | Gate 7 | |
| Compact watchlist row | P8 | Gate 8 | |
| Alert/diff view treatment (40% dim + highlight) | P8 | Gate 8 | |
| Snapshot mode (sepia + banner) | P9 | Gate 9 | |
| Usage meters / upgrade sheet | P10 | Gate 10 | |
| Mobile tab bar / bottom sheets / docked action bar | P11 | Gate 11 | |
| Dark tokens / state screens / component-states frame | P12 | Gate 12 | Final lock of the entire system |
| **Component APIs** (which data each primitive displays, per Product Spec) | — | Always locked | Defined by the Product Spec before Stitch ever runs; Stitch never had authority over them |

**Interaction principles, chart bans, honest-null grammar, and §B sample data are locked from before Prompt 1** — they come from the adopted documents, not from any Stitch output.

---

# SECTION 4 — CHANGE MANAGEMENT

## 4.1 Snapshot discipline (the precondition for all recovery)

After every PASSED gate, export/duplicate the accepted screens inside Stitch (or export images + code) into a dated "ACCEPTED — Gate N" set. This is the rollback target. Never overwrite an accepted set.

## 4.2 The change decision tree

When any change to an already-built screen is proposed:

```
Is it a NEW feature or NEW UI idea?
 └─ YES → REJECTED here. Requires amendment of the Product Spec / UX Blueprint first
          (authority chain), then a Prompt Pack update, then re-entry via this guide.
 └─ NO ↓
Is it isolated to ONE screen and does NOT touch a LOCKED component's anatomy?
 └─ YES → SCOPED EDIT on that screen. Re-run only that screen's gate rows. Done.
 └─ NO ↓
Does it change a LOCKED component (anatomy, tokens, grammar)?
 └─ YES → This is a DESIGN SYSTEM change: amend the Design System doc first, then update
          §A if tokens changed, then RE-RUN the prompt that created the component, then
          apply the Cascade Protocol (4.3) to every prompt that instantiates it.
 └─ NO ↓
Does it change multiple screens from one prompt (layout/structure level)?
 └─ YES → RE-RUN that entire prompt (its number, with the change folded into the prompt
          text), then re-gate it, then run the Cascade Check (4.4) on all later prompts.
```

## 4.3 Cascade Protocol (when a locked component changed)

1. List every prompt that instantiates the component (use §3's table).
2. In dependency order, apply a scoped edit per affected screen: *"Update [component] on this screen to exactly match the accepted version on [reference screen]. Change nothing else."*
3. Re-run only the **Component behavior** and **Visual consistency** gate rows per touched screen.
4. Re-export accepted sets. One component change = one sweep; never batch multiple component changes into one sweep (attribution of new defects becomes impossible).

## 4.4 Cascade Check (after any full prompt re-run)

Later prompts were generated in the context of the old screens. After re-running prompt N, open each accepted screen from prompts >N and verify the Universal Gate's Visual + Component rows still hold (10 min). Discrepancies → scoped edits, not re-runs.

## 4.5 When to regenerate vs edit vs re-run — summary

| Situation | Action |
|---|---|
| Typo, wrong number, wrong label, one element misplaced | Scoped edit |
| One screen's layout wrong | Re-generate that one screen via its portion of the prompt, others untouched |
| Multiple screens from one prompt wrong | Re-run that prompt number |
| Locked component must change | Docs first → §A update → creating prompt re-run → Cascade Protocol |
| Drift discovered several prompts later | Fix at the source prompt, then Cascade Check forward — never patch the drift only where noticed |

---

# SECTION 5 — STITCH FAILURE RECOVERY

## 5.1 Prevention (do these always)

- Every prompt begins with §A + §B verbatim — no paraphrasing, no trimming.
- Every prompt and every scoped edit ends with: *"Keep all existing screens exactly as they are. Do not change any color, font, spacing, or component from previous screens."*
- One prompt at a time; gate before proceeding; snapshot after every gate.
- Never say "improve," "polish," "make it nicer," or "redesign" to Stitch — these words license invention. Say "match," "align to," "make identical to."

## 5.2 Failure playbook (detect → recover)

| Failure | Detection | Recovery |
|---|---|---|
| **Changed colors** | Gate: Visual row; eyedropper vs §A hex | Scoped edit quoting exact hex: "Set the verdict badge color to #157F3D exactly." If it changed globally on new screens, re-run the prompt — global drift means §A was diluted or omitted. |
| **Changed spacing** | Side-by-side with Reference Screen at same zoom | Scoped edit with numbers: "Card padding 24px; 48px between sections." Never accept "close enough" — spacing drift compounds silently. |
| **Changed typography** | Font/weight spot-check vs P1 screens | Scoped edit: "Inter only; this number must use tabular figures; body 15px." If serif leaks outside quotes → scoped edit citing the quote-only rule. |
| **Changed layouts of previous screens** | Compare against the accepted snapshot set | Do NOT edit forward. Restore from the accepted snapshot (this is why §4.1 exists); if Stitch mutated a shared frame, re-run the current prompt with a strengthened preservation footer. |
| **Forgot a component** (e.g., witness dots missing from a card) | Gate: Component row; §3 instantiation list | Scoped edit naming the reference: "Add the witness-dot row exactly as it appears on the Opportunity Overview verdict card." |
| **Inconsistent screens within one prompt** | Gate comparison across the prompt's own outputs | Pick the best screen as local reference; scoped-edit the others to match it; never average between them. |
| **Hallucinated UI** (invented widgets, extra nav, new chart types, fake features) | Gate: acceptance criteria + the banned list | Delete via scoped edit: "Remove [element] entirely; nothing replaces it." Hallucinated *content* (numbers/markets not in §B) → replace with §B data verbatim. Hallucination on 2+ screens in one output → re-run the prompt; the generation context is polluted. |
| **Broken navigation** (rail items reordered/renamed/added) | Gate: Navigation row | Scoped edit reciting the exact rail: "Home, Watchlist, Pipeline, Alerts, Track Record, divider, Data Sources, Settings — icons and order exactly as on the accepted Home screen." |

## 5.3 Escalation ladder (when scoped edits fail 3×)

1. Re-run the single screen's generation with its prompt section + a stronger constraint block.
2. Re-run the full prompt number (fold the persistent defect's correction into the prompt text as an explicit line).
3. If the defect persists across re-runs, the prompt text is the problem: amend the Prompt Pack (more explicit wording for that element), record the amendment, re-run.
4. Last resort — **never** "rebuild the app": start a fresh Stitch project, re-run only Prompts 1 → current, pasting the amended pack; accepted snapshots make this hours, not days. The document chain is the product's memory; the Stitch project is disposable.

---

# SECTION 6 — REVIEW CHECKLISTS (per prompt)

**Every checklist = the Universal Gate (§2.1, all ten rows) + the prompt-specific items below + that prompt's acceptance criteria in the Prompt Pack.** All three must PASS. Any FAIL = No-Go.

**P1 Foundation:** □ AVOID card as designed as BUILD_NOW □ landing has no features grid/testimonials/video □ no passwords in auth □ onboarding has no progress dots/tour □ verdict word is largest type on each card □ track-record countdown line present and honest.
**P2 Shell:** □ rail order exact □ arc = 6 regions + shaded Window Open □ dots colored by verdict, sized differently □ Change Notes are sentences with a mini card □ recent analyses are a plain list □ empty state teaches with 3 example chips □ zero KPI widgets.
**P3 Loading:** □ no spinner/bar/percent anywhere □ evidence lines specific and sequential □ skeleton mirrors final card □ PRELIMINARY chip amber with "3 of 6 sources in" □ resolve frame calm — color on badge only □ interpretation line present with "change".
**P4 Overview:** □ hierarchy 1–7 exact □ ghost-trail on arc + "moved from" caption □ 5 concordance rows in canonical order incl. honest-null Social □ gap shading narrows rightward + closing-band label □ 3 headline numbers tabular with context lines □ kill criteria show current-vs-threshold □ ends with exactly 2 buttons □ stale variant = quiet banner only.
**P5 Evidence:** □ drawer order: values → computation sentence → sample/provider/freshness/channel □ background dimmed 40% □ explorer rail grouped by channel with Nulls/Disagreements chips □ providers table: dots for reliability, plain-words contributions, independence paragraph verbatim □ "Adds when available" group present.
**P6 Report:** □ sections 1–9 in order, none missing □ thesis = typographic hero □ serif only in the 3 quotes □ worked-example economics sentence in bordered box □ seasonality one de-emphasized line □ kill criteria read as commitments □ progress hairline, no TOC/tabs □ print variant structure-identical, shell-free.
**P7 Compare:** □ ranked-read sentence first □ ONE shared arc □ concordance rows aligned across columns □ gap charts share both axes □ best-in-row = weight only □ tray shows capacity "3 of 4" □ ends with per-column decisions.
**P8 Watchlist/Alerts:** □ rows sorted by urgency with direction chevrons □ "Quiet since" tertiary state present □ no folders/tags □ alerts grouped by day, exactly 2 types □ each alert: sentence + number + threshold + mini card + link □ no unread management □ diff: 40% dim + ghost→new arc positions + one highlighted row + banner.
**P9 Portfolio/History:** □ dot size=quality, color=verdict, position=stage □ groups collapsible, Window Open first □ calibration stats with n= and methodology links □ outcome marks = text chips □ verdict timeline connected on time axis □ pre-data variant honest □ ledger table has version + immutability mark □ snapshot: sepia + banner + zero primary buttons.
**P10 Settings/Billing:** □ 4 sections only □ delete = quiet red text link □ heartbeat off by default □ meters plain bars □ 3 tiers, annual default □ one primary ("Change plan") □ upgrade sheet: names blocked action, states delta plainly, one-tap completion implied.
**P11 Mobile:** □ tabs exactly Home/Watchlist/Alerts/Account □ every screen's section order = desktop □ decision buttons docked above tab bar □ evidence = bottom sheet with drag handle, 2 detents implied □ swipe-reveal on watchlist row □ arc + dots legible at 390px □ nothing decision-relevant dropped.
**P12 Polish:** □ dark = token swap only, layouts pixel-identical □ elevation via surface steps, no glows □ partial failure keeps screen usable with honest-null row + updated witness sentence □ full failure: skeleton + specific sentence + Retry, no sad-face art □ skeletons mirror finals □ component frame: all button/input/toast states incl. visible focus ring □ then §7.

---

# SECTION 7 — FINAL PRODUCT REVIEW (the completion audit)

Run after Gate 12. The UI is not "complete" until every row passes. Budget: half a day.

**7.1 Surface audit** — walk all ~34 screens against their Prompt Pack acceptance criteria one final time, as a set (defects invisible per-screen become visible in sequence — e.g., two shades of border gray).
**7.2 Navigation** — trace every route in Product Spec §6.1 through the screens; rail identical everywhere; breadcrumbs only inside analyses; the modal/drawer inventory (§6.4) contains no uninvented surfaces and no extras.
**7.3 Responsive** — for each mobile screen: side-by-side hierarchy parity with desktop; docked bars; sheets; nothing hidden that affects decisions.
**7.4 Dark mode** — token-swap fidelity; contrast spot-checks on all six verdict badges on dark; no glows.
**7.5 Accessibility** — verdict words always present; count sentences accompany dots; "View as table" under every chart; focus states in the component frame; 44px targets on mobile; contrast on all badge/tint combinations.
**7.6 Loading** — the four-frame narrative reads as one continuous story; skeletons everywhere mirror finals; no spinner anywhere in the project.
**7.7 Error states** — partial failure (honest-null) and full failure (skeleton + specific sentence + Retry) both present; no generic error art.
**7.8 Empty states** — Home, Watchlist, Compare tray, Alerts, Pipeline, Ledger: each teaches its loop in ≤2 sentences + one action; zero celebration.
**7.9 Micro-interactions** — component-states frame complete (hover/focus/disabled/loading per button variant; input error; toast+undo); the Verdict Resolve is the only ceremony anywhere.
**7.10 Performance (design-level)** — no screen depends on imagery; charts are 2-series max; nothing suggests scroll-jacking or heavy animation; exported code (if used) renders the Overview meaningfully within the 2-second rule.
**7.11 Consistency sweep** — pick the Verdict Card, arc, dots, gap chart, badges: screenshot every instance across all screens into a contact sheet per primitive; any visual variance beyond size class = FAIL at the source prompt (§4.5).
**7.12 Visual hierarchy** — squint test per screen: the first readable element must be the decision element (verdict, change note, ranked read).
**7.13 Information architecture** — the three altitudes hold: nothing from Altitude 3 renders uninvited on Altitude-1 surfaces; every claim has a drawer path.
**7.14 Workflow walkthroughs (personas, end-to-end on the screens):**
- **Search workflow:** landing → query → interpretation → 4 loading frames → Overview → drawer → done. No dead ends, no step requiring undesigned UI.
- **Investor workflow:** Overview → full report → evidence drawer from a report claim → export/print variant → share implication. The report must be defensible standalone in its print form.
- **Watchlist workflow:** Overview → Watch → watchlist row → alert (both types) → diff view → back to Overview. Change Note grammar identical at every appearance.
- **Report/Export workflow:** report → print variant structural parity → PDF header (name, date, snapshot line) present.
- **Comparison workflow:** 3 adds → tray → compare → per-column decision ending.
- **History workflow:** track record → outcome row → ledger snapshot → "view this market today" → live Overview.

**Sign-off:** all rows PASS → the Stitch build is COMPLETE and the full accepted set is exported as the implementation reference. Any FAIL → fix via §4/§5, re-run only the affected audit rows.

---

# SECTION 8 — GOLDEN RULES (permanent, non-negotiable)

1. **Never redesign previous prompts.** Additions only; changes go through §4's decision tree.
2. **Never introduce new UI patterns.** If it isn't in the Product Spec's screens or the Design System's components, it does not exist.
3. **Never invent components.** New needs → amend the documents first (authority chain), then the Prompt Pack, then build.
4. **Never change typography.** Inter + tabular numerals; serif for customer quotes only; the scale is closed.
5. **Never change the spacing scale.** 4px base; 24px card padding; 48px section rhythm.
6. **Never change the color system.** Six verdict colors on badges/words only; near-monochrome everywhere else; data colors in charts only.
7. **Never change interaction principles.** One primary button; screens end in decisions; evidence before explanation; witness dots, never percentages at Altitude 1.
8. **Never violate the Product Specification** (behavior, routes, hierarchy orders, state grammar).
9. **Never violate the UX Blueprint** (three altitudes, six primitives, anti-patterns list).
10. **Never violate the Design System** (tokens, component contracts, banned chart types, motion rules).
11. **Never paraphrase §A or §B.** Verbatim, every prompt, no exceptions.
12. **Never proceed through an open gate.** A 95% pass is a No-Go.
13. **Never patch drift where it was noticed — fix it where it was created**, then cascade forward.
14. **Never use invitation words with Stitch** ("improve", "polish", "creative", "redesign"). Use "match", "identical", "exactly".
15. **Never treat Stitch output as the source of truth.** The documents are the truth; the Stitch project is a disposable rendering of them.

---

# SECTION 9 — EXECUTION PLAYBOOK (single page)

**You are building ~34 screens in Google Stitch across 12 prompts. The documents are the truth. Stitch is the renderer. Gates are where consistency is made.**

**Setup (30 min)**
1. Read, in order: UX Blueprint → Product Spec → Design System → Prompt Pack. (The Engine Blueprint is background; you render its concepts, you don't reinterpret them.)
2. Open one new Stitch project. It will be the only project unless §5.3 step 4 forces a restart.
3. Copy §A (Style Header) and §B (Sample Data) into a scratch file. You will paste them, verbatim, into all 12 prompts.

**The loop (repeat 12 times)**
4. Paste §A + §B + the next prompt's exact text from the Prompt Pack. Run.
5. Gate it: Universal Gate (§2.1) + prompt-specific checklist (§6) + the Prompt Pack's acceptance criteria. Compare every reused primitive against the Reference Screen (Prompt 4's Overview; before Gate 4, against Prompt 1's output).
6. Defects → scoped edits only: *"Change [X] on [screen] only; do not touch anything else."* Max 3 attempts, then the escalation ladder (§5.3). Never say "improve."
7. PASS → snapshot/export the accepted screens as "ACCEPTED — Gate N", mark new components LOCKED (§3), move on. FAIL → you do not move on. There is no partial credit.

**Order (§1):** 1 → 2 → 3 → 4 (strictest gate — it mints the Reference Screen) → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12. (5–8 may be reordered; 10 anytime after 2; never parallelize generations.)

**When something must change (§4):** new feature/idea → rejected here, amend the docs first. One-screen fix → scoped edit. Locked component → Design System doc first, re-run its creating prompt, cascade sweep. Drift found late → fix at the source prompt, cascade forward.

**When Stitch misbehaves (§5):** quote exact hex/px/font in a scoped edit; restore mutated screens from snapshots — never edit forward over corruption; hallucinated UI gets deleted, not incorporated; persistent defects mean the prompt text needs amending, not more retries.

**Finish (§7):** after Gate 12, run the Final Product Review — contact-sheet every primitive across all screens, walk the six workflows end-to-end, squint-test every screen for decision-first hierarchy. All rows PASS → export the accepted set as the implementation reference. The Product Spec — not the Stitch output — remains the behavioral authority for the build that follows.

**The one-sentence version:** *Paste the blocks, run one prompt, gate it hard, snapshot it, lock it, and never let Stitch be creative.*
