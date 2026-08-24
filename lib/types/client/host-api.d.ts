/**
 * Same-origin transport for the approval-window host API. Mirrors the
 * dsh-task-board pattern: plain `fetch` for state/action and an SSE stream for
 * change pushes, sharing the trust fence the host enforces on `/api/...`.
 * @module @xuhai/dsh-approval-window/host-api
 */
/** Base path on the host. */
export declare const BASE_PATH = "/api/approval-window";
/** Wire snapshot for one session. */
export interface ApprovalWindowSnapshot {
    sessionId: string;
    armed: boolean;
    until: number | null;
    durationMs: number | null;
    remainingMs: number | null;
}
/** Host API surface injected into the header-action component. */
export interface ApprovalWindowHostApi {
    /** Read the window snapshot for a session. */
    snapshot(sessionId: string): Promise<ApprovalWindowSnapshot>;
    /** Arm a session for `durationMs`. */
    arm(sessionId: string, durationMs: number): Promise<ApprovalWindowSnapshot>;
    /** Disarm a session. */
    disarm(sessionId: string): Promise<ApprovalWindowSnapshot>;
    /** Subscribe to change pushes; returns the unsubscribe disposer. */
    subscribe(sessionId: string, onEvent: (sessionId: string) => void): () => void;
}
/** Present a snapshot when the session is active, else `null`. */
export declare function activeSnapshot(snapshot: ApprovalWindowSnapshot): ApprovalWindowSnapshot | null;
/** Build the inject-face transport bound to the host routes. */
export declare function createApprovalWindowHostApi(): ApprovalWindowHostApi;
