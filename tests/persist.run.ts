// In-process verification for the durable ledger IO (persist.ts). Runs with
// node in the plugin dir (subprocess-writable); cleans up its temp file.
// Run: node tests/persist.run.ts
import assert from 'node:assert/strict'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { readLedger, writeLedger } from '../src/core/persist.ts'

const path = join(process.cwd(), '.ledger-test.json')

// Round-trip write then read.
const entries = [
  { sessionId: 's-1', until: Date.now() + 60_000, durationMs: 60_000, priorSandboxMode: 'workspace-write' as const },
  { sessionId: 's-2', until: Date.now() - 1000, durationMs: 5000, priorSandboxMode: null },
]
writeLedger(path, entries)
const read = readLedger(path)
assert.equal(read.length, 2)
assert.deepEqual(read[0], entries[0])
assert.deepEqual(read[1], entries[1])

// Malformed file tolerates to empty.
rmSync(path)
const raw = readFileSync
void raw
const { writeFileSync } = await import('node:fs')
writeFileSync(path, '{ not json', 'utf8')
assert.deepEqual(readLedger(path), [])
writeFileSync(path, '{"not":"array"}', 'utf8')
assert.deepEqual(readLedger(path), [])
writeFileSync(path, '[{"sessionId":5}]', 'utf8')
assert.deepEqual(readLedger(path), [])

// Missing file tolerates to empty.
rmSync(path)
assert.deepEqual(readLedger(path), [])

console.log('persist (ledger IO): all assertions passed')
