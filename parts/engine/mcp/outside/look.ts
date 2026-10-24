import type { Description } from '../../../core/internal.ts'
import { storedLimit } from '../../limits.ts'
import type { Opened } from '../../opened.ts'
import { servicesOf } from '../../services/env.ts'
import { foundOf } from './found.ts'
import { isStored } from '../../../core/internal.ts'

// The looks under way, so that runs that start together wait for the same one.
const underWay = new WeakMap<Opened, Map<string, Promise<void>>>()

/** The services of a description that are outside MCP servers. */
export const outsideServices = (description: Description): string[] =>
  Object.keys(description.services).filter((name) => Boolean(description.services[name]?.mcp))

/** Whether a server is signed in to with the connection of a user. */
export const byUser = (description: Description, service: string): boolean => {
  const { auth, mcp } = description.services[service] ?? {}
  // A program started for each user is looked at with the run's user, as an auth of each user is.
  return (isStored(auth) && auth.oauth !== undefined) || (isStored(mcp) && mcp.per === 'user')
}

/** The tools of a service that its approval wrote, each with its fingerprint. */
function approvedOf(description: Description, service: string): Record<string, string> {
  const calls = description.services[service]?.calls
  const approved: Record<string, string> = {}
  for (const [tool, call] of Object.entries(isStored(calls) ? calls : {}))
    if (isStored(call) && typeof call.fingerprint === 'string') approved[tool] = call.fingerprint
  return approved
}

/**
 * Asks a server for its tools now, and holds back each approved tool that is not as it was approved, or is gone.
 * The log says so for each such tool. A server that cannot be asked is no look: what the last look held back stays
 * held, and the next run looks again.
 */
async function looked(o: Opened, service: string, user: string | undefined): Promise<void> {
  const key = `${o.version} ${service} ${user ?? ''}`
  const kept = foundOf(o)
  const approved = approvedOf(o.description, service)
  const { toolPrint } = await import('../../../connect/index.ts')
  let listed: { name: string; about: string; schema: object }[]
  try {
    listed = await (await servicesOf(o)).tools(service, {
      version: o.version,
      ...(user === undefined ? {} : { for: user }),
    })
  } catch {
    return
  }
  const now = new Map(listed.map((one) => [one.name, toolPrint(one)]))
  const held = new Set(Object.keys(approved).filter((tool) => now.get(tool) !== approved[tool]))
  for (const tool of held)
    o.log.write('lines', {
      at: o.clock.now(),
      level: 'warn',
      message: `The tool ${tool} of ${service} is not as it was approved, and is held back: run \`tent mcp approve ${service}\`.`,
    })
  kept.set(key, { held, at: o.clock.now() })
}

/**
 * Takes an app, the outside servers a run offers and the user it acts for. Answers once each server was looked at
 * within `limits.toolsLook`: a server with a fixed auth once for the app, one with `oauth` with that user's
 * connection. A run that comes first after a start, or once the look is due, waits for it.
 */
export async function lookedAt(o: Opened, services: string[], user: string | undefined): Promise<void> {
  const every = storedLimit(o.description, 'toolsLook')
  const waiting = underWay.get(o) ?? new Map<string, Promise<void>>()
  underWay.set(o, waiting)
  await Promise.all(
    services.map((service) => {
      const who = byUser(o.description, service) ? user : undefined
      const key = `${o.version} ${service} ${who ?? ''}`
      const last = foundOf(o).get(key)
      if (last && o.clock.now() - last.at < every) return undefined
      const going = waiting.get(key) ?? looked(o, service, who).finally(() => waiting.delete(key))
      waiting.set(key, going)
      return going
    }),
  )
}
