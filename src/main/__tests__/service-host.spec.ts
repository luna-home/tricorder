import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { defineContract } from '@shared/contract'
import { defineService, type ServiceContext } from '@shared/define-service'
import { HOST_CHANNELS, serviceEventChannel, serviceMethodChannel } from '@shared/ipc'
import { defineManifest } from '@shared/registry'
import type { ServiceInfo, ServiceStatus } from '@shared/service'

import { ServiceHost, type ServiceSource } from '../service-host'
import { SettingsStore } from '../settings-store'
import { fakeDeps, silentLogger, tempDir } from './helpers'

const contract = defineContract({
  methods: {
    greet: {
      input: z.object({ name: z.string().trim().min(1) }),
      output: z.object({ text: z.string() }),
    },
    count: { input: z.void(), output: z.number().int() },
    boom: { input: z.void(), output: z.string() },
    unhandled: { input: z.void(), output: z.string() },
  },
  events: { changed: z.void(), tick: z.object({ n: z.number() }) },
  settings: z.object({
    greeting: z.string().min(1).default('HALLO'),
    interval: z.number().int().min(1).default(60),
  }),
})
type Ctx = ServiceContext<typeof contract>

const manifest = (id: string, order = 1) =>
  defineManifest({ id, nameKey: `services.${id}.name`, color: 'orange', kind: 'local', order })

function source(id: string, setup: (ctx: Ctx) => unknown, order = 1): ServiceSource {
  const definition = defineService({
    manifest: manifest(id, order),
    contract,
    setup: setup as (ctx: Ctx) => void,
  })
  return { manifest: definition.manifest, contract, load: async () => definition }
}

/** A service that implements its methods properly. */
const working = (id = 'alpha', extra?: (ctx: Ctx) => void) =>
  source(id, (ctx) => {
    let calls = 0
    ctx.handle('greet', ({ name }) => ({ text: `${ctx.settings.get().greeting} ${name}` }))
    ctx.handle('count', () => ++calls)
    ctx.handle('boom', () => {
      throw new Error('kaputt')
    })
    extra?.(ctx)
  })

describe('ServiceHost', () => {
  let tmp: ReturnType<typeof tempDir>
  let env: ReturnType<typeof fakeDeps>
  let host: ServiceHost

  beforeEach(() => {
    tmp = tempDir()
    env = fakeDeps(tmp.dir)
    host = new ServiceHost(env.deps)
  })

  afterEach(async () => {
    await host.stop()
    tmp.cleanup()
  })

  const call = (id: string, method: string, args?: unknown) =>
    env.ipc.invoke(serviceMethodChannel(id, method), args)

  describe('method calls', () => {
    it('validates and transforms input, validates output', async () => {
      await host.start([working()])
      expect(await call('alpha', 'greet', { name: '  Ada ' })).toEqual({
        ok: true,
        data: { text: 'HALLO Ada' },
      })
      expect(await call('alpha', 'count')).toEqual({ ok: true, data: 1 })
    })

    it('rejects invalid input before the handler runs', async () => {
      const greet = vi.fn<() => { text: string }>(() => ({ text: 'x' }))
      await host.start([source('alpha', (ctx) => ctx.handle('greet', greet))])

      for (const args of [undefined, {}, { name: '   ' }, { name: 42 }]) {
        const result = await call('alpha', 'greet', args)
        expect(result).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      }
      const result = (await call('alpha', 'greet', { name: 42 })) as {
        error: { message: string }
      }
      expect(result.error.message).toMatch(/name/)
      expect(greet).not.toHaveBeenCalled()
    })

    it('rejects invalid output', async () => {
      await host.start([
        source('alpha', (ctx) => {
          ctx.handle('greet', () => ({ text: 42 }) as unknown as { text: string })
        }),
      ])
      expect(await call('alpha', 'greet', { name: 'Ada' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-output' },
      })
    })

    it('turns a throwing handler into "failed" and keeps the service running', async () => {
      await host.start([working()])
      expect(await call('alpha', 'boom')).toEqual({
        ok: false,
        error: { code: 'failed', message: 'kaputt' },
      })
      expect(env.logger('alpha').error).toHaveBeenCalledWith('boom failed', expect.any(Error))
      expect(await call('alpha', 'count')).toEqual({ ok: true, data: 1 })
      expect(host.list()[0]?.status.state).toBe('online')
    })

    it('handles a rejecting async handler', async () => {
      await host.start([
        source('alpha', (ctx) => {
          ctx.handle('greet', async () => Promise.reject(new Error('later')))
        }),
      ])
      expect(await call('alpha', 'greet', { name: 'x' })).toMatchObject({
        ok: false,
        error: { code: 'failed', message: 'later' },
      })
    })

    it('reports a contract method without handler as unknown-method', async () => {
      await host.start([working()])
      expect(await call('alpha', 'unhandled')).toMatchObject({
        ok: false,
        error: { code: 'unknown-method' },
      })
    })

    it('waits for an async setup before dispatching', async () => {
      let release!: () => void
      const gate = new Promise<void>((resolve) => (release = resolve))
      const starting = host.start([
        source('alpha', async (ctx) => {
          await gate
          ctx.handle('count', () => 7)
        }),
      ])
      const pending = call('alpha', 'count')
      expect(host.list()[0]?.status.state).toBe('starting')
      release()
      await starting
      expect(await pending).toEqual({ ok: true, data: 7 })
    })
  })

  describe('failure isolation', () => {
    it('gives a service whose setup throws status error, the others keep running', async () => {
      await host.start([
        source('broken', () => {
          throw new Error('DB fehlt')
        }),
        working('alpha'),
      ])
      const byId = Object.fromEntries(host.list().map((info) => [info.id, info.status]))
      expect(byId.broken).toMatchObject({
        state: 'error',
        reason: { code: 'setupFailed', detail: 'DB fehlt' },
      })
      expect(byId.alpha).toMatchObject({ state: 'online' })
      expect(await call('broken', 'count')).toEqual({
        ok: false,
        error: { code: 'unavailable', message: 'DB fehlt' },
      })
      expect(await call('alpha', 'count')).toEqual({ ok: true, data: 1 })
    })

    it('handles a rejecting async setup, a failing import and a missing main.ts', async () => {
      await host.start([
        source('async-broken', async () => Promise.reject(new Error('nope'))),
        {
          manifest: manifest('import-broken'),
          contract,
          load: () => Promise.reject(new Error('SyntaxError')),
        },
        { manifest: manifest('no-main'), contract },
        working('alpha'),
      ])
      const states = Object.fromEntries(host.list().map((info) => [info.id, info.status]))
      expect(states['async-broken']).toMatchObject({ state: 'error', reason: { detail: 'nope' } })
      expect(states['import-broken']).toMatchObject({
        state: 'error',
        reason: { detail: 'SyntaxError' },
      })
      expect(states['no-main']).toMatchObject({
        state: 'error',
        reason: { detail: expect.stringMatching(/main\.ts is missing/) },
      })
      expect(states.alpha?.state).toBe('online')
    })

    it('a setup that registers an unknown method fails only that service', async () => {
      await host.start([
        source('alpha', (ctx) => {
          ;(ctx.handle as (method: string, fn: () => void) => void)('nope', () => {})
        }),
      ])
      expect(host.list()[0]?.status).toMatchObject({
        state: 'error',
        reason: { detail: expect.stringMatching(/nope/) },
      })
    })

    it('cleans up schedules of a failed setup', async () => {
      vi.useFakeTimers()
      try {
        const job = vi.fn<() => void>()
        await host.start([
          source('alpha', (ctx) => {
            ctx.schedule(1000, job)
            throw new Error('after schedule')
          }),
        ])
        vi.advanceTimersByTime(5000)
        expect(job).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('status', () => {
    it('keeps a status set in setup and broadcasts every change once', async () => {
      const seen: ServiceStatus[] = []
      host.onStatus((status) => seen.push(status))
      let ctx!: Ctx
      await host.start([
        working('alpha', (c) => {
          ctx = c
          c.status.set('unconfigured', { code: 'noPath', detail: '/x' })
        }),
      ])
      expect(host.list()[0]?.status).toMatchObject({
        state: 'unconfigured',
        reason: { code: 'noPath', detail: '/x' },
      })

      ctx.status.set('unconfigured', { code: 'noPath', detail: '/x' })
      ctx.status.set('online')
      const broadcasts = env.broadcast.mock.calls.filter(
        ([channel]) => channel === HOST_CHANNELS.serviceStatus,
      )
      expect(broadcasts.map(([, status]) => (status as ServiceStatus).state)).toEqual([
        'unconfigured',
        'online',
      ])
      expect(seen.map((status) => status.state)).toEqual(['unconfigured', 'online'])
      expect(seen[1]).not.toHaveProperty('reason')
    })

    it('defaults to online after setup and lists services by order', async () => {
      await host.start([working('zeta', undefined), source('beta', () => {}, 0)])
      const list = (await env.ipc.invoke(HOST_CHANNELS.servicesList)) as ServiceInfo[]
      expect(list.map((info) => [info.id, info.status.state])).toEqual([
        ['beta', 'online'],
        ['zeta', 'online'],
      ])
      expect(list[0]).toMatchObject({
        color: 'orange',
        kind: 'local',
        nameKey: 'services.beta.name',
      })
    })

    it('ignores a status the service may not set', async () => {
      let ctx!: Ctx
      await host.start([working('alpha', (c) => (ctx = c))])
      ;(ctx.status.set as (state: string) => void)('starting')
      expect(host.list()[0]?.status.state).toBe('online')
    })
  })

  describe('events', () => {
    it('validates and broadcasts events to all windows', async () => {
      let ctx!: Ctx
      await host.start([working('alpha', (c) => (ctx = c))])
      ctx.emit('changed')
      ctx.emit('tick', { n: 3 })
      ctx.emit('tick', { n: 'drei' } as unknown as { n: number })
      expect(env.broadcast).toHaveBeenCalledWith(serviceEventChannel('alpha', 'changed'), undefined)
      expect(env.broadcast).toHaveBeenCalledWith(serviceEventChannel('alpha', 'tick'), { n: 3 })
      expect(
        env.broadcast.mock.calls.filter(([channel]) => channel.endsWith(':tick')),
      ).toHaveLength(1)
      expect(env.logger('alpha').error).toHaveBeenCalledWith(
        expect.stringMatching(/emit tick: invalid payload/),
      )
    })
  })

  describe('settings', () => {
    it('gets, validates, persists and notifies', async () => {
      const changes: unknown[] = []
      await host.start([
        working('alpha', (ctx) => ctx.settings.onChange((next) => changes.push(next))),
      ])

      expect(await env.ipc.invoke(HOST_CHANNELS.settingsGet, 'alpha')).toEqual({
        ok: true,
        data: { greeting: 'HALLO', interval: 60 },
      })

      const rejected = await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', { interval: 0 })
      expect(rejected).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      expect(await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', 'x')).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      })
      expect(
        await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', { junk: 'x'.repeat(1000) }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } })
      expect(changes).toEqual([])

      expect(
        await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', { greeting: 'MOIN' }),
      ).toEqual({ ok: true, data: { greeting: 'MOIN', interval: 60 } })
      expect(changes).toEqual([{ greeting: 'MOIN', interval: 60 }])
      expect(await call('alpha', 'greet', { name: 'Ada' })).toEqual({
        ok: true,
        data: { text: 'MOIN Ada' },
      })

      await env.settings.flush()
      const file = JSON.parse(readFileSync(join(tmp.dir, 'settings.json'), 'utf8'))
      expect(file.services.alpha).toEqual({ greeting: 'MOIN' })

      // A new host on the same file sees the saved value.
      await host.stop()
      const store = new SettingsStore(join(tmp.dir, 'settings.json'), silentLogger())
      const next = new ServiceHost({ ...env.deps, ipc: env.ipc, settings: store })
      await next.start([working('alpha')])
      expect(await env.ipc.invoke(HOST_CHANNELS.settingsGet, 'alpha')).toEqual({
        ok: true,
        data: { greeting: 'MOIN', interval: 60 },
      })
      await next.stop()
    })

    it('rejects unknown services', async () => {
      await host.start([working()])
      expect(await env.ipc.invoke(HOST_CHANNELS.settingsGet, 'nope')).toMatchObject({
        ok: false,
        error: { code: 'unknown-service' },
      })
      expect(await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'nope', {})).toMatchObject({
        ok: false,
        error: { code: 'unknown-service' },
      })
    })

    it('settings stay editable while the service is in error', async () => {
      await host.start([
        source('alpha', () => {
          throw new Error('kaputt')
        }),
      ])
      expect(
        await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', { greeting: 'MOIN' }),
      ).toMatchObject({ ok: true })
    })

    it('falls back to defaults when the stored section no longer parses', async () => {
      await env.settings.setService('alpha', { interval: 'oft' })
      const store = new SettingsStore(join(tmp.dir, 'settings.json'), silentLogger())
      host = new ServiceHost({ ...env.deps, settings: store })
      await host.start([working()])
      expect(await env.ipc.invoke(HOST_CHANNELS.settingsGet, 'alpha')).toEqual({
        ok: true,
        data: { greeting: 'HALLO', interval: 60 },
      })
      expect(
        await env.ipc.invoke(HOST_CHANNELS.settingsSet, 'alpha', { greeting: 'MOIN' }),
      ).toMatchObject({ ok: true, data: { interval: 60 } })
    })
  })

  describe('context helpers', () => {
    it('runs schedules, logs their errors and disposes them on stop', async () => {
      vi.useFakeTimers()
      try {
        const job = vi.fn<() => void>()
        const failing = vi.fn<() => void>(() => {
          throw new Error('job kaputt')
        })
        const cleanup = vi.fn<() => void>()
        await host.start([
          working('alpha', (ctx) => {
            ctx.schedule(1000, job)
            ctx.schedule(1000, failing)
          }),
          source('beta', () => cleanup),
        ])
        expect(job).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(3000)
        expect(job).toHaveBeenCalledTimes(3)
        expect(failing).toHaveBeenCalledTimes(3)
        expect(env.logger('alpha').error).toHaveBeenCalledWith(
          'scheduled job failed',
          expect.any(Error),
        )

        await host.stop()
        await vi.advanceTimersByTimeAsync(5000)
        expect(job).toHaveBeenCalledTimes(3)
        expect(cleanup).toHaveBeenCalledOnce()
        expect(env.ipc.handlers.size).toBe(0)
      } finally {
        vi.useRealTimers()
      }
    })

    it('a disposed schedule stops, disposing twice is harmless', async () => {
      vi.useFakeTimers()
      try {
        const job = vi.fn<() => void>()
        let dispose!: () => void
        await host.start([working('alpha', (ctx) => (dispose = ctx.schedule(100, job)))])
        await vi.advanceTimersByTimeAsync(100)
        dispose()
        dispose()
        await vi.advanceTimersByTimeAsync(1000)
        expect(job).toHaveBeenCalledOnce()
      } finally {
        vi.useRealTimers()
      }
    })

    it('rejects a non-positive interval', async () => {
      await host.start([working('alpha', (ctx) => ctx.schedule(0, () => {}))])
      expect(host.list()[0]?.status).toMatchObject({
        state: 'error',
        reason: { detail: expect.stringMatching(/interval/) },
      })
    })

    it('notify forwards to the system and survives a failing notifier', async () => {
      let ctx!: Ctx
      await host.start([working('alpha', (c) => (ctx = c))])
      ctx.notify('LOGBUCH', 'Neuer Eintrag')
      expect(env.notify).toHaveBeenCalledWith('LOGBUCH', 'Neuer Eintrag')
      env.notify.mockImplementationOnce(() => {
        throw new Error('no notifications')
      })
      expect(() => ctx.notify('a', 'b')).not.toThrow()
    })

    it('a stopped service ignores further context calls', async () => {
      let ctx!: Ctx
      await host.start([working('alpha', (c) => (ctx = c))])
      await host.stop()
      env.broadcast.mockClear()
      ctx.emit('changed')
      ctx.status.set('error', { code: 'late' })
      expect(env.broadcast).not.toHaveBeenCalled()
    })
  })

  it('rejects calls from untrusted frames', async () => {
    host = new ServiceHost({ ...env.deps, isTrustedSender: () => false })
    await host.start([working()])
    expect(await call('alpha', 'count')).toEqual({
      ok: false,
      error: { code: 'failed', message: 'untrusted sender' },
    })
  })
})
