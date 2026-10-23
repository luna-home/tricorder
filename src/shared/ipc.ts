/**
 * IPC channel names and the result envelope. No runtime dependencies: the sandboxed preload
 * imports this file and cannot load packages such as zod.
 *
 * Channels:
 * - `svc:<id>:<method>`: invoke a service method (renderer -> main, `ipcRenderer.invoke`).
 * - `svc:<id>:event:<name>`: service event (main -> renderer, `webContents.send`).
 * - `host:*`: platform channels, see {@link HOST_CHANNELS}.
 */

export const serviceMethodChannel = (service: string, method: string): string =>
  `svc:${service}:${method}`

export const serviceEventChannel = (service: string, event: string): string =>
  `svc:${service}:event:${event}`

export const HOST_CHANNELS = {
  /** invoke, no args -> `ServiceInfo[]` sorted by `order`. */
  servicesList: 'host:services:list',
  /** push, payload `ServiceStatus`, sent on every status change. */
  serviceStatus: 'host:services:status',
  /** invoke `(serviceId)` -> `IpcResult<settings>` of that service. */
  settingsGet: 'host:settings:get',
  /** invoke `(serviceId, patch)` -> `IpcResult<settings>` after validating and saving the merge. */
  settingsSet: 'host:settings:set',
  /** invoke, no args -> `IpcResult<AppSettings>`: settings of the app itself (autostart ...). */
  appSettingsGet: 'host:app-settings:get',
  /** invoke `(patch)` -> `IpcResult<AppSettings>` after validating, saving and applying the merge. */
  appSettingsSet: 'host:app-settings:set',
} as const

/**
 * Why a call failed:
 * - `unknown-service` / `unknown-method`: no such service or no handler registered.
 * - `invalid-input`: the arguments failed the contract's input schema.
 * - `invalid-output`: the handler returned data that failed the output schema (a bug).
 * - `unavailable`: the service is not running (its `setup()` failed).
 * - `failed`: the handler threw; `message` is the error message.
 */
export type ServiceErrorCode =
  | 'unknown-service'
  | 'unknown-method'
  | 'invalid-input'
  | 'invalid-output'
  | 'unavailable'
  | 'failed'

export interface ServiceErrorInfo {
  code: ServiceErrorCode
  message: string
}

/**
 * What every `invoke` resolves to. Errors travel as data because Electron drops custom error
 * properties at the IPC and context-bridge boundaries; the renderer unwraps the envelope and
 * throws {@link ServiceCallError}.
 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: ServiceErrorInfo }

/** Thrown in the renderer when an {@link IpcResult} is not ok. */
export class ServiceCallError extends Error {
  readonly code: ServiceErrorCode
  readonly service: string
  readonly method: string

  constructor(service: string, method: string, info: ServiceErrorInfo) {
    super(info.message)
    this.name = 'ServiceCallError'
    this.code = info.code
    this.service = service
    this.method = method
  }
}

/** Returns `data` of an ok result, throws {@link ServiceCallError} otherwise. */
export function unwrapResult<T>(service: string, method: string, result: IpcResult<T>): T {
  if (result.ok) return result.data
  throw new ServiceCallError(service, method, result.error)
}
