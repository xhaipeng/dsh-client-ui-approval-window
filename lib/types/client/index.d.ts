/**
 * Approval-window browser half: contributes one session-header action that
 * reads this session's trust-window snapshot and arms/disarms it. The
 * component owns its same-origin host transport directly (no slot inject face —
 * the header-action slot's contract is fixed); it issues no RPC beyond the
 * host routes and holds only its own countdown.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type ApprovalWindowKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Approval-window header-action copy. */
        'approval-window': ApprovalWindowKey;
    }
}
export type { ApprovalWindowButtonProps } from './ApprovalWindowButton.tsx';
/** Required services for locale registration and header-slot contribution. */
export declare const inject: string[];
/**
 * Client plugin body: register the dictionary and the header action.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): void;
