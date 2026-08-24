import { describe, it, expect } from 'vitest'
import { ApprovalWindow } from '../src/core/window.ts'

describe('ApprovalWindow â€?arm/disarm/isActive/remaining/restore', () => {
  it('is not active before arming', () => {
    const w = new ApprovalWindow()
    expect(w.isActive('a')).toBe(false)
    expect(w.remainingMs('a')).toBe(null)
  })

  it('arms a session with a deadline and prior sandbox mode', () => {
    const w = new ApprovalWindow()
    const now = Date.now()
    const entry = w.arm('a', 30_000, 'workspace-write')
    expect(w.isActive('a')).toBe(true)
    expect(entry.until).toBeGreaterThan(now)
    expect(w.get('a')?.priorSandboxMode).toBe('workspace-write')
    expect((w.remainingMs('a') ?? 0)).toBeGreaterThan(0)
  })

  it('re-arm overwrites deadline and prior', () => {
    const w = new ApprovalWindow()
    w.arm('a', 30_000, 'workspace-write')
    w.arm('a', 60_000, 'read-only')
    expect(w.get('a')?.priorSandboxMode).toBe('read-only')
    expect((w.remainingMs('a') ?? 0)).toBeGreaterThan(50_000)
  })

  it('a window is expired once past its deadline', () => {
    const w = new ApprovalWindow()
    const now = Date.now()
    w.arm('b', 10, 'workspace-write')
    expect(w.isActive('b', now)).toBe(true)
    expect(w.isActive('b', now + 1000)).toBe(false)
    expect(w.remainingMs('b', now + 1000)).toBe(null)
  })

  it('activeIds lists only live windows', () => {
    const w = new ApprovalWindow()
    const now = Date.now()
    w.arm('a', 60_000, 'workspace-write')
    w.arm('b', 10, 'workspace-write')
    expect(w.activeIds(now).sort()).toEqual(['a', 'b'])
    expect(w.activeIds(now + 1000)).toEqual(['a'])
  })

  it('disarm clears idempotently', () => {
    const w = new ApprovalWindow()
    w.arm('a', 60_000, 'workspace-write')
    w.disarm('a')
    expect(w.isActive('a')).toBe(false)
    expect(w.get('a')).toBe(undefined)
    w.disarm('a') // no-op
  })

  it('restore rebuilds from a persisted absolute deadline', () => {
    const w = new ApprovalWindow()
    const until = Date.now() + 60_000
    w.restore('a', until, 60_000, 'read-only')
    expect(w.isActive('a')).toBe(true)
    expect(w.get('a')).toMatchObject({ until, durationMs: 60_000, priorSandboxMode: 'read-only' })
  })
})
