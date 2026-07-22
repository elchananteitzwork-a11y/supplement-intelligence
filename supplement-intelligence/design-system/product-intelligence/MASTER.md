# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Product Intelligence
**Hand-authored:** 2026-07-22 — replaces the tool-generated 2026-07-20 version, whose palette (generic stone/amber `#78716C`/`#D97706`), typography (Inter-only), and style ("Exaggerated Minimalism") never matched the real product. This file now mirrors the *actual locked tokens* in `tailwind.config.ts` and the owner-approved language in `docs/DESIGN_LANGUAGE_PLAN.md`. Those files govern; this is the quick reference.

---

## Global Rules

### Color Palette (the real `pi.*` tokens — never substitute)

| Role | Hex | Token |
|------|-----|-------|
| Page background | `#FBF7EE` | `pi-cream` |
| Card surface | `#FFFFFF` | `pi-card` |
| Soft fill / icon well | `#F6F0E0` | `pi-sand` |
| Ink (text) | `#16171A` | `pi-ink` |
| Secondary text | `#6B6F76` | `pi-sub` |
| Faint text (check 4.5:1 per use) | `#8C877C` | `pi-faint` |
| Gold — small text on cream only | `#8D6A16` | `pi-gold` |
| Gold — THE accent (matches Landing) | `#D4A94A` | `pi-gold-deep` |
| Gold — emphasis | `#C9971F` | `pi-gold-bright` |
| Verdict: build | `#2E6B48` | `pi-build` |
| Verdict: invest | `#35507A` | `pi-invest` |
| Verdict: risk | `#A13F2E` | `pi-risk` |
| Verdict: pass | `#6E6A5C` | `pi-pass` |
| Hairline border | `rgba(22,23,26,0.09)` | `pi-hairline` |

**Primary CTA** is the gold gradient pill — `from-[#F6E7B8] via-pi-gold-deep to-pi-gold-bright`, dark-ink (`#16130a`) text — identical on Landing and in-app. One primary CTA per screen.

**Tailwind trap:** opacity modifiers must be **multiples of 5** (`/70`, not `/72`) — non-multiples silently emit no CSS in this config. This exact bug shipped once.

### Typography

- **Headlines / pull-quotes only:** Source Serif 4 (`font-serif` via `--font-serif-pi`)
- **Body / UI:** Inter (`font-sans`)
- **Data values, uppercase eyebrow labels (tracking-wide), code:** JetBrains Mono (`font-mono`); `tabular-nums` for aligned figures
- No new fonts without owner approval.

### Registers

- **Cinematic** (bamboo video hero, dark glass, particles): **Landing only.** Locked and approved.
- **Cream** (this file's rules): **every other screen**, Login included.

### Motion

`ease-cine` = `cubic-bezier(0.16, 1, 0.3, 1)` everywhere. Micro-interactions 150–200ms · standard hovers 200–300ms · reveals/stagger 300–450ms (~60ms/item, wave from start; no springy overshoot on data tables). `prefers-reduced-motion` is a hard gate — content must be complete with all motion off.

### Component kit (canonical recipes — reuse, never fork)

| Component | Recipe |
|---|---|
| Card | `bg-pi-card` + `border-pi-hairline` + `rounded-2xl` + soft double shadow (see `app/login/page.tsx`) |
| Input | white bg, hairline border, gold focus ring `0 0 0 3px rgba(212,169,74,0.14)` (see Login) |
| Primary button | the gold gradient pill above |
| Secondary button | `bg-pi-ink` cream-text; Ghost: hairline border |
| Instrument tile | mono value + uppercase mono label + honest "—" when no data |
| Verdict chip | solid-ink on the real verdict tokens, text + color together |
| Table | hairline-bordered rounded container, row hover highlight |
| Charts | `SparklineChart` (tiny) / Recharts (full); gold + verdict tones; real data only |
| Empty state | ghost structure + one sentence + one CTA — never demo data |

Full kit, register rules, and screen rollout: `docs/DESIGN_LANGUAGE_PLAN.md`. Frozen product language (Hunch/Verdict/Conviction/Trace/Pull — CTA is "Log a hunch"), honesty rules, and screen status: `docs/DESIGN_SOURCE_OF_TRUTH.md`. Check both before building any page.

---

## Anti-Patterns (Do NOT Use)

- ❌ **Emojis as icons** — SVG only (Lucide + the custom brand set in `components/icons.tsx`)
- ❌ **Missing cursor-pointer** on clickable elements
- ❌ **Layout-shifting hovers** — transform/opacity only
- ❌ **Low-contrast text** — 4.5:1 minimum on cream
- ❌ **Instant state changes** — always 150–300ms transitions
- ❌ **Invisible focus states**
- ❌ **Color as the only signal** — always text/icon alongside
- ❌ **Fabricated data in UI** — no placeholder trends, no fake states; honest "—"/empty states

## Pre-Delivery Checklist

- [ ] Icons: SVG, consistent set, no emoji
- [ ] `cursor-pointer` on all clickables
- [ ] Hovers 150–300ms, transform/opacity only
- [ ] Contrast 4.5:1 checked on cream
- [ ] Focus states visible
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive at 375 / 768 / 1024 / 1440 — no page-level horizontal scroll
- [ ] Copy passes the frozen-language check ("Log a hunch", five owned words, plain English otherwise)
- [ ] Every number traceable to the single real computation path
