import { describe, expect, it } from 'vitest'

import { defineRegistry } from '@shared/registry'
import { SERVICE_ID_PATTERN } from '@shared/service'

import { registry } from './registry'

describe('service registry', () => {
  it('keys equal manifest ids and ids are valid', () => {
    for (const [key, { manifest }] of Object.entries(registry)) {
      expect(manifest.id).toBe(key)
      expect(manifest.id).toMatch(SERVICE_ID_PATTERN)
      expect(manifest.nameKey).toBe(`services.${key}.name`)
    }
  })
})

describe('defineRegistry', () => {
  it('rejects a key that differs from the manifest id (type check)', () => {
    // @ts-expect-error the key must equal manifest.id
    expect(defineRegistry({ other: registry.logbuch })).toBeDefined()
  })
})
