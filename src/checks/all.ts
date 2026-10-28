// Runs every pure-logic check (R-040). Add one import + one call per new *.check.ts file; the list is kept in sync by hand.
import { run as puddleDressing } from './puddle-dressing.check.ts'
import { run as heartUi } from './heart-ui.check.ts'
import { run as worldVisualFixes } from './world-visual-fixes.check.ts'
import { run as pixelParticles } from './pixel-particles.check.ts'
import { run as caveDetail } from './cave-detail.check.ts'
import { run as state } from './state.check.ts'
import { run as publishedBugs } from './published-bugs.check.ts'
import { run as reportedBugs } from './reported-bugs.check.ts'
import { run as debug } from './debug.check.ts'
import { run as runCheck } from './run.check.ts'
import { run as stepCheck } from './step.check.ts'
import { run as screensCheck } from './screens.check.ts'
import { run as flow } from './flow.check.ts'
import { run as order } from './order.check.ts'
import { run as ai } from './ai.check.ts'
import { run as render } from './render.check.ts'
import { run as world } from './world.check.ts'
import { run as assets } from './assets.check.ts'
import { run as cave } from './cave.check.ts'
import { run as caveExtra } from './cave-extra.check.ts'
import { caveClassChecks } from './cave-class.check.ts'
import { run as caveReject } from './cave-reject.check.ts'
import { run as caveReject2 } from './cave-reject2.check.ts'
import { run as caveReject3 } from './cave-reject3.check.ts'
import { run as caveReject4 } from './cave-reject4.check.ts'
import { run as caveReject5 } from './cave-reject5.check.ts'
import { run as caveReject6 } from './cave-reject6.check.ts'
import { run as caveReject7 } from './cave-reject7.check.ts'
import { run as lightFlame } from './light-flame.check.ts'
import { run as parry } from './parry.check.ts'
import { run as damage } from './damage.check.ts'
import { run as movement } from './movement.check.ts'
import { run as determinism } from './determinism.check.ts'
import { run as score } from './score.check.ts'
import { run as minerals } from './minerals.check.ts'
import { run as route } from './route.check.ts'
import { run as mining } from './mining.check.ts'
import { run as beacon } from './beacon.check.ts'
import { run as rocksUnit } from './rocks-unit.check.ts'
import { run as rocks } from './rocks.check.ts'
import { run as rocksProp } from './rocks-prop.check.ts'
import { run as quake } from './quake.check.ts'
import { run as rollCheck } from './roll.check.ts'
import { run as economy } from './economy.check.ts'
import { run as escapeCheck } from './escape.check.ts'
import { run as aiDevourer } from './ai-devourer.check.ts'
import { run as depthRun } from './depth-run.check.ts'
import { run as rocksClass } from './rocks-class.check.ts'
import { run as depthScreens } from './depth-screens.check.ts'
import { run as migrateSettings } from './migrate-settings.check.ts'
import { run as cracks } from './cracks.check.ts'
import { run as devDepth } from './dev-depth.check.ts'
import { run as commitCheck } from './commit.check.ts'
import { run as escapeWisp } from './escape-wisp.check.ts'
import { run as escapeWispGlide } from './escape-wisp-glide.check.ts'
import { run as escapeWispEdge } from './escape-wisp-edge.check.ts'
import { run as animSpeed } from './anim-speed.check.ts'
import { run as shadowMist } from './shadow-mist.check.ts'
import { run as depthLabel } from './depth-label.check.ts'
import { run as stuckProbe } from './stuck-probe.check.ts'
import { run as awarenessChecks } from './ai-awareness.check.ts'
import { run as aiTactics } from './ai-tactics.check.ts'
import { run as aiTactics2 } from './ai-tactics-2.check.ts'
import { run as aiTactics3 } from './ai-tactics-3.check.ts'
import { run as flowfieldChecks } from './flowfield.check.ts'
import { run as aiBudget } from './ai-budget.check.ts'
import { run as separation } from './separation.check.ts'
import { run as depthTone } from './depth-tone.check.ts'
import { run as vineGlow } from './vine-glow.check.ts'
import { run as caveGuide } from './cave-guide.check.ts'
import { run as puddleSurface } from './puddle-surface.check.ts'
import { run as caveSculpt } from './cave-sculpt.check.ts'
import { run as caveAlcove } from './cave-alcove.check.ts'
import { run as volumeCycle } from './volume-cycle.check.ts'
import { run as audioRecipes } from './audio-recipes.check.ts'
import { run as audioEngine } from './audio-engine.check.ts'
import { run as audioWiring } from './audio-wiring.check.ts'
puddleDressing()
heartUi()
state()
runCheck()
stepCheck()
screensCheck()
flow()
order()
ai()
render()
world()
assets()
cave()
caveExtra()
caveClassChecks()
caveReject()
caveReject2()
caveReject3()
caveReject4()
caveReject5()
caveReject6()
caveReject7()
lightFlame()
parry()
damage()
movement()
determinism()
score()
minerals()
route()
mining()
beacon()
rocksUnit()
rocks()
rocksProp()
quake()
rollCheck()
economy()
escapeCheck()
aiDevourer()
depthRun()
rocksClass()
depthScreens()
migrateSettings()
cracks()
devDepth()
commitCheck()
animSpeed()
debug()
escapeWisp()
escapeWispGlide()
escapeWispEdge()
shadowMist()
depthLabel()
depthTone()
vineGlow()
caveGuide()
puddleSurface()
volumeCycle()

reportedBugs()
publishedBugs()
worldVisualFixes()
pixelParticles()
caveDetail()
caveSculpt()
caveAlcove()
stuckProbe()
awarenessChecks()
aiTactics()
aiTactics2()
aiTactics3()
flowfieldChecks()
separation()
aiBudget()
audioRecipes()
audioWiring()
audioEngine()
console.log('checks ok')
