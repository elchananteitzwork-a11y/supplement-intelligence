// ═══════════════════════════════════════════════════════════════════════
// THE INTELLIGENCE LAB — design tokens (JS/TS side)
// ───────────────────────────────────────────────────────────────────────
// Mirrors app/design-tokens.css 1:1, for contexts that need raw values
// rather than CSS classes — chart libraries, canvas/SVG drawing, inline
// style calculations. Not yet imported by any component; foundation only.
// See design/INTELLIGENCE_LAB_DESIGN_SYSTEM.md for full rationale.
// ═══════════════════════════════════════════════════════════════════════

export const labColor = {
  void: ['#050507', '#0a0a0d', '#0f0f13', '#15161b', '#1b1c23', '#21222b'] as const,
  text: {
    primary: '#f2f3f5',
    secondary: '#9b9fac',
    tertiary: '#686c78',
    disabled: '#44474f',
    inverse: '#08090b',
  },
  photon: { dim: '#2e84d9', DEFAULT: '#4fa8ff', bright: '#7fc4ff' },
  spectrum: { dim: '#6c5ce0', DEFAULT: '#8b7cff', bright: '#aba0ff' },
  verdant: '#34d9a0',
  amber: '#f5b947',
  ember: '#ff6259',
} as const

// Provenance tier → color. The single most-reused mapping in the system —
// every real/estimated/synthesized/unsupported/unknown label anywhere in
// the app should resolve its color through this map, not a one-off value.
export type ProvenanceTier = 'verified' | 'estimated' | 'synthesized' | 'unsupported' | 'unknown'

export const labProvenanceColor: Record<ProvenanceTier, string> = {
  verified: labColor.photon.DEFAULT,
  estimated: labColor.amber,
  synthesized: labColor.spectrum.DEFAULT,
  unsupported: labColor.ember,
  unknown: labColor.text.tertiary,
}

// Verdict (BUILD_NOW / VALIDATE_FURTHER / SKIP / CATEGORY_CREATION_CANDIDATE)
// → color. Mirrors the existing emerald/amber/red traffic-light convention,
// refined into the Lab palette; CATEGORY_CREATION_CANDIDATE reuses Spectrum.
export const labVerdictColor: Record<string, string> = {
  BUILD_NOW: labColor.verdant,
  VALIDATE_FURTHER: labColor.amber,
  SKIP: labColor.ember,
  CATEGORY_CREATION_CANDIDATE: labColor.spectrum.DEFAULT,
}

// 8-color categorical palette for charts with more series than the core
// semantic accents cover. Order matters: the first 5 slots intentionally
// reuse the semantic accents so a legend stays meaningful even when a
// chart happens to plot exactly one verdict/provenance series.
export const labChartCategorical = [
  labColor.photon.DEFAULT,
  labColor.spectrum.DEFAULT,
  labColor.verdant,
  labColor.amber,
  labColor.ember,
  '#3fd3c6', // teal
  '#f178b6', // rose
  '#6e84b8', // slate-blue
] as const

export const labMotion = {
  easeStandard: 'cubic-bezier(0.22, 1, 0.36, 1)',
  easeEnter: 'cubic-bezier(0.16, 1, 0.3, 1)',
  duration: {
    instant: 100,
    fast: 200,
    base: 350,
    slow: 600,
    cinematic: 900,
  },
  staggerMs: 50, // default gap when revealing lists/grids of evidence cards
} as const
