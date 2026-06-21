// ── Token-bucket rate limiter ──────────────────────────────────────────────
//
// One instance per provider. Node.js is single-threaded so no mutex is needed
// — all async tasks share the same event loop and the bucket is consistent.
//
// Example:
//   const limiter = new RateLimiter({ rate: 1, burst: 2 })   // 1 req/s, burst of 2
//   await limiter.acquire()   // blocks until a token is available
//   await fetch(url)

export interface RateLimiterOptions {
  rate:    number   // tokens refilled per second
  burst?:  number   // max token bucket size (defaults to `rate`)
}

export class RateLimiter {
  private tokens:     number
  private lastRefill: number
  private readonly rate:  number
  private readonly burst: number

  constructor(opts: RateLimiterOptions) {
    this.rate       = opts.rate
    this.burst      = opts.burst ?? opts.rate
    this.tokens     = this.burst
    this.lastRefill = Date.now()
  }

  // Waits until a token is available, then consumes one.
  // Call this immediately before every outbound request.
  async acquire(): Promise<void> {
    this.refill()

    if (this.tokens >= 1) {
      this.tokens--
      return
    }

    // Calculate how long until the next token is ready
    const waitMs = Math.ceil((1 - this.tokens) / this.rate * 1_000)
    await sleep(waitMs)

    this.refill()
    this.tokens = Math.max(0, this.tokens - 1)
  }

  // Immediately refunds a token (call after a 429 to avoid double-counting).
  release(): void {
    this.tokens = Math.min(this.burst, this.tokens + 1)
  }

  // Current available tokens (for diagnostics).
  get available(): number {
    this.refill()
    return Math.floor(this.tokens)
  }

  private refill(): void {
    const now     = Date.now()
    const elapsed = (now - this.lastRefill) / 1_000   // seconds
    this.tokens   = Math.min(this.burst, this.tokens + elapsed * this.rate)
    this.lastRefill = now
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
