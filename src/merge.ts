// Pure state-merge used on every hot swap. No DOM, so it runs under `npm run check`.

export interface Mod<S> {
  init(): S
  // Optional escape hatch: game.ts exports this when a state change needs real conversion.
  migrate?(oldState: unknown): S
}

export function mergeState<S extends object>(mod: Mod<S>, old: unknown): S {
  if (typeof old !== 'object' || old === null) return mod.init()
  if (mod.migrate) return mod.migrate(old)
  // Old values win; keys added to State since then are filled from init().
  // ponytail: shallow only (nested objects are not deep-merged) and removed keys linger;
  // export migrate() from game.ts or press R when the shape changes deeper than that.
  return { ...mod.init(), ...old }
}
