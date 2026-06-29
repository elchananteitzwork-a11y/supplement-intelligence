// Plain assertion script for lib/provider-errors.ts — no test framework is
// configured in this repo (see scripts/test-keyword-relevance-guard.ts for
// the same convention). Run with: npx tsx scripts/test-provider-errors.ts
import { classifyProviderError, handleProviderError, type ProviderErrorCategory } from '../lib/provider-errors'

// Mirrors the actual shape the Anthropic SDK throws: a real Error instance
// with extra `status`/`error` properties attached, not a plain object —
// classifyProviderError relies on `e instanceof Error` for technicalDetail.
function fakeAnthropicError(message: string, status: number, errorType: string): Error {
  return Object.assign(new Error(message), {
    status,
    error: { type: 'error', error: { type: errorType, message } },
  })
}

interface Case { name: string; error: unknown; expectCategory: ProviderErrorCategory }

const cases: Case[] = [
  {
    name: 'Insufficient credits (the exact live-reproduced case)',
    error: fakeAnthropicError(
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
      400, 'invalid_request_error',
    ),
    expectCategory: 'insufficient_credits',
  },
  {
    name: 'Rate limit (429)',
    error: fakeAnthropicError('Number of request tokens has exceeded your per-minute rate limit', 429, 'rate_limit_error'),
    expectCategory: 'rate_limit',
  },
  {
    name: 'Authentication failure (401)',
    error: fakeAnthropicError('invalid x-api-key', 401, 'authentication_error'),
    expectCategory: 'auth_failure',
  },
  {
    name: 'Permission failure (403)',
    error: fakeAnthropicError('Your API key does not have permission', 403, 'permission_error'),
    expectCategory: 'auth_failure',
  },
  {
    name: 'Service overloaded (529)',
    error: fakeAnthropicError('Overloaded', 529, 'overloaded_error'),
    expectCategory: 'service_unavailable',
  },
  {
    name: 'Service error (500)',
    error: fakeAnthropicError('Internal server error', 500, 'api_error'),
    expectCategory: 'service_unavailable',
  },
  {
    name: 'Abort/timeout (AbortController-style)',
    error: Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }),
    expectCategory: 'timeout',
  },
  {
    name: 'Abort/timeout (AbortSignal.timeout-style message)',
    error: new Error('The operation was aborted due to timeout'),
    expectCategory: 'timeout',
  },
  {
    name: 'Unrecognized error shape falls back to unknown (never throws, never crashes)',
    error: new Error('Something completely unexpected happened'),
    expectCategory: 'unknown',
  },
  {
    name: 'A non-Error thrown value is handled without crashing',
    error: 'a plain string was thrown',
    expectCategory: 'unknown',
  },
]

let failures = 0
for (const c of cases) {
  const result = classifyProviderError(c.error)
  const pass = result.category === c.expectCategory
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${c.name} (got "${result.category}", expected "${c.expectCategory}")`)
}

// The single most important property of this module: the user-facing
// message must NEVER contain the raw technical detail, for every category,
// not just the credit-balance one that triggered this fix.
console.log('\n--- No-leak checks (the actual point of this module) ---')
for (const c of cases) {
  const result = classifyProviderError(c.error)
  const rawText = c.error instanceof Error ? c.error.message : String(c.error)
  const leaked = rawText.length > 8 && result.userMessage.includes(rawText)
  const pass = !leaked
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — userMessage for "${c.name}" does not contain the raw provider text`)
}

// Regression test for a real bug found during live end-to-end verification
// (2026-06-29): app/api/discover and app/api/generate both pass a context
// object whose OWN key happens to also be named `category` (the product
// category being analyzed) — handleProviderError must never let that
// silently overwrite the actual error classification in the server log.
console.log('\n--- handleProviderError context-collision regression ---')
{
  const logs: Record<string, unknown>[] = []
  const originalError = console.error
  console.error = (...args: unknown[]) => { logs.push(args[1] as Record<string, unknown>) }
  handleProviderError(
    fakeAnthropicError('Your credit balance is too low to access the Anthropic API.', 400, 'invalid_request_error'),
    { route: '/api/discover', attempt: 1, category: 'Hydration' }, // caller's own unrelated "category" field
  )
  console.error = originalError
  const logged = logs[0]
  const pass = logged?.errorCategory === 'insufficient_credits' && logged?.category === 'Hydration'
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'} — caller's "category" context key does not clobber the real errorCategory (got errorCategory="${logged?.errorCategory}", category="${logged?.category}")`)
}

console.log(`\n${cases.length * 2 + 1 - failures}/${cases.length * 2 + 1} passed`)
if (failures > 0) process.exit(1)
