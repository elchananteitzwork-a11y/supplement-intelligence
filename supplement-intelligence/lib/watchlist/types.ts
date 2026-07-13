import type { KillCriterion } from '@/lib/kill-criteria'
import type { LifecycleStage } from '@/lib/lifecycle'

export interface WatchlistEntry {
  id:          string
  created_at:  string
  user_id:     string
  analysis_id: string

  category_name: string
  category_id:   string

  active: boolean

  lifecycle_stage_at_watch: LifecycleStage | null
  kill_criteria:            KillCriterion[]

  last_checked_at:      string | null
  last_lifecycle_stage: LifecycleStage | null
}

export type WatchlistAlertType = 'stage_transition' | 'kill_criteria_triggered'

export interface WatchlistAlert {
  id:           string
  created_at:   string
  watchlist_id: string
  user_id:      string
  alert_type:   WatchlistAlertType

  previous_stage: LifecycleStage | null
  new_stage:      LifecycleStage | null

  kill_criterion_key:   string | null
  kill_criterion_label: string | null

  acknowledged: boolean
}
