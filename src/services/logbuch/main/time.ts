const pad = (value: number, width = 2): string => String(value).padStart(width, '0')

/**
 * Local time with UTC offset, seconds precision (truncated), e.g. `2026-10-22T09:15:00+02:00`.
 * Same as Python's `datetime.now().astimezone().isoformat(timespec="seconds")` in `bin/logbuch`.
 */
export function localIsoSeconds(date: Date = new Date()): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}
