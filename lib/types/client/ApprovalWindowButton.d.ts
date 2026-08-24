import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
/** One-click preset durations in minutes. */
export declare const PRESET_MINUTES: readonly [5, 15, 30, 60];
/** Full props for the session-header approval-window action. */
export type ApprovalWindowButtonProps = PropsRuntime<'conversation.session.header.actions'> & PropsLocale<'approval-window'>;
/**
 * Session-header control: shows the current window state and arms/disarms it.
 * Owns one same-origin host transport (created once) and keeps only its own
 * countdown; every data read goes through the transport, never ctx.
 */
export declare function ApprovalWindowButton({ sessionId, t }: ApprovalWindowButtonProps): import("react").JSX.Element;
