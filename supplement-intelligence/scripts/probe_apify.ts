/**
 * Apify health probe — checks whether actor runs are available.
 *
 * The meta API (/acts) is always accessible with a valid token, even when
 * the monthly hard limit is exceeded. This probe instead checks the actual
 * run endpoint with a fast-fail actor to confirm runs are authorized.
 *
 * Exits 0 if runs are available.
 * Exits 1 if monthly limit exceeded, 401, or network failure.
 * Exits 2 if some other non-billing 403 (access denial, etc.)
 *
 * Run from supplement-intelligence/:
 *   npx tsx --env-file=.env.local scripts/probe_apify.ts
 */

async function main() {
  const token = process.env.APIFY_API_TOKEN
  if (!token) {
    console.error('APIFY_API_TOKEN not set')
    process.exit(1)
  }

  // Use a fast, cheap actor (hello-world) to test that runs are authorized.
  // /run-sync with maxItems=1 exits immediately — no real API credits used.
  // If this returns 403 with platform-feature-disabled, the hard limit is hit.
  const endpoint =
    `https://api.apify.com/v2/acts/apify~hello-world/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}`

  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'probe' }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    console.error(`Apify probe: network error — ${e instanceof Error ? e.message : e}`)
    process.exit(1)
  }

  if (res.status === 200 || res.status === 201) {
    console.log('Apify probe: OK — actor runs are available')
    process.exit(0)
  }

  const body = await res.json().catch(() => null) as { error?: { type?: string; message?: string } } | null
  const errType = body?.error?.type ?? 'unknown'
  const errMsg  = body?.error?.message ?? ''

  if (res.status === 403 && errType === 'platform-feature-disabled') {
    console.log(`Apify probe: BLOCKED — monthly usage hard limit exceeded`)
    console.log(`  Action: https://console.apify.com/billing`)
    process.exit(1)
  }

  console.log(`Apify probe: FAIL (HTTP ${res.status}, type=${errType}, msg=${errMsg})`)
  process.exit(2)
}

main()
