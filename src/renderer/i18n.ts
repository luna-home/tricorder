import { createI18n } from 'vue-i18n'

import { DEFAULT_LOCALE, type Locale } from '@shared/locale'

import de from './locales/de.json'
import en from './locales/en.json'

export { LOCALES, type Locale } from '@shared/locale'

export interface Messages {
  [key: string]: string | Messages
}

// Each service brings src/services/<id>/locales/{de,en}.json and, with a UI, optionally
// src/services/<id>/ui/locales/{de,en}.json. Both are merged under `services.<id>`.
const serviceLocales = import.meta.glob<Messages>(
  ['../services/*/locales/*.json', '../services/*/ui/locales/*.json'],
  { eager: true, import: 'default' },
)

function isMessages(value: unknown): value is Messages {
  return typeof value === 'object' && value !== null
}

function merge(target: Messages, source: Messages): Messages {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key]
    target[key] = isMessages(value)
      ? merge(isMessages(existing) ? { ...existing } : {}, value)
      : value
  }
  return target
}

/** App messages merged with every service's messages under `services.<id>`. */
export function buildMessages(): Record<Locale, Messages> {
  const services: Record<Locale, Record<string, Messages>> = { de: {}, en: {} }
  for (const [path, messages] of Object.entries(serviceLocales)) {
    const match = /\/services\/([^/]+)\/(?:ui\/)?locales\/([^/]+)\.json$/.exec(path)
    const [, id, locale] = match ?? []
    if (id && (locale === 'de' || locale === 'en')) {
      services[locale][id] = merge(services[locale][id] ?? {}, messages)
    }
  }
  return {
    de: { ...de, services: services.de },
    en: { ...en, services: services.en },
  }
}

const dateTime = {
  /** `22:52` */
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  /** Header date, e.g. `Mi., 21.10.2026` */
  date: { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' },
  /** `Mi.`: weekday alone, for `formatRealTime` */
  weekday: { weekday: 'short' },
  /** `21.10.2026` */
  day: { day: '2-digit', month: '2-digit', year: 'numeric' },
  // The same three in UTC: for the wall clock of a stored time, see `wallClockAsUtc`.
  timeWall: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' },
  weekdayWall: { weekday: 'short', timeZone: 'UTC' },
  dayWall: { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' },
} as const

export function createAppI18n(locale: Locale = DEFAULT_LOCALE) {
  return createI18n<[Messages], Locale>({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: buildMessages(),
    datetimeFormats: { de: dateTime, en: dateTime },
  })
}
