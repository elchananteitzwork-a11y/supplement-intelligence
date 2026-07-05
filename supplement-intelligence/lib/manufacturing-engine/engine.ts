import { manufacturingProviders } from './providers/registry'
import type { ManufacturingRequest, ManufacturingEstimate } from './types'
import { cacheGet, cacheSet } from '../provider-cache'

// ── Manufacturing engine orchestrator ──────────────────────────────────────
// Tries providers in registry order, returning the first successful result.
// If all providers fail, returns null.

// 7-day TTL: Alibaba supplier prices and availability move on the order of
// weeks, not days — a week-old estimate is still directionally accurate for
// the COGS Margin sub-signal and Manufacturing Feasibility score.
// Same pattern as the SERP cache (competition.ts) and keyword cache (dataforseo.ts).
const MFG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function cacheKey(req: ManufacturingRequest): string {
  return `mfg:v1:${req.product.toLowerCase().trim().replace(/\s+/g, '-')}:${req.category}`
}

export async function fetchManufacturingEstimate(
  req: ManufacturingRequest,
  timeoutMs = 12_000,
): Promise<ManufacturingEstimate | null> {
  const enabled = manufacturingProviders.filter(p => p.enabled)
  if (!enabled.length) return null

  // ── Manufacturing cache (7-day TTL, saves ~$0.03/hit) ──────────────────
  const key = cacheKey(req)
  const cached = await cacheGet<ManufacturingEstimate>(key)
  if (cached) {
    console.log('[ManufacturingEngine] cache HIT', { product: req.product, category: req.category })
    return cached
  }

  for (const provider of enabled) {
    try {
      const result = await Promise.race([
        provider.fetch(req),
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
      ])
      if (result) {
        cacheSet(key, provider.id, result, MFG_CACHE_TTL_MS).catch(() => {})
        return result
      }
    } catch (e) {
      console.error(`[ManufacturingEngine] provider ${provider.id} failed`, e)
    }
  }
  return null
}
