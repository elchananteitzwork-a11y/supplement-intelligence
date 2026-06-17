export type BuildDecision = 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP'

export interface OpportunityCard {
  name: string
  score: number
  rationale: string
  scores: {
    demand: number
    competition: number
    virality: number
    subscription: number
    manufacturing: number
    defensibility: number
  }
}
export type BuildVerdict  = 'YES' | 'MAYBE' | 'NO'

export interface DimScore {
  score: number
  notes: string
}

export interface Ingredient {
  ingredient: string
  dose:       string
  role:       string
  evidence:   string   // ★ to ★★★★★
}

export interface AdPhrase {
  they_say:    string
  use_in_copy: string
}

export interface MemoData {
  category_name:    string
  executive_summary: string
  build_verdict:    BuildVerdict
  build_decision:   BuildDecision
  build_explanation: string
  opportunity_score: number

  scores: {
    demand:        DimScore
    competition:   DimScore
    virality:      DimScore
    subscription:  DimScore
    manufacturing: DimScore
    defensibility: DimScore
  }

  biggest_competitor: {
    name:    string
    revenue: string
    gap:     string
  }

  market_size:  string
  sub_ltv:      string
  gross_margin: string

  market_gaps:        string[]   // 10 items
  brand_opportunities: string[]  // 10 items

  customer_language: {
    frustrations: string[]
    desires:      string[]
    fears:        string[]
    ad_phrases:   AdPhrase[]
  }

  product_recommendation: {
    format:        string
    dosing:        string
    formula:       Ingredient[]
    avoid:         string[]
    cogs_estimate: string
    retail_price:  string
    gross_margin:  string
  }

  financial_projections: {
    ten_k_probability:    string
    hundred_k_probability: string
    one_m_probability:    string
    gross_margin:         string
    net_margin_at_scale:  string
    subscription_ltv:     string
    path_to_10m:          string
  }
}

export interface Analysis {
  id:                 string
  user_id:            string
  created_at:         string
  raw_input:          string
  category_name:      string
  target_audience:    string | null
  price_point:        string | null
  score_demand:       number
  score_competition:  number
  score_virality:     number
  score_subscription: number
  score_manufacturing: number
  score_defensibility: number
  opportunity_score:  number
  build_decision:     BuildDecision
  memo_data:          MemoData
  biggest_competitor: string | null
  market_size:        string | null
  sub_ltv:            string | null
  gross_margin:       string | null
  generation_ms:      number | null
}

export interface LeaderboardRow {
  id:                uuid
  category_name:     string
  opportunity_score: number
  build_decision:    BuildDecision
  biggest_competitor: string | null
  market_size:       string | null
  sub_ltv:           string | null
  analysis_count:    number
  last_analyzed:     string
}

export interface Profile {
  id:              string
  email:           string
  analyses_used:   number
  analyses_limit:  number
}

// helper
type uuid = string
