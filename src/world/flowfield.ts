// Windowed flow field: pure BFS distance field from the player tile, clipped to a
// Chebyshev window, plus the downhill step. Spec: issue #113 plan chunk 17 (F3),
// design docs/architecture-monsters-ai-2.md §4 (upgrade path).
// Determinism: neighbour order is fixed to the N4 order of src/world/grid.ts
// (E, S, W, N = [[1,0],[0,1],[-1,0],[0,-1]]) in both the BFS and flowStep tie
// breaks; any other order could flip a tie between runs.
// Pure: no imports (grid.ts is not imported because it pulls in caches.ts, and
// caches.ts imports this file: a cycle), no module-level mutable state, no RNG,
// no clocks. The caller (caches.ts, chunk 35) owns the ping-pong dist buffers.

export type FlowField = { dist: Int16Array; ptx: number; pty: number; win: number }

// E, S, W, N — identical to N4 in src/world/grid.ts (kept in sync by hand on purpose).
const N4: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]

// BFS from tile (ptx,pty) over non-solid tiles, clipped to the Chebyshev-`win`
// window and the map. Fills dist (length (2*win+1)^2) with window-local indices
// (ty - (pty - win)) * (2*win + 1) + (tx - (ptx - win)), the same formula
// flowStep uses; -1 = solid, outside the window, outside the map, or unreached.
// solid: the getSolid(s) grid (1 = solid), indexed ty * w + tx.
export function buildFlow(solid: Uint8Array, w: number, h: number, ptx: number, pty: number, win: number, dist: Int16Array): void {
  dist.fill(-1)
  if (!Number.isInteger(ptx) || !Number.isInteger(pty) || ptx < 0 || pty < 0 || ptx >= w || pty >= h) return
  if (solid[pty * w + ptx] === 1) return
  const side = 2 * win + 1
  const x0 = Math.max(0, ptx - win), x1 = Math.min(w - 1, ptx + win)
  const y0 = Math.max(0, pty - win), y1 = Math.min(h - 1, pty + win)
  // ponytail: queue allocated per build (<= 64 KB at win=40); dist is caller-owned.
  // Upgrade path: pass a caller-owned Int32Array queue if rebuild profiling shows GC pressure.
  const queue = new Int32Array(side * side)
  let head = 0, tail = 0
  dist[win * side + win] = 0
  queue[tail++] = pty * w + ptx
  while (head < tail) {
    const i = queue[head++], x = i % w, y = (i - x) / w
    const d = dist[(y - pty + win) * side + (x - ptx + win)] + 1
    for (const [dx, dy] of N4) {
      const nx = x + dx, ny = y + dy
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue
      const j = ny * w + nx
      if (solid[j] === 1) continue
      const lj = (ny - pty + win) * side + (nx - ptx + win)
      if (dist[lj] < 0) { dist[lj] = d; queue[tail++] = j }
    }
  }
}

// Downhill step from tile (tx,ty): the neighbour offset [dx,dy] with dist one
// lower, ties broken by the N4 order above. null if (tx,ty) is outside the
// window, unreached/solid (dist -1), or already at the source (dist 0).
export function flowStep(dist: Int16Array, ptx: number, pty: number, win: number, tx: number, ty: number): [number, number] | null {
  const side = 2 * win + 1
  const lx = tx - (ptx - win), ly = ty - (pty - win)
  if (lx < 0 || ly < 0 || lx >= side || ly >= side) return null
  const d = dist[ly * side + lx]
  if (d <= 0) return null
  for (const [dx, dy] of N4) {
    const nx = lx + dx, ny = ly + dy
    if (nx < 0 || ny < 0 || nx >= side || ny >= side) continue
    if (dist[ny * side + nx] === d - 1) return [dx, dy]
  }
  return null
}
