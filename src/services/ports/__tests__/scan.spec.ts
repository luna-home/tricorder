import { describe, expect, it } from 'vitest'

import { DOCKER_TIMEOUT_MS, mergeSockets, type Runner, scanPorts, scopeOf } from '../main/scan'
import {
  DARWIN_PS,
  DARWIN_TCP,
  DARWIN_UDP,
  DOCKER_PS,
  WIN32_NETSTAT_EN,
  WIN32_TASKLIST,
} from './fixtures'

/** Answers by program and arguments; anything else fails like a missing program. */
function fakeRunner(outputs: Record<string, string | Error>): Runner & { calls: string[] } {
  const calls: string[] = []
  const run = async (file: string, args: string[]) => {
    const key = [file, ...args].join(' ')
    calls.push(key)
    const output = outputs[key] ?? outputs[file]
    if (output === undefined) {
      throw Object.assign(new Error(`spawn ${file} ENOENT`), { code: 'ENOENT' })
    }
    if (output instanceof Error) throw output
    return output
  }
  return Object.assign(run, { calls })
}

const darwinOutputs = {
  '/usr/sbin/netstat -anv -p tcp': DARWIN_TCP,
  '/usr/sbin/netstat -anv -p udp': DARWIN_UDP,
  '/bin/ps': DARWIN_PS,
}

describe('scopeOf', () => {
  it('tells all interfaces, loopback and specific addresses apart', () => {
    expect(scopeOf(['0.0.0.0'])).toBe('all')
    expect(scopeOf(['127.0.0.1', '::'])).toBe('all')
    expect(scopeOf(['127.0.0.1', '::1'])).toBe('loopback')
    expect(scopeOf(['127.0.0.1', '10.0.0.2'])).toBe('interface')
  })
})

describe('mergeSockets', () => {
  it('merges IPv4 and IPv6 rows of one process and keeps processes apart', () => {
    const listeners = mergeSockets([
      { protocol: 'tcp', address: '::', port: 80, pid: 7, process: 'httpd' },
      { protocol: 'tcp', address: '0.0.0.0', port: 80, pid: 7, process: 'httpd' },
      { protocol: 'tcp', address: '0.0.0.0', port: 80, pid: 7, process: 'httpd' },
      { protocol: 'udp', address: '0.0.0.0', port: 80, pid: 7, process: 'httpd' },
      { protocol: 'tcp', address: '127.0.0.1', port: 22, pid: 9, process: 'a' },
      { protocol: 'tcp', address: '10.0.0.2', port: 22, pid: 8, process: 'b' },
    ])
    expect(
      listeners.map(({ protocol, port, pid, addresses, scope }) => [
        protocol,
        port,
        pid,
        addresses,
        scope,
      ]),
    ).toEqual([
      ['tcp', 22, 8, ['10.0.0.2'], 'interface'],
      ['tcp', 22, 9, ['127.0.0.1'], 'loopback'],
      ['tcp', 80, 7, ['0.0.0.0', '::'], 'all'],
      ['udp', 80, 7, ['0.0.0.0'], 'all'],
    ])
  })
})

describe('scanPorts', () => {
  it('darwin: merges netstat rows and adds path and user from one ps call', async () => {
    const run = fakeRunner(darwinOutputs)
    const listeners = await scanPorts('darwin', run)
    expect(listeners.map(({ protocol, port }) => `${protocol}/${port}`)).toEqual([
      'tcp/22',
      'tcp/5173',
      'udp/5353',
      'tcp/8080',
      'tcp/59991',
      'tcp/64496',
    ])
    expect(listeners[0]).toEqual({
      protocol: 'tcp',
      port: 22,
      addresses: ['0.0.0.0', '::'],
      scope: 'all',
      pid: 1,
      process: 'launchd',
      path: '/sbin/launchd',
      user: 'root',
      docker: null,
    })
    // The full name from the path instead of netstat's cut one.
    expect(listeners.find(({ port }) => port === 59991)?.process).toBe('Code Helper (Plugin)')
    expect(listeners.find(({ port }) => port === 8080)?.process).toBe('com.docker.backend')
    // Spotify is not in the ps output: name from netstat, no path or user.
    expect(listeners[2]).toMatchObject({ process: 'Spotify', path: null, user: null })
    expect(run.calls.filter((call) => call.startsWith('/bin/ps'))).toEqual([
      '/bin/ps -o pid=,user=,comm= -p 1,1686,1813,3047,94757,653',
    ])
  })

  it('darwin: a failing ps keeps the ports and what it printed', async () => {
    const gone = Object.assign(new Error('Command failed: ps'), {
      stdout: '    1 root /sbin/launchd\n',
    })
    const listeners = await scanPorts('darwin', fakeRunner({ ...darwinOutputs, '/bin/ps': gone }))
    expect(listeners).toHaveLength(6)
    expect(listeners[0]?.path).toBe('/sbin/launchd')
    expect(listeners.slice(1).every(({ path }) => path === null)).toBe(true)
  })

  it('darwin: a failing netstat fails the call', async () => {
    const run = fakeRunner({ ...darwinOutputs, '/usr/sbin/netstat -anv -p udp': new Error('boom') })
    await expect(scanPorts('darwin', run)).rejects.toThrow('boom')
  })

  it('win32: names from tasklist, no path or user', async () => {
    const listeners = await scanPorts(
      'win32',
      fakeRunner({ 'netstat.exe': WIN32_NETSTAT_EN, 'tasklist.exe': WIN32_TASKLIST }),
    )
    expect(
      listeners.map(({ protocol, port, process, scope }) => [protocol, port, process, scope]),
    ).toEqual([
      ['tcp', 135, 'svchost.exe', 'all'],
      ['tcp', 445, 'System', 'all'],
      ['udp', 1900, null, 'interface'],
      ['tcp', 5173, 'node.exe', 'loopback'],
      ['udp', 5353, 'Spooler "Print".exe', 'all'],
    ])
    expect(listeners.every(({ path, user }) => path === null && user === null)).toBe(true)
  })

  it('win32: without tasklist the ports still show', async () => {
    const listeners = await scanPorts('win32', fakeRunner({ 'netstat.exe': WIN32_NETSTAT_EN }))
    expect(listeners).toHaveLength(5)
    expect(listeners.every(({ process }) => process === null)).toBe(true)
  })

  it('names the container behind a published port, the CLI is looked up in turn', async () => {
    const run = fakeRunner({ ...darwinOutputs, '/opt/homebrew/bin/docker': DOCKER_PS })
    const listeners = await scanPorts('darwin', run)
    expect(listeners.find(({ port }) => port === 8080)?.docker).toEqual({
      containers: [{ name: 'web-1', port: 80 }],
    })
    expect(listeners.filter(({ docker }) => docker)).toHaveLength(1)
    expect(run.calls.filter((call) => call.includes('docker '))).toEqual([
      '/usr/local/bin/docker ps --format {{.Names}}\t{{.Ports}}',
      '/opt/homebrew/bin/docker ps --format {{.Names}}\t{{.Ports}}',
    ])
  })

  it('marks Docker processes without the CLI; a stopped daemon ends the lookup', async () => {
    const stopped = Object.assign(new Error('Cannot connect to the Docker daemon'), { code: 1 })
    const run = fakeRunner({ ...darwinOutputs, '/usr/local/bin/docker': stopped })
    const listeners = await scanPorts('darwin', run)
    expect(listeners.find(({ port }) => port === 8080)?.docker).toEqual({ containers: [] })
    expect(listeners.find(({ port }) => port === 22)?.docker).toBeNull()
    expect(run.calls.filter((call) => call.includes('docker '))).toHaveLength(1)
  })

  it('gives the Docker CLI a shorter timeout', async () => {
    const timeouts: (number | undefined)[] = []
    const fake = fakeRunner({ ...darwinOutputs, '/usr/local/bin/docker': DOCKER_PS })
    const run: Runner = async (file, args, timeoutMs) => {
      if (file.endsWith('docker')) timeouts.push(timeoutMs)
      return fake(file, args)
    }
    await scanPorts('darwin', run)
    expect(timeouts).toEqual([DOCKER_TIMEOUT_MS])
  })

  it('rejects other platforms', async () => {
    await expect(scanPorts('linux', fakeRunner({}))).rejects.toThrow('unsupported platform: linux')
  })
})
