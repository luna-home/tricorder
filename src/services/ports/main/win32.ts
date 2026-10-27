/**
 * Windows: `netstat -ano` lists sockets with the owning PID, `tasklist /fo csv /nh` maps PIDs to
 * image names. Both are localized (a German Windows writes `ABHÖREN` for `LISTENING`), so
 * nothing here depends on the state text or the headers.
 */
import { type RawSocket, splitHostPort } from './socket'

/** A TCP socket listens when its foreign address is unset; that holds in every language. */
const UNSET_FOREIGN = new Set(['0.0.0.0:0', '[::]:0'])

/** Listening TCP sockets and UDP sockets bound to a port. */
export function parseNetstatWin32(text: string): RawSocket[] {
  const sockets: RawSocket[] = []
  for (const line of text.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    // TCP: proto, local, foreign, state, pid. UDP: proto, local, foreign, pid.
    const protocol = fields[0]?.toLowerCase()
    if (
      !(protocol === 'tcp' && fields.length === 5) &&
      !(protocol === 'udp' && fields.length === 4)
    ) {
      continue
    }
    const [, local, foreign] = fields as [string, string, string]
    if (protocol === 'tcp' ? !UNSET_FOREIGN.has(foreign) : foreign !== '*:*') continue
    const endpoint = splitHostPort(local, ':')
    const pid = fields.at(-1)!
    if (!endpoint || !/^\d+$/.test(pid)) continue
    sockets.push({
      protocol,
      address: endpoint.host.replace(/^\[(.*)\]$/, '$1'),
      port: endpoint.port,
      pid: Number(pid),
      process: null,
    })
  }
  return sockets
}

/** Output of `tasklist /fo csv /nh`: `"name","pid","session","#","memory"` per line. */
export function parseTasklist(text: string): Map<number, string> {
  const names = new Map<number, string>()
  for (const line of text.split(/\r?\n/)) {
    const cells = [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((cell) =>
      cell[1]!.replace(/""/g, '"'),
    )
    const [name, pid] = cells
    if (name && pid && /^\d+$/.test(pid)) names.set(Number(pid), name)
  }
  return names
}
