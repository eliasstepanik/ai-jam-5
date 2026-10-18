// Determinism grep guard: simulation code must not call a clock or an unseeded random source.
// Spec: docs/architecture-determinism.md §7 (R-039/R-040: lives here, outside the tsconfig include, because node:fs under src/ fails tsc).
// Run from the repo root as the last step of `npm run check`: `node scripts/check-guard.ts`. Node built-ins only, no dependency.
// Hit -> throws (exit 1) with one `check failed: <file>:<line> ...` line per hit. Missing folders are skipped (they appear slice by slice).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'

const SIM_DIRS = ['src/core', 'src/world', 'src/entities', 'src/systems']
const BANNED = /\bMath\.random\b|\bDate\.now\b|\bperformance\.now\b|\bcrypto\./
const ALLOW = new Set(['src/core/seed.ts']) // randomSeed() only

function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir).sort().flatMap((f) => {
    const p = dir + '/' + f
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []
  })
}

if (!existsSync('src/core')) throw new Error('check failed: run from the repo root (src/core not found)') // else 0 files scanned = silent pass

const files = [...SIM_DIRS.flatMap(walk), ...(existsSync('src/game.ts') ? ['src/game.ts'] : [])].filter((f) => !ALLOW.has(f))
const hits: string[] = []
for (const f of files) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (BANNED.test(line)) hits.push(`check failed: ${f}:${i + 1} uses non-injected randomness/clock`)
  })
}
if (hits.length > 0) throw new Error(hits.join('\n'))
console.log(`check-guard ok (${files.length} files)`)
// ponytail: line-based grep; catches aliases like `const r = Math.random` but not `Math['random']` and flags banned names in comments. Add an AST check if someone gets clever.
