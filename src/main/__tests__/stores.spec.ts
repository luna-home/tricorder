import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { HOST_CHANNELS } from '@shared/ipc'

import { applyLoginItem, setupAppSettings, type LoginItems } from '../app-settings'
import { createLoggerFactory } from '../logger'
import { SecretStore, type Encryption } from '../secret-store'
import { SettingsStore, SettingsValidationError, ValidatedSection } from '../settings-store'
import { FakeIpc, silentLogger, tempDir } from './helpers'

let tmp: ReturnType<typeof tempDir>
beforeEach(() => {
  tmp = tempDir()
})
afterEach(() => tmp.cleanup())

const settingsPath = () => join(tmp.dir, 'settings.json')

describe('SettingsStore', () => {
  it('starts empty without a file and does not create one until a change', () => {
    const store = new SettingsStore(settingsPath(), silentLogger())
    expect(store.service('logbuch')).toEqual({})
    expect(store.app()).toEqual({})
    expect(readdirSync(tmp.dir)).toEqual([])
  })

  it('persists sections atomically, without leftover temp files', async () => {
    const store = new SettingsStore(settingsPath(), silentLogger())
    await Promise.all([
      store.setService('logbuch', { dbPath: '/tmp/a.db' }),
      store.setService('mqtt', { host: 'jupiter' }),
      store.setApp({ autostart: true }),
    ])
    expect(readdirSync(tmp.dir)).toEqual(['settings.json'])
    const reread = new SettingsStore(settingsPath(), silentLogger())
    expect(reread.service('logbuch')).toEqual({ dbPath: '/tmp/a.db' })
    expect(reread.service('mqtt')).toEqual({ host: 'jupiter' })
    expect(reread.app()).toEqual({ autostart: true })
    expect(JSON.parse(readFileSync(settingsPath(), 'utf8')).version).toBe(1)
  })

  it('moves a corrupt file aside and starts empty', () => {
    writeFileSync(settingsPath(), '{ nicht json')
    const log = silentLogger()
    const store = new SettingsStore(settingsPath(), log)
    expect(store.service('logbuch')).toEqual({})
    expect(log.warn).toHaveBeenCalled()
    expect(readdirSync(tmp.dir)).toEqual([expect.stringMatching(/^settings\.json\.corrupt-/)])
  })

  it('treats a file with a wrong shape as corrupt', () => {
    writeFileSync(settingsPath(), JSON.stringify({ services: { logbuch: 'kaputt' } }))
    const store = new SettingsStore(settingsPath(), silentLogger())
    expect(store.service('logbuch')).toEqual({})
  })
})

describe('ValidatedSection', () => {
  const schema = z.object({ a: z.number().default(0), b: z.number().default(0) })

  function section(store: SettingsStore, id = 'x') {
    return new ValidatedSection(
      schema,
      store.service(id),
      (value) => store.setService(id, value),
      silentLogger(),
    )
  }

  const fileSection = (id = 'x') =>
    JSON.parse(readFileSync(settingsPath(), 'utf8')).services[id] as unknown

  it('rejects keys the schema does not know and stores nothing', async () => {
    const store = new SettingsStore(settingsPath(), silentLogger())
    const settings = section(store)
    await expect(settings.set({ junk: 'x'.repeat(1000), a: 1 })).rejects.toThrow(
      SettingsValidationError,
    )
    await store.flush()
    expect(readdirSync(tmp.dir)).toEqual([])
    expect(settings.get()).toEqual({ a: 0, b: 0 })
  })

  it('drops unknown keys of an older file on the next save', async () => {
    writeFileSync(
      settingsPath(),
      JSON.stringify({ version: 1, services: { x: { a: 1, legacy: 'alt' } } }),
    )
    const store = new SettingsStore(settingsPath(), silentLogger())
    await section(store).set({ b: 2 })
    await store.flush()
    expect(fileSection()).toEqual({ a: 1, b: 2 })
  })

  it('keeps both of two concurrent patches, in memory, on disk and for listeners', async () => {
    const store = new SettingsStore(settingsPath(), silentLogger())
    const settings = section(store)
    const seen: unknown[] = []
    settings.onChange((next, previous) => seen.push({ next, previous }))
    await Promise.all([settings.set({ a: 1 }), settings.set({ b: 2 })])
    await store.flush()
    expect(settings.get()).toEqual({ a: 1, b: 2 })
    expect(fileSection()).toEqual({ a: 1, b: 2 })
    expect(seen).toEqual([
      { next: { a: 1, b: 0 }, previous: { a: 0, b: 0 } },
      { next: { a: 1, b: 2 }, previous: { a: 1, b: 0 } },
    ])
  })

  it('rolls back a section whose write failed', async () => {
    // A file where the settings directory should be: every write fails.
    const blocked = join(tmp.dir, 'blocked')
    writeFileSync(blocked, '')
    const store = new SettingsStore(join(blocked, 'settings.json'), silentLogger())
    const settings = section(store)
    await expect(settings.set({ a: 1 })).rejects.toThrow(/EEXIST|ENOTDIR/)
    expect(store.service('x')).toEqual({})
    expect(settings.get()).toEqual({ a: 0, b: 0 })
  })
})

describe('app settings', () => {
  it('defaults autostart to off, validates, persists and applies changes', async () => {
    const ipc = new FakeIpc()
    const store = new SettingsStore(settingsPath(), silentLogger())
    const applyAutostart = vi.fn<(enabled: boolean) => void>()
    const app = setupAppSettings({ ipc, store, log: silentLogger(), applyAutostart })

    expect(applyAutostart).toHaveBeenCalledWith(false)
    expect(await ipc.invoke(HOST_CHANNELS.appSettingsGet)).toEqual({
      ok: true,
      data: { autostart: false },
    })
    expect(await ipc.invoke(HOST_CHANNELS.appSettingsSet, { autostart: 'ja' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(await ipc.invoke(HOST_CHANNELS.appSettingsSet, { anything: {} })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    })
    expect(await ipc.invoke(HOST_CHANNELS.appSettingsSet, { autostart: true })).toEqual({
      ok: true,
      data: { autostart: true },
    })
    expect(applyAutostart).toHaveBeenLastCalledWith(true)
    await ipc.invoke(HOST_CHANNELS.appSettingsSet, { autostart: true })
    expect(applyAutostart).toHaveBeenCalledTimes(2)

    await store.flush()
    expect(new SettingsStore(settingsPath(), silentLogger()).app()).toEqual({ autostart: true })

    app.dispose()
    expect(ipc.handlers.size).toBe(0)
  })

  it('survives a failing OS call', async () => {
    const ipc = new FakeIpc()
    const log = silentLogger()
    setupAppSettings({
      ipc,
      store: new SettingsStore(settingsPath(), silentLogger()),
      log,
      applyAutostart: () => {
        throw new Error('denied')
      },
    })
    expect(await ipc.invoke(HOST_CHANNELS.appSettingsSet, { autostart: true })).toMatchObject({
      ok: true,
    })
    expect(log.error).toHaveBeenCalledWith('applying autostart failed', expect.any(Error))
  })
})

describe('applyLoginItem', () => {
  function loginItems(initial: boolean, takes = true) {
    let openAtLogin = initial
    const set = vi.fn<LoginItems['set']>((enabled) => {
      if (takes) openAtLogin = enabled
    })
    return { get: () => ({ openAtLogin, status: 'requires-approval' }), set }
  }

  it('does not touch a login item that already matches', () => {
    const items = loginItems(false)
    applyLoginItem(items, false)
    expect(items.set).not.toHaveBeenCalled()
  })

  it('sets a login item that differs', () => {
    const items = loginItems(false)
    applyLoginItem(items, true)
    expect(items.set).toHaveBeenCalledWith(true)
  })

  it('throws when the OS did not take the change', () => {
    expect(() => applyLoginItem(loginItems(false, false), true)).toThrow(
      'login item is still off (status requires-approval)',
    )
  })
})

describe('SecretStore', () => {
  // Reversible stand-in for safeStorage.
  const encryption = (available = true): Encryption => ({
    isEncryptionAvailable: () => available,
    encryptString: (plain) => Buffer.from([...Buffer.from(plain)].reverse()),
    decryptString: (buffer) => Buffer.from([...buffer].reverse()).toString(),
  })
  const secretsPath = () => join(tmp.dir, 'secrets.json')

  it('stores encrypted values per service, separate from settings', async () => {
    const store = new SecretStore(secretsPath(), encryption(), silentLogger())
    const mqtt = store.forService('mqtt')
    await mqtt.set('password', 'geheim')
    expect(await mqtt.get('password')).toBe('geheim')
    expect(await store.forService('other').get('password')).toBeUndefined()

    const raw = readFileSync(secretsPath(), 'utf8')
    expect(raw).not.toContain('geheim')

    const reread = new SecretStore(secretsPath(), encryption(), silentLogger())
    expect(await reread.forService('mqtt').get('password')).toBe('geheim')
    await reread.forService('mqtt').set('password', undefined)
    expect(await reread.forService('mqtt').get('password')).toBeUndefined()
  })

  it('rejects set without OS encryption', async () => {
    const secrets = new SecretStore(secretsPath(), encryption(false), silentLogger()).forService(
      'x',
    )
    expect(secrets.available()).toBe(false)
    await expect(secrets.set('k', 'v')).rejects.toThrow(/not available/)
  })
})

describe('logger', () => {
  it('appends lines with time, level and name to <dir>/<name>.log', () => {
    const dir = join(tmp.dir, 'logs')
    const log = createLoggerFactory({ dir })('logbuch')
    log.info('started')
    log.error('failed', new Error('kaputt'), { a: 1 })
    const text = readFileSync(join(dir, 'logbuch.log'), 'utf8')
    expect(text).toMatch(/^\d{4}-\d{2}-\d{2}T\S+ INFO  \[logbuch\] started$/m)
    expect(text).toMatch(/ERROR \[logbuch\] failed Error: kaputt/)
    expect(text).toContain('{ a: 1 }')
  })

  it('rotates above the size limit', () => {
    const dir = join(tmp.dir, 'logs')
    const log = createLoggerFactory({ dir, maxBytes: 10 })('x')
    log.info('first line, long enough')
    log.info('second')
    expect(readdirSync(dir).sort()).toEqual(['x.log', 'x.log.1'])
  })
})
