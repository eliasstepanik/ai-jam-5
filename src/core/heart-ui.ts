// Render-only whole-heart loss tracking. A loss never reanimates previously empty slots.
export type HeartUi = { runId: number; hp: number; time: number; lostAt: number[] }
export function heartFrames(cache: HeartUi, hp: number, max: number, runId: number, time: number): number[] {
  if (cache.runId !== runId || time < cache.time || cache.lostAt.length !== max) {
    cache.runId = runId; cache.hp = hp; cache.lostAt = Array(max).fill(-Infinity)
  }
  for (let i = hp; i < cache.hp; i++) cache.lostAt[i] = time
  for (let i = 0; i < hp; i++) cache.lostAt[i] = -Infinity
  cache.hp = hp; cache.time = time
  return Array.from({ length: max }, (_, i) => i < hp ? 0 : time - cache.lostAt[i] < 0.18 ? 2 : 1)
}
