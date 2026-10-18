// Runs every pure-logic check (R-040). Add one import + one call per new *.check.ts file; the list is kept in sync by hand.
import { run as state } from './state.check.ts'
import { run as render } from './render.check.ts'
state()
render()
console.log('checks ok')
