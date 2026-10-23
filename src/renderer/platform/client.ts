import { isProxy, isRef, toRaw } from 'vue'

import type { TricorderBridge } from '@shared/api'
import type { ServiceClient } from '@shared/contract'
import { ServiceCallError, unwrapResult } from '@shared/ipc'
import type { AppApi, ContractOf, ServiceId } from '@services/registry'

/** `window.tricorder`, or `undefined` outside Electron (e.g. a plain browser). */
export function getBridge(): AppApi | undefined {
  return (globalThis as { tricorder?: AppApi }).tricorder
}

/** Thrown when there is no preload bridge at all. */
export class BridgeUnavailableError extends Error {
  constructor() {
    super('window.tricorder is missing: the renderer runs without the Electron preload')
    this.name = 'BridgeUnavailableError'
  }
}

/** Errors that a retry cannot fix: missing bridge, rejected input, unknown method. */
export function isPermanentError(error: unknown): boolean {
  return (
    error instanceof BridgeUnavailableError ||
    (error instanceof ServiceCallError && error.code !== 'failed')
  )
}

/** Deep copy without Vue proxies or refs: IPC can only clone plain data. */
export function toPlain(value: unknown): unknown {
  const raw = isRef(value) ? toPlain(value.value) : isProxy(value) ? toRaw(value) : value
  if (Array.isArray(raw)) return raw.map(toPlain)
  if (raw !== null && typeof raw === 'object' && Object.getPrototypeOf(raw) === Object.prototype) {
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, toPlain(item)]))
  }
  return raw
}

/** Untyped call: invokes `svc:<id>:<method>` and unwraps the envelope. */
export async function callService(service: string, method: string, args?: unknown) {
  const bridge = getBridge()
  if (!bridge) throw new BridgeUnavailableError()
  const untyped = bridge as unknown as TricorderBridge
  return unwrapResult(service, method, await untyped.invoke(service, method, toPlain(args)))
}

/**
 * Typed client of one service: `client.openTopics({ all: true })`. Every method resolves to the
 * output of the contract or throws `ServiceCallError` / `BridgeUnavailableError`.
 */
export function createServiceClient<Id extends ServiceId>(id: Id): ServiceClient<ContractOf<Id>> {
  return new Proxy({} as ServiceClient<ContractOf<Id>>, {
    get(_target, method) {
      // `then` would make the client look like a promise to `await`.
      if (typeof method !== 'string' || method === 'then') return undefined
      return (args?: unknown) => callService(id, method, args)
    },
  })
}

/** Query keys: `['svc', id]` covers every query of a service, so one invalidation refreshes all. */
export function serviceQueryKey(id: string, method?: string, args?: unknown): unknown[] {
  if (method === undefined) return ['svc', id]
  return args === undefined ? ['svc', id, method] : ['svc', id, method, toPlain(args)]
}
