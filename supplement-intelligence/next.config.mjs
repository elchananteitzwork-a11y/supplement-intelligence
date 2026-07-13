import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Beta Readiness Audit (Critical): required for instrumentation.ts (and
  // therefore sentry.server.config.ts/sentry.edge.config.ts) to actually
  // run — not yet default-on in this Next.js version.
  experimental: {
    instrumentationHook: true,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',           value: 'DENY' },
          { key: 'X-Content-Type-Options',     value: 'nosniff' },
          { key: 'Referrer-Policy',            value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',         value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            // Allowlist: self + Supabase (data/auth) + Anthropic fonts/scripts not served directly
            // 'unsafe-inline' required for Next.js inline styles and React hydration scripts.
            // Tighten to a nonce-based policy once the app is stable.
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              // Beta Readiness Audit (Critical): the browser Sentry SDK
              // (instrumentation-client.ts) reports directly to Sentry's
              // ingest endpoints, which are region-specific subdomains —
              // a single `*.sentry.io` wildcard does not match these
              // (CSP wildcards only replace one leftmost label). Harmless
              // if error monitoring is left unconfigured — these hosts
              // are simply never contacted, same as any other unused
              // connect-src entry.
              `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://*.supabase.co wss://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io`,
              "font-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

// Beta Readiness Audit (Critical): the Sentry webpack plugin is what wires
// instrumentation-client.ts into the browser bundle at all in this Next.js
// version (unlike instrumentation.ts, a native Next.js hook that runs
// regardless) — so this wrap must be gated on whether error monitoring is
// enabled (NEXT_PUBLIC_SENTRY_DSN present), NOT on whether source-map
// upload credentials happen to also be present. Those are a separate,
// optional, build-time-only concern (readable vs. minified stack traces)
// and are handled independently below via `sourcemaps.disable` — a repo
// with just a DSN and no auth token still gets full client-side error
// capture, only without pretty stack traces.
const errorMonitoringEnabled = !!process.env.NEXT_PUBLIC_SENTRY_DSN
const sourceMapCredentialsPresent =
  !!process.env.SENTRY_AUTH_TOKEN && !!process.env.SENTRY_ORG && !!process.env.SENTRY_PROJECT

export default errorMonitoringEnabled
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: true,
      disableLogger: true,
      sourcemaps: { disable: !sourceMapCredentialsPresent },
      // Belt-and-suspenders: even a present-but-wrong token should warn,
      // not fail the build — a source-map upload problem should never
      // block a deploy.
      errorHandler: (err) => {
        console.warn('[Sentry] Build-time integration warning — source maps were not uploaded:', err.message)
      },
    })
  : nextConfig
