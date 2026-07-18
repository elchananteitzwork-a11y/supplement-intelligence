export type RegulatoryRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface AdverseEventStats {
  // Raw, honest openFDA meta.total for the base products.name_brand text
  // match — unfiltered, may include reports where this ingredient is only a
  // CONCOMITANT (co-occurring, not causally suspected) product.
  total_reports: number
  // Of `sample_size` inspected report bodies, how many actually name this
  // ingredient's own products[] entry with role === 'SUSPECT' — the
  // causally-implicated subset (see reportImplicatesIngredient()).
  implicated_reports: number
  // Real openFDA CAERS report bodies have no `serious` field (live-confirmed
  // 2026-07-18: report shape is report_number/outcomes/date_created/
  // reactions/date_started/consumer/products — no `serious` key exists, and
  // querying `serious:1` 404s unconditionally). This is therefore an honest
  // proxy, not a queried field: the count of causally-implicated reports
  // (implicated_reports) with a hospitalization or death outcome, deduped so
  // a report with both isn't double-counted — see fetchAdverseEvents().
  serious_reports: number
  // Derived ONLY from the implicated subset — see fetchAdverseEvents().
  hospitalization_count: number
  death_count: number
  top_reactions: string[]
  recent_trend: 'Increasing' | 'Stable' | 'Decreasing' | 'Unknown'
  // Number of report bodies actually fetched/inspected for SUSPECT-role
  // filtering (<= total_reports; openFDA has no server-side way to filter by
  // a specific product's role, so implication filtering is necessarily
  // sample-based — disclosed here rather than presented as exhaustive).
  sample_size: number
}

export interface RecallStats {
  // Raw, honest openFDA meta.total for the base product_description text
  // match — unfiltered, may include recalls where this ingredient is only a
  // minor/excipient mention (e.g. "magnesium stearate") unrelated to the
  // actual recall reason.
  total_recalls: number
  // Of `sample_size` inspected recall records, how many actually name this
  // ingredient in the FDA's own stated reason_for_recall — the
  // causally-implicated subset.
  implicated_recalls: number
  // Class breakdown derived ONLY from the implicated subset.
  class_i_recalls: number
  class_ii_recalls: number
  class_iii_recalls: number
  recent_recall_descriptions: string[]
  // Number of recall records actually fetched/inspected for causal-relevance
  // filtering (<= total_recalls).
  sample_size: number
}

export interface RegulatoryIntelligence {
  query_term: string
  ingredient_searched: string
  adverse_events: AdverseEventStats | null
  recalls: RecallStats | null
  risk_level: RegulatoryRiskLevel
  risk_summary: string
  warning_flags: string[]
  confidence: number
  data_sources: string[]
  fetched_at: string
  disclaimer: string
}
