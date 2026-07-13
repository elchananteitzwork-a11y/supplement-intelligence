// ── Reddit OAuth2 client_credentials token — shared helper ──────────────────
//
// Extracted from lib/signal-engine/providers/reddit.ts's private getToken()
// (Roadmap M2.7) so the new lib/voc-pipeline batch pipeline can obtain a
// real Reddit access token without duplicating the OAuth2 flow. reddit.ts
// itself was refactored to call this instead of inlining its own copy —
// same real behavior (same endpoint, same grant type, same credentials),
// just no longer implemented twice. Each caller still owns its own token
// caching (a provider instance vs. a single batch run have different
// lifetimes), so this module only does the actual token fetch.
//
// Reddit requires OAuth2 for ALL API access, including public read-only
// data. The client_credentials grant needs no user login — just a free
// "script" app (see .env.example for the 2-minute setup).

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token'

export interface RedditTokenResponse {
  access_token?: string
  token_type?:   string
  expires_in?:   number
  error?:        string
}

export interface RedditAccessToken {
  value:   string
  // Unix ms when this token should be considered expired — 60s margin
  // subtracted from Reddit's own expires_in so a caller never uses a token
  // that expires mid-request.
  expires: number
}

export async function fetchRedditAccessToken(): Promise<RedditAccessToken | null> {
  const clientId     = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const username    = process.env.REDDIT_USERNAME ?? 'bot'
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method:  'POST',
      signal:  AbortSignal.timeout(8_000),
      headers: {
        'Authorization': `Basic ${credentials}`,
        'User-Agent':    `supplement-intelligence/1.0 by /u/${username}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
  } catch { return null }

  if (!res.ok) {
    console.error('Reddit token error', { status: res.status })
    return null
  }

  let body: RedditTokenResponse
  try { body = await res.json() as RedditTokenResponse } catch { return null }

  if (!body.access_token) {
    console.error('Reddit token: no access_token in response', body.error)
    return null
  }

  return {
    value:   body.access_token,
    expires: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  }
}

// Real, documented Reddit User-Agent format Reddit's own API rules require
// ("platform:app_id:version (by /u/username)" is their suggested form; this
// codebase's existing simpler form was already accepted in production use
// by reddit.ts, reused verbatim here rather than inventing a second format).
export function redditUserAgent(): string {
  const username = process.env.REDDIT_USERNAME ?? 'bot'
  return `supplement-intelligence/1.0 by /u/${username}`
}
