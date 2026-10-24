// L4 audio mixer. Graph: group gain -> group duck -> master -> masterLp -> compressor -> destination.
// Voices (sfx.ts / music.ts) connect their own voiceGain (+ panner) to res.audio.groups[group].
// Spec: docs/architecture-resources-2.md §3, architecture-assets-audio.md §4. No module state: nodes live in res.audio.
import type { Resources } from '../assets/resources.ts'
import type { Group } from '../assets/sounds.ts'

// Bump when the topology changes: ensureMixer then rebuilds the nodes on the same AudioContext.
export const MIXER_VERSION = 1

const GROUP_IDS: readonly Group[] = ['music', 'amb', 'sfx', 'ui']
const GROUP_GAIN: Readonly<Record<Group, number>> = { music: 0.55, amb: 0.45, sfx: 0.9, ui: 0.7 }
const LP_HZ = 18000 // masterLp rest frequency; sfx.ts dips it for the hurt sound
type DuckNode = GainNode & { target?: number } // last linear duck target set through setDuck (undefined = 1)

function disconnectAll(res: Resources): void {
  const a = res.audio
  for (const n of [...Object.values(a.groups ?? {}), ...Object.values(a.duck ?? {}), a.master, a.masterLp, a.comp]) n?.disconnect()
}

export function ensureMixer(res: Resources): void {
  const a = res.audio
  const ctx = a.ctx
  if (!ctx || (a.graphVersion === MIXER_VERSION && a.master && a.comp && a.masterLp && a.groups && a.duck)) return
  // Carry the live levels over a rebuild so a hot swap does not pop or fade in from silence.
  const oldDuck = a.duck
  const startMaster = Math.max(0, a.lastMaster)
  disconnectAll(res)
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.knee.value = 12
  comp.ratio.value = 4
  comp.attack.value = 0.005
  comp.release.value = 0.2
  comp.connect(ctx.destination)
  const masterLp = ctx.createBiquadFilter()
  masterLp.type = 'lowpass'
  masterLp.frequency.value = LP_HZ
  masterLp.Q.value = Math.SQRT1_2 // flat passband, no resonance bump below the cutoff
  masterLp.connect(comp)
  const master = ctx.createGain()
  master.gain.value = startMaster
  master.connect(masterLp)
  const groups = {} as Record<Group, GainNode>
  const duck = {} as Record<Group, GainNode>
  for (const g of GROUP_IDS) {
    const d: DuckNode = ctx.createGain()
    const old: DuckNode | undefined = oldDuck?.[g]
    d.gain.value = old?.gain.value ?? 1
    d.target = old?.target
    d.connect(master)
    const gain = ctx.createGain()
    gain.gain.value = GROUP_GAIN[g]
    gain.connect(d)
    duck[g] = d
    groups[g] = gain
  }
  a.master = master; a.masterLp = masterLp; a.comp = comp; a.groups = groups; a.duck = duck
  a.graphVersion = MIXER_VERSION
}

// Master target = muted ? 0 : volume squared (perceptual curve). Touches the param only when the target changed.
export function setMaster(res: Resources, vol: number, muted: boolean): void {
  const a = res.audio
  if (!a.ctx || !a.master) return
  const v = muted || !(vol > 0) ? 0 : Math.min(1, vol) ** 2
  if (v === a.lastMaster) return
  a.lastMaster = v
  a.master.gain.setTargetAtTime(v, a.ctx.currentTime, 0.05)
}

// Duck one group by `db` (-Infinity = silent) with time constant `tc` seconds. The last target is remembered on the
// duck node itself (it lives in the registry, so it survives hot swaps) to skip redundant per-step automation.
export function setDuck(res: Resources, group: Group, db: number, tc: number): void {
  const a = res.audio
  const node: DuckNode | undefined = a.duck?.[group]
  if (!a.ctx || !node || Number.isNaN(db)) return
  const lin = db === -Infinity ? 0 : 10 ** (Math.min(0, db) / 20) // ducks only attenuate
  if (node.target === lin) return
  node.target = lin
  node.gain.setTargetAtTime(lin, a.ctx.currentTime, Math.max(0, tc))
}

// Attack (duck deepens) and release (duck lifts) time constants in seconds for a duck of depth `db` on `group`.
// duckFor (trigger.ts) gives each case a distinct (group, depth) pair, so the reason is derivable from the dB alone:
//   music/amb -6 = perfect parry 0.01 / 0.6 | music -3 = low HP 0.5 / 0.5 | music/amb -10, sfx -inf = pause 0.1 / 0.2
//   amb -9 = beacon lit 0.05 / 0.1 | anything else (dead/won -12 / -6, ...) 0.1 / 0.1
// Limit: the same depth from another cause (amb -6 and -10 only ever come from flare / pause today) shares its timing.
function duckTimes(group: Group, db: number): readonly [number, number] {
  if (group === 'music' && db === -3) return [0.5, 0.5]
  if ((group === 'music' || group === 'amb') && db === -6) return [0.01, 0.6]
  if (((group === 'music' || group === 'amb') && db === -10) || (group === 'sfx' && db === -Infinity)) return [0.1, 0.2]
  if (group === 'amb' && db === -9) return [0.05, 0.1]
  return [0.1, 0.1]
}

// Per-step entry for the four group ducks in dB. Deepening a duck uses the new depth's attack, lifting one uses the
// release of the depth being left (the node's remembered linear target converted back to dB).
export function applyDucks(res: Resources, d: Readonly<Record<Group, number>>): void {
  for (const g of GROUP_IDS) {
    const prev = (res.audio.duck?.[g] as DuckNode | undefined)?.target ?? 1
    const prevDb = prev <= 0 ? -Infinity : Math.round(20 * Math.log10(prev))
    const db = d[g]
    setDuck(res, g, db, db < prevDb ? duckTimes(g, db)[0] : duckTimes(g, prevDb)[1])
  }
}
