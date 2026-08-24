/**
 * Standalone build config for the approval-window plugin.
 * Uses the repo's shared client-bundle preset: node-half lib/ plus the browser
 * bundle lib/client.js (closure-factory artifact for the GUI's __ModuleLoader__).
 */
import { clientBundle } from './shared/tsdown.client.ts'

export default clientBundle('@xuhai/dsh-client-ui-approval-window', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-agent',
    '@deepseek-ai/dsh-sandbox-policy',
    '@deepseek-ai/dsh-session',
    '@deepseek-ai/dsh-shell',
    '@deepseek-ai/dsh-tools',
    'schemastery',
  ],
})
