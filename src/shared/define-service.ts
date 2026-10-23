/**
 * The main-process half of a service: `defineService({ manifest, contract, setup })`.
 * The default export of `src/services/<id>/main.ts`. The host (`src/main/service-host.ts`)
 * creates one {@link ServiceContext} per service and calls `setup(ctx)` once at app start.
 */
import type {
  ArgsFor,
  EventData,
  EventName,
  MethodName,
  MethodParams,
  MethodReturn,
  ServiceContract,
  SettingsOf,
  SettingsPatch,
} from './contract'
import {
  SERVICE_ID_PATTERN,
  type ServiceManifest,
  type SettableServiceState,
  type StatusReason,
} from './service'

/** Undoes a registration (timer, listener, watcher). Calling it twice is harmless. */
export type Dispose = () => void

export type MethodHandler<C extends ServiceContract, K extends MethodName<C>> = (
  input: MethodParams<C, K>,
) => MethodReturn<C, K> | Promise<MethodReturn<C, K>>

/** The service's own section of the settings file under `userData`. */
export interface ServiceSettings<C extends ServiceContract> {
  /** Current settings, parsed with the contract's settings schema (defaults applied). */
  get(): SettingsOf<C>
  /** Merges `patch`, validates the result, saves it and notifies `onChange` listeners. Rejects on invalid data. */
  set(patch: SettingsPatch<C>): Promise<SettingsOf<C>>
  /** Called after every successful change, also for changes made from the renderer. */
  onChange(listener: (next: SettingsOf<C>, previous: SettingsOf<C>) => void): Dispose
}

/** Secrets of the service (passwords, tokens), encrypted with Electron `safeStorage`. */
export interface ServiceSecrets {
  /** False where the OS offers no encryption (some Linux setups); `set` then rejects. */
  available(): boolean
  get(key: string): Promise<string | undefined>
  /** `undefined` deletes the secret. */
  set(key: string, value: string | undefined): Promise<void>
}

/** Writes to `userData/logs/<id>.log`, prefixed with time, level and service id. */
export interface ServiceLogger {
  info(message: string, ...details: unknown[]): void
  warn(message: string, ...details: unknown[]): void
  error(message: string, ...details: unknown[]): void
}

export interface ServiceContext<C extends ServiceContract> {
  readonly manifest: ServiceManifest
  /**
   * Registers the handler of a contract method on channel `svc:<id>:<method>`. The host parses
   * the input with the method's input schema before calling `fn` and the result with its output
   * schema before sending it; a failing parse becomes an `invalid-input` / `invalid-output`
   * error, a thrown error becomes `failed`. Register every method once, during `setup`.
   */
  handle<K extends MethodName<C>>(method: K, fn: MethodHandler<C, K>): void
  /** Validates `data` with the event schema and pushes it to every window (`svc:<id>:event:<name>`). */
  emit<K extends EventName<C>>(event: K, ...data: ArgsFor<EventData<C, K>>): void
  readonly settings: ServiceSettings<C>
  readonly secrets: ServiceSecrets
  readonly status: {
    /**
     * Feeds the status list, the tray and red/yellow alerts. `reason.code` is translated by the
     * renderer (`services.<id>.reasons.<code>` in the service's ui/locales), `reason.detail` is
     * shown verbatim.
     */
    set(state: SettableServiceState, reason?: StatusReason): void
  }
  /** Runs `fn` every `intervalMs` (not immediately). Errors are logged, the timer keeps running. Disposed on shutdown. */
  schedule(intervalMs: number, fn: () => void | Promise<void>): Dispose
  /** Shows a system notification. */
  notify(title: string, body: string): void
  readonly log: ServiceLogger
}

/** Cleanup that `setup` may return; the host calls it on shutdown. */
export type SetupResult = void | Dispose | Promise<void | Dispose>

export interface ServiceDefinition<C extends ServiceContract = ServiceContract> {
  manifest: ServiceManifest
  contract: C
  /**
   * Called once at app start. Register handlers, read settings, start watchers here and set the
   * status. If it throws, the service gets status `error` and every other service keeps running.
   */
  setup(ctx: ServiceContext<C>): SetupResult
}

/**
 * Declares the main-process part of a service. Checks the manifest id and that the contract's
 * settings schema accepts an empty settings section.
 *
 * @example
 * export default defineService({
 *   manifest,
 *   contract,
 *   setup(ctx) {
 *     ctx.handle('ping', ({ text }) => `${ctx.settings.get().greeting} ${text}`)
 *     ctx.status.set('online')
 *   },
 * })
 */
export function defineService<C extends ServiceContract>(
  definition: ServiceDefinition<C>,
): ServiceDefinition<C> {
  const { id } = definition.manifest
  if (!SERVICE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid service id "${id}": use ${SERVICE_ID_PATTERN}`)
  }
  if (!definition.contract.settings.safeParse({}).success) {
    throw new Error(`Service "${id}": the settings schema must accept {} (add defaults)`)
  }
  return definition
}
