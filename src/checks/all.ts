// Runs every pure-logic check (R-040). Add one import + one call per new *.check.ts file; the list is kept in sync by hand.
import { run as state } from './state.check.ts'
import { run as runCheck } from './run.check.ts'
import { stepCheck } from './step.check.ts'
import { screensCheck } from './screens.check.ts'
import { run as render } from './render.check.ts'
import { run as world } from './world.check.ts'
import { run as assets } from './assets.check.ts'
import { run as cave } from './cave.check.ts'
import { run as caveExtra } from './cave-extra.check.ts'
import { run as caveReject } from './cave-reject.check.ts'
import { run as caveReject2 } from './cave-reject2.check.ts'
import { run as caveReject3 } from './cave-reject3.check.ts'
import { run as caveReject4 } from './cave-reject4.check.ts'
import { run as caveReject5 } from './cave-reject5.check.ts'
import { run as caveReject6 } from './cave-reject6.check.ts'
import { run as caveReject7 } from './cave-reject7.check.ts'
state()
runCheck()
stepCheck()
screensCheck()
render()
world()
assets()
cave()
caveExtra()
caveReject()
caveReject2()
caveReject3()
caveReject4()
caveReject5()
caveReject6()
caveReject7()
console.log('checks ok')
