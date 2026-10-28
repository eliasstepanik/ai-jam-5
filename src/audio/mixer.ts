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
// One duck request from one cause (flare, low HP, pause, ...): depth in dB with its own attack/release
// time constants in seconds. duckFor (trigger.ts) emits the full active set per step.
export type DuckCause = { db: number; attack: number; release: number }
// Active duck causes per bus. The mixer merges them: the applied duck is the deepest active cause.
export type Duck = { music: DuckCause[]; amb: DuckCause[]; sfx: DuckCause[]; ui: DuckCause[] }
// target = last linear duck target set through setDuck (undefined = 1); rel = longest release among the
// causes holding the applied depth (undefined when unducked). Both live on the node so they survive hot swaps.
type DuckNode = GainNode & { target?: number; rel?: number }

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
  comp.threshold.value = -14
  comp.knee.value = 12
  comp.ratio.value = 4
  // Attack longer than one period of the 55-140 Hz thuds: a shorter attack modulates gain inside the cycle and crunches.
  comp.attack.value = 0.015
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
    d.rel = old?.rel
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

// Per-step entry: merge the active causes per bus. The applied duck is the deepest active cause (most
// negative dB). Deepening uses the shortest attack among the causes at the new depth; lifting uses the
// release remembered for the depth being left (the longest release among the causes that held it), so
// releasing one cause never un-ducks while another cause of equal or greater depth is still active, and
// the release automation is scheduled from the moment the last cause at that depth goes away.
// NaN depths are ignored. Per-cause timings come from duckFor (trigger.ts); spec §5 values unchanged.
export function applyDucks(res: Resources, d: Readonly<Duck>): void {
  for (const g of GROUP_IDS) {
    const node: DuckNode | undefined = res.audio.duck?.[g]
    if (!node) continue
    let db = 0
    for (const c of d[g]) if (c.db < db) db = c.db // NaN comparisons are false -> NaN causes skipped
    let attack = Infinity
    let release = 0
    for (const c of d[g]) {
      if (c.db !== db) continue
      if (c.attack < attack) attack = c.attack
      if (c.release > release) release = c.release
    }
    const prev = node.target ?? 1
    const lin = db === -Infinity ? 0 : 10 ** (Math.min(0, db) / 20)
    if (lin !== prev) setDuck(res, g, db, db < 0 && lin < prev ? attack : node.rel ?? 0.1)
    node.rel = db < 0 ? release : undefined
  }
}
