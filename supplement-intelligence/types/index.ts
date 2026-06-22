export type BuildDecision = 'BUILD_NOW' | 'VALIDATE_FURTHER' | 'SKIP'

// Server-computed; never produced by the AI. Optional for backward compat.
export interface OpportunityMeta {
  week_added:  string   // ISO week this opp first appeared, e.g. "2026-W25"
  is_new:      boolean  // true on the week it first appeared in the cache
  score_delta: number   // 0 for new items; signed Δ vs previous week for retained items
  trending:    boolean  // score_delta > 0
}

export type CacheStatus = 'generated' | 'refreshed' | 'cached' | 'updated'

export interface OpportunityCard {
  name: string
  score: number
  rationale: string
  startup_cost: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  launch_time: string
  _meta?: OpportunityMeta  // server-added after AI response, not in AI output
  scores: {
    demand: {
      score: number
      search_volume: string              // e.g. "82k/month"
      trend: string                      // e.g. "+21% YoY" | "Stable"
      signal: 'Strong' | 'Moderate' | 'Weak'
    }
    competition: {
      score: number
      competing_brands: string           // e.g. "120+" | "15–30"
      saturation: 'Low' | 'Medium' | 'Medium-High' | 'High'
      barrier: 'Low' | 'Medium' | 'High'
    }
    virality: {
      score: number
      tiktok: 'High' | 'Medium' | 'Low'
      content_potential: 'High' | 'Medium' | 'Low'
      ugc: 'High' | 'Medium' | 'Low'
    }
    subscription: {
      score: number
      repeat_cycle: string               // e.g. "30 days"
      retention: 'High' | 'Medium' | 'Low'
    }
    manufacturing: {
      score: number
      complexity: 'Low' | 'Medium' | 'High'
      moq: string                        // e.g. "500–1,000 units"
    }
    defensibility: {
      score: number
      rationale: string                  // ≤10-word reason why differentiation is easy/hard
    }
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

  // ── Analyst-voice synthesis (added v2) — optional for backward compat ──
  market_thesis?: string   // 2–4 sentence investment thesis in senior analyst voice
  why_now?:       string   // 2–3 sentences on why this timing window is open

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
