import { isAbsolute } from 'node:path'

import { z } from 'zod'

// An unset or empty variable means "not set". Paths must be absolute: a relative LOGBUCH_DB
// would resolve against the cwd, which differs between `pnpm dev`, the packaged app and the
// Python CLI, so app and CLI would silently use different files.
const absolutePath = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .refine((value) => value === undefined || isAbsolute(value), {
    message: 'must be an absolute path',
  })

/** Environment variables the main process reads. Validated once at startup. */
export const envSchema = z.object({
  /** Logbuch database; overrides the setting `dbPath`. The Python CLI reads the same variable. */
  LOGBUCH_DB: absolutePath,
  /** userData folder (settings, secrets, logs), e.g. for tests. */
  TRICORDER_USER_DATA: absolutePath,
})

export type AppEnv = z.output<typeof envSchema>

export type EnvResult = { ok: true; env: AppEnv } | { ok: false; message: string }

export function parseEnv(source: NodeJS.ProcessEnv): EnvResult {
  const parsed = envSchema.safeParse(source)
  if (parsed.success) return { ok: true, env: parsed.data }
  return { ok: false, message: z.prettifyError(parsed.error) }
}
