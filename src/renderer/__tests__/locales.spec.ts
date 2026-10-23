import { describe, expect, it } from 'vitest'

import { buildMessages } from '../i18n'

function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages)
    .flatMap(([key, value]) =>
      typeof value === 'object' && value !== null
        ? keys(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    )
    .sort()
}

describe('locales', () => {
  it('de and en have the same keys, including every service', () => {
    const { de, en } = buildMessages()
    expect(keys(en)).toEqual(keys(de))
  })

  it('every registered service has a name', async () => {
    const { registry } = await import('@services/registry')
    const { de } = buildMessages()
    for (const { manifest } of Object.values(registry)) {
      expect(keys(de)).toContain(manifest.nameKey)
    }
  })
})
