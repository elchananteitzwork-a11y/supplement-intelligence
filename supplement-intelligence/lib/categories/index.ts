// ── Category Registry — entry point ───────────────────────────────────────
//
// This file registers all category modules. Adding a new category:
//   1. Create lib/categories/<name>/index.ts implementing CategoryModule
//   2. import and register it here
//   3. Add the matching entry to lib/categories/client-config.ts

import { categoryRegistry } from './registry'
import { supplementsModule } from './supplements'

categoryRegistry.register(supplementsModule)

export { categoryRegistry }
export type { CategoryModule } from './types'
export { supplementsModule }
