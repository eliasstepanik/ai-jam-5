// Audio-only choices vary per fall, preserve the rock family voice cap and never alter State.
import { SOUNDS } from '../assets/sounds.ts'
import { soundFile } from '../assets/sound-variants.ts'
import { init } from '../core/state.ts'
const ok = (c: boolean, msg: string): void => { if (!c) throw Error('rock samples: ' + msg) }
export function run(): void {
  const s = init(), before = JSON.stringify(s), counts = new Map<string, number>()
  for (let seq = 0; seq < 1200; seq++) {
    const file = soundFile('sfx_rock-impact', seq)
    ok(file === soundFile('sfx_rock-impact', seq), 'repeated event has stable selection')
    ok((SOUNDS['sfx_rock-impact'].variants as readonly string[]).includes(file), 'only supplied alternatives')
    counts.set(file, (counts.get(file) ?? 0) + 1)
  }
  ok(counts.size === 3 && [...counts.values()].every(n => n > 300 && n < 500), 'all three alternatives selected without heavy bias')
  ok(SOUNDS['sfx_rock-impact'].cap === 4 && !('layers' in SOUNDS['sfx_rock-impact']), 'shared four-voice family cap, no stacked variants')
  ok(soundFile('sfx_player-walk', 5) === 'sfx_player-walk' && soundFile('sfx_hurt', 5) === 'sfx_hurt', 'other sounds retain their original sample lookup')
  ok(JSON.stringify(s) === before, 'cosmetic choice does not mutate gameplay State or RNG')
}
