// ── Sentry — Edge runtime (middleware.ts) — Beta Readiness Audit (Critical) ─
// Loaded by instrumentation.ts when NEXT_RUNTIME === 'edge'. See
// lib/monitoring/sentry-config.ts for the actual, shared, testable options.

import * as Sentry from '@sentry/nextjs'
import { buildSentryInitOptions } from '@/lib/monitoring/sentry-config'

Sentry.init(buildSentryInitOptions())
