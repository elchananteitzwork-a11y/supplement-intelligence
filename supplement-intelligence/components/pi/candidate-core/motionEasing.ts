// Shared easing helper, ported verbatim from the approved design
// prototype (hero3d-prototype/src/three/motionEasing.ts) — pure math, no
// data assumptions. This codebase's own `--ease-out` CSS token
// (cubic-bezier(0.16,1,0.3,1)) is visually an ease-out-expo curve;
// `easeOutExpo` is the WebGL-side counterpart used by the Core's one-shot
// entrance ramp so the DOM and WebGL layers share one timing family.
export function easeOutExpo(x: number): number {
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)
}
