import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ApprovalWindowSnapshot } from './host-api.ts'
import { createApprovalWindowHostApi } from './host-api.ts'
import type { ApprovalWindowKey } from './locales.ts'

/** One-click preset durations in minutes. */
export const PRESET_MINUTES = [5, 15, 30, 60] as const

/** Full props for the session-header approval-window action. */
export type ApprovalWindowButtonProps =
  PropsRuntime<'conversation.session.header.actions'>
  & PropsLocale<'approval-window'>

/** Minutes to milliseconds. */
function minutesToMs(minutes: number): number {
  return Math.round(minutes * 60 * 1000)
}

/**
 * Session-header control: shows the current window state and arms/disarms it.
 * Owns one same-origin host transport (created once) and keeps only its own
 * countdown; every data read goes through the transport, never ctx.
 */
export function ApprovalWindowButton({ sessionId, t }: ApprovalWindowButtonProps) {
  const [host] = useState(() => createApprovalWindowHostApi())
  const [snapshot, setSnapshot] = useState<ApprovalWindowSnapshot | null>(null)
  const [now, setNow] = useState(() => Date.now())

  // Load once and refresh on host pushes.
  useEffect(() => {
    let cancelled = false
    void host.snapshot(sessionId).then((value) => { if (!cancelled) setSnapshot(value) }).catch(() => {})
    const unsubscribe = host.subscribe(sessionId, () => {
      void host.snapshot(sessionId).then((value) => { if (!cancelled) setSnapshot(value) }).catch(() => {})
    })
    return () => { cancelled = true; unsubscribe() }
  }, [sessionId, host])

  // Tick the remaining countdown while armed.
  useEffect(() => {
    if (snapshot === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => { clearInterval(timer) }
  }, [snapshot])

  const remaining = useMemo(() => {
    if (snapshot?.armed !== true || snapshot.until === null) return null
    return Math.max(0, Math.floor((snapshot.until - now) / 1000))
  }, [snapshot, now])

  const onArm = (minutes: number): void => {
    void host.arm(sessionId, minutesToMs(minutes)).then(setSnapshot).catch(() => {})
  }
  const onDisarm = (): void => {
    void host.disarm(sessionId).then(setSnapshot).catch(() => {})
  }

  return (
    <div>
      {snapshot?.armed === true && remaining !== null
        ? (
          <button type="button" onClick={onDisarm} title={t('status.remaining', { seconds: String(remaining) })}>
            {t('status.armed')} ({t('status.remaining', { seconds: String(remaining) })})
          </button>
        )
        : (
          <div>
            <span>{t('status.idle')}</span>
            {PRESET_MINUTES.map(minutes => (
              <button key={minutes} type="button" onClick={() => onArm(minutes)}>
                {t('preset.minutes', { minutes: String(minutes) })}
              </button>
            ))}
          </div>
        )}
    </div>
  )
}
