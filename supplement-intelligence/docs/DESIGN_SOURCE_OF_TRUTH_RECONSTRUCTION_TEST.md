# Design Source of Truth — Reconstruction Test

**Date:** 2026-07-22 · **Premise:** the entire repository disappears tomorrow. `DESIGN_SOURCE_OF_TRUTH.md` is the only survivor. An independent engineering team, three years from now, no contact with the original author or owner, must rebuild the product from it.

**Method:** walk through the document as that team. Every point where they must invent, assume, or decide is a **reconstruction failure (RF)**. The goal is not to improve the document — it is to determine whether the document is *sufficient*, and to prove the answer is no if it is no.

**Verdict up front: NO.** Estimated achievable visual fidelity from this document alone: **30–45%** — "a product with a similar mood," never "the same product." The structural reason is stated honestly at the end, because it matters more than any individual failure.

---

## The one sentence that decides the test

The document's §0 promises: *"'Where' is always a real file path, commit, or Artifact URL."* In this scenario, **every one of those pointers dereferences to nothing.** The document is an index to a repository, and the repository is gone. Roughly 80% of its rows become tombstones. Everything below is just the itemization of that single fact.

---

## Reconstruction failures

### RF1 — The two hero photographs are gone, and they are unrecoverable · **fatal**

- **Missing:** the actual pixels of `landing-cathedral-of-palms.jpg` and `candidate-detail-cathedral-of-palms-night.jpg`. The document describes them in ~30 words each. It does not contain the generation prompts, the model used, reference thumbnails, or any durable copy.
- **Divergent implementations:** every rebuild produces a *different* palm avenue. Even the original prompts (not recorded in the doc) were non-deterministic — the original session generated three candidates and the owner *chose* one. That choice is unreproducible.
- **Identity loss:** total, by the document's own definition — it calls this image "the visual identity of the entire product" and "the foundation." The single most load-bearing asset in the product is the least recoverable thing in the document.
- **Belongs where:** a brand-asset archive (the photos + the exact generation prompts + the rejection history), referenced from the SoT. Binary assets can't live in a Markdown file — but the prompts and contact-sheet thumbnails could, and don't.

### RF2 — The WebGL rotor cannot be rebuilt · **fatal**

- **Missing:** all of it. The doc gives behavioral *rules* (constant-velocity spin, no bezel, self-emissive, diagonal beams, hover slows to ~35%) but zero geometry (blade shape, proportions, hub radius, the parametric construction in `buildRotorGeometry.ts`), zero materials (emissive values, transmission/thickness/ior of the glass shards), zero shader code for the beams, zero physics constants for Pull, and zero data-adapter mapping (which score dimension drives which blade, and how magnitude maps to visual properties).
- **Divergent implementations:** infinite. "Six gold blades around a dark core rotating at constant velocity" describes a thousand different rotors, most of which would look like a loading spinner or a casino chip — the two things the original explicitly wasn't.
- **Identity loss:** catastrophic. The doc names this component "the heart of the application… the center everything else is designed around."
- **Belongs where:** the repo is the only honest home for code this specific. What the SoT *could* carry and doesn't: the parametric constants, a reference render, and the data→visual mapping table.

### RF3 — No screen has a layout · **fatal**

- **Missing:** every actual composition. Landing's structure (nav → badge → headline → search instrument → metrics row → proof cards → CTA → footer) is nowhere. Login's card anatomy is one phrase ("single glass instrument"). Candidate Detail's structure is "14 real sections" — **the section names are not listed**. Discover is "1267 lines" of vanished code described in zero visual words. Dashboard is two vanished routes described by their disagreement.
- **Divergent implementations:** any layout at all. The team knows the product has a landing page with a search box somewhere on it.
- **Identity loss:** severe. Layout *is* half of what makes a screen recognizable.
- **Belongs where:** honestly split — the repo (for implemented screens, code is the layout spec) plus the approved mockups/screenshots, which the doc references only as private Artifact URLs (already flagged as inaccessible in the Consistency Audit, D2 — this scenario upgrades that from "inaccessible to an engineer" to "gone for everyone").

### RF4 — The words are gone: copy, vocabulary, section names, verdict labels · **fatal**

- **Missing:** the five frozen words (Hunch/Verdict/Conviction/Trace/Pull) — absent from the doc (Consistency Audit D3, unapplied). The verdict display labels ("Entry Supported," "Validation Required," "Not Supported," "Category Creation") — absent. The six score-dimension names — absent. Every headline, CTA, caption, disclosure line — absent. The honesty-disclosure copy conventions ("Illustrative examples — sign up to run a real query…") — absent.
- **Divergent implementations:** a rebuilt product that says "New Analysis," "Insights," "Confidence: High" — three phrases the original owner explicitly banned.
- **Identity loss:** severe-to-total on the product-language axis. The owner considered the vocabulary a category-defining asset on par with the visual identity.
- **Belongs where:** this one genuinely belongs *in* the SoT (it's small, textual, and decision-shaped) — its absence is a defect of the document, not of the format.

### RF5 — The glass is a vibe, not a spec · **major**

- **Missing:** the doc's glass description is Tailwind shorthand ("backdrop-blur-2xl backdrop-saturate-150 backdrop-brightness-75, corner sheen, reflection streak"). Missing: gradient stops and alphas, border alpha, the two shadow stacks, sheen geometry (position/size/blur/shape), streak angle and opacity, hover-tilt degrees and glow-ring construction, and the entire refined recipe (asymmetric sheen, edge bevel, second streak — named, never quantified).
- **Divergent implementations:** every team ships *a* glassmorphism. None ships *this* glassmorphism. Frosted-white iOS-style glass is the most likely wrong default — precisely the "heavy, overly frosted" look the owner rejected.
- **Identity loss:** high — glass is the signature surface treatment of the entire cinematic world.
- **Belongs where:** a numeric design-system spec (which does not exist anywhere today, repo included — the component *is* the spec). Worth creating regardless of this scenario.

### RF6 — Atmosphere: particles, scrim, color grade · **major**

- **Missing:** particle counts, size range (px), blur radii, opacity ranges, duration ranges, spawn distribution, and drift keyframes; `AmbientWorld`'s per-intensity color-grade filters and the scrim gradient stops that make text survive on top of a bright photograph. All described qualitatively ("soft blurred motes," "color-grade scrim"), none numerically.
- **Divergent implementations:** dust, snow, fireflies, or bokeh — all match the prose. A scrim too weak (illegible text on gold sky — a bug this project actually shipped and fixed) or too strong (dead black world).
- **Identity loss:** moderate-high. The atmosphere is what makes it "one world" instead of a background image.
- **Belongs where:** the numeric design-system spec (RF5's).

### RF7 — Typography has families but no system · **major**

- **Missing:** every size, weight, line-height, and letter-spacing. The 64px serif hero, the 10–11px uppercase mono eyebrows with wide tracking, `tabular-nums` for data — none recorded. The serif question is marked "unresolved" with no interim rule (Audit D18, unapplied), so the rebuild team doesn't even know serif *headlines* are current behavior.
- **Divergent implementations:** same three fonts, completely different product. Type scale is the fastest way two implementations of one palette diverge.
- **Identity loss:** high.
- **Belongs where:** design-system spec; the families themselves are correctly in the SoT.

### RF8 — Spacing: explicitly nothing survives · **major**

- **Missing:** the doc (post-audit direction) says the approved mockup is the spacing reference of record. All mockups are gone. There is no numeric fallback.
- **Divergent implementations / identity loss:** cramped-dashboard vs. airy-editorial readings of the same screens; the "large breathing spaces" mandate exists only as a memory.
- **Belongs where:** design-system spec.

### RF9 — Motion beyond one bezier · **major**

- **Missing:** the doc records `ease-cine` + three durations. Missing: kenburns keyframes (scale/translate/42s), drift/pulse/travel keyframes, the offset-path comet technique, stagger intervals, reveal thresholds and fire-once behavior, hover tier values, the one-magnetic-element budget, and the reduced-motion contract (all specified in the Consistency Audit's proposed D10 text — which was never applied to the SoT and doesn't survive this scenario).
- **Divergent implementations:** anything from static to carnival.
- **Identity loss:** moderate-high — "calm, settles slowly, never springy" was a locked DNA trait; nothing in the surviving doc says it.
- **Belongs where:** split — token values in the SoT/design-system spec; keyframes in the repo.

### RF10 — The entire Layer 2 world is a list of names · **major**

- **Missing:** the pi-\* cream system that covers most of the app's surface area (Watchlist, Alerts, Leaderboard, Settings, Compare, Pipeline, History, plus Dashboard/Discover today) has *no visual description at all* beyond the palette — no card anatomy, no AppShell/SideNav visual design, no StatTile, no verdict chip shapes, no table/row treatments.
- **Divergent implementations:** any warm-cream admin panel.
- **Identity loss:** moderate per screen, large in aggregate — it's most of the product by area.
- **Belongs where:** the repo (it's implemented, committed code — the one part of the product that would genuinely survive as spec if the repo survives; the SoT correctly delegates to it and cannot reasonably inline it).

### RF11 — Data semantics that drive visuals · **moderate**

- **Missing:** score is 0–100 (present) — but the confidence model (0–1 weakest-link, never averaged, weakest dimension named), evidence tiers (verified vs. AI-judgment and their visual grammar), witness-dot semantics, kill-criteria display rules — all absent or fragmentary. The visual system encodes epistemology; the epistemology is gone.
- **Divergent implementations:** confidence as an averaged percentage with a green-to-red gauge — violating roughly four locked principles at once.
- **Identity loss:** high on the trust axis, which this product treats as its core differentiator.
- **Belongs where:** the V2 blueprint docs own the semantics (also gone in this scenario — a reminder that the SoT was never the only critical document); the SoT should carry the display-grammar summary.

### RF12 — Interactions and micro-behaviors · **moderate**

- **Missing:** Pull physics (resistance curve, release threshold), Trace (press-and-hold to open a number's raw signals — the rule "nothing may refuse a Trace"), blade-click → section navigation mapping, the search instrument being a styled link rather than a live input, hover-slows-rotor behavior, 3D tilt on cards.
- **Divergent implementations:** a fully static product that looks similar at rest and feels entirely different in the hand.
- **Identity loss:** moderate-high — the owner considered Pull "the signature gesture."
- **Belongs where:** split — the gesture *contracts* belong in the SoT/UX doc; implementations in the repo.

### What actually survives (for honesty's sake)

The palette hexes (minus the third gold — Audit D13), the font family names, one easing curve, the nav labels and routes, the screen inventory and status, the layer history, the One World principle as prose, the open-questions list, and the two photographs' *descriptions*. A competent team could rebuild: a warm dark product, palm-avenue hero image of their own making, gold glass panels of their own recipe, six-bladed gold rotor of their own geometry, right nav labels, right screen list. **A stranger would say "same genre." The owner would say "that's not my product."**

---

## The verdict

> **"Could an independent team rebuild this product with >95% visual fidelity using this document alone?"**
>
> **No. Not close. Estimated 30–45% fidelity** — and the shortfall is concentrated in exactly the things the document itself declares most sacred: the photograph (RF1), the rotor (RF2), the layouts (RF3), and the language (RF4). Three of those four are *fatal* independently. The document reliably preserves *decisions* (what was chosen, what was rejected, who decides) and reliably fails to preserve *artifacts* (what the chosen things actually are).

## The honest structural conclusion

This is not primarily a defect of the document — it is the document's design. The SoT was built as an **index + decision record** over a living repository, and it is good at that job. The reconstruction test fails because the premise removes the thing the index points at. Stuffing 20,000 lines of component code, keyframes, and binary photographs into a Markdown file would make it worse at its real job without ever reaching 95%.

The correct survivability architecture is four artifacts, not one bigger SoT:

1. **The committed repository** — the true spec for everything implemented. Which makes the Consistency Audit's D12 finding the real emergency hiding under this thought experiment: **today, the entire Layer 3 world is uncommitted working-tree state.** "The repo disappears" is not a three-years-from-now hypothetical; it is one `git clean -fd` away. Committing is the single action that moves reconstruction fidelity from ~35% to ~100%.
2. **A brand-asset archive** — the two photographs, their generation prompts, and the chosen-vs-rejected record (RF1).
3. **A numeric design-system spec** — glass, particles, scrim, type scale, spacing, motion values (RF5–RF9). This genuinely doesn't exist anywhere today and is worth writing even with the repo alive.
4. **The SoT itself** — plus the small, decision-shaped content it wrongly delegates today: the five words, the verdict labels, the dimension names, the display grammar (RF4, RF11 — these are SoT defects, and their fix text already exists in the Consistency Audit).

The document should say all of this about itself. Proposed addition to its header:

> **Scope warning:** this document is an index and decision record, not a reconstruction spec. It assumes the repository, the asset archive, and the V2 blueprint docs exist. If you are reading this without them, you cannot rebuild the product — see `DESIGN_SOURCE_OF_TRUTH_RECONSTRUCTION_TEST.md` for exactly what is lost and where it lives.
