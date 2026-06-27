import Anthropic from '@anthropic-ai/sdk'
import type {
  ManufacturingProvider,
  ManufacturingRequest,
  ManufacturingEstimate,
  ManufacturingComplexity,
  ConfidenceLabel,
} from '../types'

// ── AI-powered manufacturing estimator (Phase 1 provider) ──────────────────
// Fallback only — runs when the real Apify supplier-search provider fails
// or returns nothing. Estimates directional category-level manufacturing
// difficulty only; never a substitute for real supplier quotes.
//
// PERMANENT RULE (2026-06-26): this provider previously also fabricated
// unit_cost, moq, supplier_count, top_supplier_rating, and lead_time_days —
// specific-looking numbers with zero real basis (no live supplier was ever
// queried on this path). Removed entirely. The only output now is
// `complexity` (a qualitative judgment, already labeled as such in the UI)
// and free-text `notes`. When this path is active, the UI shows
// "Insufficient Verified Data" for cost/MOQ/lead-time/supplier-count/
// rating instead of a number with nothing behind it.

const SYSTEM_PROMPT = `You are a manufacturing intelligence analyst specializing in DTC consumer products.

Given a product name, category, and optional complexity hints, judge the manufacturing complexity tier.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.

CALIBRATION:
- Low: commodity ingredients/materials, simple process, widely available suppliers
- Medium: custom formulation/design, moderate stability or tooling requirements
- High: novel ingredients/materials, specialized process, cold-chain or precision tooling
- Very High: regulated/clinical-grade, advanced engineering, narrow supplier pool

Return exactly:
{
  "complexity": "Low | Medium | High | Very High",
  "notes": "one sentence on the key manufacturing consideration or risk — qualitative only, no invented cost figures, unit counts, or day estimates"
}`

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export class AIManufacturingProvider implements ManufacturingProvider {
  readonly id      = 'ai_synthesis' as const
  readonly enabled = !!process.env.ANTHROPIC_API_KEY

  async fetch(req: ManufacturingRequest): Promise<ManufacturingEstimate | null> {
    if (!this.enabled) return null

    const prompt = [
      `Product: "${req.product}"`,
      `Category: ${req.category}`,
      req.complexity ? `Complexity hint: ${req.complexity}` : null,
    ].filter(Boolean).join('\n')

    try {
      const msg = await ai.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const s   = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      const parsed = JSON.parse(s)

      return {
        product:             req.product,
        category:            req.category,
        // No real supplier data was available on this path — these stay
        // undefined/null rather than carrying an invented number.
        unit_cost:           undefined,
        moq:                 undefined,
        supplier_count:      undefined,
        top_supplier_rating: null,
        lead_time_days:      undefined,
        complexity:          (parsed.complexity ?? 'Medium') as ManufacturingComplexity,
        // PERMANENT RULE (2026-06-26): never let the model self-report its
        // own confidence — that's a number with no traceable basis, just
        // one step removed from the estimate it's describing. This whole
        // path is reached ONLY when no real supplier data was available
        // (the Apify provider, with its own deterministic scoreConfidence()
        // formula over real counts, always runs first) — so a fixed, low,
        // deterministic confidence is the honest constant here, not a
        // model guess dressed as a measurement.
        confidence:         0.2,
        confidence_label:   'Low' as ConfidenceLabel,
        data_source:        'ai_synthesis',
        notes:              parsed.notes ?? '',
        fetched_at:         new Date().toISOString(),
      }
    } catch (e) {
      console.error('[AIManufacturingProvider] error', e)
      return null
    }
  }
}
