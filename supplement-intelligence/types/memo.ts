export interface MemoScore {
  score: number
  notes: string
}

export interface FormulaIngredient {
  ingredient: string
  dose: string
  role: string
  evidence: string
}

export interface AdPhrase {
  they_say: string
  use_in_copy: string
}

export interface MemoData {
  category_name: string
  executive_summary: string
  build_verdict: 'YES' | 'MAYBE' | 'NO'

  scores: {
    demand: MemoScore
    competition: MemoScore
    virality: MemoScore
    subscription: MemoScore
    manufacturing: MemoScore
    defensibility: MemoScore
  }

  opportunity_score: number
  build_decision: 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP'
  build_explanation: string

  biggest_competitor: {
    name: string
    revenue: string
    gap: string
  }

  market_size: string
  sub_ltv: string
  gross_margin: string

  market_gaps: string[]
  brand_opportunities: string[]

  customer_language: {
    frustrations: string[]
    desires: string[]
    fears: string[]
    ad_phrases: AdPhrase[]
  }

  product_recommendation: {
    format: string
    dosing: string
    formula: FormulaIngredient[]
    avoid: string[]
    cogs_estimate: string
    retail_price: string
    gross_margin: string
  }

  financial_projections: {
    ten_k_probability: string
    hundred_k_probability: string
    one_m_probability: string
    gross_margin: string
    net_margin_at_scale: string
    subscription_ltv: string
    path_to_10m: string
  }
}

export interface Analysis {
  id: string
  user_id: string
  created_at: string
  raw_input: string
  category_name: string
  target_audience: string | null
  price_point: string | null
  extra_context: string | null
  score_demand: number
  score_competition: number
  score_virality: number
  score_subscription: number
  score_manufacturing: number
  score_defensibility: number
  opportunity_score: number
  build_decision: 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP'
  build_verdict: 'YES' | 'MAYBE' | 'NO'
  memo_data: MemoData
  biggest_competitor_name: string | null
  biggest_competitor_revenue: string | null
  market_size: string | null
  sub_ltv: string | null
  gross_margin: string | null
  generation_time_ms: number | null
}

export interface LeaderboardEntry {
  id: string
  category_name: string
  opportunity_score: number
  build_decision: 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP'
  biggest_competitor: string | null
  market_size: string | null
  sub_ltv: string | null
  analysis_count: number
  last_analyzed: string
}

export interface Profile {
  id: string
  email: string
  full_name: string | null
  beta_tier: string
  analyses_used: number
  analyses_limit: number
  created_at: string
}

export interface FeedbackPayload {
  analysis_id: string
  rating: number
  category: string
  comment?: string
}
