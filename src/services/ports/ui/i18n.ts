import { useI18n } from 'vue-i18n'

/** `useI18n()` plus `pt(key)`, which reads `services.ports.<key>`. */
export function usePortsI18n() {
  const i18n = useI18n()
  const pt = (key: string, named: Record<string, unknown> = {}) =>
    i18n.t(`services.ports.${key}`, named)
  return { ...i18n, pt }
}
