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
  unit_cost:          CostRange
  moq:                MOQRange
  supplier_count:     { estimate: number; confidence: ConfidenceLabel }
  top_supplier_rating: number | null   // 0–5, null if unknown
  lead_time_days:     LeadTimeRange
  complexity:         ManufacturingComplexity
  confidence:         number           // 0–1
  confidence_label:   ConfidenceLabel
  data_source:        ProviderId
  notes:              string
  fetched_at:         string           // ISO timestamp
}

export interface ManufacturingRequest {
  product:     string
  category:    string
  complexity?: string   // hint from opportunity card ("Low" | "Medium" | "High")
  moq_hint?:   string   // text MOQ from discovery card (e.g. "500–1,000 units")
}

// Provider interface — designed for future Alibaba/MIC/GS integrations
export interface ManufacturingProvider {
  readonly id:      ProviderId
  readonly enabled: boolean
  fetch(req: ManufacturingRequest): Promise<ManufacturingEstimate | null>
}
