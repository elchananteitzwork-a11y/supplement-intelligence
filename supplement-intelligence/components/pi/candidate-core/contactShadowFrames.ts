// RD-UIv2-M4 §4/§5 — the one line of real regression risk in the reduced-
// motion ContactShadows fix: if this ever silently reverts to always
// Infinity, a reduced-motion user gets an uncapped per-frame depth-pass
// cost under a visually "frozen" rotor. Pulled into its own plain module
// (no JSX) so it's importable from a plain .ts test file without needing
// this repo's first-ever React-component-rendering test setup — see
// CandidateCoreCanvas.tsx's own comment for why that tradeoff was made.
export function contactShadowFrames(reduceMotion: boolean): number {
  return reduceMotion ? 1 : Infinity
}
