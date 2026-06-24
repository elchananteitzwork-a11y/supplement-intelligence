// ── Thesis Orchestrator — Step 1 ─────────────────────────────────────────
//
// Core synthesis loop: ThesisRequest → signals → Claude → MarketThesis
//
// Step 1 uses the existing signal-engine as the data source (adapting
// AggregatedSignals → Signal[]). Future SignalProvider implementations
// in this directory will plug in directly via the provider registry.

import { randomUUID }         from 'crypto'
import Anthropic              from '@anthropic-ai/sdk'
import { signalEngine }       from '@/lib/signal-engine'
import type {
  AggregatedSignals,
  AggregatedDimension,
  SignalScore,
}                             from '@/lib/signal-engine/types'
import { getThesis, setThesis } from './cache'
import {
  THESIS_ENGINE_VERSION,
  THESIS_CACHE_TTL,
  CONVERGENCE_BOOST,
} from './types'
import type {
  MarketThesis,
  ThesisRequest,
  ThesisDepth,
  ThesisEvent,
  Signal,
  SignalCategory,
  SignalType,
  SignalDirection,
  SignalCluster,
  QueryIntent,
  ProviderContribution,
  SourceAttribution,
  ConfidenceScore,
  ConfidenceLabel,
  ProviderId,
  VerdictSection,
  TimingSection,
  MarketFailureSection,
  DifficultySection,
  ProductThesisSection,
  RiskItem,
  ScopeLimitation,
} from './types'

const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Query normalization ────────────────────────────────────────────────────

export function normalizeQuery(query: string): string {
  return query.toLowerCase().replace(/\s+/g, ' ').trim()
}

// ── Intent classification ──────────────────────────────────────────────────

export function classifyIntent(query: string): QueryIntent {
  const q = query.trim()

  if (/^B0[A-Z0-9]{8}$/i.test(q)) {
    return { type: 'asin', asin: q.toUpperCase() }
  }

  const parts = q.split(',').map(s => s.trim())
  if (parts.length > 1 && parts.every(p => /^B0[A-Z0-9]{8}$/i.test(p))) {
    return { type: 'asins', asins: parts.map(p => p.toUpperCase()) }
  }

  const problemPhrases = ['help me', 'why does', 'why do', 'how to', "can't", 'cannot', 'struggle', 'problem']
  if (problemPhrases.some(p => q.toLowerCase().includes(p))) {
    return { type: 'problem', description: q }
  }

  return { type: 'keyword', terms: q.split(/\s+/).filter(Boolean) }
}

// ── Confidence helpers ─────────────────────────────────────────────────────

function toConfidenceLabel(value: number): ConfidenceLabel {
  if (value >= 0.90) return 'VERY_HIGH'
  if (value >= 0.75) return 'HIGH'
  if (value >= 0.55) return 'MODERATE'
  if (value >= 0.35) return 'LOW'
  return 'PRELIMINARY'
}

function makeConfidence(
  value:       number,
  providers:   ProviderId[],
  supports:    string,
  limits:      string,
  convergence  = false,
): ConfidenceScore {
  const boosted = convergence
    ? Math.min(value + CONVERGENCE_BOOST.confidence_add, CONVERGENCE_BOOST.max_value)
    : value
  return {
    value:       boosted,
    label:       toConfidenceLabel(boosted),
    supports,
    limits,
    convergence,
    providers,
  }
}

// ── Signal adapter: AggregatedSignals → Signal[] ──────────────────────────
// Bridges the existing signal-engine output to the thesis-engine Signal type.

function makeSignal(
  id:          string,
  type:        SignalType,
  category:    SignalCategory,
  direction:   SignalDirection,
  magnitude:   number,           // 0–1
  topic_key:   string,
  description: string,
  providers:   ProviderId[],
  confidence:  ConfidenceScore,
): Signal {
  return {
    id,
    type,
    category,
    direction,
    description,
    magnitude,
    topic_key,
    evidence:    [],
    confidence,
    providers,
    observed_at: new Date().toISOString(),
  }
}

function dimToDirection(score: number): SignalDirection {
  return score >= 6 ? 'positive' : score >= 4 ? 'neutral' : 'negative'
}

export function adaptAggregatedSignals(agg: AggregatedSignals, query: string): Signal[] {
  const signals: Signal[] = []
  const now = new Date().toISOString()
  let seq = 0

  const id = (cat: string) => `sig_${cat}_${seq++}`

  if (agg.demand) {
    const d   = agg.demand.value
    const src = agg.demand.sources as ProviderId[]
    const conf = makeConfidence(
      agg.demand.confidence, src,
      `Demand data from ${src.join(', ')}`,
      'Search volume may not reflect purchase intent directly',
    )
    signals.push(makeSignal(
      id('demand'), 'demand', 'market_demand',
      dimToDirection(d.score), d.score / 10,
      'market-demand',
      `Market demand score ${d.score}/10 for "${query}"${d.search_volume ? ` — ${d.search_volume} monthly searches` : ''}.`,
      src, conf,
    ))
    if (d.trend) {
      signals.push(makeSignal(
        id('search_trend'), 'trend', 'search_momentum',
        d.trend.startsWith('+') ? 'positive' : d.trend.startsWith('-') ? 'negative' : 'neutral',
        d.score / 10,
        'search-trend',
        `Search trend: ${d.trend} — demand is ${d.signal?.toLowerCase() ?? 'moderate'}.`,
        src, conf,
      ))
    }
  }

  if (agg.competition) {
    const c   = agg.competition.value
    const src = agg.competition.sources as ProviderId[]
    // High competition (high score) is a negative signal for entry
    const dir: SignalDirection = c.score >= 7 ? 'negative' : c.score >= 4 ? 'neutral' : 'positive'
    signals.push(makeSignal(
      id('competition'), 'barrier', 'market_saturation',
      dir, c.score / 10,
      'market-saturation',
      `Competition: ${c.saturation ?? 'Medium'} saturation with ~${c.competing_brands ?? 'unknown'} brands. Entry barrier: ${c.barrier ?? 'Medium'}.`,
      src,
      makeConfidence(agg.competition.confidence, src,
        `Competition data from ${src.join(', ')}`,
        'Brand count may undercount private-label products',
      ),
    ))
  }

  if (agg.growth) {
    const g   = agg.growth.value
    const src = agg.growth.sources as ProviderId[]
    signals.push(makeSignal(
      id('growth'), 'trend', 'trend_velocity',
      dimToDirection(g.score), g.score / 10,
      'trend-velocity',
      `YoY growth: ${g.yoy_change ?? 'unknown'} — momentum is ${g.momentum ?? 'Stable'}.`,
      src,
      makeConfidence(agg.growth.confidence, src,
        `Growth trend from ${src.join(', ')}`,
        'Historical trend may not predict near-term trajectory',
      ),
    ))
  }

  if (agg.seasonality) {
    const s   = agg.seasonality.value
    const src = agg.seasonality.sources as ProviderId[]
    signals.push(makeSignal(
      id('seasonality'), 'demand', 'subscription_potential',
      dimToDirection(s.score), s.score / 10,
      'seasonality-subscription',
      `Purchase pattern: ${s.pattern ?? 'Perennial'} — ${s.score >= 7 ? 'strong' : 'moderate'} subscription potential.`,
      src,
      makeConfidence(agg.seasonality.confidence, src,
        `Seasonality data from ${src.join(', ')}`,
        'May not capture regional variation',
      ),
    ))
  }

  if (agg.pricing) {
    const p   = agg.pricing.value
    const src = agg.pricing.sources as ProviderId[]
    signals.push(makeSignal(
      id('pricing'), 'opportunity', 'pricing_signal',
      p.premium_viable ? 'positive' : 'neutral', p.score / 10,
      'pricing-opportunity',
      `Avg price: ${p.avg_price ?? 'unknown'} (range ${p.price_range ?? 'unknown'}). Premium positioning ${p.premium_viable ? 'viable' : 'constrained'}.`,
      src,
      makeConfidence(agg.pricing.confidence, src,
        `Pricing data from ${src.join(', ')}`,
        'Prices may shift with market entrants',
      ),
    ))
  }

  if (agg.virality) {
    const v   = agg.virality.value
    const src = agg.virality.sources as ProviderId[]
    signals.push(makeSignal(
      id('virality'), 'opportunity', 'viral_potential',
      dimToDirection(v.score), v.score / 10,
      'viral-potential',
      `Viral potential: TikTok ${v.tiktok ?? 'Medium'}, UGC ${v.ugc ?? 'Medium'}, content ${v.content_potential ?? 'Medium'}.`,
      src,
      makeConfidence(agg.virality.confidence, src,
        `Virality signals from ${src.join(', ')}`,
        'TikTok trends can reverse quickly',
      ),
    ))
  }

  if (agg.review_velocity) {
    const r   = agg.review_velocity.value
    const src = agg.review_velocity.sources as ProviderId[]
    const dir: SignalDirection = r.sentiment === 'Positive' ? 'positive'
                               : r.sentiment === 'Negative' ? 'negative'
                               : 'mixed'
    signals.push(makeSignal(
      id('reviews'), 'pain', 'customer_pain',
      dir, r.score / 10,
      'review-sentiment',
      `Review velocity: ${r.monthly_reviews ?? 'unknown'}/product/month, sentiment ${r.sentiment ?? 'Mixed'} (avg ${r.avg_rating ?? '?'}/5).`,
      src,
      makeConfidence(agg.review_velocity.confidence, src,
        `Review data from ${src.join(', ')}`,
        'Review volume reflects current incumbents, not unaddressed demand',
      ),
    ))
  }

  return signals
}

// ── Signal cluster builder ─────────────────────────────────────────────────

export function buildSignalClusters(signals: Signal[]): SignalCluster[] {
  const byTopic: Record<string, Signal[]> = {}
  for (const s of signals) {
    if (!byTopic[s.topic_key]) byTopic[s.topic_key] = []
    byTopic[s.topic_key].push(s)
  }

  const clusters: SignalCluster[] = []
  for (const topic_key of Object.keys(byTopic)) {
    const topicSignals = byTopic[topic_key]
    const seen = new Set<string>()
    const uniqueProviders: ProviderId[] = []
    for (const s of topicSignals) {
      for (const p of s.providers) {
        if (!seen.has(p)) { seen.add(p); uniqueProviders.push(p as ProviderId) }
      }
    }
    if (uniqueProviders.length < 2) continue

    const directions   = topicSignals.map((s: Signal) => s.direction)
    const convergent   = directions.every((d: SignalDirection) => d === directions[0])
    const netMagnitude = topicSignals.reduce((sum: number, s: Signal) => sum + s.magnitude, 0) / topicSignals.length
    const baseConf     = topicSignals.reduce((sum: number, s: Signal) => sum + s.confidence.value, 0) / topicSignals.length
    const eligible     = convergent && uniqueProviders.length >= CONVERGENCE_BOOST.min_providers

    clusters.push({
      topic_key,
      signals:       topicSignals,
      convergent,
      net_magnitude: netMagnitude,
      providers:     uniqueProviders,
      confidence: makeConfidence(
        baseConf,
        uniqueProviders,
        convergent ? 'Multiple independent sources agree on this topic' : 'Sources partially agree',
        'Cross-source convergence assessment',
        eligible,
      ),
    })
  }

  return clusters
}

// ── Section → signal routing ───────────────────────────────────────────────

const SECTION_CATEGORIES: Record<string, SignalCategory[]> = {
  verdict:         ['market_demand', 'search_momentum', 'purchase_intent', 'viral_potential'],
  timing:          ['trend_phase', 'trend_velocity', 'search_momentum', 'creator_momentum', 'window_signal'],
  market_failures: ['customer_pain', 'unmet_need', 'competitive_gap', 'quality_failure', 'trust_deficit'],
  difficulty:      ['market_saturation', 'entry_barrier', 'capital_intensity', 'supply_complexity', 'discovery_cost'],
  product_thesis:  ['differentiation_angle', 'pricing_signal', 'viral_potential', 'subscription_potential', 'channel_opportunity'],
}

function routeSignalsToSection(
  section: keyof typeof SECTION_CATEGORIES,
  signals: Signal[],
): Signal[] {
  const cats = new Set<string>(SECTION_CATEGORIES[section])
  return signals.filter(s => cats.has(s.category))
}

// ── Source attributions & contributions ───────────────────────────────────

function buildSourceAttributions(agg: AggregatedSignals | null): SourceAttribution[] {
  if (!agg) return []
  const weight = 1 / agg.providers_used.length
  return agg.providers_used.map(provider => ({
    provider:    provider as ProviderId,
    data_points: 1,
    weight,
    fetched_at:  new Date().toISOString(),
    freshness:   'live' as const,
  }))
}

function buildContributions(
  agg:     AggregatedSignals | null,
  signals: Signal[],
): ProviderContribution[] {
  if (!agg) return []
  return agg.providers_used.map(provider => ({
    provider:   provider as ProviderId,
    version:    '1.0.0',
    fetched_at: new Date().toISOString(),
    confidence: agg.overall_confidence,
    signals:    signals.filter(s => s.providers.includes(provider as ProviderId)),
    scope:      { geography: 'US' },
  }))
}

// ── Claude synthesis prompt ────────────────────────────────────────────────

function buildSynthesisPrompt(
  query:    string,
  depth:    ThesisDepth,
  signals:  Signal[],
  clusters: SignalCluster[],
): string {
  const signalLines = signals.length > 0
    ? signals.map(s =>
        `  [${s.category}|${s.type}|${s.direction}|mag=${(s.magnitude * 100).toFixed(0)}] ${s.description}`
      ).join('\n')
    : '  (none — no external signal data available)'

  const clusterLines = clusters.length > 0
    ? clusters.map(c =>
        `  "${c.topic_key}" — ${c.signals.length} signals from ${c.providers.join('+')} — ${c.convergent ? 'CONVERGENT' : 'MIXED'} (mag ${(c.net_magnitude * 100).toFixed(0)}/100)`
      ).join('\n')
    : '  (no multi-source convergence)'

  return `You are a supplement market intelligence synthesizer. Produce a structured MarketThesis JSON for the query below.

QUERY: "${query}"
ANALYSIS DEPTH: ${depth}

SIGNALS FROM DATA PROVIDERS:
${signalLines}

CROSS-SOURCE CONVERGENCE CLUSTERS:
${clusterLines}

Produce a JSON object with this exact structure. Respond with ONLY the JSON — no markdown, no preamble.

{
  "category_name": "<human-readable category label>",

  "verdict": {
    "headline": "<single sentence conclusion — is this a real opportunity?>",
    "summary": "<2-3 sentence assessment combining all evidence>",
    "signal_strength": "<STRONG|POSITIVE|MIXED|WEAK|INSUFFICIENT>",
    "opportunity_score": <0-100>,
    "one_liner": "<pithy market thesis: the gap + who wins>",
    "confidence": { "value": <0-1>, "label": "<VERY_HIGH|HIGH|MODERATE|LOW|PRELIMINARY>", "supports": "<what data supports this>", "limits": "<what is missing>", "convergence": <bool>, "providers": [<ids>] },
    "signals": [],
    "sources": []
  },

  "timing": {
    "headline": "<single sentence timing assessment>",
    "summary": "<2-3 sentences on trend trajectory and window>",
    "timing_verdict": "<ENTER_NOW|WATCH_CLOSELY|MONITOR|LATE|CLOSED>",
    "window_estimate": {
      "estimated_months": <number>,
      "direction": "<opening|open|narrowing|closed>",
      "explanation": "<plain English basis for estimate>",
      "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": false, "providers": [] }
    },
    "trend_signals": [
      { "provider": "<id>", "label": "<e.g. Google Search Demand>", "metric": "<e.g. +127% over 24mo>", "direction": "<positive|negative|neutral|mixed>", "magnitude": <0-1> }
    ],
    "phase_label": "<Early Growth|Peak|Plateau|Declining>",
    "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": <bool>, "providers": [<ids>] },
    "signals": [],
    "sources": []
  },

  "market_failures": {
    "headline": "<what is broken in this market>",
    "summary": "<2-3 sentences on the pattern of failures>",
    "failures": [
      {
        "id": "mf_001",
        "title": "<short name e.g. Efficacy Verification Gap>",
        "description": "<one precise sentence>",
        "tier": "<universal|common|niche>",
        "severity": "<High|Medium|Low>",
        "prevalence": <0-1>,
        "evidence": [
          { "type": "<customer_quote|statistical|trend|competitive|ai_synthesis>", "content": "<what was found>", "provider": "ai_synthesis" }
        ],
        "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": false, "providers": [] },
        "opportunity": "<what first-mover gains by solving this>"
      }
    ],
    "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": <bool>, "providers": [<ids>] },
    "signals": [],
    "sources": []
  },

  "difficulty": {
    "headline": "<overall difficulty assessment>",
    "summary": "<2-3 sentences on what makes this hard or easy>",
    "overall_score": <0-10>,
    "overall_label": "<Easy|Medium Difficulty|Hard|Very Hard>",
    "primary_challenge": "<the single hardest thing>",
    "dimensions": [
      {
        "name": "<e.g. Capital Required>",
        "score": <0-10>,
        "label": "<EASY|MEDIUM|HARD>",
        "explanation": "<one sentence>",
        "metric": "<e.g. $35K–75K estimated launch>",
        "providers": []
      }
    ],
    "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": <bool>, "providers": [<ids>] },
    "signals": [],
    "sources": []
  },

  "product_thesis": {
    "headline": "<what should be built>",
    "summary": "<2-3 sentences on the opportunity and approach>",
    "differentiation": {
      "vector": "<e.g. Transparency + Proof>",
      "description": "<what specifically to do differently>",
      "moat": "<why competitors won't easily copy this>",
      "time_to_build": "<e.g. 4-6 months>"
    },
    "price_range": "<e.g. $38-$44>",
    "recommended_steps": [
      { "action": "<specific action>", "rationale": "<why this first>", "priority": "<immediate|short_term|medium_term>", "time_frame": "<e.g. Week 1-2>" }
    ],
    "positioning_angle": "<the one-sentence brand promise>",
    "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": <bool>, "providers": [<ids>] },
    "signals": [],
    "sources": []
  },

  "risks": [
    {
      "title": "<short risk title>",
      "category": "<competitive|timing|execution|data|market|regulatory>",
      "severity": "<High|Medium|Low>",
      "description": "<what could go wrong>",
      "trigger": "<what activates this risk>",
      "mitigation": "<what reduces it>",
      "confidence": { "value": <0-1>, "label": "<...>", "supports": "<...>", "limits": "<...>", "convergence": false, "providers": [] }
    }
  ],

  "scope_limitations": [
    { "dimension": "<what is not covered>", "impact": "<why it matters>", "verify_with": "<how to check>" }
  ],

  "overall_confidence": {
    "value": <0-1>,
    "label": "<VERY_HIGH|HIGH|MODERATE|LOW|PRELIMINARY>",
    "supports": "<what data makes this credible>",
    "limits": "<what would improve confidence>",
    "convergence": <bool>,
    "providers": [<ids of all contributing providers>]
  }
}

Rules:
- signals[] and sources[] inside each section should be empty arrays — the orchestrator populates them
- Include 2-4 market_failures, 4-6 difficulty dimensions, 2-4 risks, 2-3 scope_limitations, 2-4 recommended_steps
- Be specific and actionable — generic answers are worse than a narrow but precise read
- opportunity_score should reflect actual market conditions, not a neutral default`
}

// ── Claude call ────────────────────────────────────────────────────────────

interface ClaudeSynthesisResult {
  category_name:      string
  verdict:            VerdictSection
  timing:             TimingSection
  market_failures:    MarketFailureSection
  difficulty:         DifficultySection
  product_thesis:     ProductThesisSection
  risks:              RiskItem[]
  scope_limitations:  ScopeLimitation[]
  overall_confidence: ConfidenceScore
}

async function callClaudeSynthesis(prompt: string): Promise<ClaudeSynthesisResult> {
  const msg = await ai.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 8000,   // MarketThesis JSON is ~5-7k tokens; 4096 truncates it
    messages:   [{ role: 'user', content: prompt }],
  })
  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  let s = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const start = s.indexOf('{')
  if (start > 0) s = s.slice(start)

  // If the response was still truncated, find the last complete top-level value
  // by scanning for a position where the outer object brace count reaches zero.
  try {
    return JSON.parse(s) as ClaudeSynthesisResult
  } catch {
    // Walk backwards to find the last valid JSON boundary
    let depth = 0, inStr = false, esc = false, last = -1
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (esc)   { esc = false; continue }
      if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') { inStr = true; continue }
      if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') { if (--depth === 0) last = i }
    }
    if (last > 0) return JSON.parse(s.slice(0, last + 1)) as ClaudeSynthesisResult
    throw new Error('Claude response was truncated and could not be recovered')
  }
}

// ── Main synthesis function ────────────────────────────────────────────────

export async function synthesize(
  request: ThesisRequest,
  emit?:   (event: ThesisEvent) => void,
): Promise<MarketThesis> {
  const depth      = request.depth    ?? 'standard'
  const query      = request.query.trim()
  const normalized = normalizeQuery(query)
  const version    = THESIS_ENGINE_VERSION

  emit?.({ event: 'analysis:started', query, depth })

  const intent = request.intent ?? classifyIntent(query)
  emit?.({ event: 'intent:classified', intent })

  // ── Cache check ────────────────────────────────────────────
  if (!request.force_refresh) {
    const cached = await getThesis(normalized, depth, version)
    if (cached) {
      emit?.({ event: 'cache:hit', thesis_id: cached.id })
      return cached
    }
  }

  // ── Signal collection ───────────────────────────────────────
  // Canonical thesis-engine ProviderId for each signal-engine provider name.
  // The signal engine uses hyphens (e.g. 'google-trends') while ProviderId
  // uses underscores ('google_trends'). This map normalises at the boundary.
  const SIGNAL_ENGINE_ID_MAP: Record<string, ProviderId> = {
    'keepa':          'keepa',
    'google-trends':  'google_trends',
    'tiktok':         'tiktok',
    'reddit':         'reddit',
    'amazon-reviews': 'amazon_reviews',
    'meta-ads':       'meta_ads',
    'amazon-ads':     'amazon_ads',
  }
  const allProviders: ProviderId[] = ['keepa', 'google_trends', 'reddit', 'tiktok', 'amazon_reviews', 'meta_ads', 'amazon_ads']
  let agg: AggregatedSignals | null = null

  emit?.({ event: 'source:started', provider: 'keepa' })
  try {
    // No resolved category module in this engine — categoryId intentionally
    // omitted so Keepa/Reddit's category-specific gates safely decline
    // rather than guessing which category this query belongs to.
    agg = await signalEngine.fetch({ query }, 15_000)
    if (agg) {
      for (const p of agg.providers_used) {
        const canonicalId = SIGNAL_ENGINE_ID_MAP[p] ?? p as ProviderId
        emit?.({ event: 'source:completed', provider: canonicalId, signal_count: 1 })
      }
    }
  } catch (err) {
    console.error('[ThesisOrchestrator] signalEngine error:', err)
    emit?.({ event: 'source:failed', provider: 'keepa', error: String(err) })
  }

  const signals  = agg ? adaptAggregatedSignals(agg, query) : []
  const clusters = buildSignalClusters(signals)

  // Normalise succeeded IDs to canonical ProviderId form
  const providersSucceeded = (agg?.providers_used ?? []).map(
    p => SIGNAL_ENGINE_ID_MAP[p] ?? p as ProviderId
  )
  const providersFailed = allProviders.filter(p => !providersSucceeded.includes(p))

  // ── Claude synthesis ────────────────────────────────────────
  emit?.({ event: 'synthesis:started' })
  const prompt    = buildSynthesisPrompt(query, depth, signals, clusters)
  const synthesis = await callClaudeSynthesis(prompt)

  // ── Wire signals into sections ──────────────────────────────
  const sourceAttrs = buildSourceAttributions(agg)
  const sectionNames = ['verdict', 'timing', 'market_failures', 'difficulty', 'product_thesis'] as const
  for (const s of sectionNames) {
    synthesis[s].signals = routeSignalsToSection(s, signals)
    synthesis[s].sources = sourceAttrs
  }

  // ── Assemble MarketThesis ───────────────────────────────────
  const now          = new Date()
  const ttlSecs      = THESIS_CACHE_TTL[depth]
  const refreshAfter = new Date(now.getTime() + ttlSecs * 1_000).toISOString()

  const thesis: MarketThesis = {
    id:               `thesis_${randomUUID()}`,
    query,
    query_normalized: normalized,
    category_name:    synthesis.category_name,
    analysis_depth:   depth,

    verdict:         synthesis.verdict,
    timing:          synthesis.timing,
    market_failures: synthesis.market_failures,
    difficulty:      synthesis.difficulty,
    product_thesis:  synthesis.product_thesis,

    risks:              synthesis.risks,
    scope_limitations:  synthesis.scope_limitations,
    overall_confidence: synthesis.overall_confidence,

    all_signals:        signals,
    converging_signals: clusters,

    providers_attempted: allProviders,
    providers_succeeded: providersSucceeded,
    providers_failed:    providersFailed,

    sources_used:           sourceAttrs,
    provider_contributions: buildContributions(agg, signals),

    created_at:       now.toISOString(),
    data_as_of:       now.toISOString(),
    refresh_after:    refreshAfter,
    analysis_version: version,
  }

  // Emit section events before caching
  for (const s of sectionNames) {
    emit?.({ event: 'thesis:section', section: s, data: thesis[s] })
  }
  emit?.({ event: 'thesis:complete', thesis })

  await setThesis(thesis)

  return thesis
}
