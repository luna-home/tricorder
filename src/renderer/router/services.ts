import type { Component } from 'vue'
import type { RouteRecordRaw } from 'vue-router'

import type { ServiceState } from '@shared/service'
import { registry } from '@services/registry'

declare module 'vue-router' {
  interface RouteMeta {
    /** Set on every route under `/<id>`: the service the page belongs to. */
    serviceId?: string
  }
}

/**
 * What `src/services/<id>/ui/routes.ts` exports:
 * - default: `RouteRecordRaw[]`, paths relative to the service (no leading slash), mounted under
 *   `/<id>`; route names start with `<id>`.
 * - `alerts` (optional): components that replace the frame's generic notice for a service state,
 *   e.g. `{ unconfigured: SetupNotice }`. They receive the prop `status: ServiceStatus`.
 */
export interface ServiceUiModule {
  default: RouteRecordRaw[]
  alerts?: Partial<Record<ServiceState, Component>>
}

const serviceUiModules = import.meta.glob<ServiceUiModule>('../../services/*/ui/routes.ts', {
  eager: true,
})

const serviceUis = Object.entries(serviceUiModules).flatMap(([path, module]) => {
  const id = /\/services\/([^/]+)\/ui\/routes\.ts$/.exec(path)?.[1]
  return id && id in registry ? [{ id, module }] : []
})

/** Ids of the services that have a UI, i.e. a ui/routes.ts. */
export const serviceUiIds: ReadonlySet<string> = new Set(serviceUis.map(({ id }) => id))

export function serviceRoutes(): RouteRecordRaw[] {
  return serviceUis.map(({ id, module }) => ({
    path: `/${id}`,
    meta: { serviceId: id },
    children: module.default,
  }))
}

/** The service's own notice for `state`, if its UI brings one. */
export function serviceAlert(id: string, state: ServiceState): Component | undefined {
  return serviceUis.find((ui) => ui.id === id)?.module.alerts?.[state]
}
