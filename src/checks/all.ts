// Runs every pure-logic check (R-040). Add one import + one call per new *.check.ts file; the list is kept in sync by hand.
import { run as state } from './state.check.ts'
import { run as render } from './render.check.ts'
import { run as world } from './world.check.ts'
import { run as assets } from './assets.check.ts'
state()
render()
world()
assets()
console.log('checks ok')
