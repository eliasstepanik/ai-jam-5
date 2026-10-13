// Run with `npm run check` (Node's built-in TS type stripping, no extra dependency).
import { mergeState } from './merge.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

type S = { score: number; name: string; extra?: number }
const mod = { init: (): S => ({ score: 0, name: 'new', extra: 7 }) }

const old = { score: 42 }
const merged = mergeState(mod, old)
ok(merged.score === 42, 'keeps old value')
ok(merged.name === 'new', 'fills missing key from init()')
ok(merged.extra === 7, 'fills every missing key')
ok(!('name' in old), 'does not mutate old state')

ok(mergeState(mod, null).score === 0, 'null old state falls back to init()')
ok(mergeState(mod, 5).name === 'new', 'non-object old state falls back to init()')

// migrate runs on every swap, so it must be idempotent: fill defaults, never transform valid values.
const migrate = (o: unknown): S => {
  const s = o as Partial<S>
  return { score: s.score ?? 0, name: s.name === undefined ? 'm' : s.name }
}
const migMod = { ...mod, migrate }
const once = mergeState(migMod, old)
ok(once.score === 42 && once.name === 'm', 'migrate() takes precedence')
const twice = mergeState(migMod, once)
ok(JSON.stringify(twice) === JSON.stringify(once), 'migrate applied twice equals applied once')

console.log('check ok')
