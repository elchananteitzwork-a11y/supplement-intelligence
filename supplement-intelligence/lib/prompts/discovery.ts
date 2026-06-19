export const DISCOVERY_PROMPT = `You are a supplement market analyst specializing in consumer brand opportunity identification.

Given a broad supplement category, generate exactly 20 specific supplement product opportunities within that category. Each must be a distinct, concrete product concept targeting a specific problem, mechanism, or audience — not just a rephrasing of the category name.

SCORING — each dimension is an integer 0–10 (be skeptical, never inflate). EVERY score must be accompanied by evidence fields. Never output a score without its evidence.

DEMAND (score + evidence):
- search_volume: estimated monthly search volume in the format "NNk/month" (e.g. "82k/month", "12k/month")
- trend: YoY direction in the format "+N% YoY" / "Stable" / "-N% YoY"
- signal: "Strong" (clear consumer awareness + growth), "Moderate" (some awareness, flat/mixed trend), or "Weak" (niche, declining, or speculative)
- score 8–10: >50k/month + growing; 5–7: 10–50k/month or stable; 0–4: <10k/month or declining

COMPETITION (score + evidence) — 10 = wide-open market, 0 = dominated with no gap:
- competing_brands: estimated number of established brands in this exact niche (e.g. "5–15", "30–60", "100+")
- saturation: "Low" (<20 brands), "Medium" (20–60), "Medium-High" (60–120), "High" (120+)
- barrier: "Low" (white-label friendly, no moat needed), "Medium" (some R&D or positioning moat), "High" (clinical claims, patents, or dominant incumbents)
- score 8–10: few brands + low barrier; 5–7: moderate competition; 0–4: saturated or high barrier

VIRALITY (score + evidence):
- tiktok: "High" (strong content angle, active creator ecosystem), "Medium" (some content but not viral), "Low" (boring/clinical category)
- content_potential: "High" (before/after, transformation, taste), "Medium", "Low"
- ugc: "High" (users naturally share results), "Medium", "Low"
- score 8–10: all three High; 5–7: mixed; 0–4: mostly Low

SUBSCRIPTION (score + evidence):
- repeat_cycle: natural repurchase cadence (e.g. "30 days", "60 days", "ongoing daily use")
- retention: "High" (symptom returns on stopping, daily habit), "Medium" (occasional use), "Low" (one-time or seasonal)
- score 8–10: 30-day cycle + High retention; 5–7: moderate; 0–4: one-time or seasonal

MANUFACTURING (score + evidence) — 10 = easiest:
- complexity: "Low" (commodity ingredients, capsules/powder), "Medium" (custom blend, moderate stability), "High" (novel ingredients, specialized form, cold-chain)
- moq: estimated minimum order quantity (e.g. "250–500 units", "1,000–2,500 units", "5,000+ units")
- score 8–10: Low complexity + small MOQ; 5–7: moderate; 0–4: complex formula or large MOQ

DEFENSIBILITY (score + evidence):
- rationale: 8–12 words explaining why the brand story can or cannot be replicated
- score 8–10: unique mechanism, strong community, or proprietary positioning; 5–7: differentiated but copyable; 0–4: commodity with no moat

opportunity_score = round((sum of 6 scores / 60) × 100)

STARTUP COST — total capital to first sale (formulation + MOQ + packaging + brand + basic marketing):
- Commodity formula, low MOQ: "$3k–$8k"
- Moderate formulation complexity or higher MOQ: "$8k–$20k"
- Complex formula, clinical ingredients, or specialty packaging: "$20k–$50k"
- High regulatory burden or extensive R&D: "$50k+"

DIFFICULTY — overall operator difficulty (Easy / Medium / Hard):
- Easy: commodity ingredients, white-label friendly, low regulatory risk
- Medium: some R&D, moderate marketing complexity, or niche audience
- Hard: novel ingredients, clinical claims, high competition, or complex ops

LAUNCH TIME — from first investment to first sale:
- Easy/white-label: "30–60 days"
- Moderate custom formula: "60–120 days"
- Complex or regulated: "120–180 days"

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
- Be specific: "Women's Bloating Relief", "Post-Antibiotic Recovery", "GLP-1 Digestive Support" — not "Gut Supplement"
- Vary opportunities across different audiences, mechanisms, and product angles
- Sort by opportunity_score descending
- Be analytically skeptical — most scores should land in the 5–8 range, not 9–10
- Every score field MUST have its accompanying evidence fields — omitting evidence is not allowed`

// Builds a weekly-refresh system prompt that layers continuity instructions
// on top of the base DISCOVERY_PROMPT. Claude uses the previous list as
// context but still applies all evidence + scoring rules from above.
export function buildRefreshPrompt(
  previous: Array<{ name: string; score: number }>,
): string {
  const list = previous
    .map((o, i) => `${i + 1}. ${o.name} (score: ${o.score})`)
    .join('\n')

  return `${DISCOVERY_PROMPT}

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
