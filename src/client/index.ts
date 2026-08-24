/**
 * Approval-window browser half: contributes one session-header action that
 * reads this session's trust-window snapshot and arms/disarms it. The
 * component owns its same-origin host transport directly (no slot inject face —
 * the header-action slot's contract is fixed); it issues no RPC beyond the
 * host routes and holds only its own countdown.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { ApprovalWindowButton } from './ApprovalWindowButton.tsx'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { en, NS, zh, type ApprovalWindowKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Approval-window header-action copy. */
    'approval-window': ApprovalWindowKey
  }
}

export type { ApprovalWindowButtonProps } from './ApprovalWindowButton.tsx'

/** Required services for locale registration and header-slot contribution. */
export const inject = ['sessions', 'slots', 'locale']

/**
 * Client plugin body: register the dictionary and the header action.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'approval-window: dictionaries')
  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'approval-window',
      order: 30,
      locale: NS,
    }, ApprovalWindowButton),
  )
}
