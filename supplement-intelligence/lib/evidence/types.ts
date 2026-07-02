// EvidencePoint type system: every data point in the pipeline carries its provenance.
// source_type enforces a strict 4-tier hierarchy — no AI value can claim primary_measurement.

export type SourceType =
  | 'primary_measurement'  // Raw provider data (Keepa price, DataForSEO volume, Apify reviews)
  | 'provider_model'       // Provider's own modeling (Keepa BSR, DataForSEO CPC estimates)
  | 'ai_synthesis'         // Claude interpretation of raw data (do NOT use for verdicts/kill-switches)
  | 'computed'             // Deterministic arithmetic on primary measurements (breakeven COGS, gate logic)

export interface EvidencePoint<T = unknown> {
  value: T
  source: string          // Human-readable: "Keepa ASIN stats", "DataForSEO SERP", etc.
  source_type: SourceType
  methodology?: string    // How value was derived (required for computed & ai_synthesis)
  freshness_date: string  // ISO date string when the underlying data was fetched
  sample_size?: number    // N products, N reviews, N keywords, etc.
  scope_note?: string     // "US Amazon only", "90-day window", etc.
}

// Typed wrappers for the common value shapes used in Stage 1 signal_data
export type NumericEvidence = EvidencePoint<number>
export type StringEvidence = EvidencePoint<string>
export type BooleanEvidence = EvidencePoint<boolean>
export type RangeEvidence = EvidencePoint<{ min: number; max: number; median?: number }>

// Convenience ctor — avoids spreading the same fields everywhere
export function toEvidencePoint<T>(
  value: T,
  source: string,
  source_type: SourceType,
  opts?: {
    methodology?: string
    freshness_date?: string
    sample_size?: number
    scope_note?: string
  }
): EvidencePoint<T> {
  return {
    value,
    source,
    source_type,
    freshness_date: opts?.freshness_date ?? new Date().toISOString().slice(0, 10),
    ...(opts?.methodology !== undefined && { methodology: opts.methodology }),
    ...(opts?.sample_size !== undefined && { sample_size: opts.sample_size }),
    ...(opts?.scope_note !== undefined && { scope_note: opts.scope_note }),
  }
}
