// Pure core: the purposed dressing props of a cave and the water anchors among them. No render, assets, DOM or State imports, so the node
// check runner can load it and both render/dressing.ts (drawn props) and render/depth-tone.ts (wetField) read ONE derivation.
// Deterministic in its arguments; writes no State and draws no rand().
import { CAVE_DRESSING, dressingAt, dressingJitter } from './cave-props.ts'
import type { DressingProp } from './cave-props.ts'
import { guideFields } from './cave-guide.ts'
import type { GuideFields } from './cave-guide.ts'
import { purposeDef } from './cave-purpose.ts'

// Everything the derivation reads. Tile indexes are ty * w + tx. `room` is the Beacon-room mask (world/caches.ts getBeaconRoom, 1 = in room)
// and `veins` the vein tile indexes; the caller passes them in because core cannot import world/ or State.
export type CaveIn = {
  tiles: string; w: number; h: number; seed: number
  entrance: number; beacon: number; exitTx: number; exitTy: number
  room: Uint8Array; veins: readonly number[]
}
export type PurposedCave = { g: GuideFields; props: DressingProp[]; water: DressingProp[] }

// Tiles that stay free of props: entrance, a 5x7 box around the exit, the Beacon room and vein walls. Same rule as render/cracks.ts cleanCells.
// ponytail: cleanCells (cracks.ts, imports depth-tone) cannot be imported from core and is outside this chunk, so the rule lives here too.
// Upgrade path: make cleanCells call this and delete its copy; the checks that pin cleanCells keep guarding both.
export function cleanSkip(c: CaveIn): (i: number) => boolean {
  const { w, entrance, exitTx, exitTy, room } = c, veins = new Set(c.veins)
  return (i) => i === entrance || (Math.abs(i % w - exitTx) <= 2 && Math.abs(Math.floor(i / w) - exitTy) <= 3) || room[i] === 1 || veins.has(i)
}

// ponytail: size-1 memo, same precedent as guideFields. Keyed on the tiles string, dims, endpoints, seed, exit, the room mask identity and
// the vein list; a hot swap or a new cave just rebuilds. Upgrade to a small LRU if two caves are ever read in the same frame.
let last: { c: CaveIn; out: PurposedCave } | null = null
const same = (a: CaveIn, b: CaveIn): boolean =>
  a.tiles === b.tiles && a.w === b.w && a.h === b.h && a.seed === b.seed && a.entrance === b.entrance && a.beacon === b.beacon
  && a.exitTx === b.exitTx && a.exitTy === b.exitTy && a.room === b.room
  && a.veins.length === b.veins.length && a.veins.every((v, i) => v === b.veins[i])

// The water props (purpose class wet) among a prop list, order kept.
export const waterOf = (props: readonly DressingProp[]): DressingProp[] => props.filter(p => CAVE_DRESSING[p.def].water)

// Every purposed prop in lattice order (3x3 blocks, anchor x % 3 === 1, y % 3 === 1): the slot gate dressingAt stays, purposeDef decides
// what goes there or rejects it, and a prop whose 3x3 neighbourhood touches a skipped tile is dropped. `water` = the class-wet subset, order kept.
// Callers must treat the result as read-only.
export function purposedCave(c: CaveIn): PurposedCave {
  if (last && same(last.c, c)) return last.out
  const { tiles, w, h, seed } = c, g = guideFields(tiles, w, h, c.entrance, c.beacon), skip = cleanSkip(c), props: DressingProp[] = []
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    if (dressingAt(tiles, w, h, x, y, seed) < 0) continue
    const def = purposeDef(g, x, y, seed)
    if (def < 0) continue
    let clear = true
    for (let dy = -1; clear && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (skip((y + dy) * w + x + dx)) clear = false
    if (!clear) continue
    const [jx, jy] = dressingJitter(x, y, seed)
    props.push({ tile: y * w + x, def, x: x * 32 + 16 + jx, y: y * 32 + 16 + jy })
  }
  const out: PurposedCave = { g, props, water: waterOf(props) }
  last = { c: { ...c, veins: c.veins.slice() }, out }
  return out
}
