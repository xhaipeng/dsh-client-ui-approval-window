/**
 * Same-origin HTTP surface for the approval-window host service: a JSON `state`
 * reader, an `action` writer (arm/disarm), and an SSE `events` stream. Every
 * request is gated by a loopback trust fence — the only baseline for a
 * permission-widening action is that the caller is the local dsh web process.
 * @module @xuhai/dsh-approval-window/host-routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { ApprovalWindowService } from './index.ts'
import type { Session } from '@deepseek-ai/dsh-session'

/** Base path shared by the three routes. */
export const BASE_PATH = '/api/approval-window'

/** Wire snapshot returned to the client. */
export interface ApprovalWindowSnapshot {
  sessionId: string
  armed: boolean
  until: number | null
  durationMs: number | null
  remainingMs: number | null
}

/** Whether the request's socket is one of the local addresses. */
function isLoopback(address: string | undefined): boolean {
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost'
}

/**
 * Trust fence: only a loopback caller with a local Host (and, when an Origin is
 * present, a local origin) may reach the window API. Loopback is the safety
 * baseline; the Host/Origin checks are a defensive tripwire against a
 * misdirected local request.
 */
function trusted(req: IncomingMessage): boolean {
  if (!isLoopback(req.socket.remoteAddress)) return false
  const host = req.headers.host ?? ''
  if (host !== '' && !/^(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(host)) return false
  const origin = req.headers.origin
  if (origin !== undefined && origin !== '' && !/^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) {
    return false
  }
  return true
}

/** Read and JSON-parse the request body, rejecting oversized or malformed bodies. */
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) {
    const text = String(chunk)
    if (raw.length + text.length > 64 * 1024) throw new Error('body too large')
    raw += text
  }
  if (raw === '') return {}
  return JSON.parse(raw) as Record<string, unknown>
}

/** Write a JSON response with the given status. */
function json(res: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) })
  res.end(body)
}

/** Resolve a sessionId string to a live session, else `undefined`. */
function sessionOf(window: ApprovalWindowService, sessionId: unknown): Session | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  return window.session(sessionId)
}

/**
 * Build the three routes for the window service.
 * @param window - the approval-window service.
 * @returns the route table to pass to `ctx.webServer.register`.
 */
export function makeApprovalWindowRoutes(window: ApprovalWindowService): readonly WebRoute[] {
  const snapshot = (session: Session): ApprovalWindowSnapshot => {
    const remaining = window.remainingMs(session)
    const now = Date.now()
    const active = remaining !== null && remaining > 0
    return {
      sessionId: session.id as string,
      armed: active,
      until: active && window.remainingMs(session) !== null ? now + (window.remainingMs(session) as number) : null,
      durationMs: active ? window.duration(session) : null,
      remainingMs: remaining,
    }
  }

  const state: WebRoute = {
    kind: 'exact',
    path: `${BASE_PATH}/state`,
    handler: (req, res) => {
      if (!trusted(req)) { json(res, 403, { error: 'untrusted' }); return }
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      const session = sessionOf(window, url.searchParams.get('sessionId'))
      if (session === undefined) { json(res, 400, { error: 'missing or invalid sessionId' }); return }
      json(res, 200, snapshot(session))
    },
  }

  const action: WebRoute = {
    kind: 'exact',
    path: `${BASE_PATH}/action`,
    handler: async (req, res) => {
      if (!trusted(req)) { json(res, 403, { error: 'untrusted' }); return }
      let body: Record<string, unknown>
      try { body = await readJson(req) } catch { json(res, 400, { error: 'invalid body' }); return }
      const session = sessionOf(window, body.sessionId)
      if (session === undefined) { json(res, 400, { error: 'missing or invalid sessionId' }); return }
      const kind = body.action
      if (kind === 'disarm') {
        window.disarm(session)
        json(res, 200, snapshot(session))
        return
      }
      if (kind === 'arm') {
        const durationMs = Number(body.durationMs)
        if (!Number.isFinite(durationMs) || durationMs <= 0) { json(res, 400, { error: 'invalid durationMs' }); return }
        window.arm(session, durationMs)
        json(res, 200, snapshot(session))
        return
      }
      json(res, 400, { error: `unknown action "${String(kind)}"` })
    },
  }

  const events: WebRoute = {
    kind: 'exact',
    path: `${BASE_PATH}/events`,
    handler: (req, res) => {
      if (!trusted(req)) { json(res, 403, { error: 'untrusted' }); return }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      res.write('retry: 3000\n\n')
      const unsubscribe = window.onChange((sessionId) => {
        res.write(`data: ${JSON.stringify({ sessionId })}\n\n`)
      })
      req.on('close', () => unsubscribe())
    },
  }

  return [state, action, events]
}
