// ── Normalized review (output of any provider) ────────────────────────────
// The Review Intelligence Engine consumes this type. It never knows or cares
// which provider produced it — the collector owns that concern.

export interface CollectedReview {
  // Identifiers
  id:   string   // unique within source; used for deduplication across providers
  asin: string

  // Core content
  title: string
  body:  string

  // Quality signals
  rating:       number    // 1–5
  verified:     boolean   // verified purchase badge
  helpful_votes: number

  // Metadata
  date:          string   // ISO 8601
  variation?:    string   // e.g. "Flavor: Vanilla | Size: 30 Servings"
  country?:      string   // ISO 3166-1 alpha-2, e.g. "US"
  reviewer_name?: string

  // Provenance (stripped before passing to ReviewEngine)
  source_provider: string  // "rainforest" | "scraper"
  collected_at:    string  // ISO 8601
}

// ── Collection result ──────────────────────────────────────────────────────

export interface CollectionResult {
  asin:             string
  reviews:          CollectedReview[]
  total_collected:  number
  total_available?: number        // declared by the provider (if known)
  providers_used:   string[]
  truncated:        boolean       // true when max_reviews limit was reached
  errors:           CollectionError[]
  collected_at:     string        // ISO 8601
}

export interface CollectionError {
  provider:  string
  message:   string
  code?:     string
  retried:   boolean
  timestamp: string
}

// ── Collector configuration ────────────────────────────────────────────────

export interface CollectorConfig {
  max_reviews:    number                           // default: 500
  max_pages:      number                           // per-provider, default: 20
  sort_by:        'helpful' | 'recent' | 'top_rated'  // default: helpful
  verified_only:  boolean                          // default: false
  min_rating?:    number                           // 1–5 filter (inclusive)
  max_rating?:    number                           // 1–5 filter (inclusive)
  country:        string                           // Amazon marketplace, default: "US"
  timeout_ms:     number                           // per HTTP request, default: 15_000
  max_retries:    number                           // per page attempt, default: 3
  retry_base_ms:  number                           // backoff base, default: 1_000
  retry_max_ms:   number                           // backoff ceiling, default: 30_000
}
