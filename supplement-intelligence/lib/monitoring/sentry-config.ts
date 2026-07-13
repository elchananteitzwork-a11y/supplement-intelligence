// ── Shared Sentry.init() configuration — Beta Readiness Audit (Critical) ────
//
// Every runtime (server, edge, client) calls Sentry.init(buildSentryInitOptions())
// with the exact same options — one place to change the sampling/console-
// capture policy rather than three near-duplicate Sentry.init() calls
// silently drifting apart. Safely inert without a DSN configured, same
// "no credentials, no effect" pattern as every other optional integration
// in this codebase (lib/billing/stripe-client.ts, the signal-engine
// providers): Sentry.init({ dsn: undefined, ... }) is a documented no-op —
// the SDK simply never sends anything.
//
// DSN is intentionally the NEXT_PUBLIC_-prefixed variable everywhere
// (including server/edge, where the prefix has no effect beyond exposing
// it to the client bundle too) — a Sentry DSN is not a secret (Sentry's
// own docs: it identifies a project + public ingest key, not credentials),
// so one variable covers all three runtimes instead of maintaining a
// separate server-only duplicate of the same non-sensitive value.

import { captureConsoleIntegration, type NodeOptions } from '@sentry/nextjs'

export function isErrorMonitoringEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_SENTRY_DSN
}

export function buildSentryInitOptions(): NodeOptions {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
    // Error capture only — no performance tracing or session replay in
    // this pass. Beta Readiness Audit finding C3 is specifically that
    // failures are invisible, not a request for a full APM/analytics
    // suite (a separate, disclosed nice-to-have — see audit item N1).
    tracesSampleRate: 0,
    // Reports every existing console.error() call across every route —
    // webhook processing, all four cron jobs, /api/generate, and every
    // other route named in the audit's own reasoning — automatically,
    // with zero changes to any of those ~23 files.
    integrations: [captureConsoleIntegration({ levels: ['error'] })],
  }
}
