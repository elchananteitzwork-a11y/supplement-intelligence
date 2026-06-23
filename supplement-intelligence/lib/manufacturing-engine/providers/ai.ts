import Anthropic from '@anthropic-ai/sdk'
import type {
  ManufacturingProvider,
  ManufacturingRequest,
  ManufacturingEstimate,
  ManufacturingComplexity,
  ConfidenceLabel,
} from '../types'

// ── AI-powered manufacturing estimator (Phase 1 provider) ──────────────────
// Uses Claude with category-specific knowledge to estimate manufacturing
// parameters. Estimates are directional intelligence, not verified quotes.
// Future providers (Alibaba, Made-in-China) will validate and replace these
// estimates with real supplier data.

const SYSTEM_PROMPT = `You are a manufacturing intelligence analyst specializing in DTC consumer products.

Given a product name, category, and optional complexity hints, estimate manufacturing parameters.

Return ONLY a valid JSON object — no markdown, no code fences, no explanation.

CALIBRATION BY CATEGORY:
- supplements (capsules/powder): MOQ 250–2000 units, unit cost $2–8, lead time 45–90 days
- supplements (gummies/liquid): MOQ 500–3000 units, unit cost $3–12, lead time 60–120 days
- beauty (serums/creams): MOQ 300–2000 units, unit cost $3–15, lead time 60–90 days
- beauty (complex/clinical): MOQ 1000–5000 units, unit cost $8–30, lead time 90–150 days
- fitness (nutrition): same as supplements
- fitness (equipment/accessories): MOQ 100–500 units, unit cost $5–40, lead time 60–150 days
- pets (treats/soft chews): MOQ 500–2000 units, unit cost $2–8, lead time 45–90 days
- pets (specialized formula): MOQ 1000–5000 units, unit cost $5–20, lead time 90–150 days
- home (simple import): MOQ 50–500 units, unit cost $3–20, lead time 45–90 days
- home (custom tooling/electronics): MOQ 200–2000 units, unit cost $10–60, lead time 90–240 days

SUPPLIER COUNT ESTIMATES:
- Low complexity, commodity category: 200–500 suppliers globally
- Medium complexity, specialized: 50–200 suppliers
- High complexity, clinical/advanced: 10–50 suppliers
- Very High complexity: 5–20 suppliers

RATING: Top suppliers in each category typically rate 4.5–5.0 on Alibaba for established verticals.
For niche or complex products, assume 4.0–4.7 from vetted suppliers.

Return exactly:
{
  "unit_cost": { "low": 0.0, "high": 0.0, "currency": "USD" },
  "moq":       { "low": 0, "high": 0, "unit": "units" },
  "supplier_count": { "estimate": 0, "confidence": "High | Medium | Low" },
  "top_supplier_rating": 0.0,
  "lead_time_days": { "low": 0, "high": 0 },
  "complexity": "Low | Medium | High | Very High",
  "confidence": 0.0,
  "confidence_label": "High | Medium | Low",
  "notes": "one sentence on the key manufacturing consideration or risk"
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
      req.moq_hint   ? `MOQ hint from discovery: ${req.moq_hint}` : null,
    ].filter(Boolean).join('\n')

    try {
      const msg = await ai.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: prompt }],
      })
      const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
      const s   = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
      const parsed = JSON.parse(s)

      return {
        product:            req.product,
        category:           req.category,
        unit_cost:          parsed.unit_cost,
        moq:                parsed.moq,
        supplier_count:     parsed.supplier_count,
        top_supplier_rating: parsed.top_supplier_rating ?? null,
        lead_time_days:     parsed.lead_time_days,
        complexity:         (parsed.complexity  ?? 'Medium') as ManufacturingComplexity,
        confidence:         parsed.confidence   ?? 0.5,
        confidence_label:   (parsed.confidence_label ?? 'Medium') as ConfidenceLabel,
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
