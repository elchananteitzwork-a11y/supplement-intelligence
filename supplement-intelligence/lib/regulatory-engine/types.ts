export type RegulatoryRiskLevel = 'Low' | 'Medium' | 'High' | 'Critical'

export interface AdverseEventStats {
  total_reports: number
  serious_reports: number
  hospitalization_count: number
  death_count: number
  top_reactions: string[]
  recent_trend: 'Increasing' | 'Stable' | 'Decreasing' | 'Unknown'
}

export interface RecallStats {
  total_recalls: number
  class_i_recalls: number
  class_ii_recalls: number
  class_iii_recalls: number
  recent_recall_descriptions: string[]
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
