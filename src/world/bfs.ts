// Wall-grid helpers: 1 = wall, 0 = floor. Independent of runtime solidity caches.
let queue = new Int32Array(0)

export function bfs4(g: Uint8Array, w: number, h: number, src: number, out: Int32Array = new Int32Array(w * h)): Int32Array {
  out.fill(-1)
  const n = w * h
  if (queue.length !== n) queue = new Int32Array(n)
  if (!Number.isInteger(src) || src < 0 || src >= n) return out
  let head = 0, tail = 0
  out[src] = 0
  queue[tail++] = src
  while (head < tail) {
    const i = queue[head++], x = i % w, d = out[i] + 1
    // E S W N, with explicit bounds so open map edges never wrap rows.
    const nb = [x + 1 < w ? i + 1 : -1, i + w < n ? i + w : -1, x > 0 ? i - 1 : -1, i >= w ? i - w : -1]
    for (const j of nb) if (j >= 0 && !g[j] && out[j] < 0) {
      out[j] = d
      queue[tail++] = j
    }
  }
  return out
}

// Walk downhill from `to` to the source, including both endpoints (CG1 §7).
export function shortestPath(dist: Int32Array, w: number, to: number): number[] {
  if (!Number.isInteger(to) || to < 0 || to >= dist.length || dist[to] < 0) return []
  const path: number[] = [to]
  let i = to
  while (dist[i] > 0) {
    const x = i % w
    const nb = [x + 1 < w ? i + 1 : -1, i + w < dist.length ? i + w : -1, x > 0 ? i - 1 : -1, i >= w ? i - w : -1]
    const j = nb.find((j) => j >= 0 && dist[j] === dist[i] - 1)
    if (j === undefined) return []
    path.push(j)
    i = j
  }
  return path
}
