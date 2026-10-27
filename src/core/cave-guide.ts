// L0 core: pure cave guide fields (cave overhaul G1). Tiles + entrance + beacon in, typed arrays out. No State, no render, no world import.
// Spec: KB projects/ai-jam-5/cave-overhaul-design-gen.md §2 (guide fields G) and plan row G1. Integer math except d01.
// Indices are row-major (y * w + x). Wall = '#', every other char is floor, as in world/caches.ts baseBlocked.
export type GuideFields = {
  w: number; h: number
  beaconDist: number // depth[beacon]; 0 when the beacon is not reachable from the entrance
  depth: Int32Array // 4-neighbour BFS distance from the entrance over floor; -1 for wall and unreachable (same metric as getDepthField)
  distB: Int32Array // same BFS from the beacon
  main: Uint8Array // 1 on the true route: greedy descent from the beacon along depth, ties by lowest index, entrance..beacon inclusive
  wd: Int32Array // 4-neighbour distance to the nearest wall; wall = 0, the map edge counts as wall (edge floor = 1)
  deadTip: Uint8Array // 1 on dead-end tips: floor, depth > 0, no greater-depth neighbour, wd <= 2, not a loop closure, outside the beacon room
  d01: Float32Array // clamp(depth / beaconDist, 0, 1) on floor; 0 on wall and unreachable (render's depth01Field fills walls, this one does not)
}

const WALL = 35 // '#'
const TIP_WD = 2
// Mirrors world/gen/places.ts beaconRoomMask (CHAMBER_MASK_R = 5, depth slack 2 * R). core cannot import world.
const ROOM_R = 5, ROOM_SLACK = 10

function bfs(open: Uint8Array, w: number, h: number, src: number): Int32Array {
  const n = w * h, out = new Int32Array(n).fill(-1)
  if (!Number.isInteger(src) || src < 0 || src >= n || !open[src]) return out
  const queue = new Int32Array(n)
  let head = 0, tail = 0
  out[src] = 0
  queue[tail++] = src
  while (head < tail) {
    const i = queue[head++], x = i % w, d = out[i] + 1
    if (x + 1 < w && open[i + 1] && out[i + 1] < 0) { out[i + 1] = d; queue[tail++] = i + 1 }
    if (i + w < n && open[i + w] && out[i + w] < 0) { out[i + w] = d; queue[tail++] = i + w }
    if (x > 0 && open[i - 1] && out[i - 1] < 0) { out[i - 1] = d; queue[tail++] = i - 1 }
    if (i >= w && open[i - w] && out[i - w] < 0) { out[i - w] = d; queue[tail++] = i - w }
  }
  return out
}

// Multi-source BFS from every wall. Border floor is seeded at 1 before the walls expand, so the queue stays ordered by distance.
function wallDistance(open: Uint8Array, w: number, h: number): Int32Array {
  const n = w * h, out = new Int32Array(n).fill(-1), queue = new Int32Array(n)
  let head = 0, tail = 0
  for (let i = 0; i < n; i++) if (!open[i]) { out[i] = 0; queue[tail++] = i }
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i - x) / w
    if (open[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1)) { out[i] = 1; queue[tail++] = i }
  }
  while (head < tail) {
    const i = queue[head++], x = i % w, d = out[i] + 1
    if (x + 1 < w && out[i + 1] < 0) { out[i + 1] = d; queue[tail++] = i + 1 }
    if (i + w < n && out[i + w] < 0) { out[i + w] = d; queue[tail++] = i + w }
    if (x > 0 && out[i - 1] < 0) { out[i - 1] = d; queue[tail++] = i - 1 }
    if (i >= w && out[i - w] < 0) { out[i - w] = d; queue[tail++] = i - w }
  }
  return out
}

// Neighbour order N, W, E, S is ascending tile index, so the first match is the lowest-index parent.
function descend(depth: Int32Array, w: number, beacon: number): Uint8Array {
  const main = new Uint8Array(depth.length)
  if (!Number.isInteger(beacon) || beacon < 0 || beacon >= depth.length || depth[beacon] < 0) return main
  let i = beacon
  for (;;) {
    main[i] = 1
    if (depth[i] === 0) return main
    const want = depth[i] - 1, x = i % w
    if (i >= w && depth[i - w] === want) i -= w
    else if (x > 0 && depth[i - 1] === want) i -= 1
    else if (x + 1 < w && depth[i + 1] === want) i += 1
    else i += w // BFS guarantees a parent exists
  }
}

function tips(depth: Int32Array, wd: Int32Array, w: number, beacon: number, beaconDist: number): Uint8Array {
  const n = depth.length, out = new Uint8Array(n), bx = beacon % w, by = (beacon - bx) / w
  for (let i = 0; i < n; i++) {
    const d = depth[i]
    if (d <= 0 || wd[i] > TIP_WD) continue
    const x = i % w, y = (i - x) / w
    const up = i >= w ? depth[i - w] : -1, dn = i + w < n ? depth[i + w] : -1
    const lf = x > 0 ? depth[i - 1] : -1, rt = x + 1 < w ? depth[i + 1] : -1
    if (up > d || dn > d || lf > d || rt > d) continue
    // Two parents whose shared corner is not floor: the two arms of a loop meet here, so this is a closure, not a dead end.
    // Two parents around a floor corner are just the far corner of a 2-wide dead end and stay a tip. (4-grid is bipartite: no equal-depth neighbours.)
    const pu = up === d - 1, pd = dn === d - 1, pl = lf === d - 1, pr = rt === d - 1
    if ((pl && pr) || (pu && pd) || (pu && pl && depth[i - w - 1] < 0) || (pu && pr && depth[i - w + 1] < 0)
      || (pd && pl && depth[i + w - 1] < 0) || (pd && pr && depth[i + w + 1] < 0)) continue
    if (beaconDist > 0 && d >= beaconDist - ROOM_SLACK && Math.abs(x - bx) <= ROOM_R && Math.abs(y - by) <= ROOM_R) continue
    out[i] = 1
  }
  return out
}

// Pure builder. Returns fresh arrays on every call; use guideFields for the shared per-cave build.
export function buildGuide(tiles: string, w: number, h: number, entrance: number, beacon: number): GuideFields {
  const n = w * h, open = new Uint8Array(n)
  if (tiles.length === n) for (let i = 0; i < n; i++) open[i] = tiles.charCodeAt(i) === WALL ? 0 : 1
  const depth = bfs(open, w, h, entrance), distB = bfs(open, w, h, beacon)
  const beaconDist = Number.isInteger(beacon) && beacon >= 0 && beacon < n ? Math.max(0, depth[beacon]) : 0
  const wd = wallDistance(open, w, h), d01 = new Float32Array(n), div = Math.max(1, beaconDist)
  for (let i = 0; i < n; i++) d01[i] = depth[i] < 0 ? 0 : Math.min(1, depth[i] / div)
  return { w, h, beaconDist, depth, distB, main: descend(depth, w, beacon), wd, deadTip: tips(depth, wd, w, beacon, beaconDist), d01 }
}

// ponytail: size-1 memo keyed on the tiles string (=== is a pointer compare for the same run's string, a 76 KB compare otherwise) plus
// dims and endpoints. core has no tilesHash, and a hash would cost as much as the compare. Derived only, so a hot swap just rebuilds.
// Upgrade to a small LRU if two caves are ever drawn in the same frame. Callers must treat the arrays as read-only.
let last: { tiles: string; w: number; h: number; entrance: number; beacon: number; g: GuideFields } | null = null

export function guideFields(tiles: string, w: number, h: number, entrance: number, beacon: number): GuideFields {
  if (last && last.tiles === tiles && last.w === w && last.h === h && last.entrance === entrance && last.beacon === beacon) return last.g
  const g = buildGuide(tiles, w, h, entrance, beacon)
  last = { tiles, w, h, entrance, beacon, g }
  return g
}
