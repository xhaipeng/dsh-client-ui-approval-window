/**
 * Shared tsdown preset for the approval-window plugin (single source of truth
 * for this repo's build). Emits the node half (lib/index.js) and the browser
 * client closure-factory artifact (lib/client.js) that calls
 * window.__ModuleLoader__.load. This standalone copy is a trimmed form of the
 * dsh-web-ui preset: the client imports no @deepseek-ai value and no CSS
 * Modules, so the purity gate and CSS plugin are omitted.
 * @module dsh-approval-window/shared/tsdown.client
 */

import type { UserConfig } from 'tsdown'
import { existsSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION } from './web-platform.ts'

/** Client-bundle externals: platform seed entries plus the runtime row. */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

interface ClientBundleOptions {
  /** Extra Node-side externals (in addition to the cordis entry). */
  readonly libExternal?: readonly (string | RegExp)[]
}

/**
 * Build the tsdown config for this plugin: the node-half library plus the
 * browser client bundle.
 * @param id - plugin id (package name), stamped into the __ModuleLoader__ handoff.
 * @param libEntry - node-half entry points.
 * @param options - node-half external overrides.
 * @returns the selected tsdown configs.
 */
export function clientBundle(id: string, libEntry: readonly string[], options: ClientBundleOptions = {}) {
  const lib: UserConfig = {
    name: id,
    entry: [...libEntry],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    // With "type": "module" the ESM node half must land on lib/index.js, not
    // tsdown's default index.mjs (the package exports/main point at .js).
    outputOptions: { entryFileNames: 'index.js' },
    external: ['@deepseek-ai/cordis', ...(options.libExternal ?? [])],
  }
  return ({ env }: { env?: { DSH_BUILD_FACE?: string } }) => {
    const face = env?.DSH_BUILD_FACE
    if (face !== undefined && face !== 'host' && face !== 'client') {
      throw new Error(`tsdown: --env.DSH_BUILD_FACE must be host or client, received ${String(face)}`)
    }
    const hasClient = existsSync(resolvePath(process.cwd(), 'src/client/index.ts'))
    const client: UserConfig | undefined = hasClient
      ? {
        name: `${id}/client`,
        entry: { client: face === undefined ? 'src/client/index.ts' : 'lib/types/client/index.js' },
        outDir: 'lib',
        format: ['cjs'],
        platform: 'browser',
        target: 'es2022',
        dts: false,
        sourcemap: true,
        clean: false,
        external: [...CLIENT_EXTERNALS],
        noExternal: (moduleId: string) => (CLIENT_EXTERNALS.includes(moduleId) ? undefined : true),
        outputOptions: {
          entryFileNames: 'client.js',
          banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
          footer: 'return module.exports; } });',
          intro: 'var module = { exports: {} }; var exports = module.exports;',
        },
      }
      : undefined
    if (face === 'host') return client === undefined ? [lib] : [lib]
    if (face === 'client') return client === undefined ? [] : [client]
    return client === undefined ? [lib] : [lib, client]
  }
}
