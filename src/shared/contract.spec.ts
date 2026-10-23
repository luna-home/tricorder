import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import { defineContract, type MethodParams, type ServiceClient } from './contract'
import { defineService } from './define-service'
import { defineManifest } from './registry'

const contract = defineContract({
  methods: {
    ping: { input: z.object({ text: z.string().trim() }), output: z.string() },
    count: { input: z.void(), output: z.number() },
  },
  events: { pinged: z.void() },
  settings: z.object({ greeting: z.string().default('PONG') }),
})

const manifest = defineManifest({
  id: 'ping',
  nameKey: 'services.ping.name',
  color: 'peach',
  kind: 'local',
  order: 1,
})

describe('defineContract', () => {
  it('defaults events and settings to none', () => {
    const bare = defineContract({ methods: {} })
    expect(bare.events).toEqual({})
    expect(bare.settings.parse({})).toEqual({})
  })

  it('derives client and handler types', () => {
    type Client = ServiceClient<typeof contract>
    expectTypeOf<Parameters<Client['ping']>>().toEqualTypeOf<[args: { text: string }]>()
    expectTypeOf<Parameters<Client['count']>>().toEqualTypeOf<[args?: void]>()
    expectTypeOf<ReturnType<Client['count']>>().toEqualTypeOf<Promise<number>>()
    expectTypeOf<MethodParams<typeof contract, 'ping'>>().toEqualTypeOf<{ text: string }>()
  })
})

describe('defineService', () => {
  it('returns the definition', () => {
    const service = defineService({ manifest, contract, setup: () => {} })
    expect(service.manifest.id).toBe('ping')
  })

  it('rejects an invalid id', () => {
    expect(() =>
      defineService({ manifest: { ...manifest, id: 'Ping Pong' }, contract, setup: () => {} }),
    ).toThrow(/Invalid service id/)
  })

  it('rejects settings without defaults', () => {
    const strict = defineContract({ methods: {}, settings: z.object({ host: z.string() }) })
    expect(() => defineService({ manifest, contract: strict, setup: () => {} })).toThrow(/{}/)
  })
})
