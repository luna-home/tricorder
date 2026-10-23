import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { TricorderBridge } from '@shared/api'
import { HOST_CHANNELS } from '@shared/ipc'

const electron = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  on: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
  removeListener: vi.fn<(channel: string, listener: (...args: unknown[]) => void) => void>(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: unknown) => electron.exposed.set(key, value),
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: electron.removeListener,
  },
}))

await import('./index')
const bridge = electron.exposed.get('tricorder') as TricorderBridge

describe('preload', () => {
  beforeEach(() => {
    electron.invoke.mockReset()
    electron.on.mockReset()
    electron.removeListener.mockReset()
  })

  it('exposes exactly window.tricorder with the shared API', () => {
    expect([...electron.exposed.keys()]).toEqual(['tricorder'])
    expect(Object.keys(bridge).sort()).toEqual([
      'invoke',
      'locale',
      'on',
      'platform',
      'services',
      'settings',
    ])
    expect(Object.keys(bridge.services).sort()).toEqual(['list', 'onStatus'])
    expect(Object.keys(bridge.settings).sort()).toEqual(['app', 'get', 'set'])
    expect(bridge.platform).toBe(process.platform)
    // No --tricorder-locale= under Vitest: the project default.
    expect(bridge.locale).toBe('de')
  })

  it('maps calls to the shared channels', async () => {
    electron.invoke.mockResolvedValue({ ok: true, data: 1 })
    await bridge.invoke('logbuch', 'projects', undefined)
    await bridge.settings.get('logbuch')
    await bridge.settings.set('logbuch', { dbPath: null })
    await bridge.settings.app.get()
    await bridge.settings.app.set({ autostart: true })
    await bridge.services.list()
    expect(electron.invoke.mock.calls).toEqual([
      ['svc:logbuch:projects', undefined],
      [HOST_CHANNELS.settingsGet, 'logbuch'],
      [HOST_CHANNELS.settingsSet, 'logbuch', { dbPath: null }],
      [HOST_CHANNELS.appSettingsGet],
      [HOST_CHANNELS.appSettingsSet, { autostart: true }],
      [HOST_CHANNELS.servicesList],
    ])
  })

  it('turns a rejected invoke into a failed envelope', async () => {
    electron.invoke.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'svc:x:y': Error: No handler registered for 'svc:x:y'",
      ),
    )
    expect(await bridge.invoke('x', 'y')).toEqual({
      ok: false,
      error: { code: 'unknown-method', message: "No handler registered for 'svc:x:y'" },
    })
    electron.invoke.mockRejectedValueOnce(new Error('gone'))
    expect(await bridge.settings.get('x')).toEqual({
      ok: false,
      error: { code: 'failed', message: 'gone' },
    })
  })

  it('subscribes to events and unsubscribes', () => {
    const listener = vi.fn<(data: unknown) => void>()
    const off = bridge.on('logbuch', 'changed', listener)
    expect(electron.on).toHaveBeenCalledWith('svc:logbuch:event:changed', expect.any(Function))
    const wrapped = electron.on.mock.calls[0]?.[1] as (event: unknown, data: unknown) => void
    wrapped({ sender: 'hidden' }, 42)
    expect(listener).toHaveBeenCalledWith(42)
    off()
    expect(electron.removeListener).toHaveBeenCalledWith('svc:logbuch:event:changed', wrapped)

    bridge.services.onStatus(listener)
    expect(electron.on).toHaveBeenLastCalledWith(HOST_CHANNELS.serviceStatus, expect.any(Function))
  })
})
