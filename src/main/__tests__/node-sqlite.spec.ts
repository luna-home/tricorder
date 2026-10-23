import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

// The app uses the built-in node:sqlite instead of a native module (see CLAUDE.md).
describe('node:sqlite', () => {
  let dir: string | undefined
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads and writes a database file', () => {
    dir = mkdtempSync(join(tmpdir(), 'tricorder-sqlite-'))
    const db = new DatabaseSync(join(dir, 'probe.db'))
    db.exec('PRAGMA busy_timeout = 10000')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
    db.prepare('INSERT INTO t (v) VALUES (?)').run('x')
    expect(db.prepare('SELECT v FROM t').get()).toEqual({ v: 'x' })
    db.close()
  })
})
