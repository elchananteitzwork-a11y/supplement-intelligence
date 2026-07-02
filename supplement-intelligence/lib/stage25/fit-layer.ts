import type {
  InvestmentThesis,
  FounderFitAnnotation,
  CapitalFit,
  ChannelFit,
  TimelineFit,
} from '../stage2/types'

// ── Founder Profile (mirrors founder_profiles DB row) ─────────────────────

export interface FounderProfile {
  id?:                      string
  user_id?:                 string
  capital_available:        number
  capital_confidence:       'committed' | 'estimated' | 'speculative'
  manufacturing_experience: 'none' | 'sourced_before' | 'established_relationships'
  regulatory_experience:    'none' | 'familiar' | 'certified'
  channel_type:             'none' | 'social_audience' | 'email_list' | 'retail_relationships' | 'wholesale' | 'multiple'
  channel_size?:            number
  target_geography:         'us_only' | 'multi_region' | 'international'
  time_horizon:             'under_6mo' | '6_to_18mo' | '18_plus_mo'
  risk_posture:             'capital_preservation' | 'balanced' | 'high_risk_tolerance'
  long_term_goal:           'lifestyle_business' | 'scale_to_exit' | 'strategic_asset'
}

// ── Capital fit ───────────────────────────────────────────────────────────

function scoreCapitalFit(profile: FounderProfile, thesis: InvestmentThesis): CapitalFit {
  const required = thesis.quick_economics_check.min_capital_required
  const available = profile.capital_available

  // Speculative capital gets a confidence haircut
  const effectiveAvailable =
    profile.capital_confidence === 'speculative' ? available * 0.6
    : profile.capital_confidence === 'estimated' ? available * 0.85
    : available

  const bufferPct = ((effectiveAvailable - required) / required) * 100

  const level =
    bufferPct >= 30  ? 'sufficient'
    : bufferPct >= 0 ? 'tight'
    : 'insufficient'

  const note =
    level === 'sufficient'
      ? `$${(effectiveAvailable / 1000).toFixed(0)}k available vs $${(required / 1000).toFixed(0)}k required — ${Math.round(bufferPct)}% buffer`
      : level === 'tight'
      ? `$${(effectiveAvailable / 1000).toFixed(0)}k available vs $${(required / 1000).toFixed(0)}k required — thin buffer; ${profile.capital_confidence === 'speculative' ? 'confidence haircut applied' : 'no contingency room'}`
      : `Capital shortfall: need $${(required / 1000).toFixed(0)}k, effective available $${(effectiveAvailable / 1000).toFixed(0)}k`

  return { level, capital_required: required, capital_available: available, buffer_pct: Math.round(bufferPct), note }
}

// ── Experience gaps ───────────────────────────────────────────────────────

function scoreExperienceGaps(profile: FounderProfile, thesis: InvestmentThesis): string[] {
  const gaps: string[] = []
  const complexity = thesis.quick_economics_check.launch_complexity
  const drivers    = thesis.quick_economics_check.complexity_drivers

  if (drivers.includes('formulation') && profile.manufacturing_experience === 'none') {
    gaps.push('No formulation/manufacturing experience — requires a contract manufacturer relationship')
  }
  if (drivers.includes('regulatory') && profile.regulatory_experience === 'none') {
    gaps.push('FDA labeling and supplement regulatory compliance experience missing')
  }
  if (drivers.includes('regulatory') && profile.regulatory_experience === 'familiar') {
    gaps.push('Regulatory familiarity without certification — increased compliance risk')
  }
  if (drivers.includes('cold-chain') && profile.manufacturing_experience === 'none') {
    gaps.push('Cold-chain logistics knowledge missing for this product type')
  }
  if (complexity === 'high' && profile.manufacturing_experience === 'none') {
    gaps.push('High-complexity launch with no manufacturing background — significant execution risk')
  }
  if (profile.target_geography !== 'us_only' && profile.manufacturing_experience === 'none') {
    gaps.push('International distribution complexity without supply-chain experience')
  }

  return gaps
}

// ── Channel fit ───────────────────────────────────────────────────────────

function scoreChannelFit(profile: FounderProfile, thesis: InvestmentThesis): ChannelFit {
  const { channel_type, channel_size } = profile
  const customer = thesis.target_customer.toLowerCase()

  // No channel is always a weak start
  if (channel_type === 'none') {
    return { level: 'weak', note: 'No existing channel — cold launch requires paid acquisition budget' }
  }

  // Social channel alignment check
  const isSocialProduct =
    customer.includes('fitness') || customer.includes('wellness') ||
    customer.includes('gym') || customer.includes('active') ||
    customer.includes('young') || customer.includes('millennial') ||
    customer.includes('gen z') || customer.includes('tiktok') ||
    customer.includes('instagram')

  if (channel_type === 'social_audience' || channel_type === 'multiple') {
    const size = channel_size ?? 0
    if (isSocialProduct && size >= 10_000) {
      return { level: 'strong', note: `Social audience of ${(size / 1000).toFixed(0)}k aligns with target customer profile` }
    }
    if (size >= 5_000) {
      return { level: 'partial', note: `Social audience of ${(size / 1000).toFixed(0)}k — moderate launch leverage` }
    }
    return { level: 'weak', note: `Social channel too small (${size.toLocaleString()} followers) for organic launch` }
  }

  if (channel_type === 'email_list') {
    const size = channel_size ?? 0
    if (size >= 5_000) {
      return { level: 'strong', note: `Email list of ${(size / 1000).toFixed(0)}k — high-intent launch channel` }
    }
    return { level: 'partial', note: `Email list of ${size.toLocaleString()} — limited reach for launch` }
  }

  if (channel_type === 'retail_relationships') {
    const isRetailProduct =
      customer.includes('mainstream') || customer.includes('older') ||
      customer.includes('senior') || customer.includes('retail') ||
      customer.includes('pharmacy') || customer.includes('grocery')
    return {
      level: isRetailProduct ? 'strong' : 'partial',
      note:  isRetailProduct
        ? 'Retail relationships align with mainstream product positioning'
        : 'Retail channel — DTC/Amazon-first strategy may be more efficient for this thesis',
    }
  }

  if (channel_type === 'wholesale') {
    return { level: 'partial', note: 'Wholesale relationships useful for B2B/professional channel; limited for DTC' }
  }

  return { level: 'partial', note: 'Channel presence provides some launch leverage' }
}

// ── Timeline fit ──────────────────────────────────────────────────────────

const COMPLEXITY_MIN_MONTHS: Record<string, number> = {
  low:    4,
  medium: 8,
  high:   14,
}

function scoreTimelineFit(profile: FounderProfile, thesis: InvestmentThesis): TimelineFit {
  const complexity = thesis.quick_economics_check.launch_complexity
  const minMonths  = COMPLEXITY_MIN_MONTHS[complexity]

  const horizonMonths =
    profile.time_horizon === 'under_6mo'  ? 6
    : profile.time_horizon === '6_to_18mo' ? 18
    : 36

  const slack = horizonMonths - minMonths

  if (slack >= 6) {
    return {
      level: 'feasible',
      note:  `${minMonths}mo minimum for ${complexity}-complexity launch fits within ${horizonMonths}mo horizon with ${slack}mo slack`,
    }
  }
  if (slack >= 0) {
    return {
      level: 'stretched',
      note:  `${minMonths}mo minimum for ${complexity}-complexity launch — only ${slack}mo buffer in ${horizonMonths}mo horizon`,
    }
  }
  return {
    level: 'infeasible',
    note:  `${complexity}-complexity launch requires ~${minMonths}mo minimum; ${horizonMonths}mo horizon is too short`,
  }
}

// ── Advantages ────────────────────────────────────────────────────────────

function scoreAdvantages(profile: FounderProfile, thesis: InvestmentThesis): string[] {
  const advantages: string[] = []

  if (profile.manufacturing_experience === 'established_relationships') {
    advantages.push('Established manufacturer relationships — faster sourcing, better MOQ terms')
  }
  if (profile.manufacturing_experience === 'sourced_before') {
    advantages.push('Prior sourcing experience reduces contract manufacturer search time')
  }
  if (profile.regulatory_experience === 'certified') {
    advantages.push('Regulatory certification — can self-manage FDA compliance without consultant')
  }
  if (profile.channel_type === 'social_audience' && (profile.channel_size ?? 0) >= 50_000) {
    advantages.push('Large social audience enables paid-free launch with organic validation first')
  }
  if (profile.channel_type === 'email_list' && (profile.channel_size ?? 0) >= 10_000) {
    advantages.push('Email list provides direct-to-customer launch vehicle — lower CAC')
  }
  if (profile.time_horizon === '18_plus_mo' && thesis.quick_economics_check.launch_complexity !== 'high') {
    advantages.push('Long runway allows iterative product development without capital pressure')
  }
  if (profile.risk_posture === 'high_risk_tolerance' && thesis.quick_economics_check.margin_viable) {
    advantages.push('High risk tolerance matches aggressive market entry strategy')
  }
  if (profile.long_term_goal === 'scale_to_exit' && thesis.quick_economics_check.margin_viable) {
    advantages.push('Exit-orientation aligns with building category-leader brand in growing market')
  }

  return advantages
}

// ── Composite fit rank (1–5) ──────────────────────────────────────────────

function computeFitRank(
  capital:    CapitalFit,
  channel:    ChannelFit,
  timeline:   TimelineFit,
  gaps:       string[],
  advantages: string[]
): number {
  let score = 3 // baseline

  // Capital
  if (capital.level === 'sufficient') score += 0.7
  if (capital.level === 'insufficient') score -= 1.5

  // Channel
  if (channel.level === 'strong')  score += 0.8
  if (channel.level === 'weak')    score -= 0.8

  // Timeline
  if (timeline.level === 'feasible')  score += 0.4
  if (timeline.level === 'infeasible') score -= 1.2

  // Experience gaps
  score -= Math.min(gaps.length * 0.4, 1.2)

  // Advantages
  score += Math.min(advantages.length * 0.3, 0.9)

  return Math.max(1, Math.min(5, Math.round(score)))
}

// ── Public API ────────────────────────────────────────────────────────────

export function scoreFit(
  profile:   FounderProfile,
  thesis:    InvestmentThesis,
  thesisId:  string,
  profileId: string
): FounderFitAnnotation {
  const capital    = scoreCapitalFit(profile, thesis)
  const gaps       = scoreExperienceGaps(profile, thesis)
  const channel    = scoreChannelFit(profile, thesis)
  const timeline   = scoreTimelineFit(profile, thesis)
  const advantages = scoreAdvantages(profile, thesis)
  const fit_rank   = computeFitRank(capital, channel, timeline, gaps, advantages)

  // Gaps summary (high-level)
  const gapsSummary: string[] = [...gaps]
  if (capital.level === 'insufficient') gapsSummary.push('Undercapitalized for this opportunity')
  if (timeline.level === 'infeasible')  gapsSummary.push('Time horizon too short for this complexity')

  return {
    thesis_id:          thesisId,
    founder_profile_id: profileId,
    fit_rank,
    capital_fit:        capital,
    experience_gaps:    gaps,
    channel_fit:        channel,
    timeline_fit:       timeline,
    advantages,
    gaps:               gapsSummary,
  }
}
