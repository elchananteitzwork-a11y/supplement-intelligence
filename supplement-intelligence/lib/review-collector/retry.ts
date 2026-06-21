// ── Error types ────────────────────────────────────────────────────────────

// Throw this to signal the error is worth retrying (network glitch, 5xx, 429).
export class RetryableError extends Error {
  constructor(
    message:             string,
    readonly status?:    number,
    readonly retryAfter?: number,   // seconds to wait (from Retry-After header)
  ) {
    super(message)
    this.name = 'RetryableError'
  }
}

// Throw this to skip retries immediately (400, 401, 403, 404, bad ASIN, etc.).
export class NonRetryableError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'NonRetryableError'
  }
}

// ── Retry options ──────────────────────────────────────────────────────────

export interface RetryOptions {
  max:      number       // total attempts (not retries — 1 = no retry)
  base_ms:  number       // initial backoff delay
  max_ms:   number       // backoff ceiling
  jitter:   number       // 0–1 fraction of delay to randomize (±)
  on_retry?: (attempt: number, err: unknown, waitMs: number) => void
}

// ── Core helper ────────────────────────────────────────────────────────────

export async function withRetry<T>(
  fn:      () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  let lastErr: unknown

  for (let attempt = 1; attempt <= options.max; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err

      // Decide immediately whether to keep trying
      if (!isRetryable(err) || attempt === options.max) throw err

      const waitMs = computeWait(err, attempt, options)
      options.on_retry?.(attempt, err, waitMs)

      await sleep(waitMs)
    }
  }

  throw lastErr
}

// ── Retry decision ─────────────────────────────────────────────────────────

function isRetryable(err: unknown): boolean {
  if (err instanceof NonRetryableError) return false
  if (err instanceof RetryableError)    return true

  if (err instanceof Error) {
    const e = err as Error & { status?: number; code?: string; cause?: unknown }

    // Explicit non-retryable HTTP status codes
    if (e.status !== undefined && [400, 401, 403, 404].includes(e.status)) return false

    // Explicit retryable HTTP status codes
    if (e.status !== undefined && [429, 500, 502, 503, 504].includes(e.status)) return true

    // Node.js network error codes
    if (typeof e.code === 'string') {
      if (['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EPIPE'].includes(e.code)) {
        return true
      }
    }

    // Fetch-level failures (AbortError from timeout is NOT retryable by default)
    if (e.name === 'AbortError') return false
    if (e.message.includes('fetch failed')) return true
    if (e.message.includes('network')) return true
  }

  // Unknown errors: default to retryable (safe — we'll hit max anyway)
  return true
}

// ── Backoff calculation ────────────────────────────────────────────────────

function computeWait(err: unknown, attempt: number, options: RetryOptions): number {
  // Honour Retry-After header when the provider supplies it
  if (err instanceof RetryableError && err.retryAfter !== undefined) {
    return Math.min(err.retryAfter * 1_000, options.max_ms)
  }

  // Exponential backoff: base × 2^(attempt-1), capped at max
  const exp    = Math.min(options.base_ms * Math.pow(2, attempt - 1), options.max_ms)
  // ±jitter so parallel retries don't thunderherd
  const jitter = exp * options.jitter * (Math.random() * 2 - 1)
  return Math.max(0, Math.round(exp + jitter))
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Build a RetryableError from an HTTP response (reads Retry-After header).
export async function httpError(res: Response): Promise<RetryableError | NonRetryableError> {
  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfter       = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined

  let body = ''
  try { body = (await res.text()).slice(0, 200) } catch { /* ignore */ }

  const msg = `HTTP ${res.status} ${res.statusText}${body ? ` — ${body}` : ''}`

  if ([429, 500, 502, 503, 504].includes(res.status)) {
    return new RetryableError(msg, res.status, Number.isNaN(retryAfter) ? undefined : retryAfter)
  }
  return new NonRetryableError(msg, res.status)
}
