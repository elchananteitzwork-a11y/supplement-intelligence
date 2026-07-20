// ── Provider error sanitization ──────────────────────────────────────────
//
// ROOT CAUSE (found 2026-06-29, live during the final pre-commit validation
// run): the Anthropic account ran out of credits mid-run, and
// app/api/thesis/route.ts's catch block did `synthErr.message` straight
// into the SSE stream sent to the browser — meaning a real user would have
// seen "Your credit balance is too low to access the Anthropic API. Please
// go to Plans & Billing..." verbatim. app/api/generate and app/api/discover
// already used a single generic "AI service error" message for every
// failure type, which is safe but undifferentiated (a rate limit, a
// timeout, and a billing failure all looked identical to the user).
//
// classifyProviderError() is the one place that decides what's safe to
// show. Every route that calls an external provider (Anthropic today;
// written generically so a future provider doesn't need its own copy)
// should route its catch block through this instead of touching the raw
// error's `.message` directly.
//
// 2026-07-20: a recurring "insufficient_credits" in production traced to
// the deployed ANTHROPIC_API_KEY belonging to a different Anthropic
// workspace than the one credit was added to — same classification logic,
// wrong key. No change needed here; noted for the next person who sees
// this category fire and assumes it's a code regression.
export type ProviderErrorCategory =
  | 'insufficient_credits'
  | 'rate_limit'
  | 'timeout'
  | 'service_unavailable'
  | 'auth_failure'
  | 'unknown'

export interface ClassifiedProviderError {
  category: ProviderErrorCategory
  /** Safe to send to the client — never contains the raw provider text. */
  userMessage: string
  /** Server-side logging only — the actual technical detail, never returned in an API response. */
  technicalDetail: string
}

const USER_MESSAGES: Record<ProviderErrorCategory, string> = {
  insufficient_credits: 'Our AI provider is temporarily unavailable. Please try again in a few minutes.',
  rate_limit:            "We're experiencing high demand right now. Please try again in a moment.",
  timeout:               'This took longer than expected. Please try again.',
  service_unavailable:   'Our AI provider is temporarily unavailable. Please try again in a few minutes.',
  auth_failure:          'A configuration issue is preventing analysis right now. Please try again later.',
  unknown:               'Something went wrong. Please try again.',
}

export function classifyProviderError(e: unknown): ClassifiedProviderError {
  const technicalDetail = e instanceof Error ? e.message : String(e)

  // Anthropic SDK errors expose `.status` (HTTP status) and a structured
  // `.error.error.type`; abort/timeout errors surface as a plain Error
  // with name 'AbortError' or a "timeout" substring depending on which
  // abort mechanism fired (AbortController vs AbortSignal.timeout).
  const status  = (e as { status?: number })?.status
  const errType = (e as { error?: { error?: { type?: string } } })?.error?.error?.type
  const isAbort = e instanceof Error && (e.name === 'AbortError' || /abort|timeout/i.test(e.message))

  let category: ProviderErrorCategory = 'unknown'
  if (isAbort) {
    category = 'timeout'
  } else if (errType === 'invalid_request_error' && /credit balance/i.test(technicalDetail)) {
    category = 'insufficient_credits'
  } else if (status === 429 || errType === 'rate_limit_error') {
    category = 'rate_limit'
  } else if (status === 401 || status === 403 || errType === 'authentication_error' || errType === 'permission_error') {
    category = 'auth_failure'
  } else if (status === 500 || status === 502 || status === 503 || status === 529 || errType === 'overloaded_error' || errType === 'api_error') {
    category = 'service_unavailable'
  }

  return { category, userMessage: USER_MESSAGES[category], technicalDetail }
}

/** Logs the full technical detail server-side and returns only the safe,
 *  user-facing message — the one call site every route's catch block needs. */
export function handleProviderError(e: unknown, context: Record<string, unknown>): string {
  const classified = classifyProviderError(e)
  // BUG (found live, 2026-06-29 end-to-end verification): both
  // app/api/discover and app/api/generate pass a context object with their
  // own `category` key (the product category being analyzed, e.g.
  // "Hydration") — spreading context AFTER the classifier's own `category`
  // silently overwrote the actual error classification in the log with an
  // unrelated string. The classifier's own fields must always win; caller
  // context is supplementary, so it's spread first now, not last.
  console.error('Provider error', { ...context, errorCategory: classified.category, technicalDetail: classified.technicalDetail })
  return classified.userMessage
}
