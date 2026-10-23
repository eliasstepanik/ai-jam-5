import { defineConfig } from 'vite'
import type { Plugin } from 'vite'

// The repo has no @types/node (no dependency may be added), so the two Node APIs used here are typed structurally.
type Node = {
  cwd(): string
  getBuiltinModule(id: 'node:child_process'): {
    execFile(file: string, args: string[], opts: { cwd: string; timeout: number }, cb: (err: unknown, out: string) => void): void
  }
}
const node = (globalThis as unknown as { process: Node }).process

// Dev only (apply: 'serve', absent from `vite build`): GET /__commit answers the short sha of the checkout HEAD, read per request
// (2 s cache), so it follows `git reset --hard` while Vite keeps running. 7 chars like GitHub. Any failure answers 'unknown'.
// ponytail: one execFile per 2 s at most; no watcher on .git. Add one only if 2 s of staleness matters.
function devCommit(): Plugin {
  let root = node.cwd()
  let cached: { at: number; sha: Promise<string> } | null = null
  const read = (): Promise<string> => {
    if (cached === null || Date.now() - cached.at > 2000) {
      const sha = new Promise<string>((resolve) => {
        try { // a synchronous throw (spawn failure, missing builtin) must also answer 'unknown', never reject
          node.getBuiltinModule('node:child_process').execFile('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, timeout: 5000 }, (err, out) => {
            const v = String(out).trim()
            resolve(err === null && /^[0-9a-f]{7}$/.test(v) ? v : 'unknown')
          })
        } catch { resolve('unknown') }
      })
      cached = { at: Date.now(), sha }
    }
    return cached.sha
  }
  return {
    name: 'dev-commit',
    apply: 'serve',
    configResolved(config) { root = config.root },
    configureServer(server) {
      server.middlewares.use('/__commit', (req, res, next) => {
        const method = (req as { method?: string }).method // IncomingMessage has no typed `method` without @types/node
        if (method !== 'GET' && method !== 'HEAD') return next()
        void read().then((sha) => {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(method === 'HEAD' ? undefined : sha)
        })
      })
    },
  }
}

// base './' so dist/ works from any path (itch.io serves it in an iframe subpath).
export default defineConfig({ base: './', plugins: [devCommit()] })
