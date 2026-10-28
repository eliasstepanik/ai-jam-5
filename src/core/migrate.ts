// L0 core: idempotent deep default fill for hot swaps (the game.ts migrate export) and the entity DEFAULT_* templates.
// Spec: docs/architecture-state-3.md §1-§3, §7; architecture-modules-core.md §3.7/§5 (C10 clone defaults, C11 no Json type);
// R-022; entity field sets mirror src/core/types.ts, extras from architecture-rulings-2.md §9 (R-067/R-068/R-130).
// Pure: never mutates `old`, never reads Input, DOM or storage. Fills missing defaults only; never transforms a valid value.
// A new entity field needs its default in the matching DEFAULT_* below in the same edit (state.check compares key sets).
import type { Best, FxEvent, Monster, Pickup, Rock, RunResult, Settings, State, Toast, Vein } from './types.ts'
import { STATE_VERSION, init } from './state.ts'
import { DEFAULT_BEST, DEFAULT_RESULT } from './score.ts'

// Key sets equal types.ts; values are the spawn defaults. Frozen: fill() hands out clones, never these objects.
// ponytail: freeze is shallow (DEFAULT_ROCK.tiles is a live empty array); fill() always clones it. Deep-freeze if someone mutates it.
export const DEFAULT_MONSTER: Readonly<Monster> = Object.freeze({
  id: 0, kind: 'lurker', x: 0, y: 0, vx: 0, vy: 0, hp: 1, ai: 'ring', aiT: 0, aiDur: 0, beat: 0,
  ringAngle: 0, ringRadius: 0, orbitDir: 1, lungeDir: 0, lungeCd: 0, stunned: 0, seen: false,
  contactT: -1, stuckT: 0, behindT: 0, lastX: 0, lastY: 0, fleeing: false,
  awareness: 'hunting', detectionTimer: 0, lastKnownX: 0, lastKnownY: 0, searchT: 0, homeX: 0, homeY: 0,
  patrolX: 0, patrolY: 0, patrolT: 0, retreatT: 0, facing: 0, stalkT: 0, stalkAngle: 0,
})
export const DEFAULT_PICKUP: Readonly<Pickup> = Object.freeze({ id: 0, kind: 'resin', x: 0, y: 0, bob: 0, size: 'small' })
export const DEFAULT_VEIN: Readonly<Vein> = Object.freeze({ id: 0, mineral: 'sodium', tile: 0, stand: 0, pieces: 1 })
export const DEFAULT_ROCK: Readonly<Rock> = Object.freeze({
  id: 0, x: 0, y: 0, size: 1, tiles: [], t: 0, landed: false, hit: false, shrunk: false,
})
export const DEFAULT_FX_EVENT: Readonly<FxEvent> = Object.freeze({ seq: 0, kind: 'swing', x: 0, y: 0, a: 0, step: 0 })
export const DEFAULT_TOAST: Readonly<Toast> = Object.freeze({ text: '', t: 0 })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

// Element templates for entity arrays, keyed by dotted path from the State root.
const ELEMENT_DEFAULTS: Record<string, unknown> = {
  monsters: DEFAULT_MONSTER, pickups: DEFAULT_PICKUP, veins: DEFAULT_VEIN,
  rocks: DEFAULT_ROCK, 'fx.events': DEFAULT_FX_EVENT, 'ui.toasts': DEFAULT_TOAST,
}

// C10: a default that is an object is cloned so live State never aliases (or freezes with) a shared template.
const dflt = (def: unknown): unknown => (typeof def === 'object' && def !== null ? structuredClone(def) : def)

// Returns a NEW value shaped like `def`, preferring `old` wherever old is type-compatible.
export function fill(def: unknown, old: unknown, path = ''): unknown {
  if (old === undefined) return dflt(def) // missing -> default
  if (def === null) return old // nullable slot (best, result): keep old as is; migrate() deep-fills it afterwards
  if (Array.isArray(def)) {
    if (!Array.isArray(old)) return dflt(def)
    const tmpl = ELEMENT_DEFAULTS[path]
    return tmpl ? old.map((e) => fill(tmpl, e)) : old.slice() // entity arrays fill per element; plain arrays are copied
  }
  if (isObj(def)) {
    if (!isObj(old)) return dflt(def)
    const out: Record<string, unknown> = { ...old } // keeps unknown/removed keys (harmless, state-3 §2)
    for (const k of Object.keys(def)) out[k] = fill(def[k], old[k], path ? path + '.' + k : k)
    return out
  }
  return typeof old === typeof def ? old : def // primitive: keep if same type (NaN stays a number)
}

// fill() rejects the string 'random' against the numeric default, so settings.depthClass is resolved here: 'random' and the
// integers 1..4 are kept, anything else (missing, wrong type, out of range) becomes 1 (Shallow default). Idempotent. Called after fill().
function fixSettings(set: Settings, old: unknown): Settings {
  const c = isObj(old) ? old.depthClass : undefined
  const ok = c === 'random' || (typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= 4)
  return Object.assign(set, { depthClass: ok ? c : 1 })
}

// Version mismatch: fresh State, keeping only settings and best when they are objects (state-3 §2).
function resetKeep(fresh: State, old: unknown): State {
  const o = isObj(old) ? old : {}
  if (isObj(o.settings)) fresh.settings = fixSettings(fill(fresh.settings, o.settings) as Settings, o.settings)
  if (isObj(o.best)) fresh.best = fill(DEFAULT_BEST, o.best) as Best
  console.warn('[migrate] state v' + String(o.version) + ' -> v' + STATE_VERSION + ': reset to title')
  return fresh
}

export function migrate(old: unknown): State {
  const fresh = init()
  if (!isObj(old) || old.version !== STATE_VERSION) return resetKeep(fresh, old)
  const s = fill(fresh, old) as State
  s.settings = fixSettings(s.settings, old.settings)
  if (s.best !== null) s.best = fill(DEFAULT_BEST, s.best) as Best
  if (s.result !== null) s.result = fill(DEFAULT_RESULT, s.result) as RunResult
  return s
}
