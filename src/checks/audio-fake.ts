// Recording fake AudioContext for the Node-side audio checks (B1 #101, B2 #102, B3 #103).
// Node has no OfflineAudioContext, so checks drive this fake instead of a real context.
// It implements only the runtime surface src/audio/* actually uses from BaseAudioContext/
// AudioContext: the create* factories, AudioParam automation, connect/disconnect,
// start/stop, currentTime, state, resume/suspend and createBuffer with real Float32Array
// channels (so noiseBuffers in synth.ts runs unmodified).
// Not a *.check.ts: check-guard's wiring pass ignores it; B1-B3 import it.
// Layer note (D-CHECK): src/checks/* importing DOM-free src/audio/* is a recorded
// deviation from architecture.md §4 / R-043; the owner records ruling R-043a.
// No DOM, no timers, no node: imports, no module-level mutable state (factory is fresh).

export type FakeParamEvent = { type: string; value: number; time: number; tc?: number }

export type FakeParam = {
  value: number
  events: FakeParamEvent[]
  setValueAtTime(v: number, t: number): FakeParam
  linearRampToValueAtTime(v: number, t: number): FakeParam
  setTargetAtTime(v: number, t: number, tc: number): FakeParam
  exponentialRampToValueAtTime(v: number, t: number): FakeParam
  cancelScheduledValues(t: number): FakeParam
}

export type FakeAudioBuffer = {
  numberOfChannels: number
  length: number
  sampleRate: number
  duration: number
  getChannelData(channel: number): Float32Array
}

export type FakeNode = {
  kind: string
  started: number | null // start(t) time, null until started
  stopped: number | null // stop(t) time, null until stopped
  connections: FakeNode[] // connect() node targets, in order
  paramConnections: FakeParam[] // connect() AudioParam targets (ConstantSource -> param drives)
  onended: (() => void) | null
  // per-kind members; present only on the kinds that own them (union-style fake)
  gain?: FakeParam
  pan?: FakeParam
  offset?: FakeParam
  delayTime?: FakeParam
  frequency?: FakeParam
  detune?: FakeParam
  Q?: FakeParam
  playbackRate?: FakeParam
  threshold?: FakeParam
  knee?: FakeParam
  ratio?: FakeParam
  attack?: FakeParam
  release?: FakeParam
  type?: string
  buffer?: FakeAudioBuffer | null
  loop?: boolean
  loopStart?: number
  loopEnd?: number
  connect(target: FakeNode | FakeParam): FakeNode | FakeParam
  disconnect(target?: FakeNode | FakeParam): void
  start(t: number, off?: number): void
  stop(t: number): void
}

export type FakeCtx = {
  nodes: FakeNode[] // every created node, in creation order
  violations: string[] // invariant breaches recorded by the fake (B3 asserts empty)
  currentTime: number
  sampleRate: number
  state: string
  destination: FakeNode
  ctx: AudioContext // the same object, typed for real audio functions (see factory)
  createGain(): FakeNode
  createBufferSource(): FakeNode
  createOscillator(): FakeNode
  createBiquadFilter(): FakeNode
  createConstantSource(): FakeNode
  createDelay(maxSeconds?: number): FakeNode
  createStereoPanner(): FakeNode
  createDynamicsCompressor(): FakeNode
  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer
  resume(): Promise<void>
  suspend(): Promise<void>
  advance(dt: number): void // move the fake clock
  fireEnded(n: FakeNode): void // invoke n.onended if set
  live(n: FakeNode): boolean // started and not stopped before currentTime
  reset(): void // clear nodes, violations and the clock
}

/**
 * Fresh recording fake. `violations` is appended to when:
 * (a) a param value or any automation/start/stop time argument is not finite,
 * (b) stop() is scheduled before start() (either call order), or start() runs twice,
 * (c) a node is connected after it has actually stopped (its stop time <= currentTime;
 *     connecting after a future stop() is legal WebAudio and used by flame-loop).
 * cancelScheduledValues records an event with value 0 (the schema has no arg slot).
 */
export function makeFakeCtx(opts?: { sampleRate?: number }): FakeCtx {
  const nodes: FakeNode[] = []
  const violations: string[] = []
  const bad = (n: number): boolean => !Number.isFinite(n)

  const makeParam = (owner: string, name: string, initial: number): FakeParam => {
    const events: FakeParamEvent[] = []
    let v = initial
    const auto = (type: string, value: number, time: number, tc?: number): FakeParam => {
      if (bad(value) || bad(time) || (tc !== undefined && bad(tc))) {
        violations.push(`${owner}.${name}: ${type} non-finite arg (value=${value}, time=${time}${tc !== undefined ? `, tc=${tc}` : ''})`)
      }
      v = value
      events.push(tc === undefined ? { type, value, time } : { type, value, time, tc })
      return p
    }
    const p: FakeParam = {
      events,
      get value(): number {
        return v
      },
      set value(x: number) {
        if (bad(x)) violations.push(`${owner}.${name}: .value set to non-finite (${x})`)
        v = x
        events.push({ type: 'value', value: x, time: api.currentTime })
      },
      setValueAtTime: (value: number, time: number) => auto('setValueAtTime', value, time),
      linearRampToValueAtTime: (value: number, time: number) => auto('linearRampToValueAtTime', value, time),
      setTargetAtTime: (value: number, time: number, tc: number) => auto('setTargetAtTime', value, time, tc),
      exponentialRampToValueAtTime: (value: number, time: number) => auto('exponentialRampToValueAtTime', value, time),
      cancelScheduledValues: (time: number) => auto('cancelScheduledValues', 0, time),
    }
    return p
  }

  const makeNode = (kind: string): FakeNode => {
    const n: FakeNode = {
      kind,
      started: null,
      stopped: null,
      connections: [],
      paramConnections: [],
      onended: null,
      connect: (target: FakeNode | FakeParam): FakeNode | FakeParam => {
        if (n.stopped !== null && n.stopped <= api.currentTime) violations.push(`${kind}: connected after stop() time`)
        if (!target || typeof target !== 'object') {
          violations.push(`${kind}: connect() to a non-node`)
          return target
        }
        if (typeof (target as FakeNode).kind === 'string') n.connections.push(target as FakeNode)
        else if (Array.isArray((target as FakeParam).events)) n.paramConnections.push(target as FakeParam)
        else violations.push(`${kind}: connect() to a non-node`)
        return target // real connect() returns the destination: a.connect(b).connect(c) chains
      },
      disconnect: (target?: FakeNode | FakeParam): void => {
        if (!target) {
          n.connections.length = 0
          n.paramConnections.length = 0
        } else {
          const i = n.connections.indexOf(target as FakeNode)
          if (i >= 0) n.connections.splice(i, 1)
          else {
            const j = n.paramConnections.indexOf(target as FakeParam)
            if (j >= 0) n.paramConnections.splice(j, 1)
          }
        }
      },
      start: (t: number, off?: number): void => {
        if (bad(t) || (off !== undefined && bad(off))) violations.push(`${kind}: start() non-finite (t=${t}, off=${off})`)
        if (n.started !== null) violations.push(`${kind}: start() called twice`)
        n.started = t
        if (n.stopped !== null && t > n.stopped) violations.push(`${kind}: start() after stop() time`)
      },
      stop: (t: number): void => {
        if (bad(t)) violations.push(`${kind}: stop() non-finite (t=${t})`)
        if (n.started !== null && t < n.started) violations.push(`${kind}: stop() before start() time`)
        n.stopped = t
      },
    }
    if (kind === 'gain') n.gain = makeParam(kind, 'gain', 1)
    if (kind === 'bufferSource') {
      n.playbackRate = makeParam(kind, 'playbackRate', 1)
      n.buffer = null
      n.loop = false
      n.loopStart = 0
      n.loopEnd = 0
    }
    if (kind === 'oscillator') {
      n.frequency = makeParam(kind, 'frequency', 440)
      n.detune = makeParam(kind, 'detune', 0)
      n.type = 'sine'
    }
    if (kind === 'biquad') {
      n.frequency = makeParam(kind, 'frequency', 350)
      n.Q = makeParam(kind, 'Q', 1)
      n.detune = makeParam(kind, 'detune', 0)
      n.type = 'lowpass'
    }
    if (kind === 'constantSource') n.offset = makeParam(kind, 'offset', 0)
    if (kind === 'delay') n.delayTime = makeParam(kind, 'delayTime', 0)
    if (kind === 'stereoPanner') n.pan = makeParam(kind, 'pan', 0)
    if (kind === 'dynamicsCompressor') {
      n.threshold = makeParam(kind, 'threshold', -24)
      n.knee = makeParam(kind, 'knee', 30)
      n.ratio = makeParam(kind, 'ratio', 12)
      n.attack = makeParam(kind, 'attack', 0.003)
      n.release = makeParam(kind, 'release', 0.25)
    }
    nodes.push(n)
    return n
  }

  const destination = makeNode('destination')

  const api: FakeCtx = {
    nodes,
    violations,
    currentTime: 0,
    sampleRate: opts?.sampleRate ?? 48000,
    state: 'running',
    destination,
    // Single cast: the fake implements only the runtime surface src/audio/* uses from
    // BaseAudioContext/AudioContext (create* factories, AudioParam automation, connect/
    // start/stop, currentTime, state). It is not structurally an AudioContext for the
    // type system, but it is duck-compatible at runtime, so checks pass `fake.ctx` to
    // real audio functions (ensureMixer, recipes). No `any` anywhere.
    get ctx(): AudioContext {
      return api as unknown as AudioContext
    },
    createGain: () => makeNode('gain'),
    createBufferSource: () => makeNode('bufferSource'),
    createOscillator: () => makeNode('oscillator'),
    createBiquadFilter: () => makeNode('biquad'),
    createConstantSource: () => makeNode('constantSource'),
    createDelay: (_maxSeconds?: number) => makeNode('delay'),
    createStereoPanner: () => makeNode('stereoPanner'),
    createDynamicsCompressor: () => makeNode('dynamicsCompressor'),
    createBuffer: (channels: number, length: number, rate: number): FakeAudioBuffer => {
      const data: Float32Array[] = []
      for (let i = 0; i < channels; i++) data.push(new Float32Array(length))
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (channel: number): Float32Array => data[channel],
      }
    },
    resume: async () => {
      api.state = 'running'
    },
    suspend: async () => {
      api.state = 'suspended'
    },
    advance: (dt: number) => {
      api.currentTime += dt
    },
    fireEnded: (n: FakeNode) => {
      if (n.onended) n.onended()
    },
    live: (n: FakeNode) => n.started !== null && (n.stopped === null || n.stopped > api.currentTime),
    reset: () => {
      nodes.length = 0
      violations.length = 0
      api.currentTime = 0
    },
  }
  return api
}
