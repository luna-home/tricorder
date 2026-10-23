import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { localeFromArgv, pickLocale } from '@shared/locale'
import type { ServiceInfo, ServiceState } from '@shared/service'

import de from '../../renderer/locales/de.json'
import { parseEnv } from '../app-env'

import { MAIN_MESSAGES } from '../i18n'
import { DEV_USER_DATA_NAME, resolveUserData, startedHidden } from '../paths'
import { serviceNames, serviceSources } from '../services'
import { buildTrayMenu, trayTooltip } from '../tray-menu'
import { isAppUrl, isExternalUrl } from '../urls'

const info = (id: string, state: ServiceState): ServiceInfo => ({
  id,
  nameKey: `services.${id}.name`,
  color: 'orange',
  kind: 'local',
  order: 1,
  status: { id, state, since: '2026-10-22T09:00:00.000Z' },
})

const keysOf = (value: object, prefix = ''): string[] =>
  Object.entries(value).flatMap(([key, child]) =>
    typeof child === 'object' && child ? keysOf(child, `${prefix}${key}.`) : [`${prefix}${key}`],
  )

describe('main i18n', () => {
  it('has the same keys in de and en', () => {
    expect(keysOf(MAIN_MESSAGES.de).sort()).toEqual(keysOf(MAIN_MESSAGES.en).sort())
  })

  it('picks English for an English system, the German default otherwise', () => {
    expect(pickLocale('de')).toBe('de')
    expect(pickLocale('de-AT')).toBe('de')
    expect(pickLocale('en-US')).toBe('en')
    expect(pickLocale('fr')).toBe('de')
  })

  it('hands the locale to the renderer on its command line', () => {
    expect(localeFromArgv(['electron', '--tricorder-locale=en'])).toBe('en')
    expect(localeFromArgv(['electron', '--tricorder-locale=fr'])).toBe('de')
    expect(localeFromArgv([])).toBe('de')
  })

  it('uses the same words as the renderer', () => {
    expect(MAIN_MESSAGES.de.state).toMatchObject(de.serviceState)
    expect(MAIN_MESSAGES.de.title).toBe(de.app.title)
  })
})

describe('tray menu', () => {
  const name = (id: string) => id.toUpperCase()

  it('has Open, one status line per service and Quit', () => {
    const items = buildTrayMenu(
      [info('logbuch', 'unconfigured'), info('mqtt', 'online')],
      name,
      MAIN_MESSAGES.de,
    )
    expect(items).toEqual([
      { kind: 'action', action: 'open', label: 'Öffnen' },
      { kind: 'separator' },
      { kind: 'status', label: 'LOGBUCH · Nicht eingerichtet' },
      { kind: 'status', label: 'MQTT · Online' },
      { kind: 'separator' },
      { kind: 'action', action: 'quit', label: 'Beenden' },
    ])
  })

  it('works in English and without services', () => {
    expect(
      buildTrayMenu([], name, MAIN_MESSAGES.en).map((item) => 'label' in item && item.label),
    ).toEqual(['Open', false, 'No services', false, 'Quit'])
  })

  it('names services that need attention in the tooltip', () => {
    expect(
      trayTooltip([info('logbuch', 'error'), info('mqtt', 'online')], name, MAIN_MESSAGES.en),
    ).toBe('Tricorder\nLOGBUCH · Error')
  })
})

describe('services', () => {
  it('finds main.ts of every registered service', () => {
    const sources = serviceSources()
    expect(sources.map((source) => source.manifest.id)).toContain('logbuch')
    expect(sources.every((source) => typeof source.load === 'function')).toBe(true)
  })

  it('reads display names from the service locales', () => {
    expect(serviceNames('de')('logbuch')).toBe('Logbuch')
    expect(serviceNames('en')('logbuch')).toBe('Logbook')
    expect(serviceNames('en')('unknown')).toBe('unknown')
  })
})

describe('env', () => {
  it('accepts unset, empty and absolute paths', () => {
    expect(parseEnv({})).toEqual({ ok: true, env: {} })
    expect(parseEnv({ LOGBUCH_DB: '  ', TRICORDER_USER_DATA: '' })).toEqual({ ok: true, env: {} })
    expect(parseEnv({ LOGBUCH_DB: ' /tmp/l.db ', TRICORDER_USER_DATA: '/tmp/ud' })).toEqual({
      ok: true,
      env: { LOGBUCH_DB: '/tmp/l.db', TRICORDER_USER_DATA: '/tmp/ud' },
    })
  })

  it('rejects relative paths with a readable message naming the variable', () => {
    const result = parseEnv({ LOGBUCH_DB: 'scratch.db', TRICORDER_USER_DATA: '~/ud' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain('LOGBUCH_DB')
    expect(result.message).toContain('TRICORDER_USER_DATA')
    expect(result.message).toContain('must be an absolute path')
  })
})

describe('paths', () => {
  const base = { env: {}, argv: [], isPackaged: true, appData: '/appdata' }

  it('prefers TRICORDER_USER_DATA, then --user-data-dir, then the dev folder', () => {
    expect(
      resolveUserData({
        ...base,
        env: { TRICORDER_USER_DATA: '/tmp/ud' },
        argv: ['--user-data-dir=/x'],
      }),
    ).toBe('/tmp/ud')
    expect(resolveUserData({ ...base, argv: ['electron', '--user-data-dir=/x'] })).toBe('/x')
    expect(resolveUserData({ ...base, isPackaged: false })).toBe(
      join('/appdata', DEV_USER_DATA_NAME),
    )
    expect(resolveUserData(base)).toBeUndefined()
  })

  it('starts hidden when opened at login', () => {
    expect(startedHidden([], true)).toBe(true)
    expect(startedHidden(['app.exe', '--hidden'], false)).toBe(true)
    expect(startedHidden(['app.exe'], false)).toBe(false)
  })
})

describe('urls', () => {
  it('accepts only the app itself', () => {
    const dev = 'http://localhost:5173/'
    expect(isAppUrl('http://localhost:5173/#/logbuch', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('https://example.com/', dev)).toBe(false)

    const built = 'file:///Applications/Tricorder.app/out/renderer/index.html'
    expect(isAppUrl(`${built}#/logbuch`, built)).toBe(true)
    expect(isAppUrl('file:///etc/passwd', built)).toBe(false)
    expect(isAppUrl('nonsense', built)).toBe(false)
  })

  it('opens only http(s) externally', () => {
    expect(isExternalUrl('https://luna.example')).toBe(true)
    expect(isExternalUrl('http://jupiter.local')).toBe(true)
    expect(isExternalUrl('file:///etc/passwd')).toBe(false)
    expect(isExternalUrl('javascript:alert(1)')).toBe(false)
  })
})
