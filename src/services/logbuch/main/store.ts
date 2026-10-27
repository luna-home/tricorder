/**
 * The `entries` table of `bin/logbuch`, read and written with `node:sqlite`. Every query
 * mirrors the Python function named in its comment; `bin/logbuch` is the source of truth.
 */
import { statSync } from 'node:fs'
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite'
import { pathToFileURL } from 'node:url'

import { type LogbuchEntry, type LogbuchPin, MAX_PINS } from '../contract'
import { localIsoSeconds } from './time'

/** `SCHEMA` of `bin/logbuch`, verbatim. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,
    project TEXT NOT NULL,
    topic TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'entry',  -- 'entry' or 'done'
    status TEXT,
    next_step TEXT,
    open_questions TEXT,
    refs TEXT,
    source TEXT NOT NULL,                -- 'manual', 'claude', 'compact', 'session-end'
    session_id TEXT,
    cwd TEXT
);
CREATE INDEX IF NOT EXISTS entries_topic ON entries (project, topic COLLATE NOCASE, ts);
CREATE TABLE IF NOT EXISTS pins (
    project TEXT NOT NULL,
    topic TEXT NOT NULL COLLATE NOCASE,
    position INTEGER NOT NULL UNIQUE,    -- 1..4, Cmd/Ctrl+position in the app
    ts TEXT NOT NULL,
    PRIMARY KEY (project, topic)
);
`

export const BUSY_TIMEOUT_MS = 10_000

/** The database file does not exist; the service never creates it. */
export class DbMissingError extends Error {
  constructor(readonly path: string) {
    super(`Logbuch database not found: ${path}`)
    this.name = 'DbMissingError'
  }
}

/** `resolve_topic` found no topic or several. */
export class TopicResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TopicResolveError'
  }
}

/** `pin_topic` refused: the topic is finished, or every position is taken. */
export class PinError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PinError'
  }
}

export interface EntryFields {
  kind?: 'entry' | 'done'
  status?: string | null
  nextStep?: string | null
  openQuestions?: string | null
  refs?: string | null
}

export interface WriteResult {
  project: string
  topic: string
  entry: LogbuchEntry
}

export interface TopicSummary {
  topic: string
  open: boolean
  lastTs: string
}

export interface ProjectSummary {
  project: string
  openTopics: number
  lastTs: string
}

type Row = Record<string, SQLOutputValue>

const text = (value: SQLOutputValue | undefined): string | null =>
  value === null || value === undefined ? null : String(value)

function toEntry(row: Row): LogbuchEntry {
  return {
    id: Number(row.id),
    ts: String(row.ts),
    project: String(row.project),
    topic: String(row.topic),
    kind: row.kind === 'done' ? 'done' : 'entry',
    status: text(row.status),
    nextStep: text(row.next_step),
    openQuestions: text(row.open_questions),
    refs: text(row.refs),
    source: String(row.source),
    sessionId: text(row.session_id),
    cwd: text(row.cwd),
  }
}

/** Device and inode of a regular file, or null when there is none. */
export function fileIdentity(path: string): string | null {
  try {
    const stat = statSync(path, { bigint: true })
    return stat.isFile() ? `${stat.dev}:${stat.ino}` : null
  } catch {
    return null
  }
}

export class LogbuchStore {
  private constructor(
    private readonly db: DatabaseSync,
    readonly path: string,
    /** {@link fileIdentity} at open time, to notice a deleted or replaced file. */
    readonly identity: string,
  ) {}

  /**
   * Opens an existing database (`connect()` without the `mkdir`): never creates the file, sets
   * the busy timeout, leaves the journal mode alone and ensures the schema.
   */
  static open(path: string): LogbuchStore {
    const identity = fileIdentity(path)
    if (!identity) throw new DbMissingError(path)
    // mode=rw: SQLite fails instead of creating the file if it vanished meanwhile.
    const url = pathToFileURL(path)
    url.searchParams.set('mode', 'rw')
    const db = new DatabaseSync(url, { timeout: BUSY_TIMEOUT_MS })
    try {
      db.exec(SCHEMA)
    } catch (error) {
      db.close()
      throw error
    }
    return new LogbuchStore(db, path, identity)
  }

  close(): void {
    if (this.db.isOpen) this.db.close()
  }

  /** `open_topics`: newest entry per (project, topic NOCASE) that is not `done`, newest first. */
  openTopics(project?: string, limit?: number): LogbuchEntry[] {
    const sql = `
      SELECT e.* FROM entries e
      JOIN (SELECT project, topic COLLATE NOCASE AS t, MAX(id) AS max_id
            FROM entries GROUP BY project, topic COLLATE NOCASE) last
        ON e.id = last.max_id
      WHERE e.kind != 'done' ${project ? 'AND e.project = ?' : ''}
      ORDER BY e.id DESC ${limit ? `LIMIT ${Math.trunc(limit)}` : ''}`
    const rows = project ? this.db.prepare(sql).all(project) : this.db.prepare(sql).all()
    return rows.map(toEntry)
  }

  /** Every project, most recently active first, with its number of open topics. */
  projects(): ProjectSummary[] {
    const result = new Map<string, ProjectSummary>()
    for (const row of this.latestPerTopic()) {
      let project = result.get(row.project)
      if (!project) {
        project = { project: row.project, openTopics: 0, lastTs: row.ts }
        result.set(row.project, project)
      }
      if (row.kind !== 'done') project.openTopics += 1
    }
    return [...result.values()]
  }

  /** Every topic of a project, most recently active first, spelled as `add_entry` keeps it. */
  topics(project: string): TopicSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
           (SELECT k.topic FROM entries k WHERE k.project = e.project AND k.topic = e.topic COLLATE NOCASE
            LIMIT 1) AS topic,
           e.kind, e.ts
         FROM entries e
         JOIN (SELECT MAX(id) AS max_id FROM entries WHERE project = ?
               GROUP BY topic COLLATE NOCASE) last
           ON e.id = last.max_id
         ORDER BY e.id DESC`,
      )
      .all(project)
    return rows.map((row) => ({
      topic: String(row.topic),
      open: row.kind !== 'done',
      lastTs: String(row.ts),
    }))
  }

  /** `history`: the newest `limit` entries (all without), oldest first. */
  history(project: string, topic: string, limit?: number): LogbuchEntry[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM entries WHERE project = ? AND topic = ? COLLATE NOCASE' +
          ' ORDER BY id DESC LIMIT ?',
      )
      .all(project, topic, limit ?? -1)
    return rows.map(toEntry).reverse()
  }

  /**
   * `add_entry` with `source='manual'` and no session or cwd: keeps the spelling of an existing
   * topic in the project, so case variants stay one topic.
   */
  addEntry(project: string, topic: string, fields: EntryFields, now = new Date()): WriteResult {
    topic = topic.trim()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const known = this.db
        .prepare('SELECT topic FROM entries WHERE project = ? AND topic = ? COLLATE NOCASE LIMIT 1')
        .get(project, topic)
      if (known) topic = String(known.topic)
      const { lastInsertRowid } = this.db
        .prepare(
          'INSERT INTO entries (ts, project, topic, kind, status, next_step, open_questions,' +
            ' refs, source, session_id, cwd) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          localIsoSeconds(now),
          project,
          topic,
          fields.kind ?? 'entry',
          fields.status ?? null,
          fields.nextStep ?? null,
          fields.openQuestions ?? null,
          fields.refs ?? null,
          'manual',
          null,
          null,
        )
      const row = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(lastInsertRowid)
      // A finished topic gives up its pin; the other pins keep their keys.
      if (fields.kind === 'done') {
        this.db.prepare('DELETE FROM pins WHERE project = ? AND topic = ?').run(project, topic)
      }
      this.db.exec('COMMIT')
      return { project, topic, entry: toEntry(row as Row) }
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * `resolve_topic` within one project: the exact spelling first, then an exact match ignoring
   * case, then a unique substring. Done topics count too. Throws {@link TopicResolveError} on
   * none or several. SQLite's NOCASE folds only ASCII, so `Übung` and `übung` can be two topics;
   * the exact spelling still picks one of them.
   */
  resolveTopic(project: string, query: string): string {
    const candidates = this.db
      .prepare('SELECT DISTINCT topic FROM entries WHERE project = ?')
      .all(project)
      .map((row) => String(row.topic))
    const q = query.toLowerCase()
    const same = candidates.filter((topic) => topic === query)
    const exact = candidates.filter((topic) => topic.toLowerCase() === q)
    const substring = () => candidates.filter((topic) => topic.toLowerCase().includes(q))
    const hits = same.length ? same : exact.length ? exact : substring()
    if (hits.length === 1) return hits[0]!
    if (!hits.length)
      throw new TopicResolveError(`No topic matches "${query}" in project ${project}.`)
    const names = hits.toSorted().map((topic) => `${project}/${topic}`)
    throw new TopicResolveError(`"${query}" is ambiguous: ${names.join(', ')}. Be more specific.`)
  }

  /** `cmd_fertig`: resolves the topic and writes a `done` entry with the note as status. */
  done(project: string, query: string, note?: string, now = new Date()): WriteResult {
    const topic = this.resolveTopic(project, query)
    return this.addEntry(project, topic, { kind: 'done', status: note ?? null }, now)
  }

  /** `pins`: every pinned topic by position. */
  pins(): LogbuchPin[] {
    return this.db
      .prepare('SELECT position, project, topic FROM pins ORDER BY position')
      .all()
      .map((row) => ({
        position: Number(row.position),
        project: String(row.project),
        topic: String(row.topic),
      }))
  }

  /**
   * `cmd_anheften`: resolves the topic and pins it on the lowest free position; an already pinned
   * topic keeps its position. Throws {@link PinError} for a finished topic or when all
   * {@link MAX_PINS} positions are taken.
   */
  pin(project: string, query: string, now = new Date()): LogbuchPin {
    const topic = this.resolveTopic(project, query)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const known = this.db
        .prepare('SELECT position FROM pins WHERE project = ? AND topic = ?')
        .get(project, topic)
      if (known) {
        this.db.exec('COMMIT')
        return { position: Number(known.position), project, topic }
      }
      const last = this.db
        .prepare(
          'SELECT kind FROM entries WHERE project = ? AND topic = ? COLLATE NOCASE' +
            ' ORDER BY id DESC LIMIT 1',
        )
        .get(project, topic)
      if (!last || last.kind === 'done') {
        throw new PinError(`"${topic}" is finished; only open topics can be pinned.`)
      }
      const taken = new Set(this.pins().map((pin) => pin.position))
      const position = Array.from({ length: MAX_PINS }, (_, i) => i + 1).find((n) => !taken.has(n))
      if (!position) throw new PinError(`All ${MAX_PINS} pins are taken; unpin a topic first.`)
      this.db
        .prepare('INSERT INTO pins (project, topic, position, ts) VALUES (?,?,?,?)')
        .run(project, topic, position, localIsoSeconds(now))
      this.db.exec('COMMIT')
      return { position, project, topic }
    } catch (error) {
      if (this.db.isTransaction) this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** `cmd_loesen`: unpins the topic; a topic that is not pinned is fine. */
  unpin(project: string, query: string): void {
    const topic = this.resolveTopic(project, query)
    this.db.prepare('DELETE FROM pins WHERE project = ? AND topic = ?').run(project, topic)
  }

  count(): number {
    return Number(this.db.prepare('SELECT COUNT(*) AS n FROM entries').get()?.n ?? 0)
  }

  /** Changes whenever any connection commits a change to `entries`. */
  fingerprint(): string {
    const version = this.db.prepare('PRAGMA data_version').get()?.data_version
    const stats = this.db.prepare('SELECT COUNT(*) AS n, MAX(id) AS m FROM entries').get()
    return `${this.identity}|${String(version)}|${String(stats?.n)}|${String(stats?.m)}`
  }

  private latestPerTopic(): LogbuchEntry[] {
    return this.db
      .prepare(
        `SELECT e.* FROM entries e
         JOIN (SELECT MAX(id) AS max_id FROM entries GROUP BY project, topic COLLATE NOCASE) last
           ON e.id = last.max_id
         ORDER BY e.id DESC`,
      )
      .all()
      .map(toEntry)
  }
}
