// ── Category Registry — entry point ───────────────────────────────────────
//
// This file registers all category modules. To add a new category:
//   1. Create lib/categories/<name>/index.ts implementing CategoryModule
//   2. Import and register it here (one line each)
//   3. Add the matching entry to lib/categories/client-config.ts

import { categoryRegistry } from './registry'
import { supplementsModule } from './supplements'
import { beautyModule }      from './beauty'
import { petsModule }        from './pets'
import { fitnessModule }     from './fitness'
import { homeModule }        from './home'

categoryRegistry.register(supplementsModule)
categoryRegistry.register(beautyModule)
categoryRegistry.register(petsModule)
categoryRegistry.register(fitnessModule)
categoryRegistry.register(homeModule)

export { categoryRegistry }
export type { CategoryModule } from './types'
export { supplementsModule, beautyModule, petsModule, fitnessModule, homeModule }
export { classifyQuery } from './open-discovery/classifier'
