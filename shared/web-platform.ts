/**
 * Shared browser platform modules: the specifiers the shell shares into the
 * frozen module table. Client-bundle externals mirror this list so module
 * identities cannot drift.
 * @module dsh-approval-window/shared/web-platform
 */

/** The module specifiers the shell shares into the frozen module table. */
export const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
] as const

/** The runtime row whose factory registers before dependent bundles. */
export const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'
