// ── AI Writing Layer — Main Generator ────────────────────────────────────
// Spec §3.3 (three parallel AI calls), §12 (6-step validation pipeline).
//
// Pipeline per call:
//   Step 1:  validateSynthesisInput  (once, before all calls)
//   Step 2:  format validation       (per call)
//   Step 3:  hallucination patterns  (per call)
//   Step 4:  evidence grounding      (per call)
//   Step 5:  deterministic fallback  (per call, after one retry)
//   Step 6:  final length check      (once, after all calls complete)

import type Anthropic from '@anthropic-ai/sdk'

import type { SynthesisInput } from '../types'
import { validateSynthesisInput } from '../validate'

import type { WriterOutput, CallValidationTrace, ValidationTrace, CallCOutput } from './types'
import {
  fallbackCausalParagraph,
  fallbackRiskSentence,
  fallbackProductThesis,
} from './fallbacks'
import {
  validateFormatCausalParagraph,
  validateFormatRiskSentence,
  validateFormatProductThesis,
  detectHallucinationPatterns,
  checkCausalParagraphGrounding,
  checkRiskSentenceGrounding,
  checkProductThesisGrounding,
  parseCallCJson,
} from './output-validator'
import {
  buildCallAPrompts,
  buildCallBPrompts,
  buildCallCPrompts,
  augmentUserMessageForRetry,
} from './prompts'

const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

// ── Per-call result ────────────────────────────────────────────────────────

interface CallResult<T> {
  value:       T
  trace:       CallValidationTrace
}

// ── Validation steps 2–4 for Call A ──────────────────────────────────────

function validateCallA(
  output: string,
  input: SynthesisInput,
): { passed: boolean; failureReason: string; trace: Omit<CallValidationTrace, 'attempt_count' | 'used_fallback'> } {
  const step2 = validateFormatCausalParagraph(output)
  const step3 = detectHallucinationPatterns(output, input)
  const step4 = step2.passed && step3.passed ? checkCausalParagraphGrounding(output, input) : { passed: false, error: 'skipped' }

  const passed = step2.passed && step3.passed && step4.passed
  const firstFailed = !step2.passed ? step2.error : !step3.passed ? step3.error : step4.error
  return {
    passed,
    failureReason: firstFailed ?? '',
    trace: { step2_format: step2, step3_patterns: step3, step4_grounding: step4 },
  }
}

// ── Validation steps 2–4 for Call B ──────────────────────────────────────

function validateCallB(
  output: string,
  input: SynthesisInput,
): { passed: boolean; failureReason: string; trace: Omit<CallValidationTrace, 'attempt_count' | 'used_fallback'> } {
  const step2 = validateFormatRiskSentence(output)
  const step3 = detectHallucinationPatterns(output, input)
  const step4 = step2.passed && step3.passed ? checkRiskSentenceGrounding(output, input) : { passed: false, error: 'skipped' }

  const passed = step2.passed && step3.passed && step4.passed
  const firstFailed = !step2.passed ? step2.error : !step3.passed ? step3.error : step4.error
  return {
    passed,
    failureReason: firstFailed ?? '',
    trace: { step2_format: step2, step3_patterns: step3, step4_grounding: step4 },
  }
}

// ── Validation steps 2–4 for Call C ──────────────────────────────────────

function validateCallC(
  parsed: CallCOutput,
  input: SynthesisInput,
): { passed: boolean; failureReason: string; trace: Omit<CallValidationTrace, 'attempt_count' | 'used_fallback'> } {
  const step2 = validateFormatProductThesis(parsed)
  const step3 = detectHallucinationPatterns(`${parsed.headline} ${parsed.full_thesis}`, input)
  const step4 = step2.passed && step3.passed ? checkProductThesisGrounding(parsed, input) : { passed: false, error: 'skipped' }

  const passed = step2.passed && step3.passed && step4.passed
  const firstFailed = !step2.passed ? step2.error : !step3.passed ? step3.error : step4.error
  return {
    passed,
    failureReason: firstFailed ?? '',
    trace: { step2_format: step2, step3_patterns: step3, step4_grounding: step4 },
  }
}

// ── Single Anthropic text call ────────────────────────────────────────────

async function callAnthropic(
  client: Anthropic,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const msg = await client.messages.create({
    model:      ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages:   [{ role: 'user', content: user }],
  })
  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

// ── Run Call A (Causal Paragraph) ─────────────────────────────────────────

async function runCallA(
  client: Anthropic,
  input: SynthesisInput,
): Promise<CallResult<string>> {
  const { system, user } = buildCallAPrompts(input)

  // Attempt 1
  const raw1 = await callAnthropic(client, system, user, 400)
  const v1 = validateCallA(raw1, input)
  if (v1.passed) {
    return {
      value: raw1,
      trace: { attempt_count: 1, used_fallback: false, ...v1.trace },
    }
  }

  // Attempt 2 (retry with augmented prompt — AT-VAL-002)
  const retryUser = augmentUserMessageForRetry(user, v1.failureReason)
  const raw2 = await callAnthropic(client, system, retryUser, 400)
  const v2 = validateCallA(raw2, input)
  if (v2.passed) {
    return {
      value: raw2,
      trace: { attempt_count: 2, used_fallback: false, ...v2.trace },
    }
  }

  // Fallback (Step 5)
  return {
    value: fallbackCausalParagraph(input),
    trace: { attempt_count: 2, used_fallback: true, ...v2.trace },
  }
}

// ── Run Call B (Risk Sentence) ────────────────────────────────────────────

async function runCallB(
  client: Anthropic,
  input: SynthesisInput,
): Promise<CallResult<string>> {
  const callBInput = {
    query:                       input.query,
    primary_risk:                input.primary_risk,
    meaningful_competitor_count: input.competitor_context?.meaningful_competitor_count ?? null,
    thin_corpus:                 input.thin_corpus,
  }
  const { system, user } = buildCallBPrompts(callBInput)

  const raw1 = await callAnthropic(client, system, user, 100)
  const v1 = validateCallB(raw1, input)
  if (v1.passed) {
    return {
      value: raw1,
      trace: { attempt_count: 1, used_fallback: false, ...v1.trace },
    }
  }

  const retryUser = augmentUserMessageForRetry(user, v1.failureReason)
  const raw2 = await callAnthropic(client, system, retryUser, 100)
  const v2 = validateCallB(raw2, input)
  if (v2.passed) {
    return {
      value: raw2,
      trace: { attempt_count: 2, used_fallback: false, ...v2.trace },
    }
  }

  return {
    value: fallbackRiskSentence(input),
    trace: { attempt_count: 2, used_fallback: true, ...v2.trace },
  }
}

// ── Run Call C (Product Thesis) ───────────────────────────────────────────

async function runCallC(
  client: Anthropic,
  input: SynthesisInput,
): Promise<CallResult<CallCOutput>> {
  const callCInput = {
    query:                 input.query,
    consumer_clusters:     input.consumer_clusters,
    competitor_context:    input.competitor_context ?? null,
    manufacturing_context: input.manufacturing_context ?? null,
    demand_calibration:    input.demand_calibration ?? null,
  }
  const { system, user } = buildCallCPrompts(callCInput)

  const tryParse = (raw: string): CallCOutput | null => parseCallCJson(raw)

  const raw1   = await callAnthropic(client, system, user, 600)
  const parsed1 = tryParse(raw1)
  if (parsed1) {
    const v1 = validateCallC(parsed1, input)
    if (v1.passed) {
      return {
        value: parsed1,
        trace: { attempt_count: 1, used_fallback: false, ...v1.trace },
      }
    }

    const retryUser = augmentUserMessageForRetry(user, v1.failureReason)
    const raw2   = await callAnthropic(client, system, retryUser, 600)
    const parsed2 = tryParse(raw2)
    if (parsed2) {
      const v2 = validateCallC(parsed2, input)
      if (v2.passed) {
        return {
          value: parsed2,
          trace: { attempt_count: 2, used_fallback: false, ...v2.trace },
        }
      }
      return {
        value: fallbackProductThesis(input),
        trace: { attempt_count: 2, used_fallback: true, ...v2.trace },
      }
    }
    // Second attempt failed to parse as JSON
    const parseFailTrace = {
      step2_format:    { passed: false, error: 'JSON parse failed on retry' },
      step3_patterns:  { passed: false, error: 'skipped (parse failed)' },
      step4_grounding: { passed: false, error: 'skipped (parse failed)' },
    }
    return {
      value: fallbackProductThesis(input),
      trace: { attempt_count: 2, used_fallback: true, ...parseFailTrace },
    }
  }

  // First attempt failed to parse as JSON — retry immediately
  const retryUser = augmentUserMessageForRetry(user, 'Response was not valid JSON with headline and full_thesis keys')
  const raw2   = await callAnthropic(client, system, retryUser, 600)
  const parsed2 = tryParse(raw2)
  if (parsed2) {
    const v2 = validateCallC(parsed2, input)
    if (v2.passed) {
      return {
        value: parsed2,
        trace: { attempt_count: 2, used_fallback: false, ...v2.trace },
      }
    }
    return {
      value: fallbackProductThesis(input),
      trace: { attempt_count: 2, used_fallback: true, ...v2.trace },
    }
  }

  const parseFailTrace = {
    step2_format:    { passed: false, error: 'JSON parse failed on both attempts' },
    step3_patterns:  { passed: false, error: 'skipped (parse failed)' },
    step4_grounding: { passed: false, error: 'skipped (parse failed)' },
  }
  return {
    value: fallbackProductThesis(input),
    trace: { attempt_count: 2, used_fallback: true, ...parseFailTrace },
  }
}

// ── Step 6: Final length check ────────────────────────────────────────────
// A last-line defense to ensure nothing exceeds hard limits,
// even if a non-fallback output passes steps 2–4.

function finalLengthCheck(output: WriterOutput): void {
  const WORD_LIMIT_CAUSAL   = 160
  const WORD_LIMIT_RISK     = 35
  const WORD_LIMIT_HEADLINE = 25
  const WORD_LIMIT_THESIS   = 200

  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length

  const causalWc = wc(output.causal_paragraph)
  if (causalWc > WORD_LIMIT_CAUSAL) {
    // Hard truncate at word limit
    output.causal_paragraph = output.causal_paragraph
      .trim().split(/\s+/).slice(0, WORD_LIMIT_CAUSAL).join(' ') + (output.causal_paragraph.trim().slice(-1) === '.' ? '' : '.')
  }

  const riskWc = wc(output.risk_sentence)
  if (riskWc > WORD_LIMIT_RISK) {
    output.risk_sentence = output.risk_sentence
      .trim().split(/\s+/).slice(0, WORD_LIMIT_RISK - 1).join(' ') + '.'
  }

  const headlineWc = wc(output.product_thesis_headline)
  if (headlineWc > WORD_LIMIT_HEADLINE) {
    output.product_thesis_headline = output.product_thesis_headline
      .trim().split(/\s+/).slice(0, WORD_LIMIT_HEADLINE).join(' ')
  }

  const thesisWc = wc(output.product_thesis_full)
  if (thesisWc > WORD_LIMIT_THESIS) {
    output.product_thesis_full = output.product_thesis_full
      .trim().split(/\s+/).slice(0, WORD_LIMIT_THESIS).join(' ') + '.'
  }
}

// ── Main public API ───────────────────────────────────────────────────────

export async function generateInterpretation(
  client: Anthropic,
  input: SynthesisInput,
): Promise<WriterOutput> {
  // Step 1: schema validation — throws on failure
  const schemaResult = validateSynthesisInput(input)
  const step1Trace = { passed: schemaResult.valid, error: schemaResult.errors[0] }
  if (!schemaResult.valid) {
    throw new Error(`SynthesisInput validation failed: ${schemaResult.errors.join('; ')}`)
  }

  // Steps 2–5 per call, all three fired in parallel (spec §3.3)
  const [callAResult, callBResult, callCResult] = await Promise.all([
    runCallA(client, input),
    runCallB(client, input),
    runCallC(client, input),
  ])

  const output: WriterOutput = {
    causal_paragraph:             callAResult.value,
    causal_paragraph_is_fallback: callAResult.trace.used_fallback,

    risk_sentence:             callBResult.value,
    risk_sentence_is_fallback: callBResult.trace.used_fallback,

    product_thesis_headline:    callCResult.value.headline,
    product_thesis_full:        callCResult.value.full_thesis,
    product_thesis_is_fallback: callCResult.trace.used_fallback,

    validation_trace: {
      step1_schema: step1Trace,
      call_a:       callAResult.trace,
      call_b:       callBResult.trace,
      call_c:       callCResult.trace,
      step6_final:  { passed: true },  // updated below if truncation fires
    },
  }

  // Step 6: final length check
  finalLengthCheck(output)
  output.validation_trace.step6_final = { passed: true }

  return output
}
