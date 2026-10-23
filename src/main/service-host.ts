/**
 * Runs the main-process half of every registered service: one {@link ServiceContext} per
 * service, IPC handlers for its contract methods, status bookkeeping and shutdown. A service
 * that fails (at import, in `setup`, in a handler) only affects itself.
 *
 * Electron is injected through {@link HostDeps}, so the host runs under Vitest without it.
 */
import { z } from 'zod'

import type { ServiceContract } from '@shared/contract'
import type {
  Dispose,
  MethodHandler,
  ServiceContext,
  ServiceDefinition,
  ServiceLogger,
  ServiceSecrets,
} from '@shared/define-service'
import {
  HOST_CHANNELS,
  serviceEventChannel,
  serviceMethodChannel,
  type IpcResult,
  type ServiceErrorCode,
} from '@shared/ipc'
import type {
  ServiceInfo,
  ServiceManifest,
  ServiceState,
  ServiceStatus,
  SettableServiceState,
  StatusReason,
} from '@shared/service'

import {
  SettingsValidationError,
  ValidatedSection,
  type Section,
  type SettingsStore,
} from './settings-store'

/** `ipcMain.handle` / `removeHandler`, reduced to what the host uses. */
export interface IpcRegistrar {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
  removeHandler(channel: string): void
}

export interface HostDeps {
  ipc: IpcRegistrar
  /** Sends to every renderer window. */
  broadcast(channel: string, payload?: unknown): void
  settings: SettingsStore
  secrets(serviceId: string): ServiceSecrets
  notify(title: string, body: string): void
  logger(name: string): ServiceLogger
  /** Rejects IPC calls from frames that are not the app's own renderer. Default: accept all. */
  isTrustedSender?(event: unknown): boolean
}

/** A registry entry plus the loader of its `main.ts`. */
export interface ServiceSource {
  manifest: ServiceManifest
  contract: ServiceContract
  /** Imports `src/services/<id>/main.ts`; absent when the service has none. */
  load?: () => Promise<ServiceDefinition>
}

const SETTABLE_STATES: readonly SettableServiceState[] = [
  'online',
  'offline',
  'unconfigured',
  'error',
]
/** How long `stop()` waits for a service's cleanup. */
const CLEANUP_TIMEOUT_MS = 3000

type AnyHandler = (input: unknown) => unknown

interface Runtime {
  manifest: ServiceManifest
  contract: ServiceContract
  log: ServiceLogger
  settings: ValidatedSection<ServiceContract['settings']>
  status: ServiceStatus
  handlers: Map<string, AnyHandler>
  disposers: Set<Dispose>
  cleanup?: Dispose
  /** Resolves when `setup` has finished, successfully or not. */
  ready: Promise<void>
  /** True after a successful `setup`, false after a failure or `stop()`. */
  running: boolean
  /** Set by a failure or `stop()`: the context ignores further calls. */
  dead: boolean
}

export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })
export const fail = (code: ServiceErrorCode, message: string): IpcResult<never> => ({
  ok: false,
  error: { code, message },
})

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export class ServiceHost {
  private readonly runtimes = new Map<string, Runtime>()
  private readonly statusListeners = new Set<(status: ServiceStatus) => void>()
  private readonly hostChannels: string[] = []
  private readonly log: ServiceLogger
  private stopping: Promise<void> | undefined

  constructor(private readonly deps: HostDeps) {
    this.log = deps.logger('tricorder')
  }

  /**
   * Registers all IPC handlers, then runs every service's `setup` in parallel. Never rejects:
   * failures end up in the service's status.
   */
  async start(sources: ServiceSource[]): Promise<void> {
    this.handleHost(HOST_CHANNELS.servicesList, () => this.list())
    this.handleHost(HOST_CHANNELS.settingsGet, (id) => this.getSettings(id))
    this.handleHost(HOST_CHANNELS.settingsSet, (id, patch) => this.setSettings(id, patch))

    const starts: Promise<void>[] = []
    for (const source of sources) {
      const { id } = source.manifest
      if (this.runtimes.has(id)) {
        this.log.error(`service "${id}" is registered twice, ignoring the second`)
        continue
      }
      const runtime = this.createRuntime(source)
      this.runtimes.set(id, runtime)
      for (const method of Object.keys(source.contract.methods)) {
        const channel = serviceMethodChannel(id, method)
        this.deps.ipc.handle(channel, (event, args) =>
          this.trusted(event) ? this.call(runtime, method, args) : this.untrusted(),
        )
      }
      const started = this.startService(runtime, source)
      runtime.ready = started
      starts.push(started)
    }
    await Promise.all(starts)
  }

  /** Every service with its manifest and current status, sorted by `order`. */
  list(): ServiceInfo[] {
    return [...this.runtimes.values()]
      .map((runtime) => ({ ...runtime.manifest, status: runtime.status }))
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  }

  /** Called on every status change of any service (tray). */
  onStatus(listener: (status: ServiceStatus) => void): Dispose {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  /** Disposes schedules and listeners, runs each service's cleanup, removes all IPC handlers. */
  stop(): Promise<void> {
    this.stopping ??= this.stopAll()
    return this.stopping
  }

  private async stopAll(): Promise<void> {
    await Promise.all(
      [...this.runtimes.values()].map(async (runtime) => {
        await withTimeout(runtime.ready, CLEANUP_TIMEOUT_MS).catch(() => {
          runtime.log.warn('setup still running at shutdown')
        })
        await this.shutdown(runtime)
        for (const method of Object.keys(runtime.contract.methods)) {
          this.deps.ipc.removeHandler(serviceMethodChannel(runtime.manifest.id, method))
        }
      }),
    )
    for (const channel of this.hostChannels) this.deps.ipc.removeHandler(channel)
    this.hostChannels.length = 0
  }

  private handleHost(channel: string, fn: (...args: unknown[]) => unknown): void {
    this.hostChannels.push(channel)
    this.deps.ipc.handle(channel, (event, ...args) =>
      this.trusted(event) ? fn(...args) : this.untrusted(),
    )
  }

  private trusted(event: unknown): boolean {
    return this.deps.isTrustedSender?.(event) ?? true
  }

  private untrusted(): IpcResult<never> {
    this.log.warn('rejected an IPC call from an untrusted frame')
    return fail('failed', 'untrusted sender')
  }

  private createRuntime(source: ServiceSource): Runtime {
    const { id } = source.manifest
    const log = this.deps.logger(id)
    const settings = new ValidatedSection(
      source.contract.settings,
      this.deps.settings.service(id),
      (value: Section) => this.deps.settings.setService(id, value),
      log,
    )
    return {
      manifest: source.manifest,
      contract: source.contract,
      log,
      settings,
      status: { id, state: 'starting', since: new Date().toISOString() },
      handlers: new Map(),
      disposers: new Set(),
      ready: Promise.resolve(),
      running: false,
      dead: false,
    }
  }

  private async startService(runtime: Runtime, source: ServiceSource): Promise<void> {
    const { id } = runtime.manifest
    try {
      if (!source.load) throw new Error(`src/services/${id}/main.ts is missing`)
      const definition = await source.load()
      if (definition?.manifest?.id !== id) {
        throw new Error(`main.ts of "${id}" exports no defineService() with that id`)
      }
      const cleanup = await definition.setup(this.createContext(runtime))
      if (runtime.dead) return
      if (typeof cleanup === 'function') runtime.cleanup = cleanup
      runtime.running = true
      if (runtime.status.state === 'starting') this.setStatus(runtime, 'online')
      runtime.log.info(`started (${runtime.status.state})`)
    } catch (error) {
      runtime.log.error('setup failed', error)
      await this.shutdown(runtime)
      this.setStatus(runtime, 'error', { code: 'setupFailed', detail: errorMessage(error) })
    }
  }

  private async shutdown(runtime: Runtime): Promise<void> {
    runtime.running = false
    runtime.dead = true
    runtime.handlers.clear()
    for (const dispose of runtime.disposers) safely(runtime.log, 'dispose', dispose)
    runtime.disposers.clear()
    const cleanup = runtime.cleanup
    runtime.cleanup = undefined
    if (cleanup) {
      await withTimeout(Promise.resolve().then(cleanup), CLEANUP_TIMEOUT_MS).catch(
        (error: unknown) => runtime.log.error('cleanup failed', error),
      )
    }
  }

  private async call(runtime: Runtime, method: string, args: unknown): Promise<IpcResult<unknown>> {
    const { id } = runtime.manifest
    try {
      await runtime.ready
      if (!runtime.running) {
        return fail(
          'unavailable',
          runtime.status.reason?.detail ?? `service "${id}" is not running`,
        )
      }
      const handler = runtime.handlers.get(method)
      const spec = runtime.contract.methods[method]
      if (!handler || !spec) return fail('unknown-method', `"${id}.${method}" has no handler`)

      const input = await spec.input.safeParseAsync(args)
      if (!input.success) return fail('invalid-input', z.prettifyError(input.error))

      let value: unknown
      try {
        value = await handler(input.data)
      } catch (error) {
        runtime.log.error(`${method} failed`, error)
        return fail('failed', errorMessage(error))
      }

      const output = await spec.output.safeParseAsync(value)
      if (!output.success) {
        const message = z.prettifyError(output.error)
        runtime.log.error(`${method} returned invalid data: ${message}`)
        return fail('invalid-output', `"${id}.${method}" returned invalid data: ${message}`)
      }
      return ok(output.data)
    } catch (error) {
      runtime.log.error(`${method}: unexpected host error`, error)
      return fail('failed', errorMessage(error))
    }
  }

  private getSettings(id: unknown): IpcResult<unknown> {
    const runtime = typeof id === 'string' ? this.runtimes.get(id) : undefined
    if (!runtime) return fail('unknown-service', `unknown service "${String(id)}"`)
    return ok(runtime.settings.get())
  }

  private async setSettings(id: unknown, patch: unknown): Promise<IpcResult<unknown>> {
    const runtime = typeof id === 'string' ? this.runtimes.get(id) : undefined
    if (!runtime) return fail('unknown-service', `unknown service "${String(id)}"`)
    try {
      return ok(await runtime.settings.set(patch))
    } catch (error) {
      if (error instanceof SettingsValidationError) return fail('invalid-input', error.message)
      runtime.log.error('saving settings failed', error)
      return fail('failed', errorMessage(error))
    }
  }

  private setStatus(runtime: Runtime, state: ServiceState, reason?: StatusReason): void {
    const current = runtime.status
    const next = reason
      ? { code: reason.code, ...(reason.detail ? { detail: reason.detail } : {}) }
      : undefined
    if (
      current.state === state &&
      current.reason?.code === next?.code &&
      current.reason?.detail === next?.detail
    ) {
      return
    }
    runtime.status = {
      id: runtime.manifest.id,
      state,
      ...(next ? { reason: next } : {}),
      since: new Date().toISOString(),
    }
    const why = next ? `: ${next.code}${next.detail ? ` (${next.detail})` : ''}` : ''
    const message = `status ${state}${why}`
    if (state === 'online' || state === 'starting') runtime.log.info(message)
    else runtime.log.warn(message)
    this.deps.broadcast(HOST_CHANNELS.serviceStatus, runtime.status)
    for (const listener of this.statusListeners) {
      safely(this.log, 'status listener', () => listener(runtime.status))
    }
  }

  private createContext(runtime: Runtime): ServiceContext<ServiceContract> {
    const { id } = runtime.manifest
    const { contract, log } = runtime
    const track = (dispose: Dispose): Dispose => {
      let done = false
      const once = () => {
        if (done) return
        done = true
        runtime.disposers.delete(once)
        dispose()
      }
      runtime.disposers.add(once)
      return once
    }

    const context: ServiceContext<ServiceContract> = {
      manifest: runtime.manifest,

      handle: (method, fn) => {
        if (!(method in contract.methods)) {
          throw new Error(`"${id}" has no method "${method}" in its contract`)
        }
        if (runtime.handlers.has(method)) {
          throw new Error(`"${id}.${method}" is handled twice`)
        }
        if (runtime.dead) return
        runtime.handlers.set(method, fn as MethodHandler<ServiceContract, string> as AnyHandler)
      },

      emit: (event, ...data) => {
        if (runtime.dead) return
        const schema = contract.events[event]
        if (!schema) {
          log.error(`emit: "${event}" is not an event of the contract`)
          return
        }
        const parsed = schema.safeParse(data[0])
        if (!parsed.success) {
          log.error(`emit ${event}: invalid payload: ${z.prettifyError(parsed.error)}`)
          return
        }
        this.deps.broadcast(serviceEventChannel(id, event), parsed.data)
      },

      settings: {
        get: () => runtime.settings.get(),
        set: (patch) => runtime.settings.set(patch),
        onChange: (listener) => track(runtime.settings.onChange(listener)),
      },

      secrets: this.deps.secrets(id),

      status: {
        set: (state, reason) => {
          if (runtime.dead) return
          if (!SETTABLE_STATES.includes(state)) {
            log.error(`status.set: invalid state "${String(state)}"`)
            return
          }
          this.setStatus(runtime, state, reason)
        },
      },

      schedule: (intervalMs, fn) => {
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
          throw new Error(`schedule: interval must be a positive number, got ${intervalMs}`)
        }
        if (runtime.dead) return () => {}
        let busy = false
        const timer = setInterval(() => {
          if (busy) return
          busy = true
          Promise.resolve()
            .then(fn)
            .catch((error: unknown) => log.error('scheduled job failed', error))
            .finally(() => {
              busy = false
            })
        }, intervalMs)
        timer.unref?.()
        return track(() => clearInterval(timer))
      },

      notify: (title, body) => {
        if (runtime.dead) return
        safely(log, 'notify', () => this.deps.notify(title, body))
      },

      log,
    }
    return context
  }
}

function safely(log: ServiceLogger, what: string, fn: () => void): void {
  try {
    fn()
  } catch (error) {
    log.error(`${what} failed`, error)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
