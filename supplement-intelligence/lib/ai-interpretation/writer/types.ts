// ── AI Writing Layer — output types ──────────────────────────────────────
// Spec §3.3 (three calls), §12 (validation pipeline), §2.1 Step 6–7

// ── Per-call validation trace ─────────────────────────────────────────────

export interface ValidationStepResult {
  passed:    boolean
  error?:    string    // what failed (one line)
  pattern?:  string    // for Step 3: which pattern matched
}

export interface CallValidationTrace {
  attempt_count:   number               // 1 = passed first try; 2 = needed retry/fallback
  used_fallback:   boolean
  step2_format:    ValidationStepResult
  step3_patterns:  ValidationStepResult
  step4_grounding: ValidationStepResult
}

// ── Full validation trace ──────────────────────────────────────────────────
// step1 runs once before all calls; step6 runs once after all calls complete.

export interface ValidationTrace {
  step1_schema: ValidationStepResult
  call_a:       CallValidationTrace
  call_b:       CallValidationTrace
  call_c:       CallValidationTrace
  step6_final:  ValidationStepResult
}

// ── Final writer output ───────────────────────────────────────────────────

export interface WriterOutput {
  causal_paragraph:             string
  causal_paragraph_is_fallback: boolean

  risk_sentence:             string
  risk_sentence_is_fallback: boolean

  product_thesis_headline:    string
  product_thesis_full:        string
  product_thesis_is_fallback: boolean

  validation_trace: ValidationTrace
}

// ── Scoped input types ────────────────────────────────────────────────────
// Each call receives only the SynthesisInput subset relevant to its task.
// Spec §3.3.

import type {
  SynthesisInput,
  PrimaryRisk,
  ConsumerCluster,
  CompetitorContext,
  ManufacturingContext,
  DemandCalibration,
} from '../types'

// Call A — Causal Paragraph — full SynthesisInput
export type CallAInput = SynthesisInput

// Call B — Risk Sentence — minimal risk context
export interface CallBInput {
  query:                       string
  primary_risk:                PrimaryRisk
  meaningful_competitor_count: number | null
  thin_corpus:                 boolean
}

// Call C — Product Thesis — product differentiation context
export interface CallCInput {
  query:                 string
  consumer_clusters:     ConsumerCluster[]
  competitor_context:    CompetitorContext | null
  manufacturing_context: ManufacturingContext | null
  demand_calibration:    DemandCalibration | null
}

export interface CallCOutput {
  headline:    string
  full_thesis: string
}
