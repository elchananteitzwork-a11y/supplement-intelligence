// ── Dev-only unlimited-analyses bypass — fail-closed by design ──────────────
//
// Beta Readiness Audit (Critical): DEV_UNLIMITED_ANALYSES was previously
// checked via a bare `process.env.DEV_UNLIMITED_ANALYSES === 'true'` in
// both quota-enforcing routes (/api/generate, /api/thesis), with no
// runtime gate at all. If this variable were ever set — or left set —
// in a real deployment, the entire per-user analysis quota would be
// silently disabled for every user, with no billing/quota state required.
//
// This module is now the single source of truth for that check.
// `NODE_ENV === 'production'` (which Next.js/Vercel set for every real
// deployment — production domain AND preview deployments, not just the
// production domain) ALWAYS disables the bypass here, regardless of what
// DEV_UNLIMITED_ANALYSES is set to. The env var only ever has effect in a
// genuine local `next dev` (or test) process, and only when explicitly
// set to the literal string "true" — a missing, empty, or malformed value
// (e.g. "1", "TRUE", "yes") is treated as "not enabled," never guessed.

export function isDevUnlimitedAnalysesEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    // Defense in depth: this has zero effect on the return value below,
    // but if the flag is ever set in a production runtime, that is a real
    // misconfiguration worth surfacing loudly rather than silently no-op-ing.
    if (process.env.DEV_UNLIMITED_ANALYSES === 'true') {
      console.warn(
        '[Billing] DEV_UNLIMITED_ANALYSES=true is set in a production runtime — ' +
        'this has NO EFFECT (dev bypasses are hard-disabled whenever NODE_ENV=production), ' +
        'but the env var should be removed from this environment.'
      )
    }
    return false
  }
  return process.env.DEV_UNLIMITED_ANALYSES === 'true'
}
