// L0 core: mulberry32 PRNG, FNV-1a hash, stored and local random streams.
// Spec: docs/architecture-determinism.md §2 (code verbatim), architecture-modules-core.md §3.3.
import type { State } from './types.ts'

// Advance a mulberry32 state. Returns [nextState, uint32 output].
export function step32(a: number): [number, number] {
  a = (a + 0x6d2b79f5) >>> 0
  let t = a
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [a, (t ^ (t >>> 14)) >>> 0]
}

// FNV-1a 32-bit over a string (UTF-16 code units).
export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193)
  return h >>> 0
}

// Derive an independent stream seed from (seed, tag). Final avalanche (murmur3 fmix32).
export function hashSeed(seed: number, tag: string): number {
  let h = fnv1a(tag) ^ Math.imul(seed >>> 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

// 1) Stored stream: state lives in s.rng[name]. Used by update().
export type StreamName = 'gameplay' | 'cosmetic'
export function rand(s: State, name: StreamName): number { // float in [0, 1)
  const [next, out] = step32(s.rng[name])
  s.rng[name] = next
  return out / 4294967296
}
export const randRange = (s: State, n: StreamName, lo: number, hi: number): number => lo + (hi - lo) * rand(s, n)
export const randInt = (s: State, n: StreamName, lo: number, hiIncl: number): number => lo + Math.floor(rand(s, n) * (hiIncl - lo + 1))
export const chance = (s: State, n: StreamName, p: number): boolean => rand(s, n) < p
export function pick<T>(s: State, n: StreamName, xs: readonly T[]): T { return xs[randInt(s, n, 0, xs.length - 1)] }

// 2) Local stream: a closure for pure generation code (no State yet). Used by generateCave().
export type Rnd = { next: () => number; int: (lo: number, hiIncl: number) => number; state: () => number }
export function makeRnd(seed: number): Rnd {
  let a = seed >>> 0
  const next = (): number => { const r = step32(a); a = r[0]; return r[1] / 4294967296 }
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), state: () => a }
}
