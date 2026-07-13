import { NextResponse }    from 'next/server'
import { createClient }  from '@/lib/supabase/server'
import { ReviewCollector } from '@/lib/review-collector'
import { checkRateLimit, REVIEWS_COLLECT_LIMIT } from '@/lib/rate-limit'
import type { CollectorConfig } from '@/lib/review-collector'

// Collection can be slow for large ASINs; give it 5 minutes.
// For >500 reviews, callers should implement background jobs + webhooks.
export const maxDuration = 300

// ── Validation constants ───────────────────────────────────────────────────

const VALID_SORT       = new Set(['helpful', 'recent', 'top_rated'] as const)
const VALID_COUNTRIES  = new Set(['US','GB','CA','AU','DE','FR','IT','ES','JP','MX','IN'])
const ASIN_RE          = /^[A-Z0-9]{10}$/i
const MAX_REVIEWS_CAP  = 2_000
const MAX_PAGES_CAP    = 100

// ── Input shape ────────────────────────────────────────────────────────────

type SortBy = 'helpful' | 'recent' | 'top_rated'

interface RequestBody {
  asin:    string
  config?: Partial<Pick<CollectorConfig,
    | 'max_reviews'
    | 'max_pages'
    | 'sort_by'
    | 'verified_only'
    | 'min_rating'
    | 'max_rating'
    | 'country'
  >>
}

// ── Validation ─────────────────────────────────────────────────────────────

type ValidationResult =
  | { ok: true;  data: RequestBody }
  | { ok: false; error: string }

function validate(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const body = raw as Record<string, unknown>

  // ASIN
  if (typeof body.asin !== 'string' || !body.asin.trim()) {
    return { ok: false, error: '`asin` is required (string)' }
  }
  if (!ASIN_RE.test(body.asin.trim())) {
    return { ok: false, error: '`asin` must be a valid Amazon ASIN (10 alphanumeric characters)' }
  }

  // Optional config
  const cfg = body.config as Record<string, unknown> | undefined
  if (cfg !== undefined) {
    if (cfg.max_reviews !== undefined) {
      const v = cfg.max_reviews
      if (typeof v !== 'number' || v < 1 || v > MAX_REVIEWS_CAP || !Number.isInteger(v)) {
        return { ok: false, error: `config.max_reviews must be an integer 1–${MAX_REVIEWS_CAP}` }
      }
    }
    if (cfg.max_pages !== undefined) {
      const v = cfg.max_pages
      if (typeof v !== 'number' || v < 1 || v > MAX_PAGES_CAP || !Number.isInteger(v)) {
        return { ok: false, error: `config.max_pages must be an integer 1–${MAX_PAGES_CAP}` }
      }
    }
    if (cfg.sort_by !== undefined && !VALID_SORT.has(cfg.sort_by as SortBy)) {
      return { ok: false, error: `config.sort_by must be one of: ${Array.from(VALID_SORT).join(', ')}` }
    }
    if (cfg.verified_only !== undefined && typeof cfg.verified_only !== 'boolean') {
      return { ok: false, error: 'config.verified_only must be a boolean' }
    }
    if (cfg.min_rating !== undefined) {
      const v = cfg.min_rating
      if (typeof v !== 'number' || v < 1 || v > 5 || !Number.isInteger(v)) {
        return { ok: false, error: 'config.min_rating must be an integer 1–5' }
      }
    }
    if (cfg.max_rating !== undefined) {
      const v = cfg.max_rating
      if (typeof v !== 'number' || v < 1 || v > 5 || !Number.isInteger(v)) {
        return { ok: false, error: 'config.max_rating must be an integer 1–5' }
      }
    }
    if (
      cfg.min_rating !== undefined && cfg.max_rating !== undefined &&
      (cfg.min_rating as number) > (cfg.max_rating as number)
    ) {
      return { ok: false, error: 'config.min_rating must be ≤ config.max_rating' }
    }
    if (cfg.country !== undefined && !VALID_COUNTRIES.has(cfg.country as string)) {
      return { ok: false, error: `config.country must be one of: ${Array.from(VALID_COUNTRIES).join(', ')}` }
    }
  }

  return { ok: true, data: body as unknown as RequestBody }
}

// ── Route handlers ─────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(user.id, REVIEWS_COLLECT_LIMIT))) {
    return NextResponse.json({ error: 'Too many requests — please wait a moment' }, { status: 429 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const validated = validate(raw)
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 })
  }

  const { asin, config } = validated.data

  try {
    const collector = new ReviewCollector(undefined, config)
    const result    = await collector.collect(asin.trim().toUpperCase())

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown collection error'
    console.error('[/api/reviews/collect] error:', message, err)
    return NextResponse.json(
      { error: 'Collection failed', details: message },
      { status: 500 },
    )
  }
}

// ── Health check ───────────────────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  const { getDefaultProviders } = await import('@/lib/review-collector')
  const providers = getDefaultProviders().map(p => ({
    name:     p.name,
    enabled:  p.enabled,
    priority: p.priority,
  }))

  return NextResponse.json({
    status:    'ok',
    endpoint:  'POST /api/reviews/collect',
    providers,
    input: {
      asin:   'string — required (10-character Amazon ASIN)',
      config: 'object — optional tuning',
    },
    config_options: {
      max_reviews:   `number (1–${MAX_REVIEWS_CAP}, default 500)`,
      max_pages:     `number (1–${MAX_PAGES_CAP}, default 20)`,
      sort_by:       `"helpful" | "recent" | "top_rated" (default "helpful")`,
      verified_only: 'boolean (default false)',
      min_rating:    'number 1–5 (default none)',
      max_rating:    'number 1–5 (default none)',
      country:       `${Array.from(VALID_COUNTRIES).join(' | ')} (default "US")`,
    },
  })
}
