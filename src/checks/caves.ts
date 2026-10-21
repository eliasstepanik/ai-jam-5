// Check helper (no asserts, not a *.check.ts file, so all.ts never runs it): caveOf(seed) memoises generateCave(seed) so the cave,
// rocks and world checks generate each seed once (SAE4 §1.10, MW §4 caves.ts row). Callers must not mutate the shared result.
import type { CaveResult } from '../core/types.ts'
import { generateCave } from '../world/generate.ts'

// ponytail: unbounded Map keyed by seed >>> 0; about 62 entries x ~80 kB per check run. Add an LRU if checks ever loop over 1000s of seeds.
const memo = new Map<number, CaveResult>()

export function caveOf(seed: number): CaveResult {
  const key = seed >>> 0
  let res = memo.get(key)
  if (!res) { res = generateCave(key); memo.set(key, res) }
  return res
}
