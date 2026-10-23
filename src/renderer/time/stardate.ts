interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3})\d*)?)?/

/**
 * Wall-clock fields of a time. An ISO string keeps the clock of its own offset, as Python's
 * `datetime.fromisoformat` does; a `Date` uses the local clock.
 */
function wallClock(value: string | Date): WallClock {
  if (typeof value === 'string') {
    const match = ISO_LOCAL.exec(value)
    if (!match) throw new RangeError(`Not an ISO 8601 time: ${value}`)
    const [, year, month, day, hour, minute, second, fraction] = match
    return {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
      second: Number(second ?? 0),
      ms: Number((fraction ?? '0').padEnd(3, '0')),
    }
  }
  return {
    year: value.getFullYear(),
    month: value.getMonth() + 1,
    day: value.getDate(),
    hour: value.getHours(),
    minute: value.getMinutes(),
    second: value.getSeconds(),
    ms: value.getMilliseconds(),
  }
}

/**
 * The wall clock of an ISO string as a `Date` at the same fields in UTC. Formatted with
 * `timeZone: 'UTC'`, it shows the clock of the string's own offset (as `clock()` in `bin/logbuch`),
 * independent of the viewer's time zone.
 */
export function wallClockAsUtc(value: string): Date {
  const { year, month, day, hour, minute, second, ms } = wallClock(value)
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms))
}

/**
 * Year plus the elapsed fraction of the year in thousandths, e.g. `2026.805`. Same result as
 * `stardate()` in `bin/logbuch`: the fraction is computed on the wall clock of the time's own
 * offset and truncated, not rounded.
 */
export function stardate(value: string | Date): string {
  const { year, month, day, hour, minute, second, ms } = wallClock(value)
  const start = Date.UTC(year, 0, 1)
  const end = Date.UTC(year + 1, 0, 1)
  const time = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  const thousandths = Math.floor(((time - start) / (end - start)) * 1000)
  return `${year}.${String(thousandths).padStart(3, '0')}`
}
