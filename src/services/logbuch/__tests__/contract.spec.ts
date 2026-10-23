import { describe, expect, it } from 'vitest'

import { logbuchContract, OPEN_TOPICS_DEFAULT_LIMIT } from '../contract'

const { methods, settings } = logbuchContract

describe('logbuch contract', () => {
  it('openTopics works without arguments', () => {
    expect(methods.openTopics.input.parse(undefined)).toEqual({
      all: false,
      limit: OPEN_TOPICS_DEFAULT_LIMIT,
    })
  })

  it('addEntry trims and drops blank optional fields', () => {
    expect(
      methods.addEntry.input.parse({
        project: ' tricorder ',
        topic: ' Electron ',
        status: ' Gerüst steht ',
        nextStep: '  ',
        refs: 'docs/plan.md',
      }),
    ).toEqual({
      project: 'tricorder',
      topic: 'Electron',
      status: 'Gerüst steht',
      nextStep: undefined,
      openQuestions: undefined,
      refs: 'docs/plan.md',
    })
  })

  it('rejects blank project, topic and status', () => {
    for (const blank of ['project', 'topic', 'status']) {
      const input = { project: 'p', topic: 't', status: 's', [blank]: '   ' }
      expect(methods.addEntry.input.safeParse(input).success).toBe(false)
    }
  })

  it('methods without arguments accept undefined', () => {
    expect(methods.projects.input.safeParse(undefined).success).toBe(true)
    expect(methods.dbInfo.input.safeParse(undefined).success).toBe(true)
  })

  it('settings default to the standard database path', () => {
    expect(settings.parse({})).toEqual({ dbPath: null })
  })

  it('accepts only absolute or home-relative database paths', () => {
    const valid = (dbPath: string) => settings.safeParse({ dbPath }).success
    const accepted = ['/tmp/l.db', '~', '~/l.db', 'C:\\Users\\a\\l.db', '\\\\srv\\l.db']
    expect(accepted.filter((dbPath) => !valid(dbPath))).toEqual([])
    expect(['scratch.db', './l.db', '~ada/l.db'].filter(valid)).toEqual([])
  })
})
