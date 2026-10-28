import { createPixelPool, pixelClock, PIXEL_CAP, samplePixels } from '../core/pixel-particles.ts'
const ok = (c: boolean, why: string): void => { if (!c) throw new Error('pixel particles: ' + why) }
export function run(): void {
  const p = createPixelPool()
  pixelClock(p, 1, 0, true)
  samplePixels(p, 1, 0, 0, true, 1)
  const x = p.x[0], y = p.y[0]
  pixelClock(p, 1, 0.05, true); samplePixels(p, 1, 20, 0, true, 1)
  pixelClock(p, 1, 0.1, true); samplePixels(p, 1, 20, 20, true, 1)
  ok(p.x[0] === x && p.y[0] === y, 'old particles keep their spawn positions when the guide turns')
  ok([...p.x.slice(1, 4)].some(v => v < 18), 'trail records the first leg of the turn')
  const clock = p.clock, head = p.head
  pixelClock(p, 1, 1, false)
  ok(p.clock === clock && p.head === head, 'pause freezes particle time/emission')
  pixelClock(p, 1, 1.05, true); samplePixels(p, 1, 900, 900, true, 1)
  ok([...p.life].every((life, i) => !life || p.x[i] > 890), 'teleport clears an obsolete guide trail')
  samplePixels(p, 0, 40, 50, true, 1, 2); samplePixels(p, 0, 40, 50, false, 1)
  ok([...p.life].every((life, i) => !life || p.source[i] !== 0), 'extinguishing clears torch particles immediately')
  for (let n = 0; n < 1000; n++) {
    pixelClock(p, 1, 2 + n / 60, true)
    for (const source of [0, 1, 2] as const) samplePixels(p, source, n, n, true, 1)
  }
  ok(p.life.length === PIXEL_CAP && p.head > PIXEL_CAP && [...p.vy].every(v => v <= 0), 'fixed pool recycles slots and particles rise')
  const low = createPixelPool(), high = createPixelPool()
  for (let n = 0; n < 60; n++) for (const [pool, q] of [[low, 0.25], [high, 1]] as const) {
    pixelClock(pool, 2, n / 60, true); samplePixels(pool, 2, 0, 0, true, q)
  }
  ok(low.head < high.head && low.head > 0, 'quality reduces count while retaining fire')
  const anchored = createPixelPool(), fallback = createPixelPool()
  pixelClock(anchored, 1, 0, true); pixelClock(fallback, 1, 0, true)
  samplePixels(anchored, 2, 100, 100, true, 1, 0, () => [31, 47])
  ok(anchored.x[0] === 31 && anchored.y[0] === 47, 'sprite birth points override the rectangular jitter')
  samplePixels(anchored, 0, 100, 100, true, 1, 2)
  samplePixels(fallback, 0, 100, 100, true, 1, 2)
  ok(anchored.x[1] === fallback.x[0] && anchored.y[1] === fallback.y[0]
    && anchored.vy[1] === fallback.vy[0] && anchored.life[1] === fallback.life[0], 'custom Beacon origins leave torch behavior unchanged')
  pixelClock(p, 2, 20, true)
  ok(p.life.every(v => !v) && !p.head, 'new runs clear particle history')
}
