import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ReviewEngine }  from '@/lib/review-engine'
import { checkRateLimit, REVIEWS_ANALYZE_LIMIT } from '@/lib/rate-limit'
import type { RawReview, ReviewEngineConfig } from '@/lib/review-engine'

// Vercel Pro: 5-minute max for large corpora.
// Callers processing 50k+ reviews should use background jobs + webhooks.
export const maxDuration = 300

// ── Input validation ───────────────────────────────────────────────────────

const MAX_REVIEWS       = 100_000
const MAX_BODY_CHARS    = 5_000   // per review
const MAX_TITLE_CHARS   = 500
const VALID_CONCURRENCY = { min: 1, max: 20 }
const VALID_CHUNK_SIZE  = { min: 10, max: 200 }
const VALID_MAX_CHUNKS  = { min: 1, max: 500 }

interface RequestBody {
  reviews: RawReview[]
  asin?:   string
  config?: Partial<Pick<ReviewEngineConfig,
    'reviews_per_chunk' | 'max_chunks' | 'concurrency' | 'sampling_strategy'
  >>
}

function validateBody(raw: unknown): { ok: true; data: RequestBody } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }

  const body = raw as Record<string, unknown>

  if (!Array.isArray(body.reviews)) {
    return { ok: false, error: '`reviews` must be an array' }
  }
  if (body.reviews.length === 0) {
    return { ok: false, error: '`reviews` must contain at least one review' }
  }
  if (body.reviews.length > MAX_REVIEWS) {
    return { ok: false, error: `Maximum ${MAX_REVIEWS.toLocaleString()} reviews per request` }
  }

  // Validate a sample of reviews (checking all 100k would be too slow)
  const sampleSize = Math.min(50, body.reviews.length)
  for (let i = 0; i < sampleSize; i++) {
    const r = body.reviews[i] as Record<string, unknown>
    if (typeof r !== 'object' || r === null || Array.isArray(r)) {
      return { ok: false, error: `reviews[${i}] must be an object` }
    }
    if (typeof r.rating !== 'number' || r.rating < 1 || r.rating > 5) {
      return { ok: false, error: `reviews[${i}].rating must be a number between 1 and 5` }
    }
    if (typeof r.body !== 'string' || !r.body.trim()) {
      return { ok: false, error: `reviews[${i}].body must be a non-empty string` }
    }
    // Sanitise oversized fields (truncate rather than reject)
    if (r.body.length > MAX_BODY_CHARS) r.body = (r.body as string).slice(0, MAX_BODY_CHARS)
    if (typeof r.title === 'string' && r.title.length > MAX_TITLE_CHARS) {
      r.title = r.title.slice(0, MAX_TITLE_CHARS)
    }
  }

  // Config validation
  const cfg = body.config as Record<string, unknown> | undefined
  if (cfg) {
    if (cfg.reviews_per_chunk !== undefined) {
      const v = cfg.reviews_per_chunk as number
      if (typeof v !== 'number' || v < VALID_CHUNK_SIZE.min || v > VALID_CHUNK_SIZE.max) {
        return { ok: false, error: `config.reviews_per_chunk must be ${VALID_CHUNK_SIZE.min}–${VALID_CHUNK_SIZE.max}` }
      }
    }
    if (cfg.max_chunks !== undefined) {
      const v = cfg.max_chunks as number
      if (typeof v !== 'number' || v < VALID_MAX_CHUNKS.min || v > VALID_MAX_CHUNKS.max) {
        return { ok: false, error: `config.max_chunks must be ${VALID_MAX_CHUNKS.min}–${VALID_MAX_CHUNKS.max}` }
      }
    }
    if (cfg.concurrency !== undefined) {
      const v = cfg.concurrency as number
      if (typeof v !== 'number' || v < VALID_CONCURRENCY.min || v > VALID_CONCURRENCY.max) {
        return { ok: false, error: `config.concurrency must be ${VALID_CONCURRENCY.min}–${VALID_CONCURRENCY.max}` }
      }
    }
    if (cfg.sampling_strategy !== undefined && !['random', 'stratified'].includes(cfg.sampling_strategy as string)) {
      return { ok: false, error: 'config.sampling_strategy must be "random" or "stratified"' }
    }
  }

  return { ok: true, data: body as unknown as RequestBody }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(user.id, REVIEWS_ANALYZE_LIMIT))) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = validateBody(raw)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { reviews, asin, config } = validated.data

  try {
    const engine = new ReviewEngine(undefined, config)
    const report = await engine.analyze(reviews, asin)
    return NextResponse.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown analysis error'
    console.error('[/api/reviews/analyze] error:', message, err)

    // Distinguish user-facing validation errors from unexpected server errors
    const isUserError = message.startsWith('ReviewEngine:')
    return NextResponse.json(
      { error: isUserError ? message : 'Analysis failed — please try again' },
      { status: isUserError ? 400 : 500 },
    )
  }
}

// ── Health check ───────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status:   'ok',
    endpoint: 'POST /api/reviews/analyze',
    input: {
      reviews:  'RawReview[]  — required; max 100,000',
      asin:     'string       — optional product ASIN',
      config:   'object       — optional engine tuning',
    },
    config_options: {
      reviews_per_chunk: 'number (10–200, default 50)',
      max_chunks:        'number (1–500, default 100)',
      concurrency:       'number (1–20, default 5)',
      sampling_strategy: '"random" | "stratified" (default "stratified")',
    },
  })
}
