import { describe, expect, it } from 'vitest'

import { parseNetstatDarwin, parsePs } from '../main/darwin'
import { splitHostPort } from '../main/socket'
import { parseNetstatWin32, parseTasklist } from '../main/win32'
import {
  DARWIN_PS,
  DARWIN_TCP,
  DARWIN_UDP,
  WIN32_NETSTAT_DE,
  WIN32_NETSTAT_EN,
  WIN32_TASKLIST,
} from './fixtures'

describe('splitHostPort', () => {
  it('splits at the last separator', () => {
    expect(splitHostPort('127.0.0.1.8080', '.')).toEqual({ host: '127.0.0.1', port: 8080 })
    expect(splitHostPort('::1.5173', '.')).toEqual({ host: '::1', port: 5173 })
    expect(splitHostPort('[::1]:5173', ':')).toEqual({ host: '[::1]', port: 5173 })
  })

  it('rejects a missing or invalid port', () => {
    expect(splitHostPort('*.*', '.')).toBeNull()
    expect(splitHostPort('0.0.0.0:0', ':')).toBeNull()
    expect(splitHostPort('localhost', ':')).toBeNull()
  })
})

describe('parseNetstatDarwin', () => {
  it('reads listening TCP sockets, also of root and with spaces in the name', () => {
    expect(parseNetstatDarwin(DARWIN_TCP)).toEqual([
      { protocol: 'tcp', address: '0.0.0.0', port: 64496, pid: 653, process: 'rapportd' },
      { protocol: 'tcp', address: '::', port: 64496, pid: 653, process: 'rapportd' },
      { protocol: 'tcp', address: '::1', port: 5173, pid: 1686, process: 'node' },
      {
        protocol: 'tcp',
        address: '127.0.0.1',
        port: 59991,
        pid: 94757,
        process: 'Code Helper (Plu',
      },
      { protocol: 'tcp', address: '0.0.0.0', port: 22, pid: 1, process: 'launchd' },
      { protocol: 'tcp', address: '::', port: 22, pid: 1, process: 'launchd' },
      {
        protocol: 'tcp',
        address: '10.111.100.161',
        port: 8080,
        pid: 3047,
        process: 'com.docker.backe',
      },
    ])
  })

  it('reads bound UDP sockets and skips connected ones and those without a port', () => {
    const sockets = parseNetstatDarwin(DARWIN_UDP)
    expect(sockets.map(({ address, port, process }) => [address, port, process])).toEqual([
      ['::', 5353, 'Spotify'],
      ['0.0.0.0', 5353, 'Spotify'],
      ['0.0.0.0', 5353, 'Spotify'],
    ])
    expect(sockets.every(({ protocol }) => protocol === 'udp')).toBe(true)
  })

  it('ignores headers and empty input', () => {
    expect(parseNetstatDarwin('')).toEqual([])
    expect(parseNetstatDarwin(DARWIN_TCP.split('\n').slice(0, 2).join('\n'))).toEqual([])
  })
})

describe('parsePs', () => {
  it('maps pid to user and executable, paths may contain spaces', () => {
    const processes = parsePs(DARWIN_PS)
    expect(processes.get(1)).toEqual({ user: 'root', path: '/sbin/launchd' })
    expect(processes.get(1686)).toEqual({ user: 'pkuckelsberg', path: 'node' })
    expect(processes.get(94757)?.path).toBe(
      '/Applications/Visual Studio Code.app/Contents/Frameworks/Code Helper (Plugin).app/Contents/MacOS/Code Helper (Plugin)',
    )
    expect(processes.size).toBe(5)
  })
})

describe('parseNetstatWin32', () => {
  it('reads listening TCP and bound UDP sockets, IPv6 without brackets', () => {
    expect(parseNetstatWin32(WIN32_NETSTAT_EN)).toEqual([
      { protocol: 'tcp', address: '0.0.0.0', port: 135, pid: 1032, process: null },
      { protocol: 'tcp', address: '0.0.0.0', port: 445, pid: 4, process: null },
      { protocol: 'tcp', address: '127.0.0.1', port: 5173, pid: 8812, process: null },
      { protocol: 'tcp', address: '::', port: 135, pid: 1032, process: null },
      { protocol: 'tcp', address: '::1', port: 5173, pid: 8812, process: null },
      { protocol: 'udp', address: '0.0.0.0', port: 5353, pid: 2340, process: null },
      {
        protocol: 'udp',
        address: 'fe80::1c2b:3d4e:5f60:7182%12',
        port: 1900,
        pid: 4400,
        process: null,
      },
    ])
  })

  it('does not depend on the language of the state column', () => {
    expect(parseNetstatWin32(WIN32_NETSTAT_DE)).toEqual([
      { protocol: 'tcp', address: '0.0.0.0', port: 135, pid: 1032, process: null },
      { protocol: 'udp', address: '::', port: 500, pid: 4840, process: null },
    ])
  })
})

describe('parseTasklist', () => {
  it('maps pid to image name, with escaped quotes', () => {
    const names = parseTasklist(WIN32_TASKLIST)
    expect(names.get(4)).toBe('System')
    expect(names.get(8812)).toBe('node.exe')
    expect(names.get(2340)).toBe('Spooler "Print".exe')
    expect(names.size).toBe(5)
  })
})
