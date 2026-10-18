// L0 core: seed text sanitising/parsing and the random seed source.
// Spec: docs/architecture-determinism.md §5, §6 rule 1; architecture-modules-core.md §3.4.
import { fnv1a } from './rng.ts'

export const SEED_MAX_LEN = 32

export function sanitizeSeedText(raw: string): string {
  return raw.normalize('NFKC').trim().replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, SEED_MAX_LEN)
}

export function parseSeed(text: string): number {
  const t = sanitizeSeedText(text)
  if (/^\d{1,10}$/.test(t) && Number(t) <= 4294967295) return Number(t) >>> 0 // plain digits: literal
  return fnv1a(t.toLowerCase()) // text: case-insensitive hash
}

// The only crypto use in the repo (determinism §6 rule 1). Called from startRun, outside the simulation.
export const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]
