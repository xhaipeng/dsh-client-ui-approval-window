/**
 * Same-origin transport for the approval-window host API. Mirrors the
 * dsh-task-board pattern: plain `fetch` for state/action and an SSE stream for
 * change pushes, sharing the trust fence the host enforces on `/api/...`.
 * @module @xuhai/dsh-approval-window/host-api
 */

/** Base path on the host. */
export const BASE_PATH = '/api/approval-window'

/** Wire snapshot for one session. */
export interface ApprovalWindowSnapshot {
  sessionId: string
  armed: boolean
  until: number | null
  durationMs: number | null
  remainingMs: number | null
}

/** Host API surface injected into the header-action component. */
export interface ApprovalWindowHostApi {
  /** Read the window snapshot for a session. */
  snapshot(sessionId: string): Promise<ApprovalWindowSnapshot>
  /** Arm a session for `durationMs`. */
  arm(sessionId: string, durationMs: number): Promise<ApprovalWindowSnapshot>
  /** Disarm a session. */
  disarm(sessionId: string): Promise<ApprovalWindowSnapshot>
  /** Subscribe to change pushes; returns the unsubscribe disposer. */
  subscribe(sessionId: string, onEvent: (sessionId: string) => void): () => void
}

/** Present a snapshot when the session is active, else `null`. */
export function activeSnapshot(snapshot: ApprovalWindowSnapshot): ApprovalWindowSnapshot | null {
  return snapshot.armed ? snapshot : null
}

/** Fetch the JSON body via the host's same-origin route. */
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`approval-window: ${response.status} ${response.statusText}`)
  return response.json() as Promise<T>
}

/** Post a JSON action and return the resulting snapshot. */
async function postAction(sessionId: string, body: { action: 'arm' | 'disarm'; durationMs?: number }): Promise<ApprovalWindowSnapshot> {
  const response = await fetch(`${BASE_PATH}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...body, sessionId }),
  })
  if (!response.ok) throw new Error(`approval-window: ${response.status} ${response.statusText}`)
  return response.json() as Promise<ApprovalWindowSnapshot>
}

/** Build the inject-face transport bound to the host routes. */
export function createApprovalWindowHostApi(): ApprovalWindowHostApi {
  return {
    snapshot: (sessionId) => getJson<ApprovalWindowSnapshot>(`${BASE_PATH}/state?sessionId=${encodeURIComponent(sessionId)}`),
    arm: (sessionId, durationMs) => postAction(sessionId, { action: 'arm', durationMs }),
    disarm: (sessionId) => postAction(sessionId, { action: 'disarm' }),
    subscribe: (sessionId, onEvent) => {
      // The host streams all change events; the client filters to its session.
      const source = new EventSource(`${BASE_PATH}/events`)
      const onMessage = (event: MessageEvent<string>): void => {
        try {
          const data = JSON.parse(event.data) as { sessionId?: string }
          if (data.sessionId === sessionId) onEvent(sessionId)
        } catch {
          // Ignore a malformed push; the next snapshot refresh reconciles.
        }
      }
      source.addEventListener('message', onMessage)
      return () => { source.removeEventListener('message', onMessage); source.close() }
    },
  }
}
