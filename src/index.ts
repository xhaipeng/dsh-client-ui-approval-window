/**
 * Host approval-window plugin: a per-session time-windowed "trust grant". While
 * a session's window is armed, the risk gate on `tools/pre-execute` auto-allows
 * low/medium-risk calls and routes high-risk calls to a human confirmation; the
 * session's sandbox mode is widened to `danger-full-access` for the window but
 * its approval policy stays `ask` (never auto-rejected).
 *
 * @module @xuhai/dsh-approval-window
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from 'schemastery'
import { SessionId } from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import type { ToolExecution, PreToolDecision } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the shell capability Context merge (ctx.shell.sandboxMode).
import type {} from '@deepseek-ai/dsh-shell'
import { setSandboxMode, effectiveSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { classifyRisk } from './core/risk.ts'
import type { RiskRule } from './core/risk.types.ts'
import { ApprovalWindow } from './core/window.ts'
import type { SandboxMode } from './core/window.ts'
import { makeApprovalWindowRoutes } from './host-routes.ts'
import { readLedger, writeLedger, type LedgerEntry } from './core/persist.ts'

/** Default one-click presets (minutes). */
export const PRESET_MINUTES: readonly number[] = [5, 15, 30, 60]

/** Plugin config. */
export interface Config {
  /** Custom risk rules evaluated ahead of the built-in five categories. */
  readonly riskRules?: RiskRule[]
  /** Durable ledger path; when omitted the window state is in-memory only. */
  readonly ledgerPath?: string
}

/**
 * Host approval-window service. Requires a confining `ctx.shell` (to read the
 * pre-window sandbox mode) and the `tools/pre-execute` seam (the risk gate).
 */
export class ApprovalWindowService extends Service {
  static Config: z<Config> = z.object({
    riskRules: z.array(z.object({
      toolName: z.string(),
      pattern: z.string(),
      reason: z.string(),
    })),
    ledgerPath: z.string(),
  })

  static inject = ['shell', 'sessions']

  private readonly window = new ApprovalWindow()
  private readonly listeners = new Set<(sessionId: string) => void>()

  constructor(ctx: Context, public config: Config) {
    super(ctx, 'approvalWindow')

    // The single decision seam, running ahead of any other pre-execute policy.
    ctx.on('tools/pre-execute', (exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> => {
      return this.gate(exec, next)
    }, { prepend: true })

    // Same-origin HTTP surface (activates only when a webServer is composed —
    // CLI/headless assemblies never mount one and must not crash on this).
    ctx.inject(['webServer'], (webCtx) => {
      for (const route of makeApprovalWindowRoutes(this)) webCtx.webServer.register(route)
    })

    // Restart replay: reload armed windows whose deadline has not passed, and
    // re-widen the sandbox for sessions that already exist. A session restored
    // later re-widens on first arm/creation (its window entry is already live).
    if (this.config.ledgerPath !== undefined) {
      for (const entry of readLedger(this.config.ledgerPath)) this.replay(entry)
    }

    // A newly created/resumed session with a persisted armed window re-widens
    // its sandbox so the stored grant is honoured without a fresh arm.
    ctx.on('session/created', (session) => {
      const entry = this.window.get(session.id)
      if (entry !== undefined && entry.until > Date.now() && this.effectiveSandbox(session) !== 'danger-full-access') {
        setSandboxMode(session, 'danger-full-access')
      }
    })
  }

  /**
   * The risk gate (one execution). Armed + not expired → classify and
   * auto-allow (low/medium) or ask (high); unarmed/expired → delegate to the
   * default pipeline. Expiry lazily clears the window and restores the prior
   * sandbox mode.
   */
  private async gate(exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> {
    const agent = exec.agent
    if (agent === undefined) return next()
    const session = agent.session
    const now = Date.now()
    if (!this.window.isActive(session.id, now)) {
      if (this.window.get(session.id) !== undefined) {
        this.restoreSandboxAndClear(session)
        return next()
      }
      return next()
    }
    const decision = classifyRisk(
      { toolName: exec.name, args: exec.arguments as Record<string, unknown> },
      { rules: this.config.riskRules },
    )
    if (decision.risk === 'high') {
      // Strong warning inside the native approval prompt; the user must confirm.
      return { kind: 'ask', reason: `⚠️ 高风险 (${decision.reason})：窗口已放行常规审批，但此动作可能损坏系统/丢失数据，请确认后执行。` }
    }
    return { kind: 'allow' }
  }

  /**
   * Arm (or re-arm) a session's window: record the pre-window sandbox mode,
   * widen it to full access, and keep the approval policy unchanged (still
   * `ask`, so the high-risk gate keeps prompting).
   * @param session - the session being granted the window.
   * @param durationMs - window length in ms.
   */
  arm(session: Session, durationMs: number): void {
    const prior = this.effectiveSandbox(session)
    if (prior !== 'danger-full-access') setSandboxMode(session, 'danger-full-access')
    this.window.arm(session.id, durationMs, prior)
    this.persist()
    this.notify(session.id)
  }

  /** Disarm (idempotent): restore the pre-window sandbox mode and clear the window. */
  disarm(session: Session): void {
    const entry = this.window.get(session.id)
    if (entry !== undefined && entry.priorSandboxMode !== null && entry.priorSandboxMode !== 'danger-full-access') {
      setSandboxMode(session, entry.priorSandboxMode)
    }
    this.window.disarm(session.id)
    this.persist()
    this.notify(session.id)
  }

  /** Whether a session's window is currently active. */
  isActive(session: Session): boolean {
    return this.window.isActive(session.id)
  }

  /** Remaining ms until expiry, or `null` when no active window. */
  remainingMs(session: Session): number | null {
    return this.window.remainingMs(session.id)
  }

  /** The armed window's granted duration in ms, or `null` when none is active. */
  duration(session: Session): number | null {
    const entry = this.window.get(session.id)
    return entry === undefined || entry.until <= Date.now() ? null : entry.durationMs
  }

  /** Resolve a session id to a live session, else `undefined`. */
  session(sessionId: string): Session | undefined {
    return this.ctx.sessions.get(SessionId(sessionId))
  }

  /** Subscribe to arm/disarm changes; returns the unsubscribe disposer. */
  onChange(listener: (sessionId: string) => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private notify(sessionId: string): void {
    for (const listener of this.listeners) listener(sessionId)
  }

  /** The session's effective sandbox mode (its own fold, else the shell default). */
  private effectiveSandbox(session: Session): SandboxMode | null {
    return effectiveSandboxMode(session.events) ?? this.ctx.shell.sandboxMode ?? null
  }

  /** Restore a persisted window entry into the live window and re-widen a live session. */
  private replay(entry: LedgerEntry): void {
    if (entry.until <= Date.now()) return // already expired; drop on next persist
    this.window.restore(entry.sessionId, entry.until, entry.durationMs, entry.priorSandboxMode)
    const session = this.session(entry.sessionId)
    if (session !== undefined && this.effectiveSandbox(session) !== 'danger-full-access') {
      setSandboxMode(session, 'danger-full-access')
    }
  }

  /** Persist every active window entry to the ledger (no-op without a path). */
  private persist(): void {
    if (this.config.ledgerPath === undefined) return
    const entries: LedgerEntry[] = this.window.activeIds().map((id) => {
      const entry = this.window.get(id)
      if (entry === undefined) throw new Error('approval-window: active entry missing')
      return { sessionId: id, until: entry.until, durationMs: entry.durationMs, priorSandboxMode: entry.priorSandboxMode }
    })
    writeLedger(this.config.ledgerPath, entries)
  }

  /** Immediate-expiry path: restore the prior sandbox, clear the window, persist. */
  private restoreSandboxAndClear(session: Session): void {
    const entry = this.window.get(session.id)
    if (entry !== undefined && entry.priorSandboxMode !== null && entry.priorSandboxMode !== 'danger-full-access') {
      setSandboxMode(session, entry.priorSandboxMode)
    }
    this.window.disarm(session.id)
    this.persist()
    this.notify(session.id)
  }
}

/** The agent-typing re-export survival helper. */
export type { RiskRule }

export default ApprovalWindowService
