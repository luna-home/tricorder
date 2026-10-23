import type { ServiceDefinition } from '@shared/define-service'
import { registry } from '@services/registry'

import type { Locale } from '@shared/locale'
import type { ServiceSource } from './service-host'

// By convention (CLAUDE.md): src/services/<id>/main.ts default-exports defineService().
// Lazy, so a service that fails at import only breaks itself.
const mains = import.meta.glob<{ default: ServiceDefinition }>('../services/*/main.ts')
const locales = import.meta.glob<{ name?: string }>('../services/*/locales/*.json', {
  eager: true,
  import: 'default',
})

const idOf = (path: string) => /\/services\/([^/]+)\//.exec(path)?.[1]

/** Every service of `src/services/registry.ts` with the loader of its `main.ts`. */
export function serviceSources(): ServiceSource[] {
  const loaders = new Map(Object.entries(mains).map(([path, load]) => [idOf(path), load]))
  return Object.values(registry).map(({ manifest, contract }) => {
    const load = loaders.get(manifest.id)
    return {
      manifest,
      contract,
      ...(load ? { load: async () => (await load()).default } : {}),
    }
  })
}

/** Display name of a service from its `locales/<locale>.json`, falling back to the id. */
export function serviceNames(locale: Locale): (id: string) => string {
  const names = new Map<string, string>()
  for (const [path, messages] of Object.entries(locales)) {
    const id = idOf(path)
    if (id && path.endsWith(`/${locale}.json`) && messages.name) names.set(id, messages.name)
  }
  return (id) => names.get(id) ?? id
}
