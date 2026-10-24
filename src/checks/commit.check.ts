// Dev commit label logic: sha normalisation (7 lowercase hex or 'unknown'), poll countdown re-arm, State default and migrate idempotence.
import { COMMIT_POLL_S, commitTick, normalizeCommit } from '../core/commit.ts'
import { init } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('commit check: ' + msg)
}

export function run(): void {
  ok(normalizeCommit('0147e37') === '0147e37', 'plain sha kept')
  ok(normalizeCommit(' 0147E37\n') === '0147e37', 'trimmed and lowercased')
  for (const bad of ['', '0147e3', '0147e372', '0147e3g', 'fatal: not a git repository', '<html>', null, undefined, 7]) {
    ok(normalizeCommit(bad) === 'unknown', 'rejects ' + String(bad))
  }
  const d = { commitT: 0 }
  ok(commitTick(d, 1 / 60), 'first tick fetches (commitT starts at 0)')
  ok(d.commitT === COMMIT_POLL_S, 're-armed to the poll period')
  let n = 0
  for (let i = 0; i < COMMIT_POLL_S * 60 - 10; i++) if (commitTick(d, 1 / 60)) n++ // 10 ticks short of the period (float-safe margin)
  ok(n === 0, 'no fetch before the period ends')
  for (let i = 0; i < 20 && n === 0; i++) if (commitTick(d, 1 / 60)) n++
  ok(n === 1, 'fetch when the period ends')
  ok(commitTick({ commitT: 0.001 }, 1 / 60), 'fetch when the countdown runs out')
  ok(!commitTick({ commitT: 1 }, 1 / 60), 'no fetch while the countdown runs')
  const s = init()
  ok(s.debug.commit === '' && s.debug.commitT === 0, 'init defaults')
  const old = JSON.parse(JSON.stringify(s)) as Record<string, Record<string, unknown>>
  delete old.debug.commit; delete old.debug.commitT
  const m = migrate(old)
  ok(m.debug.commit === '' && m.debug.commitT === 0, 'migrate fills missing fields')
  m.debug.commit = 'abcdef0'
  ok(migrate(m).debug.commit === 'abcdef0', 'migrate keeps a fetched value (idempotent)')
  console.log('commit check ok')
}
