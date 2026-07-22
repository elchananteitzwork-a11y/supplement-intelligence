# UX Experience Plan — "The Bottom Line, Then the Proof"

**Date:** 2026-07-22 · **Trigger:** owner directive: *"their experience to be easy and simple… not too much information. I would like them to have an option if they would like to get all the sources — a button that will lead them to the sources. But in the front page, I want them to get the bottom line of each thing."*

This is the experience layer that sits on top of `DESIGN_LANGUAGE_PLAN.md` (how it looks) and `DESIGN_SOURCE_OF_TRUTH.md` (what's locked). It reconciles with the already-adopted `PRODUCT_INTELLIGENCE_V2_UX_BLUEPRINT.md` — the answer-first model there is exactly this directive; where the two differ, this document (newer, owner-direct) governs and notes the difference.

---

## 1. The one rule everything follows

**Every surface shows the bottom line. Every bottom line has a Sources button. Nothing else is on by default.**

Three information layers, everywhere, always in this order:

| Layer | What the user sees | When |
|---|---|---|
| **L1 — Bottom line** | One plain-English sentence + the verdict word. No jargon, no percentages, no charts. *"Worth validating — real demand, but the customer evidence is thin."* | Always visible. This IS the screen. |
| **L2 — The why** | 3–5 short supporting facts, each itself a bottom line ("Demand is real and growing", "Margins support premium entry", "Only 42 competitor reviews found"). Small, scannable, still plain English. | One glance below L1 — visible but quiet. |
| **L3 — The sources** | Everything: numbers, charts, provider names, per-dimension scores, confidence math, methodology, raw evidence. | **Only behind the Sources button.** Never on the front of any screen. |

**The Sources button** is a single, consistent affordance — same label, same placement pattern on every card and claim: a quiet `Sources →` control (with the count when honest: `Sources · 7 →`). It opens the full evidence view for exactly that claim. This is the frozen-language **Trace** concept made into a visible button: nothing may refuse it — every bottom line on every screen can always be opened to its sources. (The press-and-hold Trace *gesture* stays a future enhancement; the button is the v1.)

**What leaves the front of every screen** (moves inside Sources): percentages and decimals, provider names, dimension breakdowns, methodology captions, per-metric bars. The V2 UX blueprint already ruled "witness dots, never percentages at top level" — this plan adopts it fully: top-level confidence is a plain word + dots ("Confidence: moderate ●●○"), the % lives in Sources. *(This corrects the current screens and the recent Home mockup, which show top-level percentages — they'll be revised to match.)*

## 2. The user's journey, screen by screen — each screen's single bottom line

Every screen must answer its one question in the first second. If a screen can't state its question, it shouldn't exist.

| Step | Screen | The one question it answers (L1) | Sources button opens… |
|---|---|---|---|
| 1 | **Landing** | "What is this?" → *Should you build it? One question, a verdict you can defend.* (approved, unchanged) | the illustrative cards already link to sign-up |
| 2 | **Login** | "How do I get in?" (approved, unchanged) | — |
| 3 | **Home** | *"Where do I stand, and what needs my attention right now?"* — anchor sentence + attention cards + pipeline rows | per row: the candidate's verdict page; pulse figures move into a `Sources →` on the pulse line |
| 4 | **Log a hunch** (`/analyze` intake) | *"What do you want to check?"* — one input, one button, nothing else on screen | — |
| 5 | **While analyzing** | *"What's happening?"* — plain progress ("Checking real demand… 4 of 7 sources answered"), never a wall of logs | live source list as it fills |
| 6 | **The Verdict** (Candidate Detail, recreated) | *"Should I build this?"* — verdict word + one-sentence why + Confidence in words + ≤4 L2 facts + kill-line ("What would kill this: …"). **That's the whole first screen.** | `Sources · 7 →` opens the full report: all 14 real sections, per-dimension scores, provider provenance, methodology — everything that exists today, none of it deleted, all of it moved one click deep |
| 7 | **Shortlist / watch** | one button on the verdict: *"Watch this"* → Home's Shortlisted stage + attention events | — |
| 8 | **Compare** | *"Which one wins?"* — the recommendation sentence first, then the top separating facts | full separation table + per-metric detail |
| 9 | **Track Record** | *"Can I trust this engine?"* — hit-rate sentence first | full ledger |
| 10 | **History / Watchlist / Alerts / Settings** | one utility question each, same L1/L2/L3 shape | per-item detail |

**The deepest change is step 6.** Today's report shows ~14 dense sections at once. Recreated: the front is a single calm verdict card (the WebGL rotor as its centerpiece, per the design plan) — and one `Sources` button carrying the entire depth. A user who never clicks it still walks away knowing exactly what to do; a user who clicks it loses nothing that exists today.

## 3. Information-diet rules (bind every mockup)

1. **One question per screen; the answer above the fold.**
2. **One primary CTA per screen** (already a kit rule).
3. **≤5 items in any list block before a "View all";** ≤4 figures in any stat row.
4. **Plain English before any number** — a number may only appear on the front of a screen if it changes the user's decision (score and evidence-age qualify; percentages, sub-scores, provider counts don't).
5. **Confidence in words + dots at top level; math in Sources** (V2 rule, now enforced).
6. **Collapsed by default** — depth never removed, always one click away. Honesty rules unchanged: what's missing stays visibly missing at L1 ("Only 42 reviews found — thin evidence" is a *bottom line*, not a footnote).
7. **Frozen language everywhere** — Hunch / Verdict / Conviction / Trace / Pull, plain English otherwise.

## 4. What this changes in flight

- **Home mockup (awaiting approval):** revise the pulse line — words+dots at top level, one `Sources →`; everything else stands.
- **Candidate Detail:** its cream mockup is now "verdict card + Sources drawer," not "14 re-skinned sections" — the sections all live inside Sources.
- **Discover/Compare/rest:** mockups follow the table above.
- **Rollout order and all gates unchanged** (`DESIGN_LANGUAGE_PLAN.md` §5): mockup → owner approval → R&D → implement, per screen.
