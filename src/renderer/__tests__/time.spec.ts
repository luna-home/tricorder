import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import LcTimestamp from '../components/LcTimestamp.vue'
import { createAppI18n } from '../i18n'
import { formatDay, formatRealTime, formatRelativeTime } from '../time/format'
import { relativeTime } from '../time/relative'
import './helpers'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function formatters(locale: 'de' | 'en') {
  const { global } = createAppI18n(locale)
  return {
    d: (value: Date, key: string) => global.d(value, key),
    t: (key: string, named: Record<string, unknown>) => global.t(key, named),
  }
}

describe('relativeTime (ago() of bin/logbuch)', () => {
  const now = new Date(2026, 9, 22, 8, 52)
  const ago = (ms: number) => relativeTime(new Date(now.getTime() - ms), now)

  it('steps through minutes, hours, yesterday and days, truncating', () => {
    expect(ago(0)).toEqual({ key: 'justNow', n: 0 })
    expect(ago(59_999)).toEqual({ key: 'justNow', n: 0 })
    expect(ago(MIN)).toEqual({ key: 'minutesAgo', n: 1 })
    expect(ago(HOUR - 1)).toEqual({ key: 'minutesAgo', n: 59 })
    expect(ago(HOUR)).toEqual({ key: 'hoursAgo', n: 1 })
    expect(ago(10 * HOUR)).toEqual({ key: 'hoursAgo', n: 10 })
    expect(ago(DAY - 1)).toEqual({ key: 'hoursAgo', n: 23 })
    expect(ago(DAY)).toEqual({ key: 'yesterday', n: 1 })
    expect(ago(2 * DAY - 1)).toEqual({ key: 'yesterday', n: 1 })
    expect(ago(2 * DAY)).toEqual({ key: 'daysAgo', n: 2 })
    expect(ago(40 * DAY)).toEqual({ key: 'daysAgo', n: 40 })
  })

  it('treats a time in the future as just now', () => {
    expect(ago(-5 * MIN)).toEqual({ key: 'justNow', n: 0 })
  })

  it('accepts ISO strings with offset', () => {
    const then = new Date(now.getTime() - 10 * HOUR).toISOString()
    expect(relativeTime(then, now)).toEqual({ key: 'hoursAgo', n: 10 })
  })

  it('is translated in de and en', () => {
    const de = formatters('de')
    const en = formatters('en')
    const then = new Date(now.getTime() - 10 * HOUR)
    expect(formatRelativeTime(then, now, de.t)).toBe('vor 10 Std')
    expect(formatRelativeTime(then, now, en.t)).toBe('10 h ago')
    expect(formatRelativeTime(new Date(now.getTime() - 3 * DAY), now, de.t)).toBe('vor 3 Tagen')
    expect(formatRelativeTime(new Date(now.getTime() - DAY), now, de.t)).toBe('gestern')
    expect(formatRelativeTime(now, now, en.t)).toBe('just now')
  })
})

describe('formatRealTime', () => {
  const time = new Date(2026, 9, 21, 22, 52)

  it('puts weekday, date and clock in one line (de)', () => {
    expect(formatRealTime(time, formatters('de').d)).toBe('Mi 21.10.2026 · 22:52')
    expect(formatDay(time, formatters('de').d)).toBe('Mi 21.10.2026')
  })

  it('uses the en formats in en', () => {
    expect(formatRealTime(time, formatters('en').d)).toBe('Wed 10/21/2026 · 22:52')
  })

  it('shows a stored time on the clock of its own offset, like the stardate and the CLI', () => {
    // -05:00 differs from the test machine's zone: 23:30 there is already the next day here.
    const ts = '2026-12-31T23:30:00-05:00'
    expect(formatRealTime(ts, formatters('de').d)).toBe('Do 31.12.2026 · 23:30')
    expect(formatDay(ts, formatters('de').d)).toBe('Do 31.12.2026')
    expect(formatRealTime('2026-10-21T22:52:00+02:00', formatters('en').d)).toBe(
      'Wed 10/21/2026 · 22:52',
    )
  })

  it('pads hours and minutes', () => {
    expect(formatRealTime(new Date(2026, 0, 5, 7, 3), formatters('de').d)).toBe(
      'Mo 05.01.2026 · 07:03',
    )
  })
})

describe('LcTimestamp', () => {
  const mountAt = (value: string, now: Date) =>
    mount(LcTimestamp, {
      props: { value, now },
      global: { plugins: [createAppI18n('de')] },
    })

  it('shows real time, relative time and stardate', () => {
    const value = '2026-10-21T22:52:00+02:00'
    const wrapper = mountAt(value, new Date('2026-10-22T08:52:00+02:00'))
    expect(wrapper.find('time').text()).toBe('Mi 21.10.2026 · 22:52')
    expect(wrapper.find('time').attributes('datetime')).toBe(value)
    expect(wrapper.find('.lc-timestamp__relative').text()).toBe('vor 10 Std')
    expect(wrapper.find('.lc-timestamp__stardate').text()).toBe('Sternzeit 2026.805')
  })

  it('keeps date, clock and stardate on the same day for a foreign offset', () => {
    const wrapper = mountAt('2026-12-31T23:30:00-05:00', new Date('2027-01-01T06:30:00Z'))
    expect(wrapper.find('time').text()).toBe('Do 31.12.2026 · 23:30')
    expect(wrapper.find('.lc-timestamp__relative').text()).toBe('vor 2 Std')
    expect(wrapper.find('.lc-timestamp__stardate').text()).toBe('Sternzeit 2026.999')
  })
})
