/** One listening socket as a platform parser reads it, before rows are merged. */
export interface RawSocket {
  protocol: 'tcp' | 'udp'
  /** Local address without port; wildcards as `0.0.0.0` (IPv4) or `::` (IPv6). */
  address: string
  port: number
  pid: number | null
  process: string | null
}

/** Splits `host<sep>port` at the last separator; `null` when the port is not a number (`*`). */
export function splitHostPort(
  value: string,
  separator: '.' | ':',
): { host: string; port: number } | null {
  const at = value.lastIndexOf(separator)
  if (at < 0) return null
  const port = Number(value.slice(at + 1))
  if (!/^\d+$/.test(value.slice(at + 1)) || port < 1 || port > 65535) return null
  return { host: value.slice(0, at), port }
}
