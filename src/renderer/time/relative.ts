const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export type RelativeTimeKey = 'justNow' | 'minutesAgo' | 'hoursAgo' | 'yesterday' | 'daysAgo'

export interface RelativeTime {
  /** Message key under `time.*`. */
  key: RelativeTimeKey
  /** Whole minutes, hours or days, truncated. 0 for `justNow`. */
  n: number
}

/**
 * How long ago `then` was, with the steps of `ago()` in `bin/logbuch`: under a minute (also in
 * the future) `justNow`, then minutes, hours, `yesterday` for one day and days after that.
 */
export function relativeTime(then: Date | string, now: Date): RelativeTime {
  const delta = now.getTime() - new Date(then).getTime()
  if (delta < MINUTE) return { key: 'justNow', n: 0 }
  if (delta < HOUR) return { key: 'minutesAgo', n: Math.floor(delta / MINUTE) }
  if (delta < DAY) return { key: 'hoursAgo', n: Math.floor(delta / HOUR) }
  const days = Math.floor(delta / DAY)
  return days === 1 ? { key: 'yesterday', n: 1 } : { key: 'daysAgo', n: days }
}
