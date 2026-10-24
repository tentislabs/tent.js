import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { lockedTool } from '../../../connect/index.ts'
import { text } from '../../../core/index.ts'
import type { Command } from '../../command.ts'
import { commandPoint } from '../../commandPoint.ts'
import { asked } from '../../reach.ts'
import { isStored } from '../../../core/internal.ts'

/** What `mcp.lock.json` of a project holds now: nothing where it holds no record. */
function lockOf(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {}
  try {
    const read: unknown = JSON.parse(readFileSync(file, 'utf8'))
    return isStored(read) ? read : {}
  } catch {
    return {}
  }
}

/**
 * `tent mcp approve <service> [--as <user id>]`: asks an outside MCP server for its tools, through the engine, with
 * the values of its auth or with that user's connection; shows each with its description and its input; and
 * writes them with their fingerprints into `mcp.lock.json` in the project's root, in place of what it held of that
 * service. The build fills the calls of the service from there.
 */
export const command: Command = {
  name: 'mcp approve',
  args: { service: text(), as: text({ optional: true }), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const service = String(args.service)
    const answered = await asked({ folder, data: args.data }, 'mcp-tools', {
      service,
      ...(typeof args.as === 'string' ? { as: args.as } : {}),
    })
    if (!isStored(answered.value)) return answered
    const tools = Array.isArray(answered.value.tools) ? answered.value.tools.filter(isStored) : []
    const approved = Object.fromEntries(
      tools
        .map((one) => ({
          name: String(one.name),
          about: String(one.about ?? ''),
          schema: isStored(one.schema) ? one.schema : {},
        }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .map((one) => [one.name, lockedTool(one)]),
    )
    const file = join(folder, 'mcp.lock.json')
    const lock = lockOf(file)
    const was = isStored(lock[service]) ? lock[service] : {}
    // The host that signs people in at a server whose documents say so is approved with its tools.
    const host = typeof answered.value.host === 'string' ? { host: answered.value.host } : {}
    lock[service] = { ...was, ...host, tools: approved }
    const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    // What the command writes is held between two points of the history, so it can be gone back from.
    await commandPoint(folder)
    writeFileSync(file, `${JSON.stringify(sorted, null, 2)}\n`)
    await commandPoint(folder)
    return {
      value: {
        written: 'mcp.lock.json',
        tools: Object.entries(approved).map(([name, one]) => ({
          name: `${service}.${name}`,
          about: one.about,
          input: one.schema,
        })),
      },
      findings: answered.findings ?? [],
    }
  },
}
