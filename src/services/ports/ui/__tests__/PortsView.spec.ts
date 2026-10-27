import type { VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

import { installBridge, mountApp, serviceInfos, settle } from '@renderer/__tests__/helpers'

import type { PortListener } from '../../contract'

function listener(overrides: Partial<PortListener> = {}): PortListener {
  return {
    protocol: 'tcp',
    port: 5173,
    addresses: ['::1'],
    scope: 'loopback',
    pid: 1686,
    process: 'node',
    path: '/usr/local/bin/node',
    user: 'patrick',
    docker: null,
    ...overrides,
  }
}

const listeners = [
  listener({
    port: 22,
    addresses: ['0.0.0.0', '::'],
    scope: 'all',
    pid: 1,
    process: 'launchd',
    path: '/sbin/launchd',
    user: 'root',
  }),
  listener(),
  listener({
    protocol: 'udp',
    port: 5353,
    addresses: ['0.0.0.0'],
    scope: 'all',
    pid: 1813,
    process: 'Spotify',
    path: null,
    user: null,
  }),
  listener({
    port: 8080,
    addresses: ['10.0.0.2'],
    scope: 'interface',
    pid: null,
    process: null,
    path: null,
    user: null,
  }),
  listener({
    port: 27017,
    addresses: ['0.0.0.0', '::'],
    scope: 'all',
    pid: 3047,
    process: 'com.docker.backend',
    path: '/Applications/Docker.app/Contents/MacOS/com.docker.backend',
    docker: { containers: [{ name: 'kompas-invoice-mongodb-1', port: 27017 }] },
  }),
]

function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === text)
  if (!found) throw new Error(`no button "${text}"`)
  return found
}

const rows = (wrapper: VueWrapper) =>
  wrapper.findAll('.port').map((row) => row.find('.port__number').text())

describe('PortsView', () => {
  it('lists every listener with port, protocol, program, pid, user, scope and path', async () => {
    installBridge({ handlers: { 'ports.list': () => listeners } })
    const { wrapper } = await mountApp('/ports')
    expect(wrapper.find('.page-head').text()).toContain('Belegte Ports')
    expect(wrapper.find('.page-head').text()).toContain('005')
    expect(rows(wrapper)).toEqual(['00022', '05173', '05353', '08080', '27017'])

    const ssh = wrapper.findAll('.port')[0]!
    expect(ssh.find('.port__protocol').text()).toBe('TCP')
    expect(ssh.find('.port-program__name').text()).toBe('launchd')
    expect(ssh.text()).toContain('PID 00001')
    expect(ssh.text()).toContain('root')
    expect(ssh.find('.port__scope').text()).toBe('Extern')
    expect(ssh.find('.port__detail').text()).toContain('0.0.0.0 · ::')
    expect(ssh.find('.port__path').text()).toBe('/sbin/launchd')

    const unknown = wrapper.findAll('.port')[3]!
    expect(unknown.find('.port-program__name').text()).toBe('Unbekannt')
    expect(unknown.text()).not.toContain('PID')
    expect(unknown.find('.port__scope').text()).toBe('Adresse')
  })

  it('filters by protocol and hides local-only ports, the filter lives in the query', async () => {
    installBridge({ handlers: { 'ports.list': () => listeners } })
    const { wrapper, router } = await mountApp('/ports')
    expect(button(wrapper, 'Alle').attributes('aria-pressed')).toBe('true')

    await button(wrapper, 'UDP').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ proto: 'udp' })
    expect(rows(wrapper)).toEqual(['05353'])

    await button(wrapper, 'TCP').trigger('click')
    await settle()
    await button(wrapper, 'Nur extern').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ proto: 'tcp', extern: '1' })
    expect(rows(wrapper)).toEqual(['00022', '08080', '27017'])
    expect(button(wrapper, 'Nur extern').attributes('aria-pressed')).toBe('true')

    await button(wrapper, 'Alle').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ extern: '1' })
    expect(rows(wrapper)).toEqual(['00022', '05353', '08080', '27017'])
  })

  it('makes the container the headline of a Docker port, the program moves below', async () => {
    installBridge({ handlers: { 'ports.list': () => listeners } })
    const { wrapper, router } = await mountApp('/ports')
    expect(wrapper.findAll('.port__marker')).toHaveLength(1)
    const docker = wrapper.findAll('.port')[4]!
    const head = docker.find('.port__head')
    expect(head.find('.port__marker').text()).toBe('Docker')
    expect(head.find('.port__container-name').text()).toBe('kompas-invoice-mongodb-1')
    expect(head.find('.port__container').text()).toContain('→ 27017')
    expect(head.text()).not.toContain('com.docker.backend')
    expect(docker.find('.port__program').text()).toContain('com.docker.backend')
    expect(docker.find('.port__program').text()).toContain('PID 03047')

    await button(wrapper, 'Nur Docker').trigger('click')
    await settle()
    expect(router.currentRoute.value.query).toEqual({ docker: '1' })
    expect(rows(wrapper)).toEqual(['27017'])
  })

  it('keeps the program as headline when the container is unknown', async () => {
    const backend = listener({
      port: 3000,
      process: 'com.docker.backend',
      docker: { containers: [] },
    })
    installBridge({ handlers: { 'ports.list': () => [backend] } })
    const { wrapper } = await mountApp('/ports')
    const head = wrapper.find('.port__head')
    expect(head.find('.port__marker').text()).toBe('Docker')
    expect(head.find('.port-program__name').text()).toBe('com.docker.backend')
    expect(wrapper.find('.port__program').exists()).toBe(false)
  })

  it('shows the empty state', async () => {
    installBridge({ handlers: { 'ports.list': () => [] } })
    const { wrapper } = await mountApp('/ports')
    expect(wrapper.text()).toContain('Keine belegten Ports')
    expect(wrapper.find('.port-list').exists()).toBe(false)
  })

  it('shows a failed scan with its technical message', async () => {
    installBridge({
      handlers: {
        'ports.list': () => {
          throw new Error('spawn netstat ENOENT')
        },
      },
    })
    const { wrapper } = await mountApp('/ports')
    expect(wrapper.find('[role="alert"]').text()).toContain('spawn netstat ENOENT')
  })

  it('polls while the page is open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    try {
      const list = vi.fn<() => PortListener[]>(() => listeners)
      installBridge({ handlers: { 'ports.list': list } })
      await mountApp('/ports')
      expect(list).toHaveBeenCalledTimes(1)
      vi.advanceTimersByTime(3000)
      await settle()
      expect(list).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows a yellow alert on an unsupported system', async () => {
    const services = serviceInfos().map((info) =>
      info.id === 'ports'
        ? {
            ...info,
            status: {
              ...info.status,
              state: 'unconfigured' as const,
              reason: { code: 'unsupported', detail: 'linux' },
            },
          }
        : info,
    )
    installBridge({ services, handlers: { 'ports.list': () => [] } })
    const { wrapper } = await mountApp('/ports')
    expect(wrapper.find('.lc-panel').classes()).toContain('lc-yellow-alert')
    expect(wrapper.text()).toContain('Betriebssystem nicht unterstützt')
    expect(wrapper.text()).toContain('linux')
  })
})
