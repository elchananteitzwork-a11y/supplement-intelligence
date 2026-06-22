import { buildSignalAugmentedSystemPrompt } from '@/lib/prompts/discovery'
import type { AggregatedSignals } from '@/lib/signal-engine/types'

// ── Shared prompt builders ─────────────────────────────────────────────────
//
// All category modules share the same refresh and signal-augmentation logic.
// The base discovery prompt is category-specific; everything else is generic.

// Generic weekly-refresh wrapper for any category's discovery prompt.
export function buildGenericRefreshPrompt(
  baseDiscoveryPrompt: string,
  previous: Array<{ name: string; score: number }>,
): string {
  const list = previous
    .map((o, i) => `${i + 1}. ${o.name} (score: ${o.score})`)
    .join('\n')

  return `${baseDiscoveryPrompt}

---
WEEKLY REFRESH CONTEXT

Last week's opportunities (reference only — do not copy blindly):
${list}

Refresh rules (apply after all rules above):
- Keep opportunities that remain strong and relevant; use their EXACT same name if retaining them
- Retained opportunity scores may shift ±4 points based on current perspective
- Replace 4–6 of the weakest or most stale entries with completely new ideas not in the list above
- New ideas must follow the same specificity and evidence standards as the main prompt
- Return exactly 20 total, sorted by opportunity_score descending`
}

// Re-export the signal augmentation utility — identical for all categories.
export function buildSharedSignalAugmentedPrompt(
  basePrompt: string,
  query:      string,
  signals:    AggregatedSignals | null,
): string {
  return buildSignalAugmentedSystemPrompt(basePrompt, query, signals)
}

// ── Shared discovery JSON schema block ────────────────────────────────────
// Identical schema instruction appended to every category's discovery prompt.
// Keeping it here ensures a single source of truth for the OpportunityCard shape.

export const SHARED_OPPORTUNITY_SCHEMA = `
Return ONLY a valid JSON array — no markdown, no code fences, no explanation, no preamble.
Start with [ and end with ].

[
  {
    "name": "2–5 word specific opportunity name",
    "score": 0,
    "rationale": "one sentence on the biggest opportunity or risk driving the score",
    "startup_cost": "$Xk–$Yk",
    "difficulty": "Easy | Medium | Hard",
    "launch_time": "X–Y days",
    "scores": {
      "demand": {
        "score": 0,
        "search_volume": "NNk/month",
        "trend": "+N% YoY",
        "signal": "Strong | Moderate | Weak"
      },
      "competition": {
        "score": 0,
        "competing_brands": "N–N",
        "saturation": "Low | Medium | Medium-High | High",
        "barrier": "Low | Medium | High"
      },
      "virality": {
        "score": 0,
        "tiktok": "High | Medium | Low",
        "content_potential": "High | Medium | Low",
        "ugc": "High | Medium | Low"
      },
      "subscription": {
        "score": 0,
        "repeat_cycle": "30 days",
        "retention": "High | Medium | Low"
      },
      "manufacturing": {
        "score": 0,
        "complexity": "Low | Medium | High",
        "moq": "N–N units"
      },
      "defensibility": {
        "score": 0,
        "rationale": "8–12 word reason"
      }
    }
  }
]

Rules:
- Generate exactly 20 opportunities
- Be specific: target a distinct problem, audience, mechanism, or angle — not a generic rephrasing
- Vary opportunities across different audiences, use-cases, and product formats
- Sort by opportunity_score descending
- Be analytically skeptical — most scores should land in the 5–8 range, not 9–10
- Every score field MUST have its accompanying evidence fields — omitting evidence is not allowed`

// ── Shared analysis memo JSON schema ─────────────────────────────────────
// All categories produce the same MemoData shape so the existing UI renders them.

export const SHARED_MEMO_SCHEMA = `
Return a JSON object with exactly these fields:
{
  "category_name": "2–4 word category name",
  "executive_summary": "2 sentences covering the opportunity and buyer",
  "build_verdict": "YES | MAYBE | NO",
  "build_decision": "BUILD_NOW | VALIDATE_FURTHER | SKIP",
  "build_explanation": "2 sentences with the key insight behind the decision",
  "opportunity_score": 0,

  "scores": {
    "demand":        { "score": 0, "notes": "one sentence" },
    "competition":   { "score": 0, "notes": "one sentence" },
    "virality":      { "score": 0, "notes": "one sentence" },
    "subscription":  { "score": 0, "notes": "one sentence" },
    "manufacturing": { "score": 0, "notes": "one sentence" },
    "defensibility": { "score": 0, "notes": "one sentence" }
  },

  "biggest_competitor": {
    "name":    "brand name",
    "revenue": "~$XM",
    "gap":     "one sentence on what they are missing"
  },

  "market_size":  "$XB (year)",
  "sub_ltv":      "$XXX",
  "gross_margin": "XX-XX%",

  "market_gaps": ["gap 1","gap 2","gap 3","gap 4","gap 5"],

  "brand_opportunities": ["angle 1","angle 2","angle 3","angle 4","angle 5"],

  "customer_language": {
    "frustrations": ["quote-style 1","quote-style 2"],
    "desires":      ["desire 1","desire 2"],
    "fears":        ["fear 1","fear 2"],
    "ad_phrases": [
      { "they_say": "...", "use_in_copy": "..." },
      { "they_say": "...", "use_in_copy": "..." }
    ]
  },

  "product_recommendation": {
    "format":        "product format description",
    "dosing":        "usage instructions",
    "formula": [
      { "ingredient": "key ingredient/component", "dose": "amount/concentration", "role": "brief role", "evidence": "★★★" }
    ],
    "avoid":         ["component to avoid — reason","component to avoid — reason"],
    "cogs_estimate": "$X-Y per unit at Xk MOQ",
    "retail_price":  "$XX-XX",
    "gross_margin":  "XX-XX%"
  },

  "financial_projections": {
    "ten_k_probability":      "XX%",
    "hundred_k_probability":  "XX%",
    "one_m_probability":      "XX%",
    "gross_margin":           "XX-XX%",
    "net_margin_at_scale":    "XX-XX%",
    "subscription_ltv":       "$XXX",
    "path_to_10m":            "one sentence on the execution path"
  }
}`
