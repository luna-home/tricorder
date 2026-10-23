import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  ArgsFor,
  MethodInput,
  MethodName,
  MethodResult,
  SettingsOf,
  SettingsPatch,
} from '@shared/contract'
import type { ServiceContext } from '@shared/define-service'
import type { SettableServiceState, StatusReason } from '@shared/service'

import { type LogbuchContract, logbuchContract } from '../contract'
import { manifest } from '../manifest'

export const CLI = fileURLToPath(new URL('../../../../bin/logbuch', import.meta.url))

/** A temp directory with an (empty) database file path inside; never the real logbuch. */
export function tempDb(create = true): { dir: string; db: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'tricorder-logbuch-'))
  const db = join(dir, 'logbuch.db')
  if (create) writeFileSync(db, '')
  return { dir, db, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

/** Runs `bin/logbuch` against `db` and returns stdout. */
export function cli(db: string, ...args: string[]): string {
  const env: NodeJS.ProcessEnv = { ...process.env, LOGBUCH_DB: db }
  delete env.LOGBUCH_SESSION
  return execFileSync('python3', [CLI, ...args], {
    env,
    cwd: tmpdir(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

type C = LogbuchContract
type Handler = (input: unknown) => unknown

/** A `ServiceContext` that records handlers, events and status changes, like the host. */
export function fakeContext(initial: SettingsPatch<C> = {}) {
  const handlers = new Map<string, Handler>()
  const events: string[] = []
  const statuses: { state: SettableServiceState; reason?: StatusReason }[] = []
  const listeners = new Set<(next: SettingsOf<C>, previous: SettingsOf<C>) => void>()
  const scheduled = new Set<() => void | Promise<void>>()
  let settings = logbuchContract.settings.parse(initial)

  const ctx: ServiceContext<C> = {
    manifest,
    handle(method, fn) {
      handlers.set(method, fn as Handler)
    },
    emit(event, ..._data) {
      events.push(event)
    },
    settings: {
      get: () => settings,
      async set(patch) {
        const previous = settings
        settings = logbuchContract.settings.parse({ ...settings, ...patch })
        for (const listener of listeners) listener(settings, previous)
        return settings
      },
      onChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    secrets: {
      available: () => false,
      get: async () => undefined,
      set: async () => {},
    },
    status: {
      set(state, reason) {
        statuses.push({ state, reason })
      },
    },
    schedule(_ms, fn) {
      scheduled.add(fn)
      return () => scheduled.delete(fn)
    },
    notify() {},
    log: { info() {}, warn() {}, error() {} },
  }

  /** Calls a method like the host: input and output pass the contract schemas. */
  async function call<K extends MethodName<C>>(
    method: K,
    ...args: ArgsFor<MethodInput<C, K>>
  ): Promise<MethodResult<C, K>> {
    const spec = logbuchContract.methods[method]
    const handler = handlers.get(method)
    if (!handler) throw new Error(`no handler for ${method}`)
    const output = await handler(spec.input.parse(args[0]))
    return spec.output.parse(output) as MethodResult<C, K>
  }

  return {
    ctx,
    call,
    events,
    statuses,
    lastStatus: () => statuses.at(-1),
    /** Runs the jobs registered with `schedule`, as the host's timer would. */
    tick: async () => {
      for (const fn of scheduled) await fn()
    },
    scheduledCount: () => scheduled.size,
  }
}
