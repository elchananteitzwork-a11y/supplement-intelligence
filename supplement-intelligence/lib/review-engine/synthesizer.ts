import type { AIProvider } from './ai/types'
import type { AggregatedInsights } from './aggregator'
import type { ReviewScores } from './scorer'
import type { RankedInsight } from './types'

// ── Output ─────────────────────────────────────────────────────────────────

export interface SynthesisResult {
  top_complaints:         string[]   // exactly 5
  top_requested_features: string[]   // exactly 5
  ai_recommendation:      string     // 3–4 actionable sentences
}

// ── Prompt ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior product strategist.
Given aggregated Amazon review intelligence, produce a crisp strategic brief.
Output ONLY valid JSON — no markdown, no preamble.`

function formatInsights(items: RankedInsight[], max: number): string {
  if (!items.length) return '  (none detected)'
  return items
    .slice(0, max)
    .map((it, i) => `  ${i + 1}. ${it.insight} (${Math.round(it.frequency * 100)}% of chunks, severity: ${it.severity})`)
    .join('\n')
}

function buildPrompt(
  insights:     AggregatedInsights,
  scores:       ReviewScores,
  totalReviews: number,
): string {
  return `REVIEW INTELLIGENCE SUMMARY
Total reviews analysed: ${totalReviews}
Overall sentiment: ${insights.overall_sentiment}  |  Avg rating: ${insights.avg_rating}/5

SCORES
  Pain Score:        ${scores.pain_score}/10
  Opportunity Score: ${scores.opportunity_score}/10
  Market Confidence: ${Math.round(scores.market_confidence * 100)}%

PAIN POINTS (top 8):
${formatInsights(insights.pain_points, 8)}

QUALITY ISSUES (top 5):
${formatInsights(insights.quality_issues, 5)}

PACKAGING ISSUES:
${formatInsights(insights.packaging_issues, 4)}

SHIPPING ISSUES:
${formatInsights(insights.shipping_issues, 4)}

PRICE COMPLAINTS:
${formatInsights(insights.price_complaints, 4)}

MISSING FEATURES (top 6):
${formatInsights(insights.missing_features, 6)}

REQUESTED IMPROVEMENTS (top 6):
${formatInsights(insights.requested_improvements, 6)}

POSITIVE THEMES (top 5):
${formatInsights(insights.positive_themes, 5)}

Based on this data, return EXACTLY:
{
  "top_complaints": [
    "complaint 1 — one clear sentence",
    "complaint 2 — one clear sentence",
    "complaint 3 — one clear sentence",
    "complaint 4 — one clear sentence",
    "complaint 5 — one clear sentence"
  ],
  "top_requested_features": [
    "feature 1 — one clear sentence",
    "feature 2 — one clear sentence",
    "feature 3 — one clear sentence",
    "feature 4 — one clear sentence",
    "feature 5 — one clear sentence"
  ],
  "ai_recommendation": "3-4 sentences. Specific, data-backed advice: which problems to fix first, which features to add, what would move the needle most. Reference the scores and specific complaints."
}

Rules:
- top_complaints: exactly 5 items; the 5 most impactful customer frustrations by frequency × severity
- top_requested_features: exactly 5 items; highest-impact features/improvements from across all request categories
- ai_recommendation: actionable, not generic — cite specific issues from the data above`
}

// ── JSON parser ────────────────────────────────────────────────────────────

function parseResult(raw: string): SynthesisResult {
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)

  try { return JSON.parse(s) as SynthesisResult } catch { /* fall through */ }

  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') { if (--depth === 0) { end = i; break } }
  }

  if (end !== -1) return JSON.parse(s.slice(0, end + 1)) as SynthesisResult

  // Last-resort fallback: extract bullet-like lines from the raw text so the
  // report still renders rather than throwing completely.
  console.error('ReviewEngine synthesizer: JSON parse failed; returning fallback')
  const lines = raw
    .split(/\n/)
    .filter(l => /^\s*[-*\d]/.test(l))
    .map(l => l.replace(/^\s*[-*\d.\s]+/, '').trim())
    .filter(Boolean)
  while (lines.length < 5) lines.push('Insufficient data')
  return {
    top_complaints:         lines.slice(0, 5),
    top_requested_features: Array(5).fill('Insufficient data'),
    ai_recommendation:      'AI synthesis failed to parse. Review raw chunk data manually.',
  }
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function synthesize(
  ai:           AIProvider,
  insights:     AggregatedInsights,
  scores:       ReviewScores,
  totalReviews: number,
): Promise<SynthesisResult> {
  const result = await ai.complete({
    system:      SYSTEM_PROMPT,
    messages:    [{ role: 'user', content: buildPrompt(insights, scores, totalReviews) }],
    max_tokens:  1000,
    temperature: 0.2,
  })

  return parseResult(result.content)
}
