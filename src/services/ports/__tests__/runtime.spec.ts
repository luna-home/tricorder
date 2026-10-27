import { createServer, type Server } from 'node:net'
import { createSocket } from 'node:dgram'

import { afterEach, describe, expect, it } from 'vitest'

import type { ServiceContext } from '@shared/define-service'
import type { SettableServiceState, StatusReason } from '@shared/service'

import { type PortListener, type PortsContract, portsContract } from '../contract'
import { startPorts } from '../main/runtime'
import type { Runner } from '../main/scan'
import { manifest } from '../manifest'
import { DARWIN_PS, DARWIN_TCP, DARWIN_UDP } from './fixtures'

/** A `ServiceContext` that records the `list` handler and status changes, like the host. */
function fakeContext() {
  let list: (() => unknown) | undefined
  const statuses: { state: SettableServiceState; reason?: StatusReason }[] = []
  const ctx: ServiceContext<PortsContract> = {
    manifest,
    handle(_method, fn) {
      list = fn as () => unknown
    },
    emit() {},
    settings: { get: () => ({}), set: async () => ({}), onChange: () => () => {} },
    secrets: { available: () => false, get: async () => undefined, set: async () => {} },
    status: {
      set(state, reason) {
        statuses.push({ state, reason })
      },
    },
    schedule: () => () => {},
    notify() {},
    log: { info() {}, warn() {}, error() {} },
  }
  /** Calls `list` like the host: the output passes the contract schema. */
  async function call(): Promise<PortListener[]> {
    if (!list) throw new Error('no handler for list')
    return portsContract.methods.list.output.parse(await list())
  }
  return { ctx, call, statuses }
}

const fixtureRunner: Runner = async (file, args) => {
  if (file === '/bin/ps') return DARWIN_PS
  if (file.endsWith('netstat')) return args.includes('udp') ? DARWIN_UDP : DARWIN_TCP
  throw Object.assign(new Error(`spawn ${file} ENOENT`), { code: 'ENOENT' })
}

describe('startPorts', () => {
  it('leaves the status to the host on a supported platform and answers list', async () => {
    const { ctx, call, statuses } = fakeContext()
    startPorts(ctx, { platform: 'darwin', run: fixtureRunner })
    expect(statuses).toEqual([])
    expect((await call()).map(({ port }) => port)).toEqual([22, 5173, 5353, 8080, 59991, 64496])
  })

  it('is unconfigured on other platforms', async () => {
    const { ctx, call, statuses } = fakeContext()
    startPorts(ctx, { platform: 'linux', run: fixtureRunner })
    expect(statuses).toEqual([
      { state: 'unconfigured', reason: { code: 'unsupported', detail: 'linux' } },
    ])
    await expect(call()).rejects.toThrow('unsupported platform')
  })
})

// Against the real socket table of this machine.
describe.runIf(process.platform === 'darwin' || process.platform === 'win32')('live scan', () => {
  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
  })

  async function listen(host: string): Promise<number> {
    const server: Server = createServer()
    await new Promise<void>((resolve) => server.listen(0, host, resolve))
    cleanups.push(() => new Promise((resolve) => server.close(() => resolve())))
    return (server.address() as { port: number }).port
  }

  async function bindUdp(): Promise<number> {
    const socket = createSocket('udp4')
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise((resolve) => socket.close(() => resolve())))
    return socket.address().port
  }

  it('finds a TCP server and a UDP socket of this process', async () => {
    const [tcpPort, udpPort] = [await listen('127.0.0.1'), await bindUdp()]
    const { ctx, call } = fakeContext()
    startPorts(ctx)
    const listeners = await call()

    const tcp = listeners.find((item) => item.protocol === 'tcp' && item.port === tcpPort)
    expect(tcp).toMatchObject({ pid: process.pid, addresses: ['127.0.0.1'], scope: 'loopback' })
    expect(tcp?.process).toBeTruthy()
    // Path from ps on macOS; Windows has none.
    expect(Boolean(tcp?.path)).toBe(process.platform === 'darwin')

    const udp = listeners.find((item) => item.protocol === 'udp' && item.port === udpPort)
    expect(udp).toMatchObject({ pid: process.pid, scope: 'loopback' })
  })
})
