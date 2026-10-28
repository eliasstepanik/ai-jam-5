// L3 systems: monster director (spawn interval, alive cap, weighted pick, unseen far despawn, spawn position search).
// Spec: docs/architecture-monsters-ai-2.md §5 (director, findSpawn), §3 (mineral attractMul), §7 (ramp);
// docs/architecture-world-queries.md §6 (sampleSpawn). Must never import monsters.ts (layer rule, modules-systems §1).
// Escape table (B8): playtest-tuning-1 §4: 0.9 s interval, cap 10, gap 220..340 from the player alone (the cave is lit), despawn 700,
// escape distance field; 75% of spawns are placed 8-14 tiles ahead on the exit route. Never imports quake/rocks/combat/beacon.
import type { MonsterKind, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { rand, randRange } from '../core/rng.ts'
import { T, zt } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { idx, inMap, TILE, tileToWorld, worldToTile } from '../world/grid.ts'
import { exitDistAt, getExitDist, pathDistAt } from '../world/caches.ts'
import { downhill } from '../world/route.ts'
import { lineOfSightPx } from '../world/los.ts'
import { insideLight, lightRadius } from './light.ts'
import { nearCount, startRetreat } from './ai-retreat.ts'

const KINDS: readonly MonsterKind[] = ['lurker', 'stalker', 'devourer'] // fixed pick order (spec §5)
const EPS = 1e-9 // R-127: accumulated-time thresholds compare x + EPS >= limit

// Up to T.director.spawnTries tries, 2 draws each (angle, gap), also after a hit so the draw count is fixed (as sampleSpawn).
// sampleSpawn cannot express the path-distance sanity rule |pathDist[tile] - pathDist[playerTile]| > ceil(r / 32) + 4 (it returns
// its first survivor before any caller test), so the whole loop is written here with the same draw order and solid test.
// playtest-tuning-1 §4: in escape one extra draw up front (fixed count) sends spawnAheadP of spawns onto the exit route;
// the two per-try draws are then re-read as route index + lateral offset (aheadSpot). Descent draws are unchanged.
export function findSpawn(s: State, kind: MonsterKind): { x: number; y: number } | null {
  const esc = s.meta.phase === 'escape'
  const p = s.player, K = T.monsters[kind], [g0, g1] = esc ? T.escape.spawnGapPx : T.director.spawnGapPx
  const fieldAt = esc ? exitDistAt : pathDistAt // escape: tiles are ranked by the (rock-aware) exit field, descent by the entrance field
  const pTile = idx(s, worldToTile(p.x), worldToTile(p.y)), pDist = fieldAt(s, pTile)
  const R = esc ? 0 : lightRadius(s)
  const route = esc && rand(s, 'gameplay') < T.escape.spawnAheadP
    ? downhill(s, getExitDist(s), pTile, T.escape.spawnAheadTiles[1] + 1) : null
  let result: { x: number; y: number } | null = null
  for (let k = 0; k < T.director.spawnTries; k++) {
    const a = randRange(s, 'gameplay', 0, 2 * Math.PI), g = randRange(s, 'gameplay', g0, g1)
    if (result) continue
    if (route) {
      result = aheadSpot(s, route, a, g, g0, g1, K.radiusPx)
      if (result) continue
    }
    const r = R + g
    const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r
    const tx = worldToTile(x), ty = worldToTile(y)
    if (!inMap(s, tx, ty) || circleHitsSolid(s, x, y, K.radiusPx) || (!esc && insideLight(s, x, y, K.radiusPx))) continue
    if (!esc && lineOfSightPx(s, p.x, p.y, x, y)) continue // D3: descent spawns must be out of the player's line of sight (escape unchanged)
    const d = fieldAt(s, idx(s, tx, ty))
    if (d < 0 || Math.abs(d - pDist) > Math.ceil(r / TILE) + 4) continue
    result = { x, y }
  }
  return result
}

// playtest-tuning-1 §4: reinterpret the two ring draws: a picks the route index j in [aheadMin, aheadMax] (clamped to the route;
// a shorter route falls back to the ring), g a lateral pixel offset (g01*2-1) * TILE perpendicular to the route step. Accept if
// not solid, on the exit field, and >= spawnGapPx[0] from the player (also blocks same-side spawns on a twisty route).
function aheadSpot(s: State, route: number[], a: number, g: number, g0: number, g1: number, radiusPx: number): { x: number; y: number } | null {
  const [aheadMin, aheadMax] = T.escape.spawnAheadTiles
  const j = Math.min(aheadMin + Math.floor((a / (2 * Math.PI)) * (aheadMax - aheadMin + 1)), route.length - 1)
  if (j < aheadMin) return null
  const w = s.world.w
  const jx = route[j] % w, jy = (route[j] - jx) / w, px = route[j - 1] % w, py = (route[j - 1] - px) / w
  const off = ((g - g0) / (g1 - g0) * 2 - 1) * TILE // perpendicular of step (dx,dy) is (-dy,dx)
  const x = tileToWorld(jx) - (jy - py) * off, y = tileToWorld(jy) + (jx - px) * off
  const tx = worldToTile(x), ty = worldToTile(y)
  if (!inMap(s, tx, ty) || circleHitsSolid(s, x, y, radiusPx)) return null
  if (exitDistAt(s, idx(s, tx, ty)) < 0) return null
  if (Math.hypot(x - s.player.x, y - s.player.y) < T.escape.spawnGapPx[0]) return null
  return { x, y }
}

export function stepDirector(s: State, dt: number): void {
  const esc = s.meta.phase === 'escape'
  if (!esc && s.meta.phase !== 'descent') return
  const p = s.player, dir = s.director, z = s.meta.zone
  const A = esc ? 1 : T.minerals.table[p.activeMineral].attractMul // minerals do nothing in escape
  const despawnPx = esc ? T.escape.despawnPx : T.director.despawnPx
  for (let i = s.monsters.length - 1; i >= 0; i--) { // silent despawn: not a kill, never in view
    const m = s.monsters[i]
    if (!m.seen && Math.hypot(m.x - p.x, m.y - p.y) > despawnPx) s.monsters.splice(i, 1)
  }
  dir.alive.lurker = dir.alive.stalker = dir.alive.devourer = 0
  let live = 0
  for (const m of s.monsters) if (m.ai !== 'dying') { dir.alive[m.kind] += 1; live += 1 }
  if (!esc) { // C5: near-cap enforcement every director step — the k-th near monster past the cap retreats (never splice visible monsters)
    let near = 0
    for (const m of s.monsters) {
      if (m.ai === 'dying' || Math.hypot(m.x - p.x, m.y - p.y) > T.director.nearRadius) continue
      near += 1
      if (near > T.director.nearCap && (m.ai === 'ring' || m.ai === 'stalk') && m.retreatT <= 0 && m.kind !== 'devourer') startRetreat(m)
    }
  }
  dir.spawnT -= dt
  if (dir.spawnT > EPS) return // R-127: <= EPS counts as elapsed
  dir.spawnT = esc ? T.escape.spawnIntervalS : zt(T.director.spawnIntervalS, z) / (A * (p.energy <= 0 ? T.director.flameOutSpawnMul : 1))
  if (live >= (esc ? T.escape.maxAlive : clamp(Math.round(zt(T.director.maxAlive, z) * A), 1, T.director.monstersMax))) return
  if (!esc && nearCount(s) >= T.director.nearCap) return // C5: no new shade while the near radius is full (before the pick draw, so a refusal consumes no RNG; timer already re-armed above)
  const w = KINDS.map(k => k === 'devourer' && dir.alive.devourer >= T.director.devourerMax ? 0 : zt(T.director.weights[k], z))
  let u = rand(s, 'gameplay') * w.reduce((a, b) => a + b, 0), pick = -1
  for (let i = 0; i < KINDS.length; i++) {
    if (w[i] <= 0) continue
    pick = i // a trailing positive weight also absorbs the u === sum edge
    if (u < w[i]) break
    u -= w[i]
  }
  if (pick < 0) return
  const pos = findSpawn(s, KINDS[pick])
  if (!pos) return
  const m = spawnMonster(s, KINDS[pick], pos.x, pos.y, esc ? 0 : lightRadius(s))
  if (!esc) m.awareness = 'unaware' // A5: descent spawns start unaware (escape stays relentless; stepAwareness forces hunting in escape anyway)
  dir.alive[KINDS[pick]] += 1
}
