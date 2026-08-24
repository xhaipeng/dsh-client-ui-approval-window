/**
 * Durable ledger for the approval-window state, so an armed window survives a
 * host restart until its deadline. A plain JSON file keyed per session (the
 * dsh-task-board ledger pattern); the host owns the path via config.
 * @module @xuhai/dsh-approval-window/persist
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { SandboxMode } from './window.ts'

/** One persisted window entry (session-keyed). */
export interface LedgerEntry {
  sessionId: string
  until: number
  durationMs: number
  priorSandboxMode: SandboxMode | null
}

/** Read the ledger, tolerating a missing or malformed file (fail-open to empty). */
export function readLedger(path: string): readonly LedgerEntry[] {
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as LedgerEntry[]).filter(isLedgerEntry)
  } catch {
    return []
  }
}

/** Write the ledger; a bad parent directory is created. */
export function writeLedger(path: string, entries: readonly LedgerEntry[]): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(entries, null, 2), 'utf8')
}

/** Shape guard for an untrusted ledger file. */
function isLedgerEntry(value: unknown): value is LedgerEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.sessionId === 'string'
    && typeof entry.until === 'number'
    && typeof entry.durationMs === 'number'
    && (entry.priorSandboxMode === null || typeof entry.priorSandboxMode === 'string')
}
