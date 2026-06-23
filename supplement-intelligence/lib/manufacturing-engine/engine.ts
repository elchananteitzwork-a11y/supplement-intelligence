import { manufacturingProviders } from './providers/registry'
import type { ManufacturingRequest, ManufacturingEstimate } from './types'

// ── Manufacturing engine orchestrator ──────────────────────────────────────
// Tries providers in registry order, returning the first successful result.
// If all providers fail, returns null.

export async function fetchManufacturingEstimate(
  req: ManufacturingRequest,
  timeoutMs = 12_000,
): Promise<ManufacturingEstimate | null> {
  const enabled = manufacturingProviders.filter(p => p.enabled)
  if (!enabled.length) return null

  for (const provider of enabled) {
    try {
      const result = await Promise.race([
        provider.fetch(req),
        new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs)),
      ])
      if (result) return result
    } catch (e) {
      console.error(`[ManufacturingEngine] provider ${provider.id} failed`, e)
    }
  }
  return null
}
