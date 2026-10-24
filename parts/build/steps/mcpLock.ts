import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { finding, isStored } from '../../core/internal.ts'
import { textOf } from '../source.ts'
import type { Step } from '../work.ts'

/**
 * Fills the calls of each outside MCP server from `mcp.lock.json` at the root of the project, which
 * `tent mcp approve` writes: each approved tool is one call, with its description, its input and its fingerprint,
 * and the host that signs people in at the server is its `host`. A file that is no JSON of that form is T1014.
 */
export const step: Step = {
  order: 4.25,
  run: async (work) => {
    const description = work.description
    if (!description) return
    const servers = Object.keys(description.services).filter((name) => Boolean(description.services[name]?.mcp))
    const file = join(work.folder, 'mcp.lock.json')
    if (!servers.length || !existsSync(file)) return
    let lock: unknown
    try {
      lock = JSON.parse(textOf(file))
    } catch {
      lock = undefined
    }
    if (!isStored(lock)) {
      work.findings.push(
        finding('T1014', 'mcp.lock.json is no JSON of the approved tools.', {
          fix: 'Write it anew with `tent mcp approve <service>`.',
          where: { file: 'mcp.lock.json', line: 1 },
        }),
      )
      return
    }
    for (const service of servers) {
      const approved = isStored(lock[service]) && isStored(lock[service].tools) ? lock[service].tools : {}
      const stored = description.services[service]
      // The host that signs people in at the server, as it was approved, which the engine holds the server's
      // documents to: it stands in the description, so another approval of it is another version.
      const host = isStored(lock[service]) ? lock[service].host : undefined
      if (typeof host === 'string' && host !== '') stored.host = host
      const calls: Record<string, unknown> = isStored(stored.calls) ? { ...stored.calls } : {}
      for (const [tool, one] of Object.entries(approved))
        if (isStored(one) && typeof one.fingerprint === 'string')
          calls[tool] = {
            about: String(one.about ?? ''),
            schema: isStored(one.schema) ? one.schema : { type: 'object' },
            fingerprint: one.fingerprint,
          }
      stored.calls = Object.fromEntries(Object.entries(calls).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
  },
}
