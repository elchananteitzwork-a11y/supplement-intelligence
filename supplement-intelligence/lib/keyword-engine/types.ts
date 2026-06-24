// A single keyword's real metrics — every field here is either pulled
// directly from DataForSEO or computed with simple, disclosed arithmetic
// over their real monthly_searches history. Nothing here is model output.
export interface KeywordMetric {
  keyword:          string
  monthly_searches: number
  growth_pct:       number | null   // null when there isn't enough monthly history to compute a trend
  competition:      number | null   // 0–1, DataForSEO's own competition index
  difficulty:       number | null   // 0–100, DataForSEO's own keyword_difficulty
  cpc:              number | null   // USD, real advertiser bid data
}

export interface KeywordIntelligence {
  seed_keyword: string
  top_buying:   KeywordMetric[]   // highest search volume — what people actually type
  opportunity:  KeywordMetric[]   // real demand + real low competition/difficulty
  long_tail:    KeywordMetric[]   // 3+ word phrases, sorted by volume
  fast_growing: KeywordMetric[]   // highest computed growth_pct, sorted desc
  provider:     string
  fetched_at:   string
}

export interface KeywordProvider {
  readonly name:    string
  readonly enabled: boolean
  fetch(seedKeyword: string): Promise<KeywordIntelligence | null>
}
