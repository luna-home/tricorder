import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stardate } from '../time/stardate'

const SCRIPT = resolve(__dirname, '../../../bin/logbuch')

function hasPython(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// Calls stardate() of bin/logbuch for every ISO time. Loading the module does not open the
// database; LOGBUCH_DB still points to a temp dir so nothing can touch the real one.
function pythonStardates(times: string[]): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'tricorder-stardate-'))
  try {
    const code = [
      'import importlib.machinery, importlib.util, json, sys',
      'from datetime import datetime',
      'loader = importlib.machinery.SourceFileLoader("logbuch", sys.argv[1])',
      'spec = importlib.util.spec_from_loader("logbuch", loader)',
      'module = importlib.util.module_from_spec(spec)',
      'loader.exec_module(module)',
      'times = json.loads(sys.argv[2])',
      'print(json.dumps([module.stardate(datetime.fromisoformat(t)) for t in times]))',
    ].join('\n')
    const out = execFileSync('python3', ['-I', '-c', code, SCRIPT, JSON.stringify(times)], {
      env: { ...process.env, LOGBUCH_DB: join(dir, 'never-created.db') },
      encoding: 'utf8',
    })
    return JSON.parse(out) as string[]
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('stardate', () => {
  // The cases of test_stardate in tests/test_logbuch.py.
  it('matches the Python test cases', () => {
    expect(stardate('2026-01-01T00:00:00+00:00')).toBe('2026.000')
    expect(stardate('2026-07-02T12:00:00+00:00')).toBe('2026.500')
    expect(stardate('2026-12-31T23:59:00+00:00')).toBe('2026.999')
  })

  it('uses the wall clock of the offset, like datetime.fromisoformat', () => {
    expect(stardate('2026-10-21T22:52:00+02:00')).toBe('2026.805')
    expect(stardate('2026-10-21T22:52:00-07:00')).toBe('2026.805')
  })

  it('reads a Date on the local clock', () => {
    expect(stardate(new Date(2026, 9, 21, 22, 52))).toBe('2026.805')
    expect(stardate(new Date(2026, 0, 1))).toBe('2026.000')
  })

  it('truncates instead of rounding, also in leap years', () => {
    expect(stardate('2026-01-01T08:45:35+01:00')).toBe('2026.000')
    expect(stardate('2026-01-01T08:45:36+01:00')).toBe('2026.001')
    expect(stardate('2028-12-31T23:59:59+01:00')).toBe('2028.999')
  })

  it('rejects text that is not an ISO time', () => {
    expect(() => stardate('gestern')).toThrow(RangeError)
  })

  it.skipIf(!hasPython())('gives the same result as bin/logbuch for the same times', () => {
    const times = [
      '2026-01-01T00:00:00+00:00',
      '2026-07-02T12:00:00+00:00',
      '2026-12-31T23:59:00+00:00',
      '2026-10-21T22:52:00+02:00',
      '2026-10-22T09:15:00+02:00',
      '2026-03-29T02:30:00+01:00',
      '2026-10-25T02:30:00+02:00',
      '2026-01-01T08:45:35+01:00',
      '2026-01-01T08:45:36+01:00',
      '2027-06-15T18:00:00-05:00',
      '2028-02-29T12:00:00+01:00',
      '2028-12-31T23:59:59+01:00',
      '2026-10-21T22:52:00.123456+02:00',
      '2026-10-21T22:52:00Z',
    ]
    expect(times.map((time) => stardate(time))).toEqual(pythonStardates(times))
  })
})
