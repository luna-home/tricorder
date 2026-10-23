import { useI18n } from 'vue-i18n'

import { ServiceCallError, type ServiceErrorCode } from '@shared/ipc'
import type { StatusReason } from '@shared/service'

const ERROR_KEYS: Record<ServiceErrorCode, string> = {
  'unknown-service': 'errors.unknownService',
  'unknown-method': 'errors.unknownMethod',
  'invalid-input': 'errors.invalidInput',
  'invalid-output': 'errors.invalidOutput',
  unavailable: 'errors.unavailable',
  failed: 'errors.failed',
}

/** i18n key for a failed call, from the stable error code of the IPC envelope. */
export function errorKey(error: unknown): string {
  return error instanceof ServiceCallError ? ERROR_KEYS[error.code] : 'errors.unknown'
}

/** The technical message of an error; shown verbatim next to the translated text. */
export function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Translated texts for what the main process reports as codes: call errors and status reasons.
 * A reason is looked up in the service's own messages first, then in the app's.
 */
export function useErrorText() {
  const { t, te } = useI18n()
  return {
    error: (error: unknown) => t(errorKey(error)),
    reason: (serviceId: string, reason: StatusReason) => {
      const own = `services.${serviceId}.reasons.${reason.code}`
      if (te(own)) return t(own)
      const shared = `reasons.${reason.code}`
      return t(te(shared) ? shared : 'reasons.unknown')
    },
  }
}
