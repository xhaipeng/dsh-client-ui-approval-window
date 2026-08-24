// In-process verification script for the pure window state machine.
// Run: node tests/window.run.ts
import assert from 'node:assert/strict'
import { ApprovalWindow } from '../src/core/window.ts'

const w = new ApprovalWindow()
const now = Date.now()

// Not armed yet
assert.equal(w.isActive('a'), false)
assert.equal(w.remainingMs('a'), null)

// Arm a session
w.arm('a', 30_000, 'workspace-write')
assert.equal(w.isActive('a'), true)
assert.ok(w.get('a')?.until! > now)
assert.ok((w.remainingMs('a') ?? 0) > 0)
assert.equal(w.get('a')?.priorSandboxMode, 'workspace-write')

// Re-arm overwrites deadline and prior
w.arm('a', 60_000, 'read-only')
assert.equal(w.get('a')?.priorSandboxMode, 'read-only')
assert.ok((w.remainingMs('a') ?? 0) > 50_000)

// Expiry: a short window at a past `now`
w.arm('b', 10, 'workspace-write')
assert.equal(w.isActive('b', now), true)
assert.equal(w.isActive('b', now + 1000), false) // expired in the past
assert.equal(w.remainingMs('b', now + 1000), null)
assert.deepEqual(w.activeIds(now).sort(), ['a', 'b'])
assert.deepEqual(w.activeIds(now + 1000), ['a'])

// Disarm clears idempotently
w.disarm('a')
assert.equal(w.isActive('a'), false)
assert.equal(w.get('a'), undefined)
w.disarm('a') // no-op

console.log('ApprovalWindow: all assertions passed')
