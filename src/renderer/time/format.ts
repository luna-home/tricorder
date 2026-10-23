import { useI18n } from 'vue-i18n'

import { relativeTime } from './relative'
import { stardate, wallClockAsUtc } from './stardate'

type DateFormatter = (value: Date, key: string) => string
type Translator = (key: string, named: Record<string, unknown>) => string

/**
 * A `Date` is shown on the local clock. An ISO string keeps the clock of its own offset, as
 * `stardate()` and the CLI do, so date, clock and stardate of an entry always agree.
 */
function resolve(value: Date | string): { date: Date; suffix: '' | 'Wall' } {
  return typeof value === 'string'
    ? { date: wallClockAsUtc(value), suffix: 'Wall' }
    : { date: value, suffix: '' }
}

/**
 * Real time with weekday, date and clock from the vue-i18n datetime formats `weekday`, `day`
 * and `time`, e.g. `Mi 21.10.2026 · 22:52` (de). The weekday loses its abbreviation dot.
 */
export function formatRealTime(value: Date | string, d: DateFormatter): string {
  const { date, suffix } = resolve(value)
  return `${formatDay(value, d)} · ${d(date, `time${suffix}`)}`
}

/** Weekday and date without the clock, e.g. `Mi 21.10.2026` (de). */
export function formatDay(value: Date | string, d: DateFormatter): string {
  const { date, suffix } = resolve(value)
  return `${d(date, `weekday${suffix}`).replace(/\.$/, '')} ${d(date, `day${suffix}`)}`
}

export function formatRelativeTime(value: Date | string, now: Date, t: Translator): string {
  const { key, n } = relativeTime(value, now)
  return t(`time.${key}`, { n })
}

export function formatStardate(value: Date | string, t: Translator): string {
  return t('time.stardate', { value: stardate(value) })
}

/** The three time formats, bound to the current locale. */
export function useTimeFormat() {
  const { d, t } = useI18n()
  const translate: Translator = (key, named) => t(key, named)
  const date: DateFormatter = (value, key) => d(value, key)
  return {
    day: (value: Date | string) => formatDay(value, date),
    realTime: (value: Date | string) => formatRealTime(value, date),
    relative: (value: Date | string, now: Date) => formatRelativeTime(value, now, translate),
    stardate: (value: Date | string) => formatStardate(value, translate),
  }
}
