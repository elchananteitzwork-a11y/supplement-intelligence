// ── SynthesisInput Runtime Validator ─────────────────────────────────────
// Pure TypeScript — no runtime dependencies. Called before every AI request.
// Implements spec §8 validation pipeline step 1: schema enforcement.
//
// Validates:
//   - Required fields present and correctly typed
//   - Enum values within allowed sets
//   - Array lengths within permitted bounds
//   - Prohibited fields absent from objects
//   - String length constraints

import type {
  SynthesisInput,
  VerdictLabel,
  ConfidenceTier,
  SignalId,
  RiskType,
  RiskSeverity,
  ValidationResult,
} from './types'

// ── Allowed value sets ────────────────────────────────────────────────────

const VERDICT_LABELS     = new Set<VerdictLabel>(['ENTRY_SUPPORTED', 'VALIDATION_REQUIRED', 'ENTRY_NOT_SUPPORTED'])
const CONFIDENCE_TIERS   = new Set<ConfidenceTier>(['HIGH', 'MODERATE', 'LOW'])
const SIGNAL_IDS         = new Set<SignalId>(['demand', 'market_accessibility', 'consumer_pain', 'virality', 'manufacturing_feasibility', 'subscription_potential', 'profitability'])
const RISK_TYPES         = new Set<RiskType>(['REVIEW_MOAT', 'MARKET_SATURATION', 'DEMAND_UNCERTAINTY', 'COST_STRUCTURE', 'THIN_CONSUMER_DATA', 'COMPETITOR_FORMULA_PARITY', 'SEASONALITY', 'DEMAND_CONCENTRATION', 'VIRALITY_ABSENCE', 'CATEGORY_ACCESSIBILITY'])
const RISK_SEVERITIES    = new Set<RiskSeverity>(['HIGH', 'MODERATE', 'LOW'])
const EXCLUSION_REASONS  = new Set(['THIN_CORPUS', 'PROVIDER_FAILURE', 'INSUFFICIENT_DATA', 'CONSUMER_OPPORTUNITY_EXCLUSION'])
const TREND_DIRECTIONS   = new Set(['UP', 'STABLE', 'DOWN', 'SEASONAL', 'INSUFFICIENT'])
const VIRALITY_STRENGTHS = new Set(['STRONG', 'MODERATE', 'WEAK', 'ABSENT'])

// ── Prohibited field patterns (AI boundary enforcement) ───────────────────
// These patterns must never appear as keys anywhere in the object graph.
// See CONSTITUTION Law 5 and spec §3 prohibited field list.

const PROHIBITED_KEYS = new Set([
  'productsAnalyzed',   // raw source product list with ASINs
  'exampleQuote',       // raw review text
  'productId',          // ASIN or equivalent
  'ingredients_label',  // raw ingredient text
  'bullets',            // raw listing bullet points
  'breadcrumb',         // raw listing category path
  'cache_key',          // provider cache keys
  'raw_input',          // original user input (passed separately via query field)
  'provider',           // provider name
  'fetched_at',         // provider fetch timestamp
  'primarySource',      // internal provider attribution
  'sources',            // internal source array
])

// ── Helper: check for prohibited keys recursively ─────────────────────────

function findProhibitedKeys(obj: unknown, path: string): string[] {
  if (typeof obj !== 'object' || obj === null) return []
  const errors: string[] = []
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (PROHIBITED_KEYS.has(key)) {
      errors.push(`Prohibited field "${key}" found at ${path}.${key}`)
    }
    errors.push(...findProhibitedKeys((obj as Record<string, unknown>)[key], `${path}.${key}`))
  }
  return errors
}

// ── Validator ─────────────────────────────────────────────────────────────

export function validateSynthesisInput(input: unknown): ValidationResult {
  const errors: string[] = []

  if (typeof input !== 'object' || input === null) {
    return { valid: false, errors: ['Input is not an object'] }
  }

  const s = input as Partial<SynthesisInput>

  // ── Query context ──────────────────────────────────────────────────────

  if (typeof s.query !== 'string' || s.query.trim().length === 0) {
    errors.push('query: must be a non-empty string')
  }
  if (typeof s.category !== 'string' || s.category.trim().length === 0) {
    errors.push('category: must be a non-empty string')
  }
  if (typeof s.analysis_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.analysis_date)) {
    errors.push('analysis_date: must be ISO date string YYYY-MM-DD')
  }

  // ── Verdict ────────────────────────────────────────────────────────────

  if (!VERDICT_LABELS.has(s.verdict as VerdictLabel)) {
    errors.push(`verdict: must be one of ${Array.from(VERDICT_LABELS).join(' | ')}, got ${JSON.stringify(s.verdict)}`)
  }
  if (!CONFIDENCE_TIERS.has(s.verdict_confidence as ConfidenceTier)) {
    errors.push(`verdict_confidence: must be HIGH | MODERATE | LOW, got ${JSON.stringify(s.verdict_confidence)}`)
  }
  if (typeof s.overall_score !== 'number' || s.overall_score < 0 || s.overall_score > 100 || !Number.isInteger(s.overall_score)) {
    errors.push(`overall_score: must be integer 0–100, got ${JSON.stringify(s.overall_score)}`)
  }

  // ── Signals ────────────────────────────────────────────────────────────

  if (!Array.isArray(s.signals)) {
    errors.push('signals: must be an array')
  } else {
    if (s.signals.length > 7) {
      errors.push(`signals: maximum 7 entries, got ${s.signals.length}`)
    }
    for (let i = 0; i < s.signals.length; i++) {
      const sig = s.signals[i]
      if (!SIGNAL_IDS.has(sig.id)) {
        errors.push(`signals[${i}].id: invalid signal id "${sig.id}"`)
      }
      if (typeof sig.score !== 'number' || sig.score < 0 || sig.score > 10) {
        errors.push(`signals[${i}].score: must be 0–10, got ${sig.score}`)
      }
      if (!CONFIDENCE_TIERS.has(sig.confidence)) {
        errors.push(`signals[${i}].confidence: must be HIGH | MODERATE | LOW`)
      }
      if (typeof sig.headline !== 'string' || sig.headline.trim().length === 0) {
        errors.push(`signals[${i}].headline: must be a non-empty string`)
      }
      if (typeof sig.supporting_stat !== 'string') {
        errors.push(`signals[${i}].supporting_stat: must be a string`)
      } else if (sig.supporting_stat.length > 30) {
        errors.push(`signals[${i}].supporting_stat: max 30 chars, got ${sig.supporting_stat.length}`)
      }
    }
  }

  // ── Primary risk ───────────────────────────────────────────────────────

  if (typeof s.primary_risk !== 'object' || s.primary_risk === null) {
    errors.push('primary_risk: must be an object')
  } else {
    if (!RISK_TYPES.has(s.primary_risk.type)) {
      errors.push(`primary_risk.type: invalid risk type "${s.primary_risk.type}"`)
    }
    if (!RISK_SEVERITIES.has(s.primary_risk.severity)) {
      errors.push(`primary_risk.severity: must be HIGH | MODERATE | LOW`)
    }
    if (typeof s.primary_risk.evidence !== 'object' || s.primary_risk.evidence === null) {
      errors.push('primary_risk.evidence: must be an object')
    }
  }

  // ── Consumer intelligence ──────────────────────────────────────────────

  if (!Array.isArray(s.consumer_clusters)) {
    errors.push('consumer_clusters: must be an array')
  } else {
    if (s.consumer_clusters.length > 3) {
      errors.push(`consumer_clusters: maximum 3 entries, got ${s.consumer_clusters.length}`)
    }
    for (let i = 0; i < s.consumer_clusters.length; i++) {
      const c = s.consumer_clusters[i]
      if (typeof c.label !== 'string' || c.label.trim().length === 0) {
        errors.push(`consumer_clusters[${i}].label: must be a non-empty string`)
      }
      if (typeof c.frequency !== 'number' || c.frequency < 0) {
        errors.push(`consumer_clusters[${i}].frequency: must be non-negative number`)
      }
      if (typeof c.frequency_pct !== 'number' || c.frequency_pct < 0 || c.frequency_pct > 100) {
        errors.push(`consumer_clusters[${i}].frequency_pct: must be 0–100`)
      }
      if (c.sentiment !== 'NEGATIVE' && c.sentiment !== 'MIXED') {
        errors.push(`consumer_clusters[${i}].sentiment: must be NEGATIVE | MIXED`)
      }
      // Prohibited: exampleQuote must not exist on consumer cluster
      if ('exampleQuote' in c) {
        errors.push(`consumer_clusters[${i}]: prohibited field "exampleQuote" present`)
      }
    }
  }

  if (typeof s.thin_corpus !== 'boolean') {
    errors.push('thin_corpus: must be boolean')
  }
  if (typeof s.corpus_size !== 'number' || s.corpus_size < 0) {
    errors.push('corpus_size: must be non-negative number')
  }

  // ── Keyword summary ────────────────────────────────────────────────────

  if (s.keyword_summary !== null && s.keyword_summary !== undefined) {
    const ks = s.keyword_summary
    if (typeof ks.total_monthly_volume !== 'number' || ks.total_monthly_volume < 0) {
      errors.push('keyword_summary.total_monthly_volume: must be non-negative number')
    }
    if (!Array.isArray(ks.top_3_keywords)) {
      errors.push('keyword_summary.top_3_keywords: must be an array')
    } else if (ks.top_3_keywords.length > 3) {
      errors.push(`keyword_summary.top_3_keywords: maximum 3 entries, got ${ks.top_3_keywords.length}`)
    }
    if (!TREND_DIRECTIONS.has(ks.trend_direction)) {
      errors.push(`keyword_summary.trend_direction: invalid value "${ks.trend_direction}"`)
    }
  }

  // ── Competitor context ─────────────────────────────────────────────────

  if (s.competitor_context !== null && s.competitor_context !== undefined) {
    const cc = s.competitor_context
    if (!Array.isArray(cc.top_competitors)) {
      errors.push('competitor_context.top_competitors: must be an array')
    } else {
      if (cc.top_competitors.length > 3) {
        errors.push(`competitor_context.top_competitors: maximum 3 entries, got ${cc.top_competitors.length}`)
      }
      for (let i = 0; i < cc.top_competitors.length; i++) {
        const c = cc.top_competitors[i]
        if ('productId' in c) {
          errors.push(`competitor_context.top_competitors[${i}]: prohibited field "productId" present`)
        }
        if ('ingredients_label' in c) {
          errors.push(`competitor_context.top_competitors[${i}]: prohibited field "ingredients_label" present`)
        }
        if ('bullets' in c) {
          errors.push(`competitor_context.top_competitors[${i}]: prohibited field "bullets" present`)
        }
        if (typeof c.brand !== 'string') {
          errors.push(`competitor_context.top_competitors[${i}].brand: must be string`)
        }
        if (typeof c.price !== 'number') {
          errors.push(`competitor_context.top_competitors[${i}].price: must be number`)
        }
        if (typeof c.review_count !== 'number') {
          errors.push(`competitor_context.top_competitors[${i}].review_count: must be number`)
        }
      }
    }
  }

  // ── Excluded signals ───────────────────────────────────────────────────

  if (!Array.isArray(s.excluded_signals)) {
    errors.push('excluded_signals: must be an array')
  } else {
    for (let i = 0; i < s.excluded_signals.length; i++) {
      const e = s.excluded_signals[i]
      if (!SIGNAL_IDS.has(e.signal_id)) {
        errors.push(`excluded_signals[${i}].signal_id: invalid signal id "${e.signal_id}"`)
      }
      if (!EXCLUSION_REASONS.has(e.reason)) {
        errors.push(`excluded_signals[${i}].reason: invalid reason "${e.reason}"`)
      }
    }
  }

  // ── Confidence flags ───────────────────────────────────────────────────

  if (!Array.isArray(s.confidence_flags)) {
    errors.push('confidence_flags: must be an array')
  } else {
    for (let i = 0; i < s.confidence_flags.length; i++) {
      const f = s.confidence_flags[i]
      if (typeof f.code !== 'string' || f.code.trim().length === 0) {
        errors.push(`confidence_flags[${i}].code: must be non-empty string`)
      }
      if (typeof f.message !== 'string') {
        errors.push(`confidence_flags[${i}].message: must be string`)
      }
    }
  }

  // ── Prohibited keys (deep scan — AI boundary enforcement) ─────────────

  const prohibitedErrors = findProhibitedKeys(s, 'input')
  errors.push(...prohibitedErrors)

  return { valid: errors.length === 0, errors }
}
