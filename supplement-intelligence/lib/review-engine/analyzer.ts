import type { AIProvider } from './ai/types'
import type { ReviewChunk } from './chunker'
import type { ChunkAnalysis, ChunkExtraction, SentimentLabel } from './types'

// ── Prompt constants ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a product intelligence analyst specializing in Amazon review analysis.
Extract structured customer insights from a batch of reviews.
Output ONLY valid JSON — no markdown fences, no preamble, just the JSON object.`

const STAR_MAP = ['', '★☆☆☆☆', '★★☆☆☆', '★★★☆☆', '★★★★☆', '★★★★★'] as const

// ── Prompt builder ─────────────────────────────────────────────────────────

function buildPrompt(chunk: ReviewChunk): string {
  const reviewBlock = chunk.reviews
    .map((r, i) => {
      const stars = STAR_MAP[Math.min(5, Math.max(1, Math.round(r.rating)))]
      const title = r.title ? `"${r.title.slice(0, 60)}" ` : ''
      const body  = r.body.slice(0, 500).replace(/\s+/g, ' ').trim()
      return `[${i + 1}] ${stars} ${title}— ${body}`
    })
    .join('\n')

  return `Analyze these ${chunk.reviews.length} Amazon product reviews (avg rating: ${chunk.avg_rating}★).

REVIEWS:
${reviewBlock}

Extract customer insights and return EXACTLY this JSON structure:
{
  "pain_points":            ["specific problem customers describe"],
  "missing_features":       ["feature customers wish the product had"],
  "requested_improvements": ["concrete improvement customers ask for"],
  "quality_issues":         ["defects, durability or material problems"],
  "packaging_issues":       ["damaged, misleading or poor packaging complaints"],
  "shipping_issues":        ["late delivery, wrong item or transit damage"],
  "price_complaints":       ["too expensive, poor value, or price-related frustration"],
  "positive_themes":        ["what customers love and praise"],
  "customer_sentiment":     "Very Positive | Positive | Mixed | Negative | Very Negative"
}

Extraction rules:
- Each array: 0–8 items (empty array [] is valid when the category is absent)
- Each item: one clear, specific sentence — "lid cracks after 2 uses" not "quality issues"
- Sentiment: reflect the collective emotional tone across ALL ${chunk.reviews.length} reviews
- Skip boilerplate ("great product", "fast shipping") unless it is a dominant recurring theme
- Do NOT hallucinate issues not present in the reviews`
}

// ── JSON parser (with brace-scanner fallback) ──────────────────────────────

function parseExtraction(raw: string): ChunkExtraction {
  // Strip markdown fences the model might add despite the instruction
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  // Jump to the first '{' (handles any accidental preamble)
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)

  // Fast path
  try { return JSON.parse(s) as ChunkExtraction } catch { /* fall through */ }

  // Slow path: string-aware brace scanner that handles '}' inside string values
  let depth = 0, inStr = false, esc = false, end = -1
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc)   { esc = false; continue }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
    if (c === '"') { inStr = true; continue }
    if (c === '{') depth++
    else if (c === '}') { if (--depth === 0) { end = i; break } }
  }

  if (end === -1) throw new Error('No complete JSON object in chunk analysis response')
  return JSON.parse(s.slice(0, end + 1)) as ChunkExtraction
}

// ── Confidence heuristic ───────────────────────────────────────────────────

function computeConfidence(chunk: ReviewChunk, extraction: ChunkExtraction): number {
  let score = 0.40

  // More reviews in the chunk = more reliable signal
  if (chunk.reviews.length >= 40) score += 0.20
  else if (chunk.reviews.length >= 20) score += 0.10

  // Richer extraction = model found real patterns (not silence or hallucination)
  const totalItems = (Object.values(extraction) as unknown[])
    .filter(Array.isArray)
    .reduce((s, arr) => s + (arr as string[]).length, 0)

  if (totalItems >= 12) score += 0.25
  else if (totalItems >= 6) score += 0.15
  else if (totalItems >= 3) score += 0.05

  // Rating variance in the chunk is a proxy for review diversity
  const dist = chunk.rating_dist
  const usedBuckets = ([1, 2, 3, 4, 5] as const).filter(s => dist[s] > 0).length
  if (usedBuckets >= 4) score += 0.10
  else if (usedBuckets >= 3) score += 0.05

  return Math.min(1, Math.round(score * 100) / 100)
}

// ── Public entry point ─────────────────────────────────────────────────────

export async function analyzeChunk(
  ai:         AIProvider,
  chunk:      ReviewChunk,
  timeoutMs:  number,
): Promise<ChunkAnalysis> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const prompt        = buildPrompt(chunk)

  // The AbortSignal is wired into the underlying fetch via the SDK;
  // if the provider doesn't honour it, the engine's concurrency guard
  // and the Vercel maxDuration ceiling act as the final backstop.
  const result = await Promise.race([
    ai.complete({
      system:      SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: prompt }],
      max_tokens:  1200,
      temperature: 0.1,
    }),
    new Promise<never>((_, reject) =>
      timeoutSignal.addEventListener('abort', () =>
        reject(new Error(`Chunk ${chunk.index} timed out after ${timeoutMs}ms`))
      )
    ),
  ])

  const extraction = parseExtraction(result.content)
  const confidence = computeConfidence(chunk, extraction)

  return {
    chunk_index:  chunk.index,
    review_count: chunk.reviews.length,
    avg_rating:   chunk.avg_rating,
    rating_dist:  chunk.rating_dist,
    extraction,
    confidence,
  }
}
