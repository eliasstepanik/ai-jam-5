// Reproducible cosmetic choice; never advances gameplay RNG or keeps module-level state.
import { hash2 } from '../core/noise.ts'
import { SOUNDS } from './sounds.ts'
import type { SoundDef, SoundId } from './sounds.ts'
export function soundFile(id: SoundId, seq: number): string {
  const def: SoundDef = SOUNDS[id], variants = def.variants
  return variants?.length ? variants[Math.floor(hash2(seq, 17, 131) * variants.length)] ?? def.file ?? id : def.file ?? id
}
