/**
 * The one place where services are registered: add `<id>: { manifest, contract }` here.
 * Main-process code (`<id>/main.ts`) and UI routes (`<id>/ui/routes.ts`) are found by
 * convention, see CLAUDE.md.
 */
import type { TricorderApi } from '@shared/api'
import { defineRegistry } from '@shared/registry'

import { logbuchContract } from './logbuch/contract'
import { manifest as logbuchManifest } from './logbuch/manifest'
import { portsContract } from './ports/contract'
import { manifest as portsManifest } from './ports/manifest'

export const registry = defineRegistry({
  logbuch: { manifest: logbuchManifest, contract: logbuchContract },
  ports: { manifest: portsManifest, contract: portsContract },
})

export type Registry = typeof registry
export type ServiceId = keyof Registry & string
export type ContractOf<Id extends ServiceId> = Registry[Id]['contract']

/** `window.tricorder`, typed from this registry. */
export type AppApi = TricorderApi<Registry>
