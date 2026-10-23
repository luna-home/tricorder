import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

import type { TricorderBridge } from '@shared/api'
// Only zod-free modules here: the sandboxed preload cannot load packages from node_modules.
import {
  HOST_CHANNELS,
  serviceEventChannel,
  serviceMethodChannel,
  type IpcResult,
} from '@shared/ipc'
import { localeFromArgv } from '@shared/locale'
import type { ServiceStatus } from '@shared/service'

function subscribe<T>(channel: string, listener: (data: T) => void): () => void {
  const wrapped = (_event: IpcRendererEvent, data: T) => listener(data)
  ipcRenderer.on(channel, wrapped)
  return () => ipcRenderer.removeListener(channel, wrapped)
}

/**
 * `invoke` that keeps the envelope promise: a rejection (no handler for an unknown service or
 * method, main process gone) becomes a failed {@link IpcResult} instead of an exception.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<IpcResult<T>> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const message = raw.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
    const unknown = message.startsWith('No handler registered')
    return { ok: false, error: { code: unknown ? 'unknown-method' : 'failed', message } }
  }
}

const api: TricorderBridge = {
  platform: process.platform,
  locale: localeFromArgv(process.argv),
  invoke: (service, method, args) => call(serviceMethodChannel(service, method), args),
  on: (service, event, listener) => subscribe(serviceEventChannel(service, event), listener),
  services: {
    list: () => ipcRenderer.invoke(HOST_CHANNELS.servicesList),
    onStatus: (listener) => subscribe<ServiceStatus>(HOST_CHANNELS.serviceStatus, listener),
  },
  settings: {
    get: (service) => call(HOST_CHANNELS.settingsGet, service),
    set: (service, patch) => call(HOST_CHANNELS.settingsSet, service, patch),
    app: {
      get: () => call(HOST_CHANNELS.appSettingsGet),
      set: (patch) => call(HOST_CHANNELS.appSettingsSet, patch),
    },
  },
}

contextBridge.exposeInMainWorld('tricorder', api)
