import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Dispose } from '@shared/define-service'

import service from '../main'
import { startLogbuch } from '../main/runtime'
import { cli, fakeContext, tempDb } from './helpers'

const waitOptions = { timeout: 3000, interval: 20 }

describe('logbuch service', () => {
  let tmp: ReturnType<typeof tempDb>
  let fake: ReturnType<typeof fakeContext>
  let dispose: Dispose | undefined

  function start(env: NodeJS.ProcessEnv, settings: { dbPath?: string | null } = {}) {
    fake = fakeContext(settings)
    // `home` points into the temp dir, so the default path never hits the real logbuch.
    dispose = startLogbuch(fake.ctx, { env, home: tmp.dir, debounceMs: 20 })
  }

  beforeEach(() => {
    tmp = tempDb()
  })
  afterEach(() => {
    dispose?.()
    dispose = undefined
    tmp.cleanup()
  })

  it('is declared with the logbuch manifest and contract', () => {
    expect(service.manifest.id).toBe('logbuch')
    expect(Object.keys(service.contract.methods)).toContain('addEntry')
  })

  it('goes online with an existing database and serves the methods', async () => {
    start({ LOGBUCH_DB: tmp.db })
    expect(fake.lastStatus()).toEqual({ state: 'online', reason: undefined })

    const written = await fake.call('addEntry', {
      project: 'tricorder',
      topic: ' Electron ',
      status: 'Gerüst steht',
      nextStep: '  ',
      refs: 'docs/plan.md',
    })
    expect(written.entry).toMatchObject({
      topic: 'Electron',
      nextStep: null,
      refs: 'docs/plan.md',
      source: 'manual',
    })
    await fake.call('addEntry', { project: 'tricorder', topic: 'electron', status: 'weiter' })

    expect((await fake.call('openTopics')).map((e) => [e.topic, e.status])).toEqual([
      ['Electron', 'weiter'],
    ])
    expect(await fake.call('projects')).toEqual([
      { project: 'tricorder', openTopics: 1, lastTs: expect.any(String) },
    ])
    expect((await fake.call('topics', { project: 'tricorder' })).map((t) => t.topic)).toEqual([
      'Electron',
    ])
    expect(
      (await fake.call('history', { project: 'tricorder', topic: 'ELECTRON' })).map(
        (e) => e.status,
      ),
    ).toEqual(['Gerüst steht', 'weiter'])

    const done = await fake.call('done', { project: 'tricorder', topic: 'elec', note: ' ' })
    expect(done).toMatchObject({ topic: 'Electron', entry: { kind: 'done', status: null } })
    expect(await fake.call('openTopics', { all: true })).toEqual([])
    await expect(fake.call('done', { project: 'tricorder', topic: 'nix' })).rejects.toThrow(
      /No topic matches/,
    )

    expect(await fake.call('dbInfo')).toEqual({
      path: tmp.db,
      pathSource: 'env',
      exists: true,
      entries: 3,
    })
  })

  it('emits changed after its own writes, coalesced', async () => {
    start({ LOGBUCH_DB: tmp.db })
    await fake.call('addEntry', { project: 'p', topic: 'A', status: 'a' })
    await fake.call('addEntry', { project: 'p', topic: 'B', status: 'b' })
    await vi.waitFor(() => expect(fake.events).toEqual(['changed']), waitOptions)
  })

  it('emits changed when another process writes the database', async () => {
    start({ LOGBUCH_DB: tmp.db })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(fake.events).toEqual([])
    const other = new DatabaseSync(tmp.db)
    other
      .prepare("INSERT INTO entries (ts, project, topic, source) VALUES ('t', 'p', 'X', 'claude')")
      .run()
    other.close()
    await vi.waitFor(() => expect(fake.events).toContain('changed'), waitOptions)
    // Reads alone do not cause events, so a refetch cannot loop.
    const count = fake.events.length
    await fake.call('openTopics')
    await fake.tick()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(fake.events.length).toBe(count)
  })

  it('is unconfigured without a database file and never creates it', async () => {
    start({})
    const defaultPath = join(tmp.dir, '.logbuch', 'logbuch.db')
    expect(fake.lastStatus()?.state).toBe('unconfigured')
    expect(fake.lastStatus()?.reason).toEqual({ code: 'dbMissing', detail: defaultPath })
    await expect(fake.call('openTopics')).rejects.toThrow(/not found/)
    await expect(fake.call('addEntry', { project: 'p', topic: 't', status: 's' })).rejects.toThrow(
      /not found/,
    )
    expect(await fake.call('dbInfo')).toEqual({
      path: defaultPath,
      pathSource: 'default',
      exists: false,
      entries: 0,
    })
    await fake.tick()
    expect(existsSync(join(tmp.dir, '.logbuch'))).toBe(false)
    expect(readdirSync(tmp.dir)).toEqual(['logbuch.db'])
  })

  it('recovers when the database file appears later', async () => {
    const later = join(tmp.dir, 'later.db')
    start({ LOGBUCH_DB: later })
    expect(fake.lastStatus()?.state).toBe('unconfigured')
    writeFileSync(later, '')
    await fake.tick()
    expect(fake.lastStatus()?.state).toBe('online')
    expect(fake.events).toEqual(['changed'])
    expect(await fake.call('openTopics')).toEqual([])
  })

  it('goes unconfigured when the file is removed', async () => {
    start({ LOGBUCH_DB: tmp.db })
    rmSync(tmp.db)
    await fake.tick()
    expect(fake.lastStatus()?.state).toBe('unconfigured')
    await expect(fake.call('projects')).rejects.toThrow(/not found/)
  })

  it('follows a change of the dbPath setting', async () => {
    start({}, { dbPath: join(tmp.dir, 'missing.db') })
    expect(fake.lastStatus()?.state).toBe('unconfigured')
    await fake.ctx.settings.set({ dbPath: tmp.db })
    expect(fake.lastStatus()?.state).toBe('online')
    expect(fake.events).toEqual(['changed'])
    expect(await fake.call('dbInfo')).toMatchObject({ path: tmp.db, pathSource: 'settings' })
  })

  it('watches the new file after a dbPath change within the same directory', async () => {
    const other = join(tmp.dir, 'other.db')
    cli(other, 'merk', 'Anfang', 'a', '--projekt', 'p')
    start({}, { dbPath: tmp.db })
    await fake.ctx.settings.set({ dbPath: other })
    expect(fake.events).toEqual(['changed'])
    // The fake schedule never fires: only the file watcher can notice the CLI writes.
    await new Promise((resolve) => setTimeout(resolve, 100))
    cli(other, 'merk', 'Weiter', 'b', '--projekt', 'p')
    await vi.waitFor(() => expect(fake.events).toEqual(['changed', 'changed']), waitOptions)
  })

  it('LOGBUCH_DB wins over the setting', async () => {
    start({ LOGBUCH_DB: tmp.db }, { dbPath: join(tmp.dir, 'missing.db') })
    expect(fake.lastStatus()?.state).toBe('online')
    expect(await fake.call('dbInfo')).toMatchObject({ path: tmp.db, pathSource: 'env' })
  })

  it('reports an error for a file that is not a database', async () => {
    const junk = join(tmp.dir, 'junk.db')
    writeFileSync(junk, 'this is not sqlite '.repeat(100))
    start({ LOGBUCH_DB: junk })
    expect(fake.lastStatus()?.state).toBe('error')
    await expect(fake.call('openTopics')).rejects.toThrow(/Cannot open/)
  })

  it('stops watching and scheduling on dispose', async () => {
    start({ LOGBUCH_DB: tmp.db })
    expect(fake.scheduledCount()).toBe(1)
    dispose?.()
    dispose = undefined
    expect(fake.scheduledCount()).toBe(0)
    const other = new DatabaseSync(tmp.db)
    other
      .prepare("INSERT INTO entries (ts, project, topic, source) VALUES ('t', 'p', 'X', 'claude')")
      .run()
    other.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect(fake.events).toEqual([])
  })
})
