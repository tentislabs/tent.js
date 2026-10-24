import type { Admin } from '../admin.ts'
import { wordOf } from '../admin.ts'
import { servicesOf } from '../services/env.ts'

/**
 * `tent mcp approve <service>`: asks an outside MCP server for its tools now, with the values of its auth, or
 * with `as` with the connection of that user. Answers each tool with its description and its input, and for a
 * server that says in its own documents where it signs people in, the host that does.
 */
export const admin: Admin = {
  name: 'mcp-tools',
  async run(o, args) {
    const service = wordOf(args, 'service', 'the name of an outside MCP server')
    const as: unknown = Reflect.get(args, 'as')
    const { discoverAll, discovering, signInHost } = await import('../mcp/outside/discover.ts')
    if (discovering(o).includes(service) && signInHost(o, service) === undefined) await discoverAll(o)
    const tools = await (await servicesOf(o)).tools(service, {
      version: o.version,
      ...(typeof as === 'string' ? { for: as } : {}),
    })
    const host = signInHost(o, service)
    return { tools, ...(host === undefined ? {} : { host }) }
  },
}
