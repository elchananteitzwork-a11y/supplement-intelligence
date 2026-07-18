import { SignalEngine }              from './engine'
import { KeepaProvider }             from './providers/keepa'
import { GoogleTrendsProvider }      from './providers/google-trends'
import { DataForSeoTrendsProvider }  from './providers/dataforseo-trends'
import { TikTokProvider }            from './providers/tiktok'
import { RedditProvider }            from './providers/reddit'
import { MetaAdsProvider }           from './providers/meta-ads'
import { CompetitionSignalProvider } from './providers/competition'
import { ScienceProvider }           from './providers/science'

// To add a new provider:
//   1. Implement SignalProvider in providers/<name>.ts
//   2. Import it here
//   3. Instantiate and add it to the array below
//   Nothing else needs to change — the engine and routes pick it up automatically.

// Roadmap M2.14: DataForSeoTrendsProvider is registered but disabled by
// default (DATAFORSEO_TRENDS_ENABLED unset) — coexists with the live
// GoogleTrendsProvider without affecting any real analysis until
// explicitly enabled for validation.
const providers = [
  new KeepaProvider(),
  new GoogleTrendsProvider(),
  new DataForSeoTrendsProvider(),
  new TikTokProvider(),
  new RedditProvider(),
  new MetaAdsProvider(),
  new CompetitionSignalProvider(),
  new ScienceProvider(),
]

// Roadmap M3.5 (TikTok Shop Intelligence / Social Commerce) — deliberately
// NOT instantiated into the `providers` array above. TikTokShopProvider
// (lib/signal-engine/providers/tiktok-shop.ts) IS a real, fully-implemented
// SignalProvider — but its `social_commerce` field is deliberately absent
// from engine.ts's `dims` array, so registering it here would mean every
// uncached live analysis across the whole app (any category, via
// `signalEngine` below) pays for a real Apify call whose result
// SignalEngine.aggregate() then silently drops — real cost, zero surfaced
// benefit. (An earlier version of this file registered it anyway; caught
// and reverted before this milestone shipped.) Its one real consumer,
// lib/watchlist/recheck.ts, instantiates `new TikTokShopProvider()` and
// calls `.fetch()` directly, bypassing this registry and SignalEngine
// entirely — see that file's header comment.

// Singleton engine used by all API routes.
export const signalEngine = new SignalEngine(providers)
