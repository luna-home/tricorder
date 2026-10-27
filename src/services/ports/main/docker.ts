/**
 * Docker: `docker ps --format '{{.Names}}\t{{.Ports}}'` names the container behind a published
 * host port. Docker Desktop forwards those ports through its own process, so netstat alone only
 * shows `com.docker.backend`.
 */

/** Processes that hold ports for Docker containers (Docker Desktop, the Linux proxy, WSL). */
const DOCKER_PROCESSES = new Set([
  'com.docker.backend',
  'com.docker.vpnkit',
  'vpnkit',
  'docker-proxy',
  'wslrelay',
])

export function isDockerProcess(name: string | null): boolean {
  return !!name && DOCKER_PROCESSES.has(name.toLowerCase().replace(/\.exe$/, ''))
}

/** A host port that a running container publishes. */
export interface PublishedPort {
  protocol: 'tcp' | 'udp'
  hostPort: number
  container: string
  containerPort: number
}

// `0.0.0.0:3000->3000/tcp`, `[::]:8000-8002->80-82/tcp`, `127.0.0.1:53->53/udp`; an exposed but
// unpublished port (`3306/tcp`) has no `->` and is skipped.
const MAPPING = /(?:\S*:)?(\d+)(?:-(\d+))?->(\d+)(?:-(\d+))?\/(tcp|udp)/g

/** One entry per container, host port and protocol (the IPv4 and IPv6 bindings collapse). */
export function parseDockerPs(text: string): PublishedPort[] {
  const ports = new Map<string, PublishedPort>()
  for (const line of text.split(/\r?\n/)) {
    const [container, mappings] = line.split('\t')
    if (!container || !mappings) continue
    for (const match of mappings.matchAll(MAPPING)) {
      const [, hostFrom, hostTo, containerFrom, , protocol] = match as unknown as string[]
      const first = Number(hostFrom)
      const last = hostTo ? Number(hostTo) : first
      for (let hostPort = first; hostPort <= last; hostPort++) {
        const containerPort = Number(containerFrom) + hostPort - first
        const key = `${protocol}|${hostPort}|${container}`
        ports.set(key, {
          protocol: protocol as PublishedPort['protocol'],
          hostPort,
          container,
          containerPort,
        })
      }
    }
  }
  return [...ports.values()]
}
