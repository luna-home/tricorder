/**
 * Runs the platform's tools, merges their rows into one listener per protocol, port and
 * process, and adds path and user where the platform offers them, and the Docker containers
 * behind published ports.
 */
import { execFile } from 'node:child_process'
import { posix } from 'node:path'

import type { PortListener, PortScope } from '../contract'
import { parseNetstatDarwin, parsePs } from './darwin'
import { isDockerProcess, parseDockerPs, type PublishedPort } from './docker'
import type { RawSocket } from './socket'
import { parseNetstatWin32, parseTasklist } from './win32'

/** Runs a program without a shell and resolves with its stdout. */
export type Runner = (file: string, args: string[], timeoutMs?: number) => Promise<string>

export const TIMEOUT_MS = 5_000
/** A hanging Docker daemon must not hold up the list for long. */
export const DOCKER_TIMEOUT_MS = 2_000

export const execRunner: Runner = (file, args, timeoutMs = TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
      (error, stdout) => {
        if (!error) return resolve(stdout)
        // Keep what was printed: `ps -p` exits 1 when one of the processes is already gone.
        reject(Object.assign(error, { stdout }))
      },
    )
  })

export function isSupported(platform: NodeJS.Platform): boolean {
  return platform === 'darwin' || platform === 'win32'
}

export async function scanPorts(
  platform: NodeJS.Platform,
  run: Runner = execRunner,
): Promise<PortListener[]> {
  if (!isSupported(platform)) throw new Error(`unsupported platform: ${platform}`)
  const [listeners, published] = await Promise.all([
    platform === 'darwin' ? scanDarwin(run) : scanWin32(run),
    dockerPorts(platform, run),
  ])
  return markDocker(listeners, published)
}

/** Where the Docker CLI may live; an app started from the Finder has a minimal PATH. */
const DOCKER_CLI: Partial<Record<NodeJS.Platform, string[]>> = {
  darwin: [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ],
  win32: ['docker.exe'],
}

/** Published ports of the running containers; none without the CLI or a running daemon. */
async function dockerPorts(platform: NodeJS.Platform, run: Runner): Promise<PublishedPort[]> {
  for (const cli of DOCKER_CLI[platform] ?? []) {
    try {
      const output = await run(cli, ['ps', '--format', '{{.Names}}\t{{.Ports}}'], DOCKER_TIMEOUT_MS)
      return parseDockerPs(output)
    } catch (error) {
      // Only a missing binary moves on to the next place; a stopped daemon ends the search.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return []
    }
  }
  return []
}

/** Marks listeners on a port a container publishes, and those a Docker process holds. */
export function markDocker(listeners: PortListener[], published: PublishedPort[]): PortListener[] {
  return listeners.map((listener) => {
    const containers = published
      .filter((item) => item.protocol === listener.protocol && item.hostPort === listener.port)
      .map((item) => ({ name: item.container, port: item.containerPort }))
    const docker = containers.length || isDockerProcess(listener.process) ? { containers } : null
    return { ...listener, docker }
  })
}

async function scanDarwin(run: Runner): Promise<PortListener[]> {
  // Absolute paths: an app started from the Finder has a minimal PATH.
  const [tcp, udp] = await Promise.all([
    run('/usr/sbin/netstat', ['-anv', '-p', 'tcp']),
    run('/usr/sbin/netstat', ['-anv', '-p', 'udp']),
  ])
  const listeners = mergeSockets([...parseNetstatDarwin(tcp), ...parseNetstatDarwin(udp)])
  const pids = [...new Set(listeners.flatMap(({ pid }) => (pid === null ? [] : [pid])))]
  if (!pids.length) return listeners
  const processes = parsePs(
    await tolerant(run('/bin/ps', ['-o', 'pid=,user=,comm=', '-p', pids.join(',')])),
  )
  return listeners.map((listener) => {
    const info = listener.pid === null ? undefined : processes.get(listener.pid)
    // netstat cuts the name to 16 characters; the executable's file name is complete.
    return info
      ? { ...listener, process: posix.basename(info.path), path: info.path, user: info.user }
      : listener
  })
}

async function scanWin32(run: Runner): Promise<PortListener[]> {
  const [netstat, tasklist] = await Promise.all([
    run('netstat.exe', ['-ano']),
    tolerant(run('tasklist.exe', ['/fo', 'csv', '/nh'])),
  ])
  const names = parseTasklist(tasklist)
  return mergeSockets(
    parseNetstatWin32(netstat).map((socket) => ({
      ...socket,
      process: socket.pid === null ? null : (names.get(socket.pid) ?? null),
    })),
  )
}

/** The names and paths are extras: without them the ports still show, so a failure is empty. */
async function tolerant(output: Promise<string>): Promise<string> {
  try {
    return await output
  } catch (error) {
    const { stdout } = error as { stdout?: unknown }
    return typeof stdout === 'string' ? stdout : ''
  }
}

/** One row per protocol, port and process; sorted by port, then protocol, then pid. */
export function mergeSockets(sockets: RawSocket[]): PortListener[] {
  const merged = new Map<string, PortListener>()
  for (const socket of sockets) {
    const key = `${socket.protocol}|${socket.port}|${socket.pid ?? ''}`
    const listener = merged.get(key)
    if (!listener) {
      merged.set(key, {
        protocol: socket.protocol,
        port: socket.port,
        addresses: [socket.address],
        scope: 'interface',
        pid: socket.pid,
        process: socket.process,
        path: null,
        user: null,
        docker: null,
      })
    } else if (!listener.addresses.includes(socket.address)) {
      listener.addresses.push(socket.address)
    }
  }
  return [...merged.values()]
    .map((listener) => {
      const addresses = listener.addresses.sort(compareAddresses)
      return { ...listener, addresses, scope: scopeOf(addresses) }
    })
    .sort(
      (a, b) =>
        a.port - b.port || a.protocol.localeCompare(b.protocol) || (a.pid ?? -1) - (b.pid ?? -1),
    )
}

const WILDCARDS = new Set(['0.0.0.0', '::'])

export function scopeOf(addresses: readonly string[]): PortScope {
  if (addresses.some((address) => WILDCARDS.has(address))) return 'all'
  if (addresses.every(isLoopback)) return 'loopback'
  return 'interface'
}

function isLoopback(address: string): boolean {
  return address.startsWith('127.') || address === '::1' || address.startsWith('::ffff:127.')
}

/** IPv4 before IPv6, otherwise alphabetical: `0.0.0.0` before `::`, `127.0.0.1` before `::1`. */
function compareAddresses(a: string, b: string): number {
  return Number(a.includes(':')) - Number(b.includes(':')) || a.localeCompare(b)
}
