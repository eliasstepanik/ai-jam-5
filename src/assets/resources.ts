// Non-State resources: lazy data only, retained in Vite hot.data. No DOM work on import.
import type { SoundId, Group } from './sounds.ts'

export type Canvas2D = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }
export type ImageStore = {
  sheets: (HTMLImageElement | null)[]
  sheetState: ('idle' | 'loading' | 'ok' | 'failed')[]
  screens: Record<string, HTMLImageElement | null>
  rects: Map<string, readonly number[] | null>
  tints: Map<string, HTMLCanvasElement>
  gen: number; loaded: number; total: number; started: boolean
}
export type TileCache = {
  key: string
  zone: Uint8Array; mask: Uint8Array; inner: Uint8Array; variant: Uint8Array
  chunks: Map<number, HTMLCanvasElement>; lru: number[]
}
export type MemoryCache = { key: number; canvas: Canvas2D | null; img: ImageData | null; words: Int32Array }
export type LightCache = Map<string, HTMLCanvasElement>
export type Particles = {
  x0: Float32Array; y0: Float32Array; vx: Float32Array; vy: Float32Array
  born: Float32Array; life: Float32Array; size: Float32Array; drag: Float32Array; grav: Float32Array
  col: Uint8Array; add: Uint8Array; shape: Uint8Array
  head: number; lastSeq: number; runId: number
}
export type Perf = {
  frameMs: Float32Array; i: number; last: number; level: 0 | 1 | 2 | 3
  down: number; up: number; cool: number; pass: Record<string, number>
}
export type Voice = { id: SoundId; pri: number; t0: number; stopAt: number; out: GainNode; nodes: AudioScheduledSourceNode[] }
export type MusicRes = { cur: string; t0: number; srcs: AudioBufferSourceNode[]; gains: GainNode[]; danger: number }
export type AudioRes = {
  ctx: AudioContext | null
  state: 'locked' | 'running' | 'suspended' | 'failed'
  graphVersion: number
  master: GainNode | null; comp: DynamicsCompressorNode | null
  groups: Record<Group, GainNode> | null
  buffers: Map<string, AudioBuffer | null>; pending: Set<string>
  noise: { white: AudioBuffer; pink: AudioBuffer; brown: AudioBuffer } | null
  voices: Voice[]; lastStart: Map<SoundId, number>
  music: MusicRes; loops: Partial<Record<SoundId, Voice>>
  lastSeq: number; lastScreen: string
  unlock: { el: EventTarget; type: string; fn: EventListener }[]
  duck: Record<Group, GainNode> | null; masterLp: BiquadFilterNode | null
  lastMaster: number; pauseAt: number
  nextCrackle: number; nextBeat: number; crackleN: number; growlAt: number
  broken: Set<SoundId>; synthGen: number
}
export type Resources = {
  version: number
  images: ImageStore; tiles: TileCache | null; memory: MemoryCache; light: LightCache
  dark: Canvas2D | null; scratch: Canvas2D | null
  particles: Particles; perf: Perf; audio: AudioRes
  debug: { on: boolean }
  ui: { copyResult: 'none' | 'ok' | 'failed'; urlRead: boolean }
  hud: { exitA: number; lastT: number; runId: number; dist: number; distT: number } | null
}

export const RES_VERSION = 1
const P_MAX = 512
const holder: { res?: Resources } = import.meta.hot?.data ?? {}

function makeRes(ctx: AudioContext | null): Resources {
  const floats = () => new Float32Array(P_MAX), bytes = () => new Uint8Array(P_MAX)
  return {
    version: RES_VERSION,
    images: { sheets: [], sheetState: [], screens: {}, rects: new Map(), tints: new Map(),
      gen: 0, loaded: 0, total: 0, started: false },
    tiles: null,
    memory: { key: -1, canvas: null, img: null, words: new Int32Array(0) },
    light: new Map(), dark: null, scratch: null,
    particles: { x0: floats(), y0: floats(), vx: floats(), vy: floats(), born: floats(), life: floats(),
      size: floats(), drag: floats(), grav: floats(), col: bytes(), add: bytes(), shape: bytes(),
      head: 0, lastSeq: -1, runId: -1 },
    perf: { frameMs: new Float32Array(120), i: 0, last: 0, level: 0, down: 0, up: 0, cool: 0, pass: {} },
    audio: {
      ctx, state: ctx ? 'suspended' : 'locked', graphVersion: -1,
      master: null, comp: null, groups: null, buffers: new Map(), pending: new Set(), noise: null,
      voices: [], lastStart: new Map(), music: { cur: '', t0: 0, srcs: [], gains: [], danger: 0 },
      loops: {}, lastSeq: -1, lastScreen: '', unlock: [], duck: null, masterLp: null,
      lastMaster: -1, pauseAt: -1, nextCrackle: 0, nextBeat: 0, crackleN: 0, growlAt: 0,
      broken: new Set(), synthGen: -1,
    },
    debug: { on: false }, ui: { copyResult: 'none', urlRead: false }, hud: null,
  }
}

function fillRes(r: Resources): Resources {
  // Additive fields fill only missing values; active resources and cursors stay intact.
  r.debug ??= { on: false }
  r.scratch ??= null
  r.ui ??= { copyResult: 'none', urlRead: false }
  r.ui.urlRead ??= false
  r.hud ??= null
  r.audio.duck ??= null
  r.audio.masterLp ??= null
  r.audio.lastMaster ??= -1
  r.audio.pauseAt ??= -1
  r.audio.nextCrackle ??= 0
  r.audio.nextBeat ??= 0
  r.audio.crackleN ??= 0
  r.audio.growlAt ??= 0
  r.audio.broken ??= new Set()
  r.audio.synthGen ??= -1
  return r
}

function releaseRes(r: Resources): void {
  const canvases = new Set<HTMLCanvasElement>([...r.images.tints.values(), ...r.light.values(), ...r.tiles?.chunks.values() ?? []])
  for (const c of [r.memory.canvas, r.dark, r.scratch]) if (c) canvases.add(c.canvas)
  for (const canvas of canvases) canvas.width = canvas.height = 0
  r.images.tints.clear(); r.images.rects.clear(); r.light.clear(); r.tiles?.chunks.clear()
  const sources = new Set<AudioScheduledSourceNode>(r.audio.music.srcs)
  const outputs = new Set<AudioNode>(r.audio.music.gains)
  for (const v of new Set([...r.audio.voices, ...Object.values(r.audio.loops)])) {
    for (const node of v.nodes) sources.add(node)
    outputs.add(v.out)
  }
  for (const src of sources) {
    try { src.stop() } catch { /* An already-ended source is safe to discard. */ }
    src.disconnect()
  }
  for (const node of outputs) node.disconnect()
  for (const node of [...Object.values(r.audio.groups ?? {}), ...Object.values(r.audio.duck ?? {}),
    r.audio.masterLp, r.audio.master, r.audio.comp]) node?.disconnect()
  r.audio.voices.length = 0
  r.audio.music.srcs.length = 0; r.audio.music.gains.length = 0
  r.audio.loops = {}
  // Keep the page's AudioContext, decoded buffers and listener handles; never close it.
}

export function getResources(): Resources {
  const r = holder.res
  if (r?.version === RES_VERSION) return fillRes(r)
  if (r) releaseRes(r)
  const next = makeRes(r?.audio.ctx ?? null)
  if (r) {
    next.audio.buffers = r.audio.buffers
    next.audio.noise = r.audio.noise
    next.audio.unlock = r.audio.unlock
    next.ui = r.ui // URL reads and clipboard effects must not repeat on a version rebuild.
  }
  holder.res = next
  return next
}
