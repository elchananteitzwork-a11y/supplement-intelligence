// GoogleTrendsProvider rate-limit classification tests — bug fix (2026-07-17):
// the google-trends-api package throws a generic JSON.parse SyntaxError on
// any non-JSON response (rate limit / consent-page HTML), never a message
// containing "302"/"429"/"sorry". The package makes two sequential real
// requests per interestOverTime() call, with two different failure shapes
// on a rate limit:
//   1. `/trends/api/explore` (parseResults() in
//      node_modules/google-trends-api/src/utilities.js) — throws its own
//      JSON.parse SyntaxError with the raw body attached as `e.requestBody`.
//      Covered by the "...(stage 1..." tests below, using HTML shapes
//      live-captured from the real package (v4.9.2) on 2026-07-17 by
//      hammering the real trends.google.com endpoint until it 429'd/302'd.
//   2. `/trends/api/widgetdata/multiline` — the package swallows its own
//      JSON.parse failure and resolves successfully with the raw HTML
//      instead of throwing, so google-trends.ts's own JSON.parse(raw) is
//      what throws, with NO `.requestBody` anywhere. google-trends.ts hoists
//      that raw string and passes it to isGoogleTrendsRateLimit() as a
//      second, explicit argument — covered by the "...(stage 2..." tests
//      below using a structurally representative (not live-captured) body.

import { describe, it, expect } from 'vitest'
import { isGoogleTrendsRateLimit } from '../google-trends'

// A real 302→/sorry redirect page body, live-captured 2026-07-17.
const SORRY_REDIRECT_BODY =
  '<HTML><HEAD><meta http-equiv="content-type" content="text/html;charset=utf-8">\n' +
  '<TITLE>302 Moved</TITLE></HEAD><BODY>\n<H1>302 Moved</H1>\nThe document has moved\n' +
  '<A HREF="https://www.google.com/sorry/index?continue=https://trends.google.com/trends/api/explore...">here</A>.\n</BODY></HTML>'

// A real "429 Too Many Requests" error page body, live-captured 2026-07-17.
const TOO_MANY_REQUESTS_BODY =
  '<html lang="en" dir=ltr><meta charset=utf-8><meta name=viewport content="initial-scale=1, ' +
  'minimum-scale=1, width=device-width"><title>Error 429 (Too Many Requests)!!1</title>' +
  '<style nonce="dJKdjw3lnM5iYwGGQ0LZpg">*{margin:0;padding:0}html,code{font:15px/22px arial,sans-serif}' +
  'html{background:#fff;color:#222;padding:15px}body{color:#222;text-align:unset;margin:7% auto 0;' +
  'max-width:390px;min-height:180px;padding:30px 0 15px;}* > body{background:url(//www.google.com/' +
  'images/errors/robot.png) 100% 5px no-repeat;padding-right:205px}p{margin:11px 0 22px;overflow:hidden}'

// A structurally representative (not live-captured) rate-limit body for the
// SECOND internal request's failure mode — same real Google rate-limit
// markers as the live-captured stage-1 bodies above, since in practice both
// endpoints live on trends.google.com and would surface the same
// consent/rate-limit page. Not live-captured because this path never
// throws from inside the package itself (see file header) — it only
// throws once it reaches google-trends.ts's own JSON.parse(raw), which is
// what we're reproducing here.
const STAGE2_RATE_LIMIT_BODY =
  '<html lang="en" dir=ltr><meta charset=utf-8><title>Error 429 (Too Many Requests)!!1</title>' +
  '<body style="background:url(//www.google.com/images/errors/robot.png)">That’s an error.</body></html>'

// Reproduces exactly what node_modules/google-trends-api/src/utilities.js
// parseResults() does: a native JSON.parse SyntaxError with the raw
// response body attached as `.requestBody`. Used for the stage-1 failure
// mode (the package's own JSON.parse throws).
function jsonParseSyntaxError(body: string): Error {
  const err = plainJsonParseSyntaxError(body)
  ;(err as Error & { requestBody?: string }).requestBody = body
  return err
}

// Reproduces what google-trends.ts's own `JSON.parse(raw)` throws for the
// stage-2 failure mode: a plain native SyntaxError with NO `.requestBody`
// property anywhere (the package already swallowed its own parse error and
// handed back the raw, unparsed HTML string instead of throwing).
function plainJsonParseSyntaxError(body: string): Error {
  try {
    JSON.parse(body)
    throw new Error('test fixture bug: body must not be valid JSON')
  } catch (e) {
    return e as Error
  }
}

describe('isGoogleTrendsRateLimit', () => {
  describe('stage 1 — the package throws its own JSON.parse error with e.requestBody set', () => {
    it('classifies a real 302→/sorry redirect body as a rate limit', () => {
      expect(isGoogleTrendsRateLimit(jsonParseSyntaxError(SORRY_REDIRECT_BODY))).toBe(true)
    })

    it('classifies a real "Error 429 (Too Many Requests)" body as a rate limit', () => {
      expect(isGoogleTrendsRateLimit(jsonParseSyntaxError(TOO_MANY_REQUESTS_BODY))).toBe(true)
    })

    it('does NOT classify the generic JSON.parse error message alone (no "302"/"429"/"sorry" substring) as a rate limit when the body has no rate-limit markers', () => {
      const err = jsonParseSyntaxError('<html><body>Not Found</body></html>')
      // Sanity check on the exact real-world failure mode described in the
      // bug report: the message never contains the old substrings.
      expect(err.message).not.toMatch(/302|429|sorry/i)
      expect(isGoogleTrendsRateLimit(err)).toBe(false)
    })
  })

  describe('stage 2 — the package swallows its own parse error and returns raw HTML instead; our own JSON.parse(raw) throws with no e.requestBody, so the caller must pass the raw body explicitly', () => {
    it('classifies a rate-limit body passed as the explicit rawBody argument, even though the thrown error itself has no .requestBody', () => {
      const err = plainJsonParseSyntaxError(STAGE2_RATE_LIMIT_BODY)
      expect((err as Error & { requestBody?: unknown }).requestBody).toBeUndefined()
      expect(isGoogleTrendsRateLimit(err, STAGE2_RATE_LIMIT_BODY)).toBe(true)
    })

    it('does NOT classify a non-rate-limit rawBody as a rate limit', () => {
      const err = plainJsonParseSyntaxError('<html><body>Service Unavailable</body></html>')
      expect(isGoogleTrendsRateLimit(err, '<html><body>Service Unavailable</body></html>')).toBe(false)
    })

    it('returns false when no rawBody is available at all (nothing to inspect)', () => {
      const err = plainJsonParseSyntaxError(STAGE2_RATE_LIMIT_BODY)
      expect(isGoogleTrendsRateLimit(err)).toBe(false)
    })
  })

  it('still matches on a bare "429" appearing in the error message itself (defensive fallback)', () => {
    expect(isGoogleTrendsRateLimit(new Error('Request failed with status code 429'))).toBe(true)
  })

  it('returns false for an unrelated error with no requestBody', () => {
    expect(isGoogleTrendsRateLimit(new TypeError('Cannot read properties of undefined'))).toBe(false)
  })

  it('returns false for a non-Error thrown value', () => {
    expect(isGoogleTrendsRateLimit('some string error')).toBe(false)
  })
})
