// In-process functional test of the HTTP route layer: boots a real node:http
// server with makeApprovalWindowRoutes(), backed by a lightweight fake of the
// window service (the routes only type-import @deepseek-ai, so no DSH runtime
// deps). Proves state / action (arm+disarm) / validation / server on loopback.
// Run: node tests/host-routes.run.ts  (needs escalation? no — node is in-process)
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { makeApprovalWindowRoutes, BASE_PATH, type ApprovalWindowSnapshot } from '../src/host-routes.ts'

// A minimal fake of ApprovalWindowService.shape — only what the routes touch.
function makeFakeWindow() {
  const store = new Map<string, { until: number; durationMs: number; priorSandboxMode: string | null }>()
  const listeners = new Set<(id: string) => void>()
  return {
    session(sessionId: string) {
      return store.has(sessionId) || sessionId === 'real' ? { id: sessionId } : undefined
    },
    remainingMs(session: { id: string }) {
      const e = store.get(session.id)
      return e !== undefined && e.until > Date.now() ? e.until - Date.now() : null
    },
    duration(session: { id: string }) {
      const e = store.get(session.id)
      return e !== undefined && e.until > Date.now() ? e.durationMs : null
    },
    arm(session: { id: string }, durationMs: number) {
      store.set(session.id, { until: Date.now() + durationMs, durationMs, priorSandboxMode: null })
      for (const l of listeners) l(session.id)
    },
    disarm(session: { id: string }) {
      store.delete(session.id)
      for (const l of listeners) l(session.id)
    },
    onChange(listener: (id: string) => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

const window = makeFakeWindow()
const routes = makeApprovalWindowRoutes(window as never)
const server = createServer(async (req, res) => {
  for (const route of routes) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (route.kind === 'exact' && url.pathname === route.path) {
      await route.handler(req, res)
      return
    }
  }
  res.writeHead(404).end()
})

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = (server.address() as { port: number }).port
const base = `http://127.0.0.1:${port}${BASE_PATH}`

// Pre-arm the session so state reports armed.
window.arm({ id: 'real' }, 60_000)

// state → snapshot (loopback → trusted → 200)
const stateRes = await fetch(`${base}/state?sessionId=real`)
assert.equal(stateRes.status, 200)
const state = (await stateRes.json()) as ApprovalWindowSnapshot
assert.equal(state.armed, true)
assert.equal(state.sessionId, 'real')

// state with missing sessionId → 400
const badState = await fetch(`${base}/state`)
assert.equal(badState.status, 400)

// action arm on a fresh session → 200 + armed
const armRes = await fetch(`${base}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'arm', sessionId: 'real', durationMs: 30_000 }),
})
assert.equal(armRes.status, 200)
const armed = (await armRes.json()) as ApprovalWindowSnapshot
assert.equal(armed.armed, true)

// action with bad durationMs → 400
const badArm = await fetch(`${base}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'arm', sessionId: 'real', durationMs: -5 }),
})
assert.equal(badArm.status, 400)

// action disarm → 200 + disarmed
const disarmRes = await fetch(`${base}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'disarm', sessionId: 'real' }),
})
assert.equal(disarmRes.status, 200)
const disarmed = (await disarmRes.json()) as ApprovalWindowSnapshot
assert.equal(disarmed.armed, false)

// unknown action → 400
const unknown = await fetch(`${base}/action`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'yolo', sessionId: 'real' }),
})
assert.equal(unknown.status, 400)

// malformed body → 400
const malformed = await fetch(`${base}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not-json' })
assert.equal(malformed.status, 400)

server.close()

console.log('host-routes (HTTP state/action): all assertions passed')
