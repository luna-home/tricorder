import { z } from 'zod'

import type { ServiceLogger } from '@shared/define-service'

import { createQueue, quarantineFile, readJsonFile, writeJsonFileAtomic } from './json-file'

const section = z.record(z.string(), z.unknown())

/**
 * `userData/settings.json`. Holds raw sections only; each section is validated by its owner
 * (a service's settings schema, the app settings schema).
 */
const fileSchema = z.object({
  version: z.literal(1).default(1),
  app: section.default({}),
  services: z.record(z.string(), section).default({}),
})

export type SettingsFile = z.output<typeof fileSchema>
export type Section = Record<string, unknown>

/**
 * The settings file. Reads once on creation, keeps the content in memory and saves every change
 * atomically, one write at a time. A corrupt file is moved aside and replaced by an empty one.
 */
export class SettingsStore {
  private data: SettingsFile
  private readonly enqueue = createQueue()

  constructor(
    readonly path: string,
    private readonly log: ServiceLogger,
  ) {
    this.data = this.load()
  }

  private load(): SettingsFile {
    const read = readJsonFile(this.path)
    if (read.kind === 'missing') return fileSchema.parse({})
    if (read.kind === 'ok') {
      const parsed = fileSchema.safeParse(read.data)
      if (parsed.success) return parsed.data
      this.log.warn(`settings file has an invalid shape: ${z.prettifyError(parsed.error)}`)
    } else {
      this.log.warn('settings file is not valid JSON', read.error)
    }
    try {
      this.log.warn(`moved unreadable settings file to ${quarantineFile(this.path)}`)
    } catch (error) {
      this.log.error('cannot move unreadable settings file aside', error)
    }
    return fileSchema.parse({})
  }

  /** Raw section of a service, `{}` when it has none. */
  service(id: string): Section {
    return this.data.services[id] ?? {}
  }

  app(): Section {
    return this.data.app
  }

  /** Replaces a service section and saves the file. A failed write restores the old section. */
  setService(id: string, value: Section): Promise<void> {
    return this.replace(
      () => this.data.services[id],
      (section) => {
        const services = { ...this.data.services }
        if (section === undefined) delete services[id]
        else services[id] = section
        this.data = { ...this.data, services }
      },
      value,
    )
  }

  setApp(value: Section): Promise<void> {
    return this.replace(
      () => this.data.app,
      (section) => {
        this.data = { ...this.data, app: section ?? {} }
      },
      value,
    )
  }

  /** Resolves when all pending writes are on disk. */
  flush(): Promise<void> {
    return this.enqueue(() => Promise.resolve())
  }

  private async replace(
    read: () => Section | undefined,
    write: (section: Section | undefined) => void,
    value: Section,
  ): Promise<void> {
    const previous = read()
    write(value)
    try {
      await this.save()
    } catch (error) {
      // Only roll back when no later change replaced the section in the meantime.
      if (read() === value) write(previous)
      throw error
    }
  }

  private save(): Promise<void> {
    const snapshot = this.data
    return this.enqueue(() => writeJsonFileAtomic(this.path, snapshot))
  }
}

/** Only the keys the schema knows; keys of an older schema version are dropped. */
function knownKeys(schema: z.ZodObject, value: Section): Section {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key in schema.shape))
}

/**
 * Settings of one owner, validated with its schema. The file keeps the merged input (what the
 * user set, restricted to the schema's keys); `get()` returns the parsed output with defaults
 * applied. A stored section that no longer parses (schema changed) falls back to the defaults
 * and is logged. Calls of `set` run one after another, so concurrent patches never overwrite
 * each other.
 */
export class ValidatedSection<S extends z.ZodObject> {
  private raw: Section
  private current: z.output<S>
  private readonly listeners = new Set<(next: z.output<S>, previous: z.output<S>) => void>()
  private readonly enqueue = createQueue()

  constructor(
    private readonly schema: S,
    stored: Section,
    private readonly write: (value: Section) => Promise<void>,
    private readonly log: ServiceLogger,
  ) {
    const parsed = schema.safeParse(stored)
    if (parsed.success) {
      this.raw = knownKeys(schema, stored)
      this.current = parsed.data
    } else {
      log.warn(`stored settings are invalid, using defaults: ${z.prettifyError(parsed.error)}`)
      this.raw = {}
      this.current = schema.parse({})
    }
  }

  get(): z.output<S> {
    return this.current
  }

  /**
   * Merges, validates and saves. Rejects with {@link SettingsValidationError} on invalid data,
   * including keys the schema does not know.
   */
  set(patch: unknown): Promise<z.output<S>> {
    return this.enqueue(() => this.apply(patch))
  }

  private async apply(patch: unknown): Promise<z.output<S>> {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new SettingsValidationError('settings patch must be an object')
    }
    const unknownKeys = Object.keys(patch).filter((key) => !(key in this.schema.shape))
    if (unknownKeys.length) {
      throw new SettingsValidationError(`unknown settings: ${unknownKeys.join(', ')}`)
    }
    const merged = { ...this.raw, ...patch }
    const parsed = this.schema.safeParse(merged)
    if (!parsed.success) throw new SettingsValidationError(z.prettifyError(parsed.error))
    await this.write(merged)
    this.raw = merged
    const previous = this.current
    this.current = parsed.data
    for (const listener of this.listeners) {
      try {
        listener(parsed.data, previous)
      } catch (error) {
        this.log.error('settings listener failed', error)
      }
    }
    return parsed.data
  }

  onChange(listener: (next: z.output<S>, previous: z.output<S>) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettingsValidationError'
  }
}
