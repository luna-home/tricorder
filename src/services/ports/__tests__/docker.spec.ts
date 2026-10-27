import { describe, expect, it } from 'vitest'

import { isDockerProcess, parseDockerPs } from '../main/docker'
import { DOCKER_PS } from './fixtures'

describe('parseDockerPs', () => {
  it('reads published ports, expands ranges and skips unpublished ones', () => {
    expect(parseDockerPs(DOCKER_PS)).toEqual([
      { protocol: 'tcp', hostPort: 8080, container: 'web-1', containerPort: 80 },
      { protocol: 'udp', hostPort: 1053, container: 'dns-1', containerPort: 53 },
      { protocol: 'tcp', hostPort: 7000, container: 'range-1', containerPort: 9000 },
      { protocol: 'tcp', hostPort: 7001, container: 'range-1', containerPort: 9001 },
    ])
  })

  it('ignores empty output', () => {
    expect(parseDockerPs('')).toEqual([])
  })
})

describe('isDockerProcess', () => {
  it('knows the processes that forward container ports', () => {
    expect(isDockerProcess('com.docker.backend')).toBe(true)
    expect(isDockerProcess('com.docker.backend.exe')).toBe(true)
    expect(isDockerProcess('wslrelay.exe')).toBe(true)
    expect(isDockerProcess('docker-proxy')).toBe(true)
    expect(isDockerProcess('node')).toBe(false)
    expect(isDockerProcess(null)).toBe(false)
  })
})
