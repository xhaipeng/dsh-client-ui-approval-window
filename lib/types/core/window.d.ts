/**
 * Pure per-session trust-window state machine, decoupled from cordis so it can
 * be unit-tested and reused by the host glue and the durable store.
 *
 * A window is `armed` for a session once {@link ApprovalWindow.arm} records a
 * deadline (`until`); it is `active` while `until > now` and is lazily cleared
 * (with its prior-sandbox restore) by the host glue on expiry.
 * @module @xuhai/dsh-approval-window/window
 */
/** The sandbox modes a window may widen to, mirroring `@deepseek-ai/dsh-sandbox`. */
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';
/** One armed window's bookkeeping. */
export interface WindowEntry {
    /** Deadline epoch-ms; the window is active while `now < until`. */
    readonly until: number;
    /** The granted duration in ms (for display and persistence). */
    readonly durationMs: number;
    /** The sandbox mode before the window widened it (restored on disarm/expiry). */
    readonly priorSandboxMode: SandboxMode | null;
}
/** A same-process, in-memory window ledger keyed by session id. */
export declare class ApprovalWindow {
    private readonly entries;
    /**
     * Arm (or re-arm, overwriting) a session's window.
     * @param sessionId - the session being granted the window.
     * @param durationMs - how long the window stays active.
     * @param priorSandboxMode - the sandbox mode to restore on disarm/expiry.
     * @returns the recorded entry.
     */
    arm(sessionId: string, durationMs: number, priorSandboxMode: SandboxMode | null): WindowEntry;
    /** Clear a session's window (idempotent). */
    disarm(sessionId: string): void;
    /**
     * Rebuild a session's window from a persisted entry, using the exact stored
     * deadline rather than recomputing from now (restart replay).
     * @param sessionId - the session being restored.
     * @param until - the persisted absolute deadline (epoch ms).
     * @param durationMs - the granted duration (for display and persistence).
     * @param priorSandboxMode - the sandbox mode to restore on disarm/expiry.
     */
    restore(sessionId: string, until: number, durationMs: number, priorSandboxMode: SandboxMode | null): void;
    /** Read a session's window entry, regardless of expiry. */
    get(sessionId: string): WindowEntry | undefined;
    /** Whether a session's window is armed and not yet expired. */
    isActive(sessionId: string, now?: number): boolean;
    /** Remaining ms until expiry, or `null` when the session has no active window. */
    remainingMs(sessionId: string, now?: number): number | null;
    /** Session ids whose windows are armed and active right now. */
    activeIds(now?: number): string[];
}
