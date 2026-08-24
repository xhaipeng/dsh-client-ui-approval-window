/**
 * Host approval-window plugin: a per-session time-windowed "trust grant". While
 * a session's window is armed, the risk gate on `tools/pre-execute` auto-allows
 * low/medium-risk calls and routes high-risk calls to a human confirmation; the
 * session's sandbox mode is widened to `danger-full-access` for the window but
 * its approval policy stays `ask` (never auto-rejected).
 *
 * @module @xuhai/dsh-approval-window
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from 'schemastery';
import type { Session } from '@deepseek-ai/dsh-session';
import type { RiskRule } from './core/risk.types.ts';
/** Default one-click presets (minutes). */
export declare const PRESET_MINUTES: readonly number[];
/** Plugin config. */
export interface Config {
    /** Custom risk rules evaluated ahead of the built-in five categories. */
    readonly riskRules?: RiskRule[];
    /** Durable ledger path; when omitted the window state is in-memory only. */
    readonly ledgerPath?: string;
}
/**
 * Host approval-window service. Requires a confining `ctx.shell` (to read the
 * pre-window sandbox mode) and the `tools/pre-execute` seam (the risk gate).
 */
export declare class ApprovalWindowService extends Service {
    config: Config;
    static Config: z<Config>;
    static inject: string[];
    private readonly window;
    private readonly listeners;
    constructor(ctx: Context, config: Config);
    /**
     * The risk gate (one execution). Armed + not expired → classify and
     * auto-allow (low/medium) or ask (high); unarmed/expired → delegate to the
     * default pipeline. Expiry lazily clears the window and restores the prior
     * sandbox mode.
     */
    private gate;
    /**
     * Arm (or re-arm) a session's window: record the pre-window sandbox mode,
     * widen it to full access, and keep the approval policy unchanged (still
     * `ask`, so the high-risk gate keeps prompting).
     * @param session - the session being granted the window.
     * @param durationMs - window length in ms.
     */
    arm(session: Session, durationMs: number): void;
    /** Disarm (idempotent): restore the pre-window sandbox mode and clear the window. */
    disarm(session: Session): void;
    /** Whether a session's window is currently active. */
    isActive(session: Session): boolean;
    /** Remaining ms until expiry, or `null` when no active window. */
    remainingMs(session: Session): number | null;
    /** The armed window's granted duration in ms, or `null` when none is active. */
    duration(session: Session): number | null;
    /** Resolve a session id to a live session, else `undefined`. */
    session(sessionId: string): Session | undefined;
    /** Subscribe to arm/disarm changes; returns the unsubscribe disposer. */
    onChange(listener: (sessionId: string) => void): () => void;
    private notify;
    /** The session's effective sandbox mode (its own fold, else the shell default). */
    private effectiveSandbox;
    /** Restore a persisted window entry into the live window and re-widen a live session. */
    private replay;
    /** Persist every active window entry to the ledger (no-op without a path). */
    private persist;
    /** Immediate-expiry path: restore the prior sandbox, clear the window, persist. */
    private restoreSandboxAndClear;
}
/** The agent-typing re-export survival helper. */
export type { RiskRule };
export default ApprovalWindowService;
