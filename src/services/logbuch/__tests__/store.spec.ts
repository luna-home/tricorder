import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { defaultDbPath, resolveDbLocation } from '../main/paths'
import { DbMissingError, LogbuchStore, PinError, TopicResolveError } from '../main/store'
import { tempDb } from './helpers'

// Mirrors tests/test_logbuch.py for the parts the service reproduces.
describe('LogbuchStore', () => {
  let tmp: ReturnType<typeof tempDb>
  let store: LogbuchStore

  const merk = (project: string, topic: string, status: string, nextStep?: string) =>
    store.addEntry(project, topic, { status, nextStep })

  beforeEach(() => {
    tmp = tempDb()
    store = LogbuchStore.open(tmp.db)
  })
  afterEach(() => {
    store.close()
    tmp.cleanup()
  })

  it('creates the schema of bin/logbuch and keeps the journal mode', () => {
    const db = new DatabaseSync(tmp.db)
    const names = db
      .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name")
      .all()
      .map((row) => row.name)
    expect(names).toEqual([
      'entries',
      'entries_topic',
      'pins',
      'sqlite_autoindex_pins_1',
      'sqlite_autoindex_pins_2',
    ])
    expect(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toBe('delete')
    db.close()
  })

  it('pins open topics on the lowest free position, at most four', () => {
    for (const topic of ['A', 'B', 'C', 'D', 'E']) merk('p', topic, topic)
    expect(store.pin('p', 'c')).toEqual({ position: 1, project: 'p', topic: 'C' })
    expect(store.pin('p', 'A').position).toBe(2)
    expect(store.pin('p', 'C').position).toBe(1)
    store.pin('p', 'B')
    store.pin('p', 'D')
    expect(() => store.pin('p', 'E')).toThrow(PinError)

    store.unpin('p', 'A')
    store.unpin('p', 'A')
    expect(store.pin('p', 'E').position).toBe(2)
    expect(store.pins().map((pin) => [pin.position, pin.topic])).toEqual([
      [1, 'C'],
      [2, 'E'],
      [3, 'B'],
      [4, 'D'],
    ])
  })

  it('a finished topic gives up its pin and cannot be pinned again', () => {
    merk('p', 'A', 'a')
    merk('p', 'B', 'b')
    store.pin('p', 'A')
    store.pin('p', 'B')
    store.done('p', 'A')
    expect(store.pins().map((pin) => [pin.position, pin.topic])).toEqual([[2, 'B']])
    expect(() => store.pin('p', 'A')).toThrow(/finished/)
  })

  it('refuses a missing file and does not create it', () => {
    const missing = join(tmp.dir, 'nope', 'logbuch.db')
    expect(() => LogbuchStore.open(missing)).toThrow(DbMissingError)
    expect(existsSync(join(tmp.dir, 'nope'))).toBe(false)
  })

  it('case variants stay one topic', () => {
    merk('p', 'Port-Scanner', 'eins')
    const result = merk('p', 'port-scanner', 'zwei')
    expect(result.topic).toBe('Port-Scanner')
    expect(store.openTopics('p').map((r) => [r.topic, r.status])).toEqual([
      ['Port-Scanner', 'zwei'],
    ])
  })

  it('the same topic name in another project is a separate topic', () => {
    merk('p', 'Port-Scanner', 'eins')
    expect(merk('q', 'port-scanner', 'zwei').topic).toBe('port-scanner')
    expect(store.openTopics().map((r) => `${r.project}/${r.topic}`)).toEqual([
      'q/port-scanner',
      'p/Port-Scanner',
    ])
  })

  it('openTopics hides done topics and sorts newest first', () => {
    merk('p', 'A', 'a')
    merk('p', 'B', 'b')
    merk('q', 'C', 'c')
    store.done('p', 'B')
    expect(store.openTopics().map((r) => r.topic)).toEqual(['C', 'A'])
    expect(store.openTopics('p').map((r) => r.topic)).toEqual(['A'])
    // A new entry reopens a finished topic.
    merk('p', 'B', 'wieder da')
    expect(store.openTopics('p')[0]?.status).toBe('wieder da')
  })

  it('openTopics honours the limit', () => {
    for (const topic of ['A', 'B', 'C']) merk('p', topic, topic)
    expect(store.openTopics(undefined, 2).map((r) => r.topic)).toEqual(['C', 'B'])
    expect(store.openTopics('p', 1).map((r) => r.topic)).toEqual(['C'])
  })

  it('resolves exact names first, then a unique substring, and rejects ambiguity', () => {
    merk('p', 'Port-Scanner', 'eins', 'Tests')
    expect(store.resolveTopic('p', 'port')).toBe('Port-Scanner')
    merk('p', 'Portal', 'x')
    expect(() => store.resolveTopic('p', 'port')).toThrow(TopicResolveError)
    expect(() => store.resolveTopic('p', 'port')).toThrow(/ambiguous: p\/Port-Scanner, p\/Portal/)
    expect(store.resolveTopic('p', 'PORTAL')).toBe('Portal')
    expect(() => store.resolveTopic('p', 'nix')).toThrow(/No topic matches "nix"/)
    expect(() => store.resolveTopic('q', 'port')).toThrow(TopicResolveError)
  })

  it('done writes a done entry with the note as status', () => {
    merk('p', 'Port-Scanner', 'eins')
    const { topic, entry } = store.done('p', 'scanner', 'erledigt')
    expect(topic).toBe('Port-Scanner')
    expect(entry).toMatchObject({ kind: 'done', status: 'erledigt', source: 'manual' })
    expect(store.done('p', 'port-scanner').entry.status).toBeNull()
  })

  it('done fails for an unknown topic and writes nothing', () => {
    merk('p', 'A', 'a')
    expect(() => store.done('p', 'B')).toThrow(TopicResolveError)
    expect(store.count()).toBe(1)
  })

  it('history returns the newest entries, oldest first', () => {
    for (const status of ['1', '2', '3']) merk('p', 'A', status)
    merk('p', 'B', 'other')
    expect(store.history('p', 'a').map((r) => r.status)).toEqual(['1', '2', '3'])
    expect(store.history('p', 'A', 2).map((r) => r.status)).toEqual(['2', '3'])
    expect(store.history('q', 'A')).toEqual([])
  })

  it('writes every column like add_entry', () => {
    const { entry } = store.addEntry(
      'p',
      '  A  ',
      { status: 's', nextStep: 'n', openQuestions: 'o', refs: 'r' },
      new Date(2026, 9, 22, 9, 15, 7, 900),
    )
    expect(entry).toMatchObject({
      project: 'p',
      topic: 'A',
      kind: 'entry',
      status: 's',
      nextStep: 'n',
      openQuestions: 'o',
      refs: 'r',
      source: 'manual',
      sessionId: null,
      cwd: null,
    })
    expect(entry.ts).toMatch(/^2026-10-22T09:15:07[+-]\d\d:\d\d$/)
  })

  it('lists projects and topics, most recently active first', () => {
    merk('p', 'A', 'a')
    merk('q', 'X', 'x')
    merk('p', 'B', 'b')
    merk('p', 'b', 'b2')
    store.done('p', 'A')
    expect(store.projects().map(({ project, openTopics }) => [project, openTopics])).toEqual([
      ['p', 1],
      ['q', 1],
    ])
    const topics = store.topics('p')
    expect(topics.map(({ topic, open }) => [topic, open])).toEqual([
      ['A', false],
      ['B', true],
    ])
    const last = store.history('p', 'A').at(-1)
    expect(topics[0]?.lastTs).toBe(last?.ts)
    expect(store.topics('none')).toEqual([])
  })

  it('fingerprint changes with every write from any connection', () => {
    const before = store.fingerprint()
    expect(store.fingerprint()).toBe(before)
    merk('p', 'A', 'a')
    const afterOwn = store.fingerprint()
    expect(afterOwn).not.toBe(before)
    const other = new DatabaseSync(tmp.db)
    other.prepare("UPDATE entries SET status = 'edited'").run()
    other.close()
    expect(store.fingerprint()).not.toBe(afterOwn)
  })
})

describe('database path', () => {
  const home = join('/', 'home', 'pat')

  it('defaults to ~/.logbuch/logbuch.db', () => {
    expect(resolveDbLocation({}, null, home)).toEqual({
      path: defaultDbPath(home),
      source: 'default',
    })
    expect(defaultDbPath(home)).toBe(join(home, '.logbuch', 'logbuch.db'))
  })

  it('setting overrides the default, LOGBUCH_DB overrides both', () => {
    expect(resolveDbLocation({}, '~/x.db', home)).toEqual({
      path: join(home, 'x.db'),
      source: 'settings',
    })
    expect(resolveDbLocation({ LOGBUCH_DB: '/tmp/e.db' }, '/s.db', home)).toEqual({
      path: '/tmp/e.db',
      source: 'env',
    })
    expect(resolveDbLocation({ LOGBUCH_DB: '  ' }, null, home).source).toBe('default')
  })
})
