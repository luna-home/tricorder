import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, vi, type Mock } from 'vitest'
import type { Component, Plugin } from 'vue'
import { createMemoryHistory, type Router } from 'vue-router'

import type { TricorderBridge } from '@shared/api'
import type { IpcResult, ServiceErrorCode } from '@shared/ipc'
import type { ServiceInfo, ServiceState, ServiceStatus, StatusReason } from '@shared/service'
import { registry } from '@services/registry'

import App from '../App.vue'
import { createAppI18n, type Locale } from '../i18n'
import { createAppRouter } from '../router'

enableAutoUnmount(afterEach)
afterEach(() => {
  delete (globalThis as { tricorder?: unknown }).tricorder
})

/** A handler result that the mock bridge turns into a failed envelope. */
export class Failure {
  constructor(
    readonly code: ServiceErrorCode,
    readonly message: string,
  ) {}
}

export type Handler = (args: unknown) => unknown
type AppSettingsApi = TricorderBridge['settings']['app']

export interface BridgeMock {
  bridge: TricorderBridge
  invoke: Mock<TricorderBridge['invoke']>
  settingsSet: Mock<TricorderBridge['settings']['set']>
  /** Pushes a service event to every subscribed listener. */
  emit(service: string, event: string, data?: unknown): void
  /** Pushes a status change, as `host:services:status` does. */
  pushStatus(status: ServiceStatus): void
  /** Number of active event listeners for `service:event`. */
  listenerCount(service: string, event: string): number
}

export function status(id: string, state: ServiceState, reason?: StatusReason): ServiceStatus {
  return { id, state, ...(reason ? { reason } : {}), since: new Date().toISOString() }
}

/** The registry's services, all with `state` (default `online`). */
export function serviceInfos(state: ServiceState = 'online', reason?: StatusReason): ServiceInfo[] {
  return Object.values(registry).map(({ manifest }) => ({
    ...manifest,
    status: status(manifest.id, state, reason),
  }))
}

/**
 * Installs a fake `window.tricorder`. `handlers` are keyed `service.method`; a handler's return
 * value becomes `{ ok: true, data }`, a thrown error or a returned `Failure` a failed envelope.
 */
export function installBridge(
  options: {
    handlers?: Record<string, Handler>
    services?: ServiceInfo[] | Error
    platform?: string
  } = {},
): BridgeMock {
  const listeners = new Map<string, Set<(data: unknown) => void>>()
  const statusListeners = new Set<(status: ServiceStatus) => void>()
  const services = options.services ?? serviceInfos()

  const invoke = vi.fn<TricorderBridge['invoke']>(async (service, method, args) => {
    const handler = options.handlers?.[`${service}.${method}`]
    if (!handler) {
      return { ok: false, error: { code: 'unknown-method', message: `${service}.${method}` } }
    }
    try {
      const data = await handler(args)
      if (data instanceof Failure)
        return { ok: false, error: { code: data.code, message: data.message } }
      return { ok: true, data }
    } catch (error) {
      return { ok: false, error: { code: 'failed', message: (error as Error).message } }
    }
  })
  const settingsSet = vi.fn<TricorderBridge['settings']['set']>(
    async (_service, patch): Promise<IpcResult<unknown>> => ({ ok: true, data: patch }),
  )

  const bridge: TricorderBridge = {
    platform: options.platform ?? 'linux',
    locale: 'de',
    invoke,
    on(service, event, listener) {
      const key = `${service}:${event}`
      const set = listeners.get(key) ?? new Set()
      set.add(listener)
      listeners.set(key, set)
      return () => set.delete(listener)
    },
    services: {
      list: vi.fn<TricorderBridge['services']['list']>(async () => {
        if (services instanceof Error) throw services
        return structuredClone(services)
      }),
      onStatus(listener) {
        statusListeners.add(listener)
        return () => statusListeners.delete(listener)
      },
    },
    settings: {
      get: vi.fn<TricorderBridge['settings']['get']>(async () => ({ ok: true, data: {} })),
      set: settingsSet,
      app: {
        get: vi.fn<AppSettingsApi['get']>(async () => ({ ok: true, data: { autostart: false } })),
        set: vi.fn<AppSettingsApi['set']>(async (patch) => ({
          ok: true,
          data: { autostart: false, ...patch },
        })),
      },
    },
  }
  ;(globalThis as { tricorder?: unknown }).tricorder = bridge

  return {
    bridge,
    invoke,
    settingsSet,
    emit(service, event, data) {
      listeners.get(`${service}:${event}`)?.forEach((listener) => listener(data))
    },
    pushStatus(next) {
      statusListeners.forEach((listener) => listener(next))
    },
    listenerCount(service, event) {
      return listeners.get(`${service}:${event}`)?.size ?? 0
    },
  }
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

/** Plugins for mounting a single component: i18n, pinia, vue-query. */
export function testPlugins(locale: Locale = 'de') {
  const queryClient = createTestQueryClient()
  return {
    queryClient,
    plugins: [createAppI18n(locale), createPinia(), [VueQueryPlugin, { queryClient }]] as (
      Plugin | [Plugin, ...unknown[]]
    )[],
  }
}

/** Mounts the whole app (frame + router) at `path` and waits until it settled. */
export async function mountApp(path = '/', locale: Locale = 'de') {
  const router = createAppRouter(createMemoryHistory())
  await preloadRoutes(router)
  const { queryClient, plugins } = testPlugins(locale)
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App as Component, {
    attachTo: document.body,
    global: { plugins: [...plugins, router] },
  })
  await settle()
  return { wrapper, router, queryClient }
}

// Lazy route views load through dynamic imports, which take longer than a few ticks the first
// time; loading them up front keeps `settle()` short and deterministic.
async function preloadRoutes(router: Router) {
  const loaders = router
    .getRoutes()
    .flatMap((route) => Object.values(route.components ?? {}))
    .filter((component): component is () => Promise<unknown> => typeof component === 'function')
  await Promise.all([...loaders.map((load) => load()), ...asyncComponents.map((load) => load())])
}
const asyncComponents = [() => import('@services/logbuch/ui/components/SetupNotice.vue')]

/** Lets queries, lazy routes and async components resolve. */
export async function settle() {
  for (let i = 0; i < 5; i++) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
