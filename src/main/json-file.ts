import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type ReadResult =
  { kind: 'missing' } | { kind: 'ok'; data: unknown } | { kind: 'corrupt'; error: unknown }

/** Reads and parses a JSON file. Never throws. */
export function readJsonFile(path: string): ReadResult {
  if (!existsSync(path)) return { kind: 'missing' }
  try {
    return { kind: 'ok', data: JSON.parse(readFileSync(path, 'utf8')) }
  } catch (error) {
    return { kind: 'corrupt', error }
  }
}

/** Moves an unreadable file aside (`<name>.corrupt-<time>`) so it is kept for inspection. */
export function quarantineFile(path: string): string {
  const target = `${path}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`
  mkdirSync(dirname(path), { recursive: true })
  renameSync(path, target)
  return target
}

/**
 * Writes JSON atomically: to a temp file next to the target, then rename. A crash never leaves a
 * half-written file behind.
 */
export async function writeJsonFileAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await rename(temp, path)
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** Runs async jobs one after another, so concurrent saves of one file never interleave. */
export function createQueue(): <T>(job: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()
  return (job) => {
    const run = tail.then(job, job)
    tail = run.catch(() => undefined)
    return run
  }
}
