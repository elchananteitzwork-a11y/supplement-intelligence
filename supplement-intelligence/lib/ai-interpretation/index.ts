// ── AI Interpretation Layer — public API ──────────────────────────────────
// The only surface that downstream consumers should import from.

export { buildSynthesisInput } from './builder'
export { validateSynthesisInput } from './validate'
export { classifyPrimaryRisk, computeCompetitorFormulaSimilarity } from './risk-classifier'
export type { RiskContext } from './risk-classifier'
export * from './types'
