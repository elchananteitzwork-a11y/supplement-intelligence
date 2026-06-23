/**
 * Alibaba Manufacturing Intelligence — verification script
 *
 * Tests:
 *   1. Credentials present in .env.local
 *   2. Direct Alibaba API call succeeds and returns supplier data
 *   3. Provider ordering (Alibaba before AI)
 *   4. /api/manufacturing returns data_source='alibaba' when creds valid
 *   5. /api/manufacturing falls back to data_source='ai_synthesis' when creds absent
 *
 * Usage:
 *   node scripts/verify-alibaba.mjs
 *   ALIBABA_APP_KEY=xxx ALIBABA_APP_SECRET=yyy node scripts/verify-alibaba.mjs
 */

import crypto from 'crypto'
import fs     from 'fs'
import path   from 'path'
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

// Alibaba MD5 signing (mirrors providers/alibaba.ts)
function sign(params, secret) {
  const sorted = Object.keys(params).sort()
  let base = secret
  for (const k of sorted) base += k + params[k]
  base += secret
  return crypto.createHash('md5').update(base, 'utf8').digest('hex').toUpperCase()
}

// Get a valid session cookie for the local server
async function getSessionCookie() {
  const supaUrl    = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supaUrl || !serviceKey) return null

  // Generate a magic link for the ci-test user
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

  // Exchange token for session
  const verifyRes = await fetch(
    `${supaUrl}/auth/v1/verify?token=${hashed_token}&type=magiclink&redirect_to=http://localhost:3000/auth/callback`,
    { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '' }, redirect: 'manual' },
  )
  const location = verifyRes.headers.get('location') ?? ''
  const fragment = new URLSearchParams(location.split('#')[1] ?? '')
  const accessToken   = fragment.get('access_token')
  const refreshToken  = fragment.get('refresh_token')
  const expiresAt     = parseInt(fragment.get('expires_at') ?? '0', 10)
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
const APP_KEY    = process.env.ALIBABA_APP_KEY
const APP_SECRET = process.env.ALIBABA_APP_SECRET
const credsPresent = check('ALIBABA_APP_KEY set',    !!APP_KEY,    APP_KEY    ? `${APP_KEY.slice(0,4)}...` : 'missing')
                  && check('ALIBABA_APP_SECRET set',  !!APP_SECRET, APP_SECRET ? `${APP_SECRET.slice(0,4)}...` : 'missing')

// ── Test 2: Direct Alibaba API call ───────────────────────────────────────

console.log('\n── 2. Alibaba API (direct) ──')

if (!credsPresent) {
  info('Skipping direct API test — credentials not set')
  info('Set ALIBABA_APP_KEY and ALIBABA_APP_SECRET to test live data')
} else {
  const params = { q: 'lion mane mushroom extract capsule OEM', language: 'en_US', pageSize: '10', sort: '0' }
  const url    = new URL(`https://gw.api.alibaba.com/openapi/param2/2/alibaba.open.product.search/${APP_KEY}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  url.searchParams.set('sign', sign(params, APP_SECRET))

  try {
    const res  = await fetch(url.toString(), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    const body = await res.json()

    check('HTTP 200 from Alibaba', res.ok, `status=${res.status}`)
    check('No API error',          !body.errorCode, body.errorCode ?? 'ok')

    const products = body.result?.products ?? []
    check('Products returned',     products.length > 0, `${products.length} products`)

    const priced = products.filter(p => (p.minPrice ?? 0) > 0)
    check('Price data present',    priced.length > 0, `${priced.length}/${products.length} have prices`)

    if (priced.length) {
      const p = priced[0]
      info(`Sample: "${(p.subject ?? '').slice(0,60)}"`)
      info(`  Price: $${p.minPrice}–$${p.maxPrice} | MOQ: ${p.moq ?? '?'} ${p.moqUnit ?? ''}`)
      info(`  Supplier: ${p.sellerDt?.companyName ?? '?'} | Star: ${p.sellerDt?.starLevel ?? '?'}`)
    }

    const totalCount = body.result?.totalCount ?? 0
    check('Supplier count returned', totalCount > 0, `${totalCount} total listings`)
  } catch (e) {
    check('Alibaba API reachable', false, e.message)
  }
}

// ── Test 3: Provider ordering ──────────────────────────────────────────────

console.log('\n── 3. Provider ordering ──')

// Verify by inspecting the registry source — no credentials needed
const registryPath = path.join(ROOT, 'lib/manufacturing-engine/providers/registry.ts')
const registrySrc  = fs.readFileSync(registryPath, 'utf8')
const alibabaLine  = registrySrc.indexOf('new AlibabaProvider()')
const aiLine       = registrySrc.indexOf('new AIManufacturingProvider()')
check('AlibabaProvider registered',   alibabaLine >= 0)
check('AIManufacturingProvider registered', aiLine >= 0)
check('Alibaba before AI in registry', alibabaLine < aiLine,
      `Alibaba at char ${alibabaLine}, AI at char ${aiLine}`)

// ── Test 4 & 5: /api/manufacturing endpoint ────────────────────────────────

console.log('\n── 4 & 5. /api/manufacturing endpoint ──')

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

let cookie
try {
  cookie = await getSessionCookie()
  check('Auth session obtained', !!cookie, cookie ? 'ok' : 'failed')
} catch (e) {
  check('Auth session obtained', false, e.message)
}

if (cookie) {
  const payload = JSON.stringify({
    product:    "Lion's Mane Focus Supplement",
    category:   'supplements',
    complexity: 'Low',
  })

  try {
    const res  = await fetch(`${BASE_URL}/api/manufacturing`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body:    payload,
      signal:  AbortSignal.timeout(20_000),
    })
    const data = await res.json()

    check('Endpoint returns 200', res.ok, `status=${res.status}`)
    check('unit_cost present',    typeof data.unit_cost?.low === 'number',  `$${data.unit_cost?.low}–$${data.unit_cost?.high}`)
    check('moq present',          typeof data.moq?.low === 'number',        `${data.moq?.low}–${data.moq?.high} ${data.moq?.unit}`)
    check('lead_time present',    typeof data.lead_time_days?.low === 'number')
    check('confidence present',   !!data.confidence_label)

    if (credsPresent) {
      // With credentials: expect Alibaba data
      check('data_source is alibaba', data.data_source === 'alibaba',
            `got: ${data.data_source}`)
      check('supplier_count from live data', (data.supplier_count?.estimate ?? 0) > 0,
            `${data.supplier_count?.estimate} suppliers`)
    } else {
      // Without credentials: expect AI fallback
      check('AI fallback active (data_source=ai_synthesis)', data.data_source === 'ai_synthesis',
            `got: ${data.data_source}`)
      info('To test Alibaba path: set ALIBABA_APP_KEY and ALIBABA_APP_SECRET in .env.local')
    }

    info(`data_source: ${data.data_source}`)
    info(`confidence:  ${data.confidence_label} (${Math.round((data.confidence ?? 0)*100)}%)`)
    info(`notes:       ${(data.notes ?? '').slice(0, 90)}`)
  } catch (e) {
    check('Endpoint reachable', false, e.message)
  }
}

// ── UI badge verification ──────────────────────────────────────────────────

console.log('\n── 6. UI badge logic (static) ──')

const memoDisplayPath = path.join(ROOT, 'components/MemoDisplay.tsx')
const memoSrc         = fs.readFileSync(memoDisplayPath, 'utf8')

check('Header badge is dynamic (not hardcoded ai-synthesis)',
      memoSrc.includes("estimate?.data_source && estimate.data_source !== 'ai_synthesis'"))
check("Source row uses sourceBadge variable (not hardcoded)",
      memoSrc.includes('type={sourceBadge}'))
check("'verified' badge for non-AI sources",
      memoSrc.includes("isVerified ? 'verified' : 'ai-synthesis'"))

// ── Summary ────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`)
console.log(`RESULT: ${passed} passed  |  ${failed} failed`)
if (!credsPresent) {
  console.log('\n⚠  Alibaba credentials not set — live data path not tested.')
  console.log('   Add ALIBABA_APP_KEY and ALIBABA_APP_SECRET to .env.local,')
  console.log('   then re-run: node scripts/verify-alibaba.mjs')
}
if (failed > 0) process.exit(1)
