import { defineStore } from 'pinia'
import { computed, ref, toValue, type MaybeRefOrGetter } from 'vue'

import type { Unsubscribe } from '@shared/api'
import type { ServiceInfo, ServiceStatus } from '@shared/service'

import { getBridge } from './client'

/** `connecting` until the host answered once; `unreachable` when there is no bridge or no host. */
export type HostConnection = 'connecting' | 'connected' | 'unreachable'

/** Why the host is unreachable: `code` is translated (`alert.bridge.causes.<code>`), `detail` is shown verbatim. */
export interface HostFailure {
  code: 'noBridge' | 'hostUnreachable'
  detail?: string
}

const RETRY_MS = 2000

/** Services and their live status, from `host:services:list` plus `host:services:status` pushes. */
export const useServicesStore = defineStore('services', () => {
  const services = ref<ServiceInfo[]>([])
  const connection = ref<HostConnection>('connecting')
  /** Why the host is unreachable, for the red alert. */
  const failure = ref<HostFailure>()

  // Pushes received so far; a list response may be older than a push that overtook it.
  const pushed = new Map<string, ServiceStatus>()
  let offStatus: Unsubscribe | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let loading: Promise<void> | undefined

  function newest(a: ServiceStatus, b: ServiceStatus | undefined): ServiceStatus {
    return b && Date.parse(b.since) >= Date.parse(a.since) ? b : a
  }

  function applyStatus(status: ServiceStatus) {
    pushed.set(status.id, newest(status, pushed.get(status.id)))
    services.value = services.value.map((info) =>
      info.id === status.id ? { ...info, status: newest(info.status, status) } : info,
    )
  }

  async function load() {
    clearTimeout(retryTimer)
    const bridge = getBridge()
    if (!bridge) {
      connection.value = 'unreachable'
      failure.value = { code: 'noBridge' }
      return
    }
    offStatus ??= bridge.services.onStatus(applyStatus)
    try {
      const list = await bridge.services.list()
      services.value = list.map((info) => ({
        ...info,
        status: newest(info.status, pushed.get(info.id)),
      }))
      connection.value = 'connected'
      failure.value = undefined
    } catch (error) {
      connection.value = 'unreachable'
      failure.value = {
        code: 'hostUnreachable',
        detail: error instanceof Error ? error.message : String(error),
      }
      retryTimer = setTimeout(() => void connect(), RETRY_MS)
    }
  }

  /** Loads the service list; retries every 2 s while the host does not answer. */
  function connect(): Promise<void> {
    loading ??= load().finally(() => (loading = undefined))
    return loading
  }

  function disconnect() {
    clearTimeout(retryTimer)
    offStatus?.()
    offStatus = undefined
  }

  function statusOf(id: string): ServiceStatus | undefined {
    return services.value.find((info) => info.id === id)?.status
  }

  return { services, connection, failure, connect, disconnect, statusOf }
})

/** Live status of one service; `undefined` until the host has listed it. */
export function useServiceStatus(id: MaybeRefOrGetter<string | undefined>) {
  const store = useServicesStore()
  return computed(() => {
    const serviceId = toValue(id)
    return serviceId === undefined ? undefined : store.statusOf(serviceId)
  })
}
