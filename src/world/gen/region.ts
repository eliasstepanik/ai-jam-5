export function largestRegion(g: Uint8Array, w: number, h: number): { keep: number; dropped: number } {
  const n = w * h, lab = new Int32Array(n), q = new Int32Array(n)
  let best = 0, bestSize = 0, next = 1, total = 0
  for (let s = 0; s < n; s++) {
    if (g[s] || lab[s]) continue
    let head = 0, tail = 0
    q[tail++] = s
    lab[s] = next
    while (head < tail) {
      const i = q[head++], x = i % w
      const nb = [x + 1 < w ? i + 1 : -1, i + w < n ? i + w : -1, x > 0 ? i - 1 : -1, i >= w ? i - w : -1]
      for (const j of nb) if (j >= 0 && !g[j] && !lab[j]) {
        lab[j] = next
        q[tail++] = j
      }
    }
    total += tail
    // Scanning seeds in index order and using strict > preserves the first tie.
    if (tail > bestSize) { bestSize = tail; best = next }
    next++
  }
  for (let i = 0; i < n; i++) if (!g[i] && lab[i] !== best) g[i] = 1
  return { keep: bestSize, dropped: total - bestSize }
}
