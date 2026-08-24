/**
 * Approval-window header-action copy.
 * @module @xuhai/dsh-approval-window/locales
 */
export const NS = 'approval-window' as const

/** Key map for the approval-window namespace. */
export type ApprovalWindowKey =
  | 'action.arm'
  | 'action.disarm'
  | 'preset.minutes'
  | 'preset.custom'
  | 'status.armed'
  | 'status.idle'
  | 'status.remaining'

/** Simplified Chinese copy. */
export const zh = {
  'action.arm': '开启',
  'action.disarm': '关闭',
  'preset.minutes': '{minutes} 分钟',
  'preset.custom': '自定义',
  'status.armed': '审批放行中',
  'status.idle': '审批放行',
  'status.remaining': '剩余 {seconds} 秒',
} satisfies Record<ApprovalWindowKey, string>

/** English copy. */
export const en = {
  'action.arm': 'Enable',
  'action.disarm': 'Disable',
  'preset.minutes': '{minutes} min',
  'preset.custom': 'Custom',
  'status.armed': 'Approval easing',
  'status.idle': 'Approval easing',
  'status.remaining': '{seconds}s left',
} satisfies Record<ApprovalWindowKey, string>
