/**
 * Durable ledger for the approval-window state, so an armed window survives a
 * host restart until its deadline. A plain JSON file keyed per session (the
 * dsh-task-board ledger pattern); the host owns the path via config.
 * @module @xuhai/dsh-approval-window/persist
 */
import type { SandboxMode } from './window.ts';
/** One persisted window entry (session-keyed). */
export interface LedgerEntry {
    sessionId: string;
    until: number;
    durationMs: number;
    priorSandboxMode: SandboxMode | null;
}
/** Read the ledger, tolerating a missing or malformed file (fail-open to empty). */
export declare function readLedger(path: string): readonly LedgerEntry[];
/** Write the ledger; a bad parent directory is created. */
export declare function writeLedger(path: string, entries: readonly LedgerEntry[]): void;
