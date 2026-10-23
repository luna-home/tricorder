import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { vi } from 'vitest'

import type { ServiceLogger, ServiceSecrets } from '@shared/define-service'

import type { HostDeps, IpcRegistrar } from '../service-host'
import { SettingsStore } from '../settings-store'

/** In-memory `ipcMain`: `invoke` calls the registered handler like a renderer would. */
export class FakeIpc implements IpcRegistrar {
  readonly handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()

  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void {
    if (this.handlers.has(channel)) throw new Error(`second handler for ${channel}`)
    this.handlers.set(channel, listener)
  }

  removeHandler(channel: string): void {
    this.handlers.delete(channel)
  }

  async invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler registered for '${channel}'`)
    return handler({ senderFrame: { url: 'app://test' } }, ...args)
  }
}

export const silentLogger = (): ServiceLogger => ({
  info: vi.fn<ServiceLogger['info']>(),
  warn: vi.fn<ServiceLogger['warn']>(),
  error: vi.fn<ServiceLogger['error']>(),
})

export function tempDir(): { dir: string; cleanup(): void } {
  const dir = mkdtempSync(join(tmpdir(), 'tricorder-main-'))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

const noSecrets: ServiceSecrets = {
  available: () => false,
  get: async () => undefined,
  set: async () => {
    throw new Error('no secrets in tests')
  },
}

export function fakeDeps(dir: string) {
  const ipc = new FakeIpc()
  const broadcast = vi.fn<HostDeps['broadcast']>()
  const notify = vi.fn<HostDeps['notify']>()
  const loggers = new Map<string, ServiceLogger>()
  const logger = (name: string) => {
    const existing = loggers.get(name)
    if (existing) return existing
    const created = silentLogger()
    loggers.set(name, created)
    return created
  }
  const settings = new SettingsStore(join(dir, 'settings.json'), logger('settings'))
  const deps: HostDeps = {
    ipc,
    broadcast,
    settings,
    secrets: () => noSecrets,
    notify,
    logger,
  }
  return { deps, ipc, broadcast, notify, settings, logger }
}
