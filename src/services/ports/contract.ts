/**
 * Contract of the ports service: which ports on this machine are taken right now and which
 * program holds them. Read-only; the service reads the operating system's socket table
 * (`netstat`), it does not probe ports.
 */
import { z } from 'zod'

import { defineContract } from '@shared/contract'

/** One listening socket per protocol, port and process; IPv4 and IPv6 rows are merged. */
export const listenerSchema = z.object({
  protocol: z.enum(['tcp', 'udp']),
  port: z.number().int().min(1).max(65535),
  /** Local addresses the process listens on, e.g. `['0.0.0.0', '::']` or `['127.0.0.1']`. */
  addresses: z.array(z.string()),
  /** `all`: every interface, `loopback`: this machine only, `interface`: specific addresses. */
  scope: z.enum(['all', 'loopback', 'interface']),
  pid: z.number().int().min(0).nullable(),
  /**
   * Program name: the file name of `path` (macOS), else as `netstat` (cut to 16 characters) or
   * `tasklist` (Windows) reports it.
   */
  process: z.string().nullable(),
  /** Executable as `ps` reports it (macOS), usually the full path; `null` on Windows. */
  path: z.string().nullable(),
  /** Owner of the process (macOS); `null` on Windows. */
  user: z.string().nullable(),
  /**
   * Set when the port belongs to Docker: a running container publishes it, or a Docker process
   * holds it. `containers` is empty when the Docker CLI is missing or Docker is not running.
   */
  docker: z
    .object({
      containers: z.array(z.object({ name: z.string(), port: z.number().int().min(1) })),
    })
    .nullable(),
})

export const portsContract = defineContract({
  methods: {
    /** Snapshot of every listening TCP port and bound UDP port, sorted by port, then protocol. */
    list: {
      input: z.void(),
      output: z.array(listenerSchema),
    },
  },
})

export type PortsContract = typeof portsContract
export type PortListener = z.output<typeof listenerSchema>
export type PortScope = PortListener['scope']
