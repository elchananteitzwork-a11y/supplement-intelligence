import { NextResponse }           from 'next/server'
import { CompetitiveReviewEngine } from '@/lib/competitive-review-engine'
import type { CompetitiveEngineOptions } from '@/lib/competitive-review-engine'

// Long-running: 10 products × 100 reviews × analysis + AI calls
export const maxDuration = 300

// ── Validation constants ───────────────────────────────────────────────────

const ASIN_RE           = /^[A-Z0-9]{10}$/i
const MAX_EXPLICIT_ASINS = 20
const VALID_SORT         = new Set(['helpful', 'recent'])
const VALID_COUNTRIES    = new Set(['US','GB','CA','AU','DE','FR','IT','ES','JP','MX','IN'])

// ── Input shape ────────────────────────────────────────────────────────────

interface RequestBody {
  // Exactly one of:
  category_node_id?: number     // Keepa category node → auto-resolve ASINs
  asins?:            string[]   // explicit competitor ASINs

  // Optional context
  category_name?:  string

  // Optional tuning (mirrors CompetitiveEngineOptions)
  max_products?:         number
  reviews_per_product?:  number
  product_concurrency?:  number
  sort_by?:              'helpful' | 'recent'
  country?:              string
}

// ── Validation ─────────────────────────────────────────────────────────────

type ValidationOk     = { ok: true;  data: RequestBody }
type ValidationFail   = { ok: false; error: string }
type ValidationResult = ValidationOk | ValidationFail

function validate(raw: unknown): ValidationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Request body must be a JSON object' }
  }
  const body = raw as Record<string, unknown>

  // Require exactly one of category_node_id or asins
  const hasNode = body.category_node_id !== undefined
  const hasASINs = body.asins !== undefined

  if (!hasNode && !hasASINs) {
    return { ok: false, error: 'Provide either `category_node_id` (Keepa node) or `asins` (string[])' }
  }
  if (hasNode && hasASINs) {
    return { ok: false, error: 'Provide only one of `category_node_id` or `asins`, not both' }
  }

  // Validate category_node_id
  if (hasNode) {
    const v = body.category_node_id
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
      return { ok: false, error: '`category_node_id` must be a positive integer' }
    }
  }

  // Validate explicit ASIN list
  if (hasASINs) {
    const asins = body.asins
    if (!Array.isArray(asins) || asins.length === 0) {
      return { ok: false, error: '`asins` must be a non-empty array' }
    }
    if (asins.length > MAX_EXPLICIT_ASINS) {
      return { ok: false, error: `Maximum ${MAX_EXPLICIT_ASINS} ASINs per request` }
    }
    for (let i = 0; i < asins.length; i++) {
      if (typeof asins[i] !== 'string' || !ASIN_RE.test(asins[i] as string)) {
        return { ok: false, error: `asins[${i}] is not a valid ASIN (10 alphanumeric characters)` }
      }
    }
  }

  // category_name
  if (body.category_name !== undefined && typeof body.category_name !== 'string') {
    return { ok: false, error: '`category_name` must be a string' }
  }

  // max_products
  if (body.max_products !== undefined) {
    const v = body.max_products
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 2 || v > 20) {
      return { ok: false, error: '`max_products` must be an integer 2–20' }
    }
  }

  // reviews_per_product
  if (body.reviews_per_product !== undefined) {
    const v = body.reviews_per_product
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 10 || v > 500) {
      return { ok: false, error: '`reviews_per_product` must be an integer 10–500' }
    }
  }

  // product_concurrency
  if (body.product_concurrency !== undefined) {
    const v = body.product_concurrency
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      return { ok: false, error: '`product_concurrency` must be an integer 1–5' }
    }
  }

  // sort_by
  if (body.sort_by !== undefined && !VALID_SORT.has(body.sort_by as string)) {
    return { ok: false, error: `\`sort_by\` must be one of: ${Array.from(VALID_SORT).join(', ')}` }
  }

  // country
  if (body.country !== undefined && !VALID_COUNTRIES.has(body.country as string)) {
    return { ok: false, error: `\`country\` must be one of: ${Array.from(VALID_COUNTRIES).join(', ')}` }
  }

  return { ok: true, data: body as unknown as RequestBody }
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<NextResponse> {
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

  const body = validated.data

  // Build engine options from request body
  const engineOptions: Partial<CompetitiveEngineOptions> = {}
  if (body.max_products        !== undefined) engineOptions.max_products        = body.max_products
  if (body.reviews_per_product !== undefined) engineOptions.reviews_per_product = body.reviews_per_product
  if (body.product_concurrency !== undefined) engineOptions.product_concurrency = body.product_concurrency
  if (body.sort_by             !== undefined) engineOptions.sort_by             = body.sort_by as 'helpful' | 'recent'
  if (body.country             !== undefined) engineOptions.country             = body.country

  try {
    const engine = new CompetitiveReviewEngine()

    let report
    if (body.category_node_id !== undefined) {
      // Keepa path: requires KEEPA_API_KEY
      report = await engine.analyzeByNode(
        body.category_node_id,
        engineOptions,
        body.category_name,
      )
    } else {
      // Explicit ASIN path
      report = await engine.analyzeByASINs(
        (body.asins as string[]).map(a => a.toUpperCase()),
        engineOptions,
        { categoryName: body.category_name },
      )
    }

    return NextResponse.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    const isUserError =
      message.includes('KEEPA_API_KEY') ||
      message.includes('No competitors found') ||
      message.includes('CompetitiveReviewEngine:')

    console.error('[/api/reviews/competitive] error:', message, err)
    return NextResponse.json(
      { error: isUserError ? message : 'Competitive analysis failed — please try again' },
      { status: isUserError ? 400 : 500 },
    )
  }
}

// ── Health / capability check ──────────────────────────────────────────────

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status:   'ok',
    endpoint: 'POST /api/reviews/competitive',
    requires: {
      KEEPA_API_KEY:     `${process.env.KEEPA_API_KEY ? '✓ set' : '✗ missing'} (required for category_node_id mode)`,
      RAINFOREST_API_KEY: `${process.env.RAINFOREST_API_KEY ? '✓ set' : '✗ missing (scraper fallback active)'}`,
      ANTHROPIC_API_KEY: `${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ missing'}`,
    },
    input: {
      category_node_id:  'number  — Keepa category node (resolves ASINs automatically)',
      asins:             'string[] — explicit competitor ASINs (bypasses Keepa)',
      category_name:     'string  — optional label for the report',
      max_products:      'number  2–20 (default 10)',
      reviews_per_product: 'number 10–500 (default 100)',
      product_concurrency: 'number 1–5 (default 3)',
      sort_by:           '"helpful" | "recent" (default "helpful")',
      country:           `${Array.from(VALID_COUNTRIES).join(' | ')} (default "US")`,
    },
    output_scores: [
      'market_pain_score        0–10',
      'market_opportunity_score 0–10',
      'gap_score                0–10',
      'competition_risk         0–10',
      'market_confidence        0–1',
    ],
  })
}
