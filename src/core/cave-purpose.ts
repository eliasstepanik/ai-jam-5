// L0 core: purposeful cave dressing (cave overhaul G2). Pure: guide fields in, a prop class and a CAVE_DRESSING index out.
// Spec: KB projects/ai-jam-5/cave-overhaul-design-gen.md §2 (class table) and plan row G2. No State, no DOM, no rand(s, ..): stateless hash2 only.
// dressingAt (cave-props.ts, frozen) still decides where a slot exists; purposeDef decides what goes there, or rejects it.
// New hash salts: 0xdda6 (variant inside a pool, wall reject) and 0xdda7 (crumb honesty).
import { CAVE_DRESSING, dressingWall } from './cave-props.ts'
import type { DressingDef } from './cave-props.ts'
import type { GuideFields } from './cave-guide.ts'
import { hash2 } from './noise.ts'

export type PurposeClass = 'landmark' | 'collapse' | 'lair' | 'wet' | 'crumb' | 'cover' | 'life' | 'none'
type Pooled = Exclude<PurposeClass, 'none'>

const series = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => prefix + String(i + 1).padStart(2, '0'))
// Frame names per class, as in the design table. Every name must exist in CAVE_DRESSING (resolved below, checked by cave-guide.check.ts).
export const POOL_NAMES: Record<Pooled, readonly string[]> = {
  landmark: [...series('ground_stalagmite_cluster_', 2), ...series('ground_mushroom_amber_', 3)],
  collapse: [...series('ground_fallen_branch_', 2), ...series('ground_mineral_crust_', 3)],
  lair: [...series('ground_dry_leaves_', 2), ...series('ground_roots_', 2), ...series('ground_mushroom_bonnet_', 3)],
  wet: [...series('ground_water_puddle_', 10), ...series('ground_wet_gravel_', 2)],
  crumb: [...series('ground_mushroom_puffball_', 2), ...series('ground_moss_patch_', 4)],
  cover: series('ground_stalagmite_cluster_', 2),
  life: [...series('ground_cave_fern_', 3), ...series('ground_moss_patch_', 4), ...series('ground_roots_', 2)],
}
export const WALL_POOL_NAMES = {
  lichen: series('wall_lichen_', 2),
  rootMoss: [...series('wall_root_network_', 3), ...series('wall_moss_drape_', 4)],
  shelf: series('wall_mushroom_shelf_', 3),
} as const

function indexOf(name: string): number {
  const k = CAVE_DRESSING.findIndex((d) => d.name === name)
  if (k < 0) throw new Error('cave purpose: unknown dressing frame ' + name)
  return k
}
const POOLS = Object.fromEntries(Object.entries(POOL_NAMES).map(([c, names]) => [c, names.map(indexOf)])) as unknown as Record<Pooled, readonly number[]>
const WALL_POOLS = {
  lichen: WALL_POOL_NAMES.lichen.map(indexOf), rootMoss: WALL_POOL_NAMES.rootMoss.map(indexOf), shelf: WALL_POOL_NAMES.shelf.map(indexOf),
}

const SLOT_P = 0.55 // dressingAt keeps a slot only when hash2(.., seed ^ 0xdda0) < 0.55; purposeDef reuses that value, rescaled to [0, 1), as its density roll
const DECOY_R = 6 // decoy mouths lie within this Chebyshev radius of the route (design: 6)
const HONEST = 0.65 // share of main-route slots that carry an honest crumb
const BEACON_ROOM = 10 // distB below this is the Beacon chamber: no wet "bulb" there (the Beacon is the depth maximum)

// Density factor per class vs d01 (design table, last column). 'none' never places.
function density(c: PurposeClass, d01: number): number {
  switch (c) {
    case 'collapse': return 0.4 + 0.6 * d01
    case 'lair': return 0.3 + 0.7 * d01
    case 'wet': return 0.8
    case 'crumb': return 0.6
    case 'life': return 1 - 2 * d01
    case 'none': return 0
    default: return 1 // landmark, cover
  }
}

function near(g: GuideFields, x: number, y: number, r: number, f: (j: number) => boolean): boolean {
  for (let ny = Math.max(0, y - r); ny <= Math.min(g.h - 1, y + r); ny++) {
    for (let nx = Math.max(0, x - r); nx <= Math.min(g.w - 1, x + r); nx++) if (f(ny * g.w + nx)) return true
  }
  return false
}

// A dressingAt slot, replayed from the guide fields: lattice tile, hash gate (same 0xdda0 read as dressingAt), 3x3 block of floor.
function slotShape(g: GuideFields, x: number, y: number, seed: number): boolean {
  if (x % 3 !== 1 || y % 3 !== 1 || x < 1 || y < 1 || x >= g.w - 1 || y >= g.h - 1 || hash2(x, y, seed ^ 0xdda0) >= SLOT_P) return false
  return !near(g, x, y, 1, (j) => g.wd[j] === 0)
}

// Branch leaves the route here: a non-main floor tile within 2 whose Beacon distance is more than 2 above this tile's.
function junction(g: GuideFields, x: number, y: number): boolean {
  const i = y * g.w + x
  return near(g, x, y, 2, (j) => g.depth[j] >= 0 && !g.main[j] && g.distB[j] > g.distB[i] + 2)
}

function mainParent(g: GuideFields, i: number): number {
  const want = g.depth[i] - 1, x = i % g.w
  if (i >= g.w && g.main[i - g.w] && g.depth[i - g.w] === want) return i - g.w
  if (x > 0 && g.main[i - 1] && g.depth[i - 1] === want) return i - 1
  if (x + 1 < g.w && g.main[i + 1] && g.depth[i + 1] === want) return i + 1
  if (i + g.w < g.depth.length && g.main[i + g.w] && g.depth[i + g.w] === want) return i + g.w
  return -1
}

// Lowest-depth main tile in the 3x3 footprint of the slot at (x, y), or -1. Blocks of 3x3 partition the map, so each main tile has one slot.
function anchor(g: GuideFields, x: number, y: number): number {
  let best = -1
  for (let ny = Math.max(0, y - 1); ny <= Math.min(g.h - 1, y + 1); ny++) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(g.w - 1, x + 1); nx++) {
      const j = ny * g.w + nx
      if (g.main[j] && (best < 0 || g.depth[j] < g.depth[best])) best = j
    }
  }
  return best
}

const candidate = (g: GuideFields, x: number, y: number, seed: number): boolean => slotShape(g, x, y, seed) && anchor(g, x, y) >= 0 && junction(g, x, y)

// Max one landmark per 12 main tiles: a junction slot on the route wins only if no earlier junction slot has its anchor in the same 12-deep window.
function landmark(g: GuideFields, x: number, y: number, seed: number): boolean {
  if (!candidate(g, x, y, seed)) return false
  const a = anchor(g, x, y), start = g.depth[a] - g.depth[a] % 12
  for (let cur = mainParent(g, a); cur >= 0 && g.depth[cur] >= start; cur = mainParent(g, cur)) {
    const cx = cur % g.w, cy = (cur - cx) / g.w, lx = cx - cx % 3 + 1, ly = cy - cy % 3 + 1
    if (anchor(g, lx, ly) === cur && candidate(g, lx, ly, seed)) return false
  }
  return true
}

const tipNear = (g: GuideFields, x: number, y: number, r: number): boolean => near(g, x, y, r, (j) => g.deadTip[j] === 1)

// A slot is a 3x3 block, so it is "on the route" when the route touches its footprint (main runs 1-2 wide: a centre-on-main test would almost never hold).
export const onRoute = (g: GuideFields, x: number, y: number): boolean => near(g, x, y, 1, (j) => g.main[j] === 1)

// Decoy mouth: off the route, within DECOY_R of it, and off every shortest route (depth + distB exceeds beaconDist), so it leads away from the Beacon.
function decoy(g: GuideFields, i: number, x: number, y: number): boolean {
  return !onRoute(g, x, y) && g.depth[i] + g.distB[i] > g.beaconDist + 1 && near(g, x, y, DECOY_R, (j) => g.main[j] === 1)
}

// A lone wall tile with floor on all 8 sides: the sculpt pass's pillar. The slot rule needs a 3x3 floor block, so a slot can sit at
// Chebyshev 2 from a pillar but never at 1; the class therefore covers Chebyshev <= 2 (design says 8-neighbour).
function pillarNear(g: GuideFields, x: number, y: number): boolean {
  return near(g, x, y, 2, (j) => {
    const px = j % g.w, py = (j - px) / g.w
    return g.wd[j] === 0 && px > 0 && py > 0 && px < g.w - 1 && py < g.h - 1 && !near(g, px, py, 1, (k) => k !== j && g.wd[k] === 0)
  })
}

// First match wins. The lair tip clause is the ring 4 \ 3 so the wet tip clause (within 3) stays reachable behind it.
export function classAt(g: GuideFields, i: number, seed: number): PurposeClass {
  if (!Number.isInteger(i) || i < 0 || i >= g.depth.length || g.depth[i] < 0) return 'none'
  const x = i % g.w, y = (i - x) / g.w, d01 = g.d01[i], onMain = g.main[i] === 1
  if (landmark(g, x, y, seed)) return 'landmark'
  const h = hash2(x, y, seed ^ 0xdda7)
  if (h < HONEST && onRoute(g, x, y)) return 'crumb'
  if (g.wd[i] <= 2 && d01 >= 0.45 && near(g, x, y, 4, (j) => g.main[j] === 1 && g.wd[j] <= 2)) return 'collapse'
  if (!onMain && ((tipNear(g, x, y, 4) && !tipNear(g, x, y, 3)) || (g.wd[i] >= 4 && d01 >= 0.5))) return 'lair'
  if (!onMain && (tipNear(g, x, y, 3) || (g.wd[i] >= 2 && g.distB[i] > BEACON_ROOM && !near(g, x, y, 3, (j) => g.depth[j] > g.depth[i] + 1)))) return 'wet'
  if (h >= HONEST && decoy(g, i, x, y)) return 'crumb'
  if (pillarNear(g, x, y)) return 'cover'
  if (d01 < 0.25) return 'life'
  return 'none'
}

// CAVE_DRESSING index for the slot at (x, y), or -1 when the class is 'none' or the density roll fails. Call it only for tiles where
// dressingAt >= 0; a non-slot tile always rolls >= 1 and is rejected.
export function purposeDef(g: GuideFields, x: number, y: number, seed: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= g.w || y >= g.h) return -1
  const i = y * g.w + x, c = classAt(g, i, seed)
  if (c === 'none' || hash2(x, y, seed ^ 0xdda0) / SLOT_P >= density(c, g.d01[i])) return -1
  const pool = POOLS[c]
  return pool[Math.floor(hash2(x, y, seed ^ 0xdda6) * pool.length)]
}

// Wall dressing for wall tile (x, y): the dressingWall gate stays, the def is remapped. The reference floor is the first of N, W, E, S.
// Beside a wet tile (Chebyshev 1) -> lichen; d01 < 0.3 -> roots / moss; a landmark within 3 -> mushroom shelf; else the original def
// survives with probability 1 - 0.6 * d01.
export function purposeWall(g: GuideFields, x: number, y: number, seed: number): DressingDef | null {
  const base = dressingWall(x, y, seed)
  if (!base || !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= g.w || y >= g.h) return null
  const i = y * g.w + x
  const ref = [i - g.w, i - 1, i + 1, i + g.w].find((j, k) => j >= 0 && j < g.depth.length && (k !== 1 || x > 0) && (k !== 2 || x + 1 < g.w) && g.depth[j] >= 0)
  if (ref === undefined) return null
  const u = hash2(x, y, seed ^ 0xdda6), pick = (pool: readonly number[]): DressingDef => CAVE_DRESSING[pool[Math.floor(u * pool.length)]]
  if (near(g, x, y, 1, (j) => g.depth[j] >= 0 && classAt(g, j, seed) === 'wet')) return pick(WALL_POOLS.lichen)
  if (g.d01[ref] < 0.3) return pick(WALL_POOLS.rootMoss)
  if (near(g, x, y, 3, (j) => g.main[j] === 1 && classAt(g, j, seed) === 'landmark')) return pick(WALL_POOLS.shelf)
  return u < g.d01[ref] * 0.6 ? null : base
}
