import type { CategoryModule } from './types'

// ── CategoryRegistry ───────────────────────────────────────────────────────
//
// Singleton that holds all registered category modules. Routes call
// registry.get(id) to resolve the right module; unknown ids fall back to the
// default (supplements). Adding a future category: register it in index.ts.

class CategoryRegistry {
  private readonly modules = new Map<string, CategoryModule>()

  register(module: CategoryModule): void {
    this.modules.set(module.id, module)
  }

  get(id: string): CategoryModule | undefined {
    return this.modules.get(id)
  }

  getAll(): CategoryModule[] {
    return Array.from(this.modules.values())
  }

  // Falls back to 'supplements' — always registered first.
  getDefault(): CategoryModule {
    const m = this.modules.get('supplements')
    if (!m) throw new Error('Default category (supplements) not registered')
    return m
  }

  // Resolves id → module, falling back to the default when id is unknown.
  resolve(id?: string): CategoryModule {
    if (!id) return this.getDefault()
    return this.modules.get(id) ?? this.getDefault()
  }
}

export const categoryRegistry = new CategoryRegistry()
