/**
 * Helpers for `src/services/registry.ts`, the one place where services are listed. The
 * registry holds manifest and contract only (no main-process code), so main and renderer can
 * both import it.
 */
import type { ServiceContract } from './contract'
import type { ServiceManifest } from './service'

export interface RegistryEntry<
  Id extends string = string,
  C extends ServiceContract = ServiceContract,
> {
  manifest: ServiceManifest<Id>
  contract: C
}

export type ServiceRegistry = Record<string, RegistryEntry>

/** Keys must equal the manifest ids; the type check enforces it. */
export function defineRegistry<const R extends { [K in keyof R & string]: RegistryEntry<K> }>(
  registry: R,
): R {
  return registry
}

/** Declares a manifest and keeps its id as a literal type. */
export function defineManifest<const Id extends string>(
  manifest: ServiceManifest<Id>,
): ServiceManifest<Id> {
  return manifest
}
