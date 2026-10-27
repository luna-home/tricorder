/**
 * Contract of the logbuch service. Semantics follow the Python CLI `bin/logbuch`, which stays
 * the source of truth: same SQLite table `entries`, same topic matching, same `ts` format.
 *
 * Topic rules (as in `bin/logbuch`):
 * - A topic is identified by project (exact) plus topic name (case-insensitive).
 * - Writing to a topic keeps the spelling it already has in that project.
 * - A topic is open while its newest entry is not a `done` marker.
 */
import { z } from 'zod'

import { defineContract } from '@shared/contract'

/** Default number of topics `openTopics` returns, as `logbuch wo` (`-n 10`). */
export const OPEN_TOPICS_DEFAULT_LIMIT = 10

/** At most this many topics are pinned at once, on keys Cmd/Ctrl+1..4 (`MAX_PINS` in the CLI). */
export const MAX_PINS = 4

/** Values of `source` written by the CLI, the hooks and this app. Older rows may hold others. */
export const ENTRY_SOURCES = ['manual', 'claude', 'compact', 'session-end'] as const

const name = z.string().trim().min(1)

/** POSIX `/…`, Windows `C:\…` or `\\server\…`, or home-relative `~`, `~/…`. */
const ABSOLUTE_OR_HOME = /^(?:~(?:[\\/]|$)|[\\/]|[A-Za-z]:[\\/])/
/** Optional free text; blank input counts as absent and is stored as NULL. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)

/** One row of the `entries` table, columns in camelCase. */
export const entrySchema = z.object({
  id: z.number().int(),
  /** Local time with offset, seconds precision, e.g. `2026-10-22T09:15:00+02:00`. */
  ts: z.string(),
  project: z.string(),
  topic: z.string(),
  /** `done` marks the topic as finished; `status` then holds the optional note. */
  kind: z.enum(['entry', 'done']),
  /** "Stand": where the work stands. */
  status: z.string().nullable(),
  /** "Weiter": the next concrete step. */
  nextStep: z.string().nullable(),
  /** "Offen": open questions, blockers. */
  openQuestions: z.string().nullable(),
  /** "Bezug": tickets, files, branches, URLs. */
  refs: z.string().nullable(),
  /** Who wrote it, see {@link ENTRY_SOURCES}. This app writes `manual`. */
  source: z.string(),
  sessionId: z.string().nullable(),
  cwd: z.string().nullable(),
})

const topicRef = z.object({ project: name, topic: name })
const pinSchema = z.object({
  /** 1..{@link MAX_PINS}; stays the same while the topic is pinned. */
  position: z.number().int().min(1).max(MAX_PINS),
  project: z.string(),
  /** Spelling as stored with the topic's entries. */
  topic: z.string(),
})

const writeResult = z.object({
  /** Project and topic as stored, i.e. with the topic's existing spelling. */
  project: z.string(),
  topic: z.string(),
  entry: entrySchema,
})

export const logbuchContract = defineContract({
  methods: {
    /**
     * Newest entry of every open topic, newest first (`logbuch wo`).
     * `project` filters by exact project name; `all: true` ignores `limit`.
     */
    openTopics: {
      input: z
        .object({
          project: name.optional(),
          all: z.boolean().default(false),
          limit: z.number().int().min(1).default(OPEN_TOPICS_DEFAULT_LIMIT),
        })
        .prefault({}),
      output: z.array(entrySchema),
    },

    /** Every project with at least one entry, most recently active first. */
    projects: {
      input: z.void(),
      output: z.array(
        z.object({
          project: z.string(),
          /** Number of open topics, 0 when all are done. */
          openTopics: z.number().int().min(0),
          /** `ts` of the project's newest entry. */
          lastTs: z.string(),
        }),
      ),
    },

    /**
     * Every topic of a project, open and done, most recently active first. One row per topic
     * (case-insensitive), with the spelling `addEntry` keeps. Feeds the topic autocomplete.
     */
    topics: {
      input: z.object({ project: name }),
      output: z.array(
        z.object({
          topic: z.string(),
          open: z.boolean(),
          lastTs: z.string(),
        }),
      ),
    },

    /**
     * Entries of one topic in chronological order, oldest first (`logbuch zeig`). The topic
     * matches case-insensitively. With `limit`, only the newest `limit` entries; without, all.
     */
    history: {
      input: topicRef.extend({ limit: z.number().int().min(1).optional() }),
      output: z.array(entrySchema),
    },

    /**
     * Writes an entry (`logbuch merk`), `source` is `manual`. Reuses the existing spelling of the
     * topic in that project. A new project or topic is created by its first entry.
     */
    addEntry: {
      input: topicRef.extend({
        status: name,
        nextStep: optionalText,
        openQuestions: optionalText,
        refs: optionalText,
      }),
      output: writeResult,
    },

    /**
     * Marks a topic as finished (`logbuch fertig`): writes a `done` entry with `note` as status.
     * Fails when the project has no such topic.
     */
    done: {
      input: topicRef.extend({ note: optionalText }),
      output: writeResult,
    },

    /**
     * Pinned topics by position (`pins` table). A topic loses its pin when it is finished, the
     * other pins keep their positions.
     */
    pins: {
      input: z.void(),
      output: z.array(pinSchema),
    },

    /**
     * Pins an open topic on the lowest free position (`logbuch anheften`); a pinned topic keeps
     * its position. Fails for a finished topic or when all {@link MAX_PINS} positions are taken.
     */
    pin: {
      input: topicRef,
      output: pinSchema,
    },

    /** Unpins a topic (`logbuch loesen`); a topic that is not pinned is fine. */
    unpin: {
      input: topicRef,
      output: z.void(),
    },

    /** Which database the service uses and whether it exists. Does not create the file. */
    dbInfo: {
      input: z.void(),
      output: z.object({
        /** Absolute path of the SQLite file. */
        path: z.string(),
        /** Where the path comes from: env `LOGBUCH_DB`, the service settings, or the default `~/.logbuch/logbuch.db`. */
        pathSource: z.enum(['env', 'settings', 'default']),
        exists: z.boolean(),
        /** Number of rows in `entries`, 0 when the file does not exist. */
        entries: z.number().int().min(0),
      }),
    },
  },

  events: {
    /** The database changed: through this service or from outside (CLI, Claude Code hooks). Refetch. */
    changed: z.void(),
  },

  settings: z.object({
    /**
     * Path of the SQLite file; `null` = default. Absolute or starting with `~`: a relative path
     * would resolve against the app's working directory. The env variable `LOGBUCH_DB` overrides it.
     */
    dbPath: z
      .string()
      .trim()
      .min(1)
      .refine((path) => ABSOLUTE_OR_HOME.test(path), {
        message: 'must be an absolute path or start with ~',
      })
      .nullable()
      .default(null),
  }),
})

export type LogbuchContract = typeof logbuchContract
export type LogbuchEntry = z.output<typeof entrySchema>
export type LogbuchPin = z.output<typeof pinSchema>
export type LogbuchSettings = z.output<LogbuchContract['settings']>
