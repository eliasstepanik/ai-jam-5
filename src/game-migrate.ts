// L5: preserve the core deep-fill contract, then align a live run with its authored doorway.
import { migrate as fillState } from './core/migrate.ts'
import { entranceExit } from './world/entrance-art.ts'
export function migrate(old: unknown) {
  const s = fillState(old)
  if (s.world.tiles) s.world.exit = entranceExit(s)
  return s
}
