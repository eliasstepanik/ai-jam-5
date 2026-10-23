// migrate() settings.depthClass repair check. Spec: src/core/migrate.ts fixSettings (R-164, R-022): 'random' and integers 1..4
// are kept, anything else (missing, wrong type, out of range, NaN) becomes 3; other settings fields are untouched; idempotent.
// Covers both paths: same-version migrate() and the version-mismatch resetKeep() path. Exports run(); DOM-free; no node: imports.
import { init, STATE_VERSION } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'
import type { State } from '../core/types.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

function deepEq(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  const rb = b as Record<string, unknown>
  return ka.every((k) => k in rb && deepEq((a as Record<string, unknown>)[k], rb[k]))
}

const MISSING = Symbol('missing') // marks "no depthClass key at all"
// [label, stored depthClass, expected depthClass after migrate]
const ROWS: [string, unknown, unknown][] = [
  ['random', 'random', 'random'], ['1', 1, 1], ['2', 2, 2], ['3', 3, 3], ['4', 4, 4],
  ['0', 0, 3], ['5', 5, 3], ['-1', -1, 3], ['2.5', 2.5, 3], ['"2"', '2', 3], ['"Random"', 'Random', 3],
  ['null', null, 3], ['NaN', NaN, 3], ['Infinity', Infinity, 3], ['true', true, 3], ['object', { v: 2 }, 3],
  ['undefined', undefined, 3], ['missing key', MISSING, 3],
]

// Stored settings with non-default values everywhere, so an altered neighbour field is visible.
function stored(dc: unknown): Record<string, unknown> {
  const set: Record<string, unknown> = { ...init().settings, volume: 0.31, muted: true, lastSeed: 'ember7', loaded: true, reducedFlash: true, quality: 'q2' }
  if (dc === MISSING) delete set.depthClass
  else set.depthClass = dc
  return set
}

function oldState(dc: unknown, version: unknown): Record<string, unknown> {
  return { ...init(), version, settings: stored(dc) }
}

function pass(label: string, old: unknown, want: unknown): void {
  const a = migrate(old)
  ok(Object.is(a.settings.depthClass, want), `${label}: depthClass is ${String(a.settings.depthClass)}, want ${String(want)}`)
  const b = migrate(a)
  ok(deepEq(a, b), `${label}: migrate(migrate(x)) deep-equals migrate(x)`)
  ok(Object.is(b.settings.depthClass, want), `${label}: second pass keeps depthClass ${String(want)}`)
  const s = a.settings
  ok(s.volume === 0.31 && s.muted === true && s.lastSeed === 'ember7' && s.loaded === true && s.reducedFlash === true && s.quality === 'q2',
    `${label}: other settings fields survive`)
}

export function run(): void {
  const warn = console.warn
  console.warn = () => {} // resetKeep logs a reset warning on purpose
  try {
    for (const [label, dc, want] of ROWS) {
      pass('migrate ' + label, oldState(dc, STATE_VERSION), want)
      pass('reset ' + label, oldState(dc, STATE_VERSION + 1000), want) // version mismatch -> resetKeep path
    }
    // settings is not an object at all: default settings, depthClass 3, on both paths.
    for (const v of [STATE_VERSION, STATE_VERSION + 1000]) {
      const old = { ...init(), version: v, settings: 5 }
      const a: State = migrate(old)
      ok(a.settings.depthClass === 3, `non-object settings (v${v}): depthClass 3`)
      ok(a.settings.volume === init().settings.volume, `non-object settings (v${v}): default volume`)
      ok(deepEq(migrate(a), a), `non-object settings (v${v}): idempotent`)
    }
    // the input is never mutated
    const old = oldState(9, STATE_VERSION)
    migrate(old)
    ok((old.settings as Record<string, unknown>).depthClass === 9, 'migrate does not mutate old.settings')
  } finally {
    console.warn = warn
  }
}
