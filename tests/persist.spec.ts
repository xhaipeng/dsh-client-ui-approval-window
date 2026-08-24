import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readLedger, writeLedger } from '../src/core/persist.ts'

describe('persist â€?durable ledger IO', () => {
  let dir: string
  let path: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aw-ledger-'))
    path = join(dir, 'ledger.json')
  })
  afterAll(() => {
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* best-effort */ }
  })

  it('round-trips entries', () => {
    const entries = [
      { sessionId: 's-1', until: Date.now() + 60_000, durationMs: 60_000, priorSandboxMode: 'workspace-write' as const },
      { sessionId: 's-2', until: Date.now() - 1000, durationMs: 5000, priorSandboxMode: null },
    ]
    writeLedger(path, entries)
    expect(readLedger(path)).toEqual(entries)
  })

  it('tolerates a malformed file to empty', () => {
    writeFileSync(path, '{ not json', 'utf8')
    expect(readLedger(path)).toEqual([])
    writeFileSync(path, '{"not":"array"}', 'utf8')
    expect(readLedger(path)).toEqual([])
    writeFileSync(path, '[{"sessionId":5}]', 'utf8')
    expect(readLedger(path)).toEqual([])
  })

  it('tolerates a missing file to empty', () => {
    rmSync(path)
    expect(readLedger(path)).toEqual([])
  })
})
