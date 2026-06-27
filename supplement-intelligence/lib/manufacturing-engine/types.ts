// ── Manufacturing Intelligence — core types ─────────────────────────────────

export type ManufacturingComplexity = 'Low' | 'Medium' | 'High' | 'Very High'
export type ConfidenceLabel         = 'High' | 'Medium' | 'Low'
export type ProviderId              = 'ai_synthesis' | 'alibaba' | 'apify' | 'made_in_china' | 'global_sources'

export interface CostRange {
  low:      number
  high:     number
  currency: 'USD'
}

export interface MOQRange {
  low:  number
  high: number
  unit: string  // "units" | "kg" | "liters" etc.
}

export interface LeadTimeRange {
  low:  number  // days
  high: number
}

export interface ManufacturingEstimate {
  product:            string
  category:           string
  // 2026-06-26 evidence-first redesign: these five fields are optional
  // because the ai_synthesis fallback (no real supplier data available)
  // no longer fabricates them — it returns undefined/null instead of an
  // invented cost/MOQ/lead-time/supplier-count/rating. They are always
  // populated by the real Apify provider when it succeeds.
  unit_cost?:          CostRange
  moq?:                MOQRange
  supplier_count?:     { estimate: number; confidence: ConfidenceLabel }
  top_supplier_rating: number | null   // 0–5, null if unknown or unverified
  lead_time_days?:     LeadTimeRange
  complexity:         ManufacturingComplexity
  confidence:         number           // 0–1
  confidence_label:   ConfidenceLabel
  data_source:        ProviderId
  notes:              string
  fetched_at:         string           // ISO timestamp
  // Real named suppliers behind the aggregates above (2026-06-26 data-
  // coverage audit) — companyName was already fetched by the Apify
  // provider (xtracto/alibaba-search-scraper) but never read; a "Supplier
  // Count: 14" with no names attached gives no actual diligence trail.
  // Identity-only — never invented, never AI-paraphrased.
  top_suppliers?: {
    name:                 string
    rating?:               number | null
    trade_assurance?:      boolean
    gold_supplier_years?:  string
  }[]
}

export interface ManufacturingRequest {
  product:     string
  category:    string
  complexity?: string   // hint from opportunity card ("Low" | "Medium" | "High")
}

// Provider interface — designed for future Alibaba/MIC/GS integrations
export interface ManufacturingProvider {
  readonly id:      ProviderId
  readonly enabled: boolean
  fetch(req: ManufacturingRequest): Promise<ManufacturingEstimate | null>
}
