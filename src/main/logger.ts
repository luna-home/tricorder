import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { inspect } from 'node:util'

import type { ServiceLogger } from '@shared/define-service'

type Level = 'info' | 'warn' | 'error'

export interface LoggerOptions {
  /** Directory of the log files, `userData/logs`. */
  dir: string
  /** Also write to the terminal (dev). */
  console?: boolean
  /** Rotate to `<name>.log.1` above this size. */
  maxBytes?: number
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

function format(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? `${detail.name}: ${detail.message}`
  if (typeof detail === 'string') return detail
  return inspect(detail, { depth: 4, breakLength: Infinity })
}

/**
 * Creates loggers that append to `<dir>/<name>.log`. Logging never throws: a failing write is
 * reported once on stderr and otherwise ignored.
 */
export function createLoggerFactory(options: LoggerOptions): (name: string) => ServiceLogger {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
  let warned = false

  function write(name: string, level: Level, message: string, details: unknown[]): void {
    const text = [message, ...details.map(format)].join(' ')
    const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${name}] ${text}\n`
    if (options.console) {
      const out = level === 'info' ? console.log : console.error
      out(line.trimEnd())
    }
    try {
      mkdirSync(options.dir, { recursive: true })
      const file = join(options.dir, `${name}.log`)
      try {
        if (statSync(file).size > maxBytes) renameSync(file, `${file}.1`)
      } catch {
        // no file yet
      }
      appendFileSync(file, line, 'utf8')
    } catch (error) {
      if (!warned) console.error(`[tricorder] cannot write log ${name}:`, error)
      warned = true
    }
  }

  return (name) => ({
    info: (message, ...details) => write(name, 'info', message, details),
    warn: (message, ...details) => write(name, 'warn', message, details),
    error: (message, ...details) => write(name, 'error', message, details),
  })
}
