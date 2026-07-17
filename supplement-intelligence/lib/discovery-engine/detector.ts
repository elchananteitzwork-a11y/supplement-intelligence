// ── Discovery Engine — acceleration detector — Roadmap M2.12 ─────────────────
//
// Roadmap M2.22: the actual primitive (detectAcceleration, its
// ObservationPoint/AccelerationResult types, and the disclosed
// DISCOVERY_ACCELERATION_THRESHOLD_PCT threshold) moved to
// lib/pattern-detection/acceleration.ts so lib/divergence-detector can
// reuse it without importing this directory. Re-exported here unchanged so
// this module's existing caller (lib/discovery-engine/run.ts) and its
// import path keep working with zero behavior change.
export {
  detectAcceleration,
  DISCOVERY_ACCELERATION_THRESHOLD_PCT,
  type ObservationPoint,
  type AccelerationResult,
} from '../pattern-detection/acceleration'
