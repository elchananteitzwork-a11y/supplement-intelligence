# Design Language Plan — "Warm Intelligence"

**Date:** 2026-07-22 · **Trigger:** owner directive after approving Landing + Login: *"recreate everything… use the basic of the design system colors we have now and make sure it also fits the color of the landing page."* · **Inputs:** ui-ux-pro-max design-system + ux + typography queries (this pass), 21st pattern search (this pass — no close catalog match; we build on our own primitives), the real locked tokens in `tailwind.config.ts`, the approved Landing/Login, `DESIGN_SOURCE_OF_TRUTH.md`.

This is the plan for the product-wide design language — the vocabulary every recreated screen will be built from. Per the standing gate, no screen is implemented from this document directly: each screen still gets its own mockup → owner approval → R&D doc → implementation.

---

## 1. The one-sentence language

**A calm, warm-cream intelligence instrument — editorial serif voice, gold as the single accent, data always legible, honesty visible — that feels like stepping out of the Landing's golden bamboo world into a bright, quiet reading room of the same building.**

External validation from this pass: ui-ux-pro-max's own recommendation for this product category is literally "warm ink + amber accent on cream" with a data-dense-but-breathing dashboard style, "avoid ornate" — which is what we already have. The palette below therefore stays **ours** (the locked `pi.*` tokens); the tool's structural/accessibility/motion guidance is adopted, its generic hex values are not.

## 2. How the cream app "fits the color of the landing page"

The Landing is dark bamboo + gold light. The app is cream + gold ink. They connect through five deliberate echoes — this is the answer to "make sure it fits":

1. **Gold is the same gold.** `pi-gold-deep #D4A94A` is the accent everywhere — the landing's sun-ray gold is the app's accent gold. One accent, both registers. (`pi-gold #8D6A16` is for small text on cream only; `pi-gold-bright #C9971F` for emphasis moments. Never a new yellow.)
2. **The CTA button is identical in both worlds.** The gold gradient pill (`#F6E7B8 → pi-gold-deep → pi-gold-bright`, dark-ink text) from Landing/Login is *the* primary button on every cream screen, unchanged. A user sees the same button before and after signing in.
3. **The serif voice carries over.** Landing's "Should you build it?" serif (Source Serif 4, already loaded as `--font-serif-pi`) is every page's headline voice. Serif = headlines and pull-quotes only; Inter = everything else; JetBrains Mono = data values, uppercase eyebrow labels, code. No new fonts (the tool suggested alternatives; rejected — ours already validate as the "elegant/premium editorial" pairing).
4. **The rotor mark is everywhere.** Same `RotorMark`, nav + brand moments, both registers.
5. **The motion is the same motion.** `ease-cine` cubic-bezier(.16,1,.3,1) everywhere; micro-interactions 150–200ms, standard hovers 200–300ms, reveals/stagger 300–450ms (~60ms/item grid wave — tool-confirmed); `prefers-reduced-motion` is a hard gate. Cream screens move *less* than the landing, never differently.

Register rule (unchanged from the SoT): **cinematic register = Landing only** (bamboo video, locked, approved). **Cream register = every other screen**, Login included (approved). The cream register is not "the plain version" — it's the same world in daylight.

## 3. The component vocabulary (the kit every screen is built from)

Canonical recipes — build once, reuse verbatim; a screen may compose these, never fork them:

| Component | Canonical recipe (source of truth today) |
|---|---|
| **Page shell** | Evolved cream `AppShell`/`SideNav`: cream 88% + blur sticky nav, gold-tint active state, labels Home/Compare/History/Track Record/Settings, CTA re-voiced to "Log a hunch" (frozen language — fixes the standing D16 defect). One shell for all cream screens. |
| **Card** | The Login card: `bg-pi-card` + `border-pi-hairline` + `rounded-2xl` + soft double shadow (`0_1px_3px` + `0_20px_44px_-16px` ink at low alpha). No glass on cream screens. |
| **Instrument tile** (stats/KPIs) | Evolution of `StatTile`: mono value, uppercase mono label, honest "—" when no real data, verdict-color value tinting where a real threshold exists (never color alone — always the number itself). |
| **Verdict chip** | Solid-ink chips on the real verdict tokens (`pi.build/invest/risk/pass`), text + color together, same shapes across all screens. |
| **Buttons** | Primary: the gold gradient pill (identical to Landing). Secondary: `bg-pi-ink` cream-text. Ghost: hairline border. One primary per screen. |
| **Inputs** | The Login recipe: white bg, hairline border, gold focus ring `0_0_0_3px rgba(212,169,74,0.14)`. |
| **Table/rows** | `LedgerTable`'s hairline-bordered rounded container; row hover highlight (tool-recommended). |
| **Charts/sparklines** | Hand-rolled `SparklineChart` for tiny traces; Recharts for full charts; gold/verdict tones only; real data only — an empty metric gets an honest empty state, never a decorative placeholder trend. |
| **Empty states** | Teach by structure (ghost outlines + one sentence + one CTA), never demo data — the `/pipeline` ghost-stage pattern generalized. |

Everything above already exists in some form in the repo — this plan's job is that each gets **one** canonical implementation reused everywhere, instead of per-screen variants.

## 4. Rules that ride along (non-negotiable, from the standing governance)

- **Frozen language:** Hunch/Verdict/Conviction/Trace/Pull + plain English; "Log a hunch," never "New Analysis."
- **Honesty rules:** real data only; always-visible values; color never the sole signal; missing data shown as missing; verdicts/scores/confidence from the single computation path.
- **Accessibility baseline (tool-confirmed this pass):** 4.5:1 contrast minimum on cream (watch `pi-faint` on cream — audit per screen), icons/text alongside color, mobile-first breakpoints, no page-level horizontal scroll.
- **WebGL stays scoped:** the rotor (`components/pi/candidate-core/`) remains Candidate Detail's hero — on a **cream stage** now, not the dark prototype stage (see §5). `RotorMark` SVG everywhere else.

## 5. Rollout order (each screen: ui-ux-pro-max screen query → mockup → owner approval → R&D doc → implement → live-browser verify)

1. **Home** — flagship cream screen. IA already decided (`CANONICAL_HOME_ARCHITECTURE.md` merge). First real showcase of the full kit.
2. **Candidate Detail** — ⚠️ **direction change to confirm:** the approved-direction dark "night world" prototype is superseded by this cream directive. Recreated as the cream register's reading experience: real WebGL rotor on a bright cream stage, all 14 MemoDisplay sections re-composed with the kit. The night prototype and its background stay archived, not implemented. **This is the one place today's directive reverses an earlier "very close" approval — flagged for your explicit confirmation at its mockup, not silently dropped.**
3. **Discover** (`/analyze`) — the engine's stage-managed flow re-composed with the kit; its missing-nav-chrome gap fixed by the one shell.
4. **Compare + History** — already cream pi-\*; a component-alignment pass onto the canonical kit (Compare's frozen v1 IA untouched).
5. **Watchlist, Alerts, Leaderboard, Settings** — same component-alignment pass. (Today's "recreate everything" supersedes their old "out of scope" status — they join the cream kit rollout as the final wave.)

## 6. What changes in the governance docs

- `design-system/product-intelligence/MASTER.md` (stale generated file from 07-20, wrong palette, Inter-only) → replaced by a hand-authored master pointing at the real tokens + this plan.
- `DESIGN_SOURCE_OF_TRUTH.md` → registers section updated to cite this plan; Candidate Detail row marked "direction superseded, cream re-plan pending mockup."
- The dark Candidate Detail prototype (`design-prototypes/candidate-detail-night.html`) and night photo stay in the repo as archived exploration, clearly not-current.
