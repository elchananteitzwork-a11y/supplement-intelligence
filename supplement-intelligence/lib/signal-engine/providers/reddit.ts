import type { SignalProvider, ProviderSignals } from '../types'

// Reddit provider stub.
// When implemented, this provider will:
//   - Call the Reddit API (OAuth2 script app — free tier supports 100 QPM)
//   - Search supplement-relevant subreddits: r/Supplements, r/PCOS, r/Fitness, etc.
//   - Count posts and comments mentioning the category keyword over 90/365 days
//   - Extract sentiment from post titles and top comments
//   - Measure problem articulation frequency ("I wish", "I hate", "help with")
//
// Required env vars (once implemented):
//   REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET + REDDIT_USERNAME + REDDIT_PASSWORD
//
// Dimensions this provider will cover when live:
//   demand     — subreddit post volume as consumer awareness proxy
//   growth     — 30-day vs. 90-day mention growth rate
//   review_velocity — community sentiment from post scoring patterns

export class RedditProvider implements SignalProvider {
  readonly name    = 'reddit'
  readonly enabled = false   // flip to !!(process.env.REDDIT_CLIENT_ID) when implemented

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async fetch(_category: string): Promise<ProviderSignals | null> {
    return null
  }
}
