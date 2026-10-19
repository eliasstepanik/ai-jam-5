// L4 render: flame colour table. Spec: docs/architecture-render-3.md §1. Pure, DOM-free.
// The hexes live in T.minerals.table (core/tuning.ts); this only renames `deep` to `fringe` (values match the style table
// #c2410c / #f5b700 / #0e8f9c / #8a0a1e). Gameplay radiusMul / flickerFreq stay in systems and tuning.
import type { FlameKind } from '../core/types.ts'
import { T } from '../core/tuning.ts'

export type FlameCol = { core: string; mantle: string; fringe: string; spark: string }

const col = (k: FlameKind): FlameCol => {
  const m = T.minerals.table[k]
  return { core: m.core, mantle: m.mantle, fringe: m.deep, spark: m.spark }
}

export const FLAME_COL: Record<FlameKind, FlameCol> = {
  none: col('none'), sodium: col('sodium'), copper: col('copper'), strontium: col('strontium'),
}
