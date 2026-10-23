import { z } from 'zod'

import type { ServiceLogger, ServiceSecrets } from '@shared/define-service'

import { createQueue, quarantineFile, readJsonFile, writeJsonFileAtomic } from './json-file'

/** The part of Electron `safeStorage` the store needs; injectable for tests. */
export interface Encryption {
  isEncryptionAvailable(): boolean
  encryptString(plain: string): Buffer
  decryptString(encrypted: Buffer): string
}

const fileSchema = z.record(z.string(), z.record(z.string(), z.string()))
type SecretsFile = z.output<typeof fileSchema>

/**
 * `userData/secrets.json`: per service, key -> base64 of the `safeStorage` ciphertext.
 * Kept apart from `settings.json`, so settings can be shared or inspected without secrets.
 */
export class SecretStore {
  private data: SecretsFile
  private readonly enqueue = createQueue()

  constructor(
    readonly path: string,
    private readonly encryption: Encryption,
    private readonly log: ServiceLogger,
  ) {
    const read = readJsonFile(path)
    const parsed = read.kind === 'ok' ? fileSchema.safeParse(read.data) : undefined
    this.data = parsed?.success ? parsed.data : {}
    if (read.kind === 'corrupt' || (parsed && !parsed.success)) {
      log.warn('secrets file is unreadable, starting empty')
      try {
        quarantineFile(path)
      } catch (error) {
        log.error('cannot move unreadable secrets file aside', error)
      }
    }
  }

  /** The secrets of one service, as handed to its `ServiceContext`. */
  forService(id: string): ServiceSecrets {
    return {
      available: () => this.encryption.isEncryptionAvailable(),
      get: async (key) => {
        const stored = this.data[id]?.[key]
        if (stored === undefined) return undefined
        try {
          return this.encryption.decryptString(Buffer.from(stored, 'base64'))
        } catch (error) {
          this.log.error(`cannot decrypt secret ${id}/${key}`, error)
          return undefined
        }
      },
      set: async (key, value) => {
        const section = { ...this.data[id] }
        if (value === undefined) {
          delete section[key]
        } else {
          if (!this.encryption.isEncryptionAvailable()) {
            throw new Error('secure storage is not available on this system')
          }
          section[key] = this.encryption.encryptString(value).toString('base64')
        }
        this.data = { ...this.data, [id]: section }
        const snapshot = this.data
        await this.enqueue(() => writeJsonFileAtomic(this.path, snapshot))
      },
    }
  }

  flush(): Promise<void> {
    return this.enqueue(() => Promise.resolve())
  }
}
