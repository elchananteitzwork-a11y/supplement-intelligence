# UI Polish Backlog

Deferred, non-blocking visual/interaction refinements. Nothing here blocks a
screen from shipping to beta. Run one dedicated pass across this whole list
after every major screen in the v2 build order has its production build.

## Compare (frozen v1 — mockup approved, 2026-07-21)

- `DECISIVE_THRESHOLD` (0.35) / `DECISIVE_CAP` (5) in the signal-separation
  engine are launch defaults, not tuned against real usage. Revisit once
  there's real comparison data — watch for the top-5 skewing toward one
  section (e.g. Market) at the expense of an intuitively-obvious signal
  like market revenue.
- Correlated signals (e.g. `momentum` and `trend`) can both surface in the
  same top-5 since the engine scores each metric independently. Consider a
  light section-diversity or correlation-aware cap if this reads as
  repetitive in real comparisons.
- Dot-plot value labels (`.dotvals`) can visually crowd when two
  candidates land very close together on a track — no collision handling
  yet.
- The "Weak set" (no-winner) state's "why none of them clear it" list is
  still hand-authored, not run through the separation engine — the engine
  answers "what separates the candidates," not "why did each one fail its
  own gates," so this may be a permanently different code path rather than
  a gap to close. Revisit whether it's worth unifying.
- Verdict-chip colors (`VERDICT_CHIP_CLASS`) were assigned by feel
  (PURSUE→build, PURSUE_WITH_CAUTION→gold, INVESTIGATE_FURTHER→invest,
  DO_NOT_PURSUE→pass) rather than pulled from the real `VERDICT_COLOR`
  map in `metrics.ts` (positive/caution-text/black/negative). Reconcile
  exactly during production build.
- Score-bar entrance animation and mobile breakpoint are untested outside
  the mockup's own viewport sizes.
