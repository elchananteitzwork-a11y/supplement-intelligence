// ── Sentry — browser runtime — Beta Readiness Audit (Critical) ─────────────
// Next.js's own client instrumentation entry point (auto-loaded; no import
// needed anywhere). See lib/monitoring/sentry-config.ts for the actual,
// shared, testable options. Captures unhandled exceptions/rejections and
// console.error calls in the browser — React render errors specifically
// still need an error.tsx boundary to be caught and reported (a separate,
// already-disclosed audit item, H4 — not part of this fix).

import * as Sentry from '@sentry/nextjs'
import { buildSentryInitOptions } from '@/lib/monitoring/sentry-config'

Sentry.init(buildSentryInitOptions())
