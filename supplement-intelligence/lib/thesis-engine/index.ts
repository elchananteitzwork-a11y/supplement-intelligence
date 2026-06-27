// ── Thesis Engine — Public Exports ────────────────────────────────────────
//
// This module is the stable public API of the thesis engine.
// All types the UI, API routes, and downstream consumers need come from here.
//
// Import pattern:
//   import type { MarketThesis, ThesisRequest, Signal } from '@/lib/thesis-engine'

export type {
  // §1 Identity
  ProviderId,
  ThesisId,
  AnalysisVersion,

  // §2 Confidence & Attribution
  ConfidenceLabel,
  ConfidenceScore,
  SourceAttribution,

  // §3 Evidence
  EvidenceType,
  SignalMetric,
  EvidenceItem,

  // §4 Signal Layer (the extensibility boundary)
  SignalType,
  SignalCategory,
  SignalDirection,
  Signal,
  SignalCluster,

  // §5 Provider Contract
  ProviderCapability,
  ProviderContribution,
  ProviderScope,
  SignalProvider,

  // §6 Thesis Sections
  ThesisSection,
  SignalStrength,
  VerdictSection,
  TimingVerdict,
  WindowEstimate,
  TimingSection,
  FailureTier,
  FailureSeverity,
  MarketFailure,
  MarketFailureSection,
  DifficultyDimension,
  DifficultySection,
  NextStep,
  DifferentiationAngle,
  ProductThesisSection,

  // §7 Cross-cutting
  RiskSeverity,
  RiskCategory,
  RiskItem,
  ScopeLimitation,

  // §8 The MarketThesis (canonical output)
  MarketThesis,

  // §9 Query & Request
  QueryIntent,
  ThesisDepth,
  ThesisRequest,
  ThesisEvent,
} from './types'

export {
  // §10 Constants
  THESIS_ENGINE_VERSION,
  THESIS_CACHE_TTL,
  CONVERGENCE_BOOST,
  SIGNAL_STRENGTH_THRESHOLDS,
  SOURCE_STALENESS_THRESHOLDS_MS,
} from './types'

export {
  synthesize,
  normalizeQuery,
  classifyIntent,
} from './orchestrator'

export {
  getThesis,
  setThesis,
  buildCacheKey,
} from './cache'
