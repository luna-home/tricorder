/**
 * macOS: `netstat -anv -p tcp|udp` lists every socket with `process:pid`, also those of root
 * and other users (`lsof` without sudo only sees the user's own). `ps` adds path and user.
 */
import { type RawSocket, splitHostPort } from './socket'

// proto, recv-q, send-q, local, foreign, optional state, rxbytes, txbytes, rhiwat, shiwat,
// process:pid, then the 5-digit hex `state` column. The process name is cut to 16 characters
// and may contain spaces and colons ("Code Helper (Plu:94757"), so it is anchored on both sides.
const LINE =
  /^(tcp|udp)(46|4|6)\s+\d+\s+\d+\s+(\S+)\s+(\S+)\s+(?:([A-Z_0-9]+)\s+)?\d+\s+\d+\s+\d+\s+\d+\s+(.+?):(\d+)\s+[0-9a-f]{5}\s/

/** Listening TCP sockets (`LISTEN`) and bound, unconnected UDP sockets with a port. */
export function parseNetstatDarwin(text: string): RawSocket[] {
  const sockets: RawSocket[] = []
  for (const line of text.split('\n')) {
    const match = LINE.exec(line)
    if (!match) continue
    const [, protocol, family, local, foreign, state, name, pid] = match as unknown as string[]
    if (protocol === 'tcp' ? state !== 'LISTEN' : foreign !== '*.*') continue
    const endpoint = splitHostPort(local!, '.')
    if (!endpoint) continue
    for (const address of addressesOf(endpoint.host, family!)) {
      sockets.push({
        protocol: protocol as RawSocket['protocol'],
        address,
        port: endpoint.port,
        pid: Number(pid),
        process: name!.trim(),
      })
    }
  }
  return sockets
}

/** `*` is the wildcard; on a dual-stack socket (`tcp46`) it stands for both families. */
function addressesOf(host: string, family: string): string[] {
  if (host !== '*') return [host]
  if (family === '4') return ['0.0.0.0']
  if (family === '6') return ['::']
  return ['0.0.0.0', '::']
}

export interface ProcessInfo {
  user: string
  /** `comm`: the executable, usually as a full path. */
  path: string
}

/** Output of `ps -o pid=,user=,comm= -p <pids>`. */
export function parsePs(text: string): Map<number, ProcessInfo> {
  const processes = new Map<number, ProcessInfo>()
  for (const line of text.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)\s+(.+?)\s*$/.exec(line)
    if (match) processes.set(Number(match[1]), { user: match[2]!, path: match[3]! })
  }
  return processes
}
