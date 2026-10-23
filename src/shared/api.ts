/**
 * `window.tricorder`: the only bridge between renderer and main, exposed by the preload.
 * No Node APIs reach the renderer. Type-only module.
 */
import type {
  ArgsFor,
  EventName,
  EventPayload,
  MethodInput,
  MethodName,
  MethodResult,
  SettingsOf,
  SettingsPatch,
} from './contract'
import type { IpcResult } from './ipc'
import type { Locale } from './locale'
import type { ServiceRegistry } from './registry'
import type { ServiceInfo, ServiceStatus } from './service'

export type Unsubscribe = () => void

/** Settings of the app itself, not of a service. Stored in the `app` section of `settings.json`. */
export interface AppSettings {
  /** Start Tricorder at login, hidden in the tray. Off by default; only applied in a packaged app. */
  autostart: boolean
}

/** Untyped shape, as implemented by the preload. */
export interface TricorderBridge {
  /** `process.platform` of the main process, e.g. for the macOS inset title bar. */
  platform: string
  /** UI language, decided once by the main process (see `@shared/locale`). */
  locale: Locale
  invoke(service: string, method: string, args?: unknown): Promise<IpcResult<unknown>>
  on(service: string, event: string, listener: (data: unknown) => void): Unsubscribe
  services: {
    list(): Promise<ServiceInfo[]>
    onStatus(listener: (status: ServiceStatus) => void): Unsubscribe
  }
  settings: {
    get(service: string): Promise<IpcResult<unknown>>
    set(service: string, patch: unknown): Promise<IpcResult<unknown>>
    /** Settings of the app itself, see {@link AppSettings}. */
    app: {
      get(): Promise<IpcResult<AppSettings>>
      set(patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>>
    }
  }
}

type ContractOf<R extends ServiceRegistry, S extends keyof R> = R[S]['contract']

/** The same object, typed from the service registry. Declared on `window` in `src/renderer/env.d.ts`. */
export interface TricorderApi<R extends ServiceRegistry> {
  platform: string
  locale: Locale
  /** Calls a service method. Resolves to an envelope; unwrap with `unwrapResult()`. */
  invoke<S extends keyof R & string, M extends MethodName<ContractOf<R, S>>>(
    service: S,
    method: M,
    ...args: ArgsFor<MethodInput<ContractOf<R, S>, M>>
  ): Promise<IpcResult<MethodResult<ContractOf<R, S>, M>>>
  /** Subscribes to a service event. Call the returned function to unsubscribe. */
  on<S extends keyof R & string, E extends EventName<ContractOf<R, S>>>(
    service: S,
    event: E,
    listener: (data: EventPayload<ContractOf<R, S>, E>) => void,
  ): Unsubscribe
  services: TricorderBridge['services']
  settings: {
    get<S extends keyof R & string>(service: S): Promise<IpcResult<SettingsOf<ContractOf<R, S>>>>
    set<S extends keyof R & string>(
      service: S,
      patch: SettingsPatch<ContractOf<R, S>>,
    ): Promise<IpcResult<SettingsOf<ContractOf<R, S>>>>
    app: TricorderBridge['settings']['app']
  }
}
