import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import { localIsoSeconds } from '../main/time'

const PYTHON_TS = `
import sys
from datetime import datetime
for ms in sys.argv[1:]:
    print(datetime.fromtimestamp(int(ms) / 1000).astimezone().isoformat(timespec="seconds"))
`

// Summer and winter time, a DST switch, fractional seconds, a leap day and a year end.
const MOMENTS = [
  Date.UTC(2026, 9, 22, 7, 15, 0),
  Date.UTC(2026, 0, 15, 23, 59, 59, 999),
  Date.UTC(2026, 2, 29, 0, 59, 59, 500),
  Date.UTC(2026, 2, 29, 1, 0, 0),
  Date.UTC(2028, 1, 29, 12, 0, 1, 1),
  Date.UTC(2026, 11, 31, 23, 30, 0),
]
const ZONES = ['Europe/Berlin', 'UTC', 'America/New_York', 'Asia/Kolkata', 'Australia/Adelaide']

function inZone<T>(zone: string, fn: () => T): T {
  const previous = process.env.TZ
  process.env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
}

describe('localIsoSeconds', () => {
  it('has the format of bin/logbuch', () => {
    expect(localIsoSeconds()).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/)
  })

  it.each(ZONES)('matches Python isoformat(timespec="seconds") in %s', (zone) => {
    const python = execFileSync('python3', ['-c', PYTHON_TS, ...MOMENTS.map(String)], {
      env: { ...process.env, TZ: zone },
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
    const node = inZone(zone, () => MOMENTS.map((ms) => localIsoSeconds(new Date(ms))))
    expect(node).toEqual(python)
  })
})
