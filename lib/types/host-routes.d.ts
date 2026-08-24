/**
 * Same-origin HTTP surface for the approval-window host service: a JSON `state`
 * reader, an `action` writer (arm/disarm), and an SSE `events` stream. Every
 * request is gated by a loopback trust fence — the only baseline for a
 * permission-widening action is that the caller is the local dsh web process.
 * @module @xuhai/dsh-approval-window/host-routes
 */
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { ApprovalWindowService } from './index.ts';
/** Base path shared by the three routes. */
export declare const BASE_PATH = "/api/approval-window";
/** Wire snapshot returned to the client. */
export interface ApprovalWindowSnapshot {
    sessionId: string;
    armed: boolean;
    until: number | null;
    durationMs: number | null;
    remainingMs: number | null;
}
/**
 * Build the three routes for the window service.
 * @param window - the approval-window service.
 * @returns the route table to pass to `ctx.webServer.register`.
 */
export declare function makeApprovalWindowRoutes(window: ApprovalWindowService): readonly WebRoute[];
