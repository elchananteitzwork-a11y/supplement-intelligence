import type { BuildDecision } from '@/types/index'

// ── Positions — V4 Phase 1 (Pull) ────────────────────────────────────────────
// docs/RD_V4_PHASE1.md §3 items 1/2/4 / V4_PRODUCT_ARCHITECTURE.md §5 S-Pull.
// Typed client helpers for the Stream/Brief/Pull frontend — thin fetch
// wrappers + the shared TS types. No business logic here (that lives in the
// route handlers under app/api/positions and app/api/events); this module
// is the frontend's single import surface for both.

export type PositionState = 'validating' | 'watching' | 'killed'

export const POSITION_STATES: PositionState[] = ['validating', 'watching', 'killed']

export function isPositionState(v: unknown): v is PositionState {
  return typeof v === 'string' && (POSITION_STATES as string[]).includes(v)
}

// Real shape produced by components/memo/shared.tsx's deriveSuccessMetrics()
// (plain-language sentences, e.g. "3 new competitor listings in 90 days") —
// the Pull flow snapshots that exact array at commit time. Kept as the
// documented, expected shape; the DB column itself is a generic jsonb (see
// supabase/migrations/029_positions.sql) so a caller is never blocked by a
// client-side type mismatch.
export type SuccessMetrics = string[]

export interface Position {
  analysisId:      string
  state:            PositionState
  successMetrics:   SuccessMetrics | null
  killReason:       string | null
  createdAt:        string
  categoryName:     string
  decision:         BuildDecision | null
  // Fix-and-resubmit cycle (independent review finding 1, honesty):
  // `decision` above is the raw, persisted `analyses.build_decision` —
  // computeGroundedScore stores 'SKIP' there as an internal artifact when
  // insufficientEvidence is true (lib/scoring.ts), which is NOT a real "Not
  // Supported" market judgment. The Brief re-derives this honestly via
  // lib/partner-copy.ts's verdictWord(); this flag lets any other real
  // consumer of `decision` (e.g. PositionsStrip) do the same, instead of
  // rendering the raw SKIP label. Computed server-side per row from the
  // real memo_data (see app/api/positions/route.ts) — never inferred
  // client-side from `decision` alone.
  insufficientEvidence: boolean
}

export interface PositionsResponse {
  positions: Position[]
}

export interface UpsertPositionInput {
  analysisId:      string
  state:            PositionState
  successMetrics?:  SuccessMetrics
  killReason?:      string
}

export interface UpsertPositionResponse {
  position: Position
}

export const PRODUCT_EVENTS = [
  'verdict_viewed',
  'claim_tapped',
  'pull_committed',
  'returned_after_trip',
] as const

export type ProductEventName = (typeof PRODUCT_EVENTS)[number]

export function isProductEventName(v: unknown): v is ProductEventName {
  return typeof v === 'string' && (PRODUCT_EVENTS as readonly string[]).includes(v)
}

export interface LogEventInput {
  event:       ProductEventName
  analysisId?: string
}

// ── Fetch wrappers ────────────────────────────────────────────────────────
// Thin, honest wrappers: no retry, no silent fallback. A 503 (migration
// pending) or any other non-2xx response throws with the server's own error
// string so the caller can decide how to degrade — never swallowed here.

async function readJsonError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (body && typeof body.error === 'string') return body.error
  } catch {
    // fall through to the generic message below
  }
  return `Request failed (${res.status})`
}

export async function fetchPositions(): Promise<PositionsResponse> {
  const res = await fetch('/api/positions', { method: 'GET' })
  if (!res.ok) throw new Error(await readJsonError(res))
  return res.json() as Promise<PositionsResponse>
}

export async function upsertPosition(input: UpsertPositionInput): Promise<UpsertPositionResponse> {
  const res = await fetch('/api/positions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readJsonError(res))
  return res.json() as Promise<UpsertPositionResponse>
}

export async function logEvent(input: LogEventInput): Promise<void> {
  const res = await fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new Error(await readJsonError(res))
}
