import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Dispose } from '@shared/define-service'

import { startLogbuch } from '../main/runtime'
import { cli, fakeContext, tempDb } from './helpers'

const TS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/

// Contract test against the Python CLI bin/logbuch, the source of truth: both sides work on
// the same temp database (LOGBUCH_DB) and must see the same topics.
describe('logbuch service vs. bin/logbuch', () => {
  let tmp: ReturnType<typeof tempDb>
  let fake: ReturnType<typeof fakeContext>
  let dispose: Dispose

  const run = (...args: string[]) => cli(tmp.db, ...args)
  const rows = () => {
    const db = new DatabaseSync(tmp.db, { readOnly: true })
    const result = db.prepare('SELECT * FROM entries ORDER BY id').all()
    db.close()
    return result
  }

  beforeEach(() => {
    tmp = tempDb()
    fake = fakeContext()
    dispose = startLogbuch(fake.ctx, { env: { LOGBUCH_DB: tmp.db }, home: tmp.dir })
  })
  afterEach(() => {
    dispose()
    tmp.cleanup()
  })

  it('reads CLI entries like `logbuch wo`, including case variants and fertig', async () => {
    run('merk', 'Port-Scanner', 'eins', '--projekt', 'p', '--weiter', 'Tests', '--bezug', 'T-1')
    run('merk', 'port-scanner', 'zwei', '--projekt', 'p', '--offen', 'Warum?', '--von', 'claude')
    run('merk', 'A', 'a', '--projekt', 'p')
    run('merk', 'B', 'b', '--projekt', 'q')
    run('fertig', 'A', '--projekt', 'p', '--notiz', 'fertig')

    const open = await fake.call('openTopics')
    expect(open.map((e) => [e.project, e.topic, e.status])).toEqual([
      ['q', 'B', 'b'],
      ['p', 'Port-Scanner', 'zwei'],
    ])
    expect(open[1]).toMatchObject({
      kind: 'entry',
      nextStep: null,
      openQuestions: 'Warum?',
      source: 'claude',
    })
    expect(open[1]?.cwd).toBeTruthy()

    const wo = run('wo', '--projekt', 'p')
    expect(wo).toContain('■ p / Port-Scanner')
    expect(wo).not.toContain('■ p / A')

    const history = await fake.call('history', { project: 'p', topic: 'PORT-SCANNER' })
    expect(history.map((e) => [e.topic, e.status, e.nextStep])).toEqual([
      ['Port-Scanner', 'eins', 'Tests'],
      ['Port-Scanner', 'zwei', null],
    ])
    expect(await fake.call('topics', { project: 'p' })).toEqual([
      { topic: 'A', open: false, lastTs: expect.stringMatching(TS) },
      { topic: 'Port-Scanner', open: true, lastTs: expect.stringMatching(TS) },
    ])
    expect((await fake.call('projects')).map((p) => [p.project, p.openTopics])).toEqual([
      ['p', 1],
      ['q', 1],
    ])
  })

  it('writes entries the CLI shows, with the same ts format and source manual', async () => {
    run('merk', 'Electron', 'cli', '--projekt', 'tricorder')
    const { topic } = await fake.call('addEntry', {
      project: 'tricorder',
      topic: 'ELECTRON',
      status: 'Formular fertig',
      nextStep: 'Abschließen bauen',
      openQuestions: 'Icons?',
      refs: 'docs/plan.md',
    })
    expect(topic).toBe('Electron')
    await fake.call('addEntry', { project: 'tricorder', topic: 'Neu', status: 'erster Stand' })

    const wo = run('wo', '--projekt', 'tricorder')
    expect(wo.indexOf('■ tricorder / Neu')).toBeLessThan(wo.indexOf('■ tricorder / Electron'))
    expect(wo).toContain('Stand: Formular fertig')
    expect(wo).toContain('Weiter: Abschließen bauen')
    expect(wo).toContain('Offen: Icons?')
    expect(wo).toContain('Bezug: docs/plan.md')
    expect(wo).toMatch(/■ tricorder \/ Electron {2}\(.*, manual\)/)

    const zeig = run('zeig', 'electron', '--projekt', 'tricorder')
    expect(zeig.startsWith('tricorder / Electron\n')).toBe(true)
    expect(zeig.indexOf('Stand: cli')).toBeLessThan(zeig.indexOf('Stand: Formular fertig'))

    const [fromCli, ...fromService] = rows()
    expect(fromService).toHaveLength(2)
    for (const row of [fromCli, ...fromService]) expect(row?.ts).toMatch(TS)
    // Same offset as the CLI writes at the same moment.
    expect(String(fromService[0]?.ts).slice(19)).toBe(String(fromCli?.ts).slice(19))
    for (const row of fromService) {
      expect(row).toMatchObject({ source: 'manual', session_id: null, cwd: null, kind: 'entry' })
    }
    expect(fromService[0]).toMatchObject({
      topic: 'Electron',
      next_step: 'Abschließen bauen',
      open_questions: 'Icons?',
      refs: 'docs/plan.md',
    })
  })

  it('done from either side hides the topic on both sides', async () => {
    await fake.call('addEntry', { project: 'p', topic: 'Service', status: 's' })
    run('merk', 'Cli', 'c', '--projekt', 'p')

    run('fertig', 'service', '--projekt', 'p')
    await fake.call('done', { project: 'p', topic: 'cl', note: 'erledigt' })

    expect(await fake.call('openTopics', { project: 'p' })).toEqual([])
    expect(run('wo', '--projekt', 'p').trim()).toBe('Keine offenen Themen im Logbuch.')
    expect(rows().map((r) => [r.topic, r.kind, r.status])).toEqual([
      ['Service', 'entry', 's'],
      ['Cli', 'entry', 'c'],
      ['Service', 'done', null],
      ['Cli', 'done', 'erledigt'],
    ])
    expect(run('zeig', 'cli', '--projekt', 'p')).toContain('✓ abgeschlossen')
  })

  it('a new entry after done reopens the topic on both sides', async () => {
    run('merk', 'Thema', 'eins', '--projekt', 'p')
    await fake.call('done', { project: 'p', topic: 'thema' })
    run('merk', 'thema', 'wieder da', '--projekt', 'p')
    expect((await fake.call('openTopics')).map((e) => [e.topic, e.status])).toEqual([
      ['Thema', 'wieder da'],
    ])

    run('fertig', 'Thema', '--projekt', 'p')
    await fake.call('addEntry', { project: 'p', topic: 'THEMA', status: 'nochmal' })
    expect(run('wo', '--projekt', 'p')).toContain('■ p / Thema')
    expect(run('wo', '--projekt', 'p')).toContain('Stand: nochmal')
  })

  it('closes umlaut case variants by their exact spelling on both sides', async () => {
    // NOCASE folds only ASCII: the CLI's "Übung" and the app's "übung" are two topics.
    run('merk', 'Übung', 'a', '--projekt', 'p')
    await fake.call('addEntry', { project: 'p', topic: 'übung', status: 'b' })
    const open = async () => (await fake.call('openTopics', { project: 'p' })).map((e) => e.topic)
    expect((await open()).toSorted()).toEqual(['Übung', 'übung'])

    await fake.call('done', { project: 'p', topic: 'Übung' })
    expect(await open()).toEqual(['übung'])
    run('fertig', 'übung', '--projekt', 'p')
    expect(await open()).toEqual([])
    expect(run('wo', '--projekt', 'p')).not.toContain('bung')

    await expect(fake.call('done', { project: 'p', topic: 'ÜBUNG' })).rejects.toThrow(/ambiguous/)
  })

  it('rejects ambiguous topics like `logbuch fertig`', async () => {
    run('merk', 'Port-Scanner', 'x', '--projekt', 'p')
    run('merk', 'Portal', 'y', '--projekt', 'p')
    expect(() => run('fertig', 'port', '--projekt', 'p')).toThrow(/Command failed/)
    await expect(fake.call('done', { project: 'p', topic: 'port' })).rejects.toThrow(/ambiguous/)
    expect(rows()).toHaveLength(2)
  })
})
