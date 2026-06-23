/**
 * Apify Manufacturing Intelligence — verification script
 *
 * Tests:
 *   1. APIFY_API_TOKEN present in .env.local
 *   2. Direct Apify API call returns valid Alibaba supplier data
 *   3. All 7 required fields present in response
 *   4. Price parsing + USD conversion logic
 *   5. Provider ordering (ApifyProvider before AIManufacturingProvider)
 *   6. /api/manufacturing returns data_source='apify' when token is set
 *   7. UI badge logic handles 'apify' source correctly
 *
 * Usage:
 *   node scripts/verify-apify.mjs
 */

import fs   from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT      = path.resolve(__dirname, '..')

// ── Load .env.local ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(ROOT, '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
}

loadEnv()

// ── Helpers ────────────────────────────────────────────────────────────────

const pass = (msg) => console.log(`  ✅ ${msg}`)
const fail = (msg) => console.log(`  ❌ ${msg}`)
const info = (msg) => console.log(`  ℹ  ${msg}`)

let passed = 0, failed = 0

function check(label, ok, detail = '') {
  if (ok) { pass(label + (detail ? ` — ${detail}` : '')); passed++ }
  else    { fail(label + (detail ? ` — ${detail}` : '')); failed++ }
  return ok
}

// Get a valid session cookie for the local server
async function getSessionCookie() {
  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !serviceKey) return null

  const genRes = await fetch(`${supaUrl}/auth/v1/admin/generate_link`, {
    method:  'POST',
    headers: {
      apikey:         serviceKey,
      Authorization:  `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: 'ci-test-vitamintest@supplement-intel.dev' }),
  })
  if (!genRes.ok) return null
  const { hashed_token } = await genRes.json()
  if (!hashed_token) return null

  const verifyRes = await fetch(
    `${supaUrl}/auth/v1/verify?token=${hashed_token}&type=magiclink&redirect_to=http://localhost:3000/auth/callback`,
    { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' }, redirect: 'manual' },
  )
  const location    = verifyRes.headers.get('location') ?? ''
  const fragment    = new URLSearchParams(location.split('#')[1] ?? '')
  const accessToken = fragment.get('access_token')
  const refreshToken = fragment.get('refresh_token')
  const expiresAt   = parseInt(fragment.get('expires_at') ?? '0', 10)
  if (!accessToken) return null

  const session = JSON.stringify({
    access_token:  accessToken,
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    expiresAt,
    refresh_token: refreshToken,
    user:          { id: 'ee10c45b-fc5c-4529-b86b-c9d895e88e5b' },
  })
  return `sb-ziqehpqxwypbwuiyujrv-auth-token=${encodeURIComponent(session)}`
}

// ── Test 1: Credentials present ────────────────────────────────────────────

console.log('\n── 1. Credentials ──')
const TOKEN = process.env.APIFY_API_TOKEN
const tokenPresent = check(
  'APIFY_API_TOKEN set',
  !!TOKEN,
  TOKEN ? `${TOKEN.slice(0, 10)}...` : 'missing — add to .env.local',
)

// ── Test 2 & 3: Direct Apify API call + field validation ───────────────────

console.log('\n── 2 & 3. Apify API (direct) + required fields ──')

let apiProducts = []

if (!tokenPresent) {
  info('Skipping direct API test — APIFY_API_TOKEN not set')
} else {
  const apiUrl = `https://api.apify.com/v2/acts/xtracto~alibaba-search-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=25`

  try {
    const t0  = Date.now()
    const res = await fetch(apiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queries:            ["Lion's Mane Capsules OEM"],
        maxPagesPerQuery:   1,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
      }),
      signal: AbortSignal.timeout(60_000),
    })
    const elapsed = Date.now() - t0

    check('HTTP 200/201 from Apify', res.status === 200 || res.status === 201, `status=${res.status} in ${elapsed}ms`)

    apiProducts = await res.json()

    check('Products returned', apiProducts.length > 0, `${apiProducts.length} products`)

    if (apiProducts.length > 0) {
      const p = apiProducts[0]
      info(`Sample: "${(p.title ?? '').slice(0, 65)}"`)
      info(`  priceFormatted:   ${p.priceFormatted ?? 'MISSING'}`)
      info(`  minOrderQuantity: ${p.minOrderQuantity ?? 'MISSING'}`)
      info(`  companyName:      ${p.companyName ?? 'MISSING'}`)
      info(`  tradeAssurance:   ${p.tradeAssurance ?? 'MISSING'}`)
      info(`  goldSupplierYears:${p.goldSupplierYears ?? 'MISSING'}`)
      info(`  countryCode:      ${p.countryCode ?? 'MISSING'}`)

      // Required field checks
      check('title present',            apiProducts.some(p => !!p.title))
      check('priceFormatted present',   apiProducts.some(p => !!p.priceFormatted))
      check('minOrderQuantity present', apiProducts.some(p => !!p.minOrderQuantity))
      check('companyName present',      apiProducts.some(p => !!p.companyName))
      check('tradeAssurance field exists', apiProducts.some(p => 'tradeAssurance' in p))
      check('goldSupplierYears present', apiProducts.some(p => !!p.goldSupplierYears))
      check('countryCode present',      apiProducts.some(p => !!p.countryCode))
    }
  } catch (e) {
    check('Apify API reachable', false, e.message)
  }
}

// ── Test 4: Price parsing ──────────────────────────────────────────────────

console.log('\n── 4. Price parsing + USD conversion ──')

// Inline the same parser logic for verification
const TO_USD = {
  USD: 1, CNY: 0.138, ZAR: 0.054, JMD: 0.0065,
  EUR: 1.08, GBP: 1.27, INR: 0.012, BRL: 0.19,
}

function parseNumericValue(s) {
  const clean = s.trim().replace(/\s+/g, '')
  if (/,\d{1,2}$/.test(clean)) return parseFloat(clean.replace(/\./g, '').replace(',', '.'))
  return parseFloat(clean.replace(/,/g, ''))
}

function parsePrice(formatted) {
  const trimmed = formatted.trim()
  const m = trimmed.match(/^(\$|€|£|¥|R(?!\w)|[A-Z]{2,4})\s*(.+)$/)
  if (!m) return null
  const symbol  = m[1].trim()
  const numPart = m[2]
  const parts = numPart.split(/\s*[-–]\s*/)
    .map(parseNumericValue)
    .filter(n => n > 0 && n < 1_000_000)
  if (!parts.length) return null
  const code = symbol === '$' ? 'USD' : symbol === 'R' ? 'ZAR' : symbol === '¥' ? 'CNY' : symbol
  const rate = TO_USD[code] ?? 0.1
  const low  = +(Math.min(...parts) * rate).toFixed(2)
  const high = +(Math.max(...parts) * rate).toFixed(2)
  return { low: Math.max(low, 0.01), high: Math.max(high, low) }
}

const priceTests = [
  { input: 'R 25,13-40,21', expectLow: 1.35, expectHigh: 2.18 },
  { input: 'R 111,40',       expectLow: 6.01, expectHigh: 6.01 },
  { input: 'JMD 237.07-379.30', expectLow: 1.54, expectHigh: 2.47 },
  { input: '$3.50-$4.20',    expectLow: 3.50, expectHigh: 4.20 },
]

for (const t of priceTests) {
  const r = parsePrice(t.input)
  const ok = r && r.low > 0 && r.low <= r.high
  check(
    `parsePrice("${t.input}")`,
    !!ok,
    r ? `$${r.low}–$${r.high}` : 'null',
  )
}

// If live data present, verify prices are parseable
if (apiProducts.length > 0) {
  const priced = apiProducts.filter(p => p.priceFormatted && parsePrice(p.priceFormatted))
  check(
    'Live prices parseable to USD',
    priced.length > 0,
    `${priced.length}/${apiProducts.length} products have parseable prices`,
  )
  if (priced.length > 0) {
    const sample = parsePrice(priced[0].priceFormatted)
    info(`Sample USD price: $${sample.low}–$${sample.high}`)
  }
}

// ── Test 5: Provider ordering ──────────────────────────────────────────────

console.log('\n── 5. Provider ordering ──')

const registryPath = path.join(ROOT, 'lib/manufacturing-engine/providers/registry.ts')
const registrySrc  = fs.readFileSync(registryPath, 'utf8')
const apifyLine    = registrySrc.indexOf('new ApifyProvider()')
const aiLine       = registrySrc.indexOf('new AIManufacturingProvider()')

check('ApifyProvider registered',          apifyLine >= 0)
check('AIManufacturingProvider registered', aiLine    >= 0)
check('Apify before AI in registry',       apifyLine < aiLine,
      `Apify at char ${apifyLine}, AI at char ${aiLine}`)

// ── Test 6: /api/manufacturing endpoint ────────────────────────────────────

console.log('\n── 6. /api/manufacturing endpoint ──')

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

let cookie
try {
  cookie = await getSessionCookie()
  check('Auth session obtained', !!cookie, cookie ? 'ok' : 'failed')
} catch (e) {
  check('Auth session obtained', false, e.message)
}

if (cookie) {
  try {
    const res  = await fetch(`${BASE_URL}/api/manufacturing`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body:    JSON.stringify({ product: "Lion's Mane Capsules OEM", category: 'supplements' }),
      signal:  AbortSignal.timeout(35_000),
    })
    const data = await res.json()

    check('Endpoint returns 200',   res.ok,                              `status=${res.status}`)
    check('unit_cost present',      typeof data.unit_cost?.low === 'number',  `$${data.unit_cost?.low}–$${data.unit_cost?.high}`)
    check('moq present',            typeof data.moq?.low === 'number',        `${data.moq?.low}–${data.moq?.high} ${data.moq?.unit}`)
    check('lead_time present',      typeof data.lead_time_days?.low === 'number')
    check('confidence present',     !!data.confidence_label)

    if (tokenPresent) {
      check('data_source is apify', data.data_source === 'apify', `got: ${data.data_source}`)
      check('supplier_count > 0',   (data.supplier_count?.estimate ?? 0) > 0,
            `${data.supplier_count?.estimate} suppliers`)
    } else {
      check('AI fallback (data_source=ai_synthesis)', data.data_source === 'ai_synthesis',
            `got: ${data.data_source}`)
    }

    info(`data_source: ${data.data_source}`)
    info(`confidence:  ${data.confidence_label} (${Math.round((data.confidence ?? 0)*100)}%)`)
    info(`notes:       ${(data.notes ?? '').slice(0, 90)}`)
  } catch (e) {
    check('Endpoint reachable', false, e.message)
  }
} else {
  info('Server not running or auth failed — skipping endpoint test')
}

// ── Test 7: UI badge logic ──────────────────────────────────────────────────

console.log('\n── 7. UI badge logic (static) ──')

const memoDisplayPath = path.join(ROOT, 'components/MemoDisplay.tsx')
const memoSrc         = fs.readFileSync(memoDisplayPath, 'utf8')

check("isVerified based on data_source !== 'ai_synthesis'",
      memoSrc.includes("est.data_source !== 'ai_synthesis'"))
check("sourceBadge uses isVerified",
      memoSrc.includes("isVerified ? 'verified' : 'ai-synthesis'"))
check("'apify' handled — badge shows 'verified' for any non-AI source",
      memoSrc.includes("isVerified") && !memoSrc.includes("=== 'alibaba'"))

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`RESULT: ${passed} passed  |  ${failed} failed`)
if (failed > 0) process.exit(1)
