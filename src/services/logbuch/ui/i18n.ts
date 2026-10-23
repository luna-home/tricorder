import { useI18n } from 'vue-i18n'

/** `useI18n()` plus `lt(key)`, which reads `services.logbuch.<key>`. */
export function useLogbuchI18n() {
  const i18n = useI18n()
  const lt = (key: string, named: Record<string, unknown> = {}) =>
    i18n.t(`services.logbuch.${key}`, named)
  return { ...i18n, lt }
}
