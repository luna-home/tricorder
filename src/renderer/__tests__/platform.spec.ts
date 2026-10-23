import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineComponent, effectScope, reactive, ref } from 'vue'

import { ServiceCallError } from '@shared/ipc'
import type { ServiceInfo } from '@shared/service'
import type { LogbuchEntry } from '@services/logbuch/contract'

import {
  BridgeUnavailableError,
  createServiceClient,
  serviceQueryKey,
  toPlain,
} from '../platform/client'
import { useServicesStore } from '../platform/status'
import { useServiceEventSync } from '../platform/sync'
import { useService } from '../platform/useService'
import { Failure, installBridge, serviceInfos, settle, status, testPlugins } from './helpers'

describe('createServiceClient', () => {
  it('invokes svc methods and unwraps the envelope', async () => {
    const mock = installBridge({ handlers: { 'logbuch.projects': () => [] } })
    const client = createServiceClient('logbuch')
    await expect(client.projects()).resolves.toEqual([])
    expect(mock.invoke).toHaveBeenCalledWith('logbuch', 'projects', undefined)
  })

  it('types methods from the contract', () => {
    const client = createServiceClient('logbuch')
    expectTypeOf(client.openTopics).returns.resolves.toEqualTypeOf<LogbuchEntry[]>()
    expectTypeOf(client.dbInfo).parameters.toEqualTypeOf<[args?: void]>()
  })

  it('throws ServiceCallError with code and message', async () => {
    installBridge({
      handlers: { 'logbuch.done': () => new Failure('invalid-input', 'topic: required') },
    })
    const error = await createServiceClient('logbuch')
      .done({ project: 'p', topic: '' })
      .catch((cause: unknown) => cause)
    expect(error).toBeInstanceOf(ServiceCallError)
    expect(error).toMatchObject({ code: 'invalid-input', service: 'logbuch', method: 'done' })
  })

  it('throws BridgeUnavailableError without a preload', async () => {
    await expect(createServiceClient('logbuch').projects()).rejects.toBeInstanceOf(
      BridgeUnavailableError,
    )
  })

  it('sends plain data, never Vue proxies', async () => {
    const mock = installBridge({ handlers: { 'logbuch.history': () => [] } })
    const args = reactive({ project: 'p', topic: ref('t') })
    await createServiceClient('logbuch').history(args as never)
    const sent = mock.invoke.mock.calls[0]?.[2]
    expect(sent).toEqual({ project: 'p', topic: 't' })
    expect(sent).not.toBe(args)
    expect(toPlain([reactive({ a: 1 })])).toEqual([{ a: 1 }])
  })

  it('builds query keys per service and method', () => {
    expect(serviceQueryKey('logbuch')).toEqual(['svc', 'logbuch'])
    expect(serviceQueryKey('logbuch', 'projects')).toEqual(['svc', 'logbuch', 'projects'])
    expect(serviceQueryKey('logbuch', 'history', { project: 'p' })).toEqual([
      'svc',
      'logbuch',
      'history',
      { project: 'p' },
    ])
  })
})

describe('useService', () => {
  function mountWith(setup: () => Record<string, unknown>) {
    const { plugins, queryClient } = testPlugins()
    const wrapper = mount(defineComponent({ setup, template: '<div />' }), {
      global: { plugins: [...plugins] },
    })
    return { wrapper, queryClient }
  }

  it('unsubscribes events when the component unmounts', () => {
    const mock = installBridge()
    const listener = vi.fn<() => void>()
    const { wrapper } = mountWith(() => {
      useService('logbuch').on('changed', listener)
      return {}
    })
    mock.emit('logbuch', 'changed')
    expect(listener).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    expect(mock.listenerCount('logbuch', 'changed')).toBe(0)
  })

  it('queries under a reactive key and refetches when the args change', async () => {
    const mock = installBridge({
      handlers: { 'logbuch.openTopics': (args) => [{ args }] as unknown[] },
    })
    const project = ref<string | undefined>('a')
    let query: ReturnType<ReturnType<typeof useService<'logbuch'>>['query']> | undefined
    mountWith(() => {
      query = useService('logbuch').query('openTopics', () => ({ project: project.value }))
      return {}
    })
    await settle()
    expect(query?.data.value).toEqual([{ args: { project: 'a' } }])
    project.value = 'b'
    await settle()
    expect(query?.data.value).toEqual([{ args: { project: 'b' } }])
    expect(mock.invoke).toHaveBeenCalledTimes(2)
  })

  it('does not run a disabled query', async () => {
    const mock = installBridge({ handlers: { 'logbuch.topics': () => [] } })
    mountWith(() => {
      useService('logbuch').query('topics', { project: 'p' }, { enabled: false })
      return {}
    })
    await settle()
    expect(mock.invoke).not.toHaveBeenCalled()
  })

  it('refetches after a service event and after a mutation', async () => {
    let calls = 0
    const mock = installBridge({
      handlers: {
        'logbuch.projects': () => [{ project: 'p', openTopics: ++calls, lastTs: 'x' }],
        'logbuch.done': () => ({ project: 'p', topic: 't', entry: {} }),
      },
    })
    let api: ReturnType<typeof useService<'logbuch'>> | undefined
    mountWith(() => {
      useServiceEventSync()
      api = useService('logbuch')
      api.query('projects')
      return {}
    })
    await settle()
    expect(calls).toBe(1)

    mock.emit('logbuch', 'changed')
    await settle()
    expect(calls).toBe(2)

    await api?.api.done({ project: 'p', topic: 't' })
    await api?.invalidate()
    await settle()
    expect(calls).toBe(3)
  })
})

describe('services store', () => {
  it('loads the services and applies status pushes', async () => {
    const mock = installBridge()
    setActivePinia(createPinia())
    const store = useServicesStore()
    await store.connect()
    expect(store.connection).toBe('connected')
    expect(store.statusOf('logbuch')?.state).toBe('online')

    mock.pushStatus(status('logbuch', 'unconfigured', { code: 'dbMissing' }))
    expect(store.statusOf('logbuch')).toMatchObject({
      state: 'unconfigured',
      reason: { code: 'dbMissing' },
    })
    store.disconnect()
  })

  it('keeps a push that overtook the list response', async () => {
    const stale = serviceInfos('starting')
    for (const info of stale) info.status.since = '2026-01-01T00:00:00.000Z'
    const mock = installBridge({ services: stale })
    setActivePinia(createPinia())
    const store = useServicesStore()
    const loading = store.connect()
    mock.pushStatus(status('logbuch', 'online'))
    await loading
    expect(store.statusOf('logbuch')?.state).toBe('online')
    store.disconnect()
  })

  it('is unreachable without a bridge', async () => {
    setActivePinia(createPinia())
    const store = useServicesStore()
    await store.connect()
    expect(store.connection).toBe('unreachable')
  })

  it('retries while the host has no handler yet', async () => {
    vi.useFakeTimers()
    try {
      const list = vi
        .fn<() => Promise<ServiceInfo[]>>()
        .mockRejectedValueOnce(new Error("No handler registered for 'host:services:list'"))
        .mockResolvedValueOnce(serviceInfos())
      const mock = installBridge()
      mock.bridge.services.list = list
      setActivePinia(createPinia())
      const store = useServicesStore()
      await store.connect()
      expect(store.connection).toBe('unreachable')
      expect(store.failure).toMatchObject({ code: 'hostUnreachable', detail: /No handler/ })
      await vi.advanceTimersByTimeAsync(2000)
      expect(list).toHaveBeenCalledTimes(2)
      expect(store.connection).toBe('connected')
      store.disconnect()
    } finally {
      vi.useRealTimers()
    }
  })

  it('removes its status listener on disconnect', async () => {
    const mock = installBridge()
    const scope = effectScope()
    setActivePinia(createPinia())
    const store = scope.run(() => useServicesStore())!
    await store.connect()
    store.disconnect()
    mock.pushStatus(status('logbuch', 'error'))
    expect(store.statusOf('logbuch')?.state).toBe('online')
    scope.stop()
  })
})
