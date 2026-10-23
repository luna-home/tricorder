import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import { installBridge, mountApp, serviceInfos, settle, status } from './helpers'

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

const railLabels = (wrapper: VueWrapper) => wrapper.findAll('.lc-nav').map((nav) => nav.text())

describe('App frame', () => {
  it('shows title, clock, status and a rail built from the registry', async () => {
    installBridge()
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('.lc-panel__title').text()).toBe('Tricorder')
    expect(wrapper.find('.lc-panel__clock').text()).toMatch(/^\d{2}:\d{2}$/)
    expect(wrapper.find('.lc-panel__date').text()).toMatch(/^\S+ \d{2}\.\d{2}\.\d{4}$/)
    expect(wrapper.find('.lc-status').attributes('data-state')).toBe('online')
    expect(wrapper.find('.lc-status').text()).toBe('Online')
    expect(railLabels(wrapper)).toEqual(['Start', 'Logbuch'])
    expect(wrapper.find('.lc-nav[aria-current="page"]').text()).toBe('Start')
    expect(wrapper.find('.lc-panel').classes()).not.toContain('lc-red-alert')
  })

  it('home shows one command tile per service with its status', async () => {
    installBridge({ services: serviceInfos('unconfigured') })
    const { wrapper } = await mountApp('/')
    const tile = wrapper.find('.lc-tile')
    expect(tile.find('.lc-tile__code').text()).toBe('01-LOG')
    expect(tile.text()).toContain('Logbuch')
    const readout = wrapper.find('.lc-readout__value[data-state="alert"]')
    expect(readout.text()).toBe('Nicht eingerichtet')
  })

  it('opens a service from its tile and shows its sub-pages in the rail', async () => {
    installBridge({ handlers: { 'logbuch.projects': () => [], 'logbuch.openTopics': () => [] } })
    const { wrapper, router } = await mountApp('/')
    await wrapper.find('.lc-tile').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch')
    expect(railLabels(wrapper)).toEqual(['Start', 'Logbuch', 'Neu'])
    expect(wrapper.find('.lc-nav[aria-current="page"]').text()).toBe('Logbuch')

    await button(wrapper, 'Neu').trigger('click')
    await settle()
    expect(router.currentRoute.value.name).toBe('logbuch.new')
    expect(wrapper.find('.lc-nav[aria-current="page"]').text()).toBe('Neu')
  })

  it('goes to red alert without a bridge and names cause and fix', async () => {
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-red-alert')
    expect(wrapper.find('.lc-notice--red .lc-notice__title').text()).toBe(
      'Keine Verbindung zum Host',
    )
    const details = wrapper.findAll('.lc-notice__detail').map((detail) => detail.text())
    expect(details).toEqual([
      'Die Brücke zum Main-Prozess fehlt (Preload nicht geladen)',
      'App neu starten, Log unter userData/logs prüfen',
    ])
    expect(wrapper.find('.frame-alert__verbatim').exists()).toBe(false)
    expect(wrapper.find('.lc-status').attributes('data-state')).toBe('offline')
    expect(
      wrapper.findAll('.lc-nav').every((nav) => nav.attributes('disabled') !== undefined),
    ).toBe(true)
  })

  it('goes to red alert when the host does not answer, and retries', async () => {
    const mock = installBridge({
      services: new Error("No handler registered for 'host:services:list'"),
    })
    const { wrapper } = await mountApp('/')
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-red-alert')
    expect(wrapper.text()).toContain('Der Main-Prozess antwortet nicht')
    expect(wrapper.find('.frame-alert__verbatim').text()).toBe(
      "No handler registered for 'host:services:list'",
    )

    mock.bridge.services.list = async () => serviceInfos()
    await button(wrapper, 'Erneut prüfen').trigger('click')
    await settle()
    expect(wrapper.find('.lc-panel').classes()).not.toContain('lc-red-alert')
  })

  it('goes to red alert when the open service fails, with its reason', async () => {
    installBridge({
      services: serviceInfos('error', { code: 'setupFailed', detail: 'setup() threw: disk full' }),
    })
    const { wrapper, router } = await mountApp('/logbuch')
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-red-alert')
    expect(wrapper.find('.lc-notice__title').text()).toBe('Logbuch gestört')
    const details = wrapper.findAll('.lc-notice__detail').map((item) => item.text())
    expect(details).toEqual([
      'Der Dienst ließ sich nicht starten',
      'Log unter userData/logs prüfen, App neu starten',
    ])
    // The technical detail keeps its case and is not part of the translated lines.
    const verbatim = wrapper.find('.frame-alert__verbatim')
    expect(verbatim.text()).toBe('setup() threw: disk full')
    expect(verbatim.classes()).toContain('lc-verbatim')

    const home = wrapper.findAll('.frame-alert button').find((item) => item.text() === 'Start')
    await home!.trigger('click')
    await settle()
    expect(router.currentRoute.value.path).toBe('/')
    expect(wrapper.find('.lc-panel').classes()).not.toContain('lc-red-alert')
  })

  it('translates a reason from the service messages, the path stays verbatim', async () => {
    installBridge({
      services: serviceInfos('error', {
        code: 'dbOpenFailed',
        detail: '/Users/Ada/.logbuch/logbuch.db: database disk image is malformed',
      }),
    })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.findAll('.lc-notice__detail')[0]?.text()).toBe(
      'Logbuch-Datenbank lässt sich nicht öffnen',
    )
    expect(wrapper.find('.frame-alert__verbatim').text()).toBe(
      '/Users/Ada/.logbuch/logbuch.db: database disk image is malformed',
    )
  })

  it('falls back to a generic text for an unknown reason code', async () => {
    installBridge({ services: serviceInfos('error', { code: 'somethingNew' }) })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.findAll('.lc-notice__detail')[0]?.text()).toBe('Ursache unbekannt')
  })

  it('switches to yellow alert live when the service becomes unconfigured', async () => {
    const mock = installBridge({
      handlers: {
        'logbuch.projects': () => [],
        'logbuch.openTopics': () => [],
        'logbuch.dbInfo': () => ({
          path: '/Users/x/.logbuch/logbuch.db',
          pathSource: 'default',
          exists: false,
          entries: 0,
        }),
      },
    })
    const { wrapper } = await mountApp('/logbuch')
    expect(wrapper.find('.lc-panel').classes()).not.toContain('lc-yellow-alert')

    mock.pushStatus(status('logbuch', 'unconfigured', { code: 'dbMissing', detail: '/x.db' }))
    await settle()
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-yellow-alert')
    expect(wrapper.find('.lc-status').attributes('data-state')).toBe('offline')
    expect(wrapper.find('.lc-status').text()).toBe('Alarm')
    expect(wrapper.find('.lc-notice--yellow .lc-notice__title').text()).toBe(
      'Logbuch nicht gefunden',
    )
    expect(wrapper.text()).toContain('Pfad in Einstellungen setzen')
    expect(wrapper.text()).toContain('/Users/x/.logbuch/logbuch.db')
  })

  it('marks the frame as a macOS drag region on darwin only', async () => {
    installBridge({ platform: 'darwin' })
    const mac = await mountApp('/')
    expect(mac.wrapper.find('.app-shell').attributes('data-platform')).toBe('darwin')
    expect(mac.wrapper.find('.app-shell__drag').exists()).toBe(true)
    mac.wrapper.unmount()

    installBridge({ platform: 'win32' })
    const win = await mountApp('/')
    expect(win.wrapper.find('.app-shell__drag').exists()).toBe(false)
  })

  it('renders in English', async () => {
    installBridge()
    const { wrapper } = await mountApp('/', 'en')
    expect(railLabels(wrapper)).toEqual(['Home', 'Logbook'])
  })
})
