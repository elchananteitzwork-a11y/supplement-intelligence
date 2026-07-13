// ── Next.js instrumentation hook — Beta Readiness Audit (Critical) ─────────
// Loads the right Sentry init file for whichever runtime this server
// process actually is — Next.js can run route handlers on either the
// Node.js runtime or the Edge runtime (e.g. middleware.ts is Edge-only),
// and each needs its own Sentry entry point since the two runtimes expose
// different APIs. Requires experimental.instrumentationHook (see
// next.config.mjs) — not yet stable-by-default in this Next.js version.

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}
