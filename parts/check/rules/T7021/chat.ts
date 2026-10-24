import type { Finding } from '../../../core/index.ts'
import type { Description } from '../../../core/internal.ts'
import { stateEntries, isStored } from '../../../core/internal.ts'
import { isOfferedToMcp } from '../../offered.ts'
import type { Rule } from '../../rule.ts'
import { at, inside, writtenIn } from '../../rule.ts'

/** The views that a screen draws, however deep, with the layouts it is shown in: the screen first. */
function viewsOf(description: Description, name: string): Record<string, unknown>[] {
  const seen = new Set<string>()
  const found: Record<string, unknown>[] = []
  const waiting = [name]
  for (let one = waiting.shift(); one !== undefined; one = waiting.shift()) {
    if (seen.has(one)) continue
    seen.add(one)
    const stored: unknown = description.screens[one] ?? description.components[one]
    if (!isStored(stored)) continue
    found.push(stored)
    if (Array.isArray(stored.uses)) waiting.push(...stored.uses.map(String))
    for (const field of ['layout', 'loading'])
      if (typeof stored[field] === 'string') waiting.push(String(stored[field]))
  }
  return found
}

/**
 * Every function, flow and member that the stored data of views read or call, by its name, and what the build read
 * of the source of each view that it calls.
 */
function namedBy(views: Record<string, unknown>[]): Set<string> {
  const found = new Set<string>()
  for (const view of views) {
    if (Array.isArray(view.calls)) for (const one of view.calls) found.add(String(one))
    inside(view.data, (record) => {
      for (const key of ['function', 'query', 'action', 'flow'])
        if (typeof record[key] === 'string') found.add(String(record[key]))
    })
  }
  return found
}

/** The states that a frame of another site cannot keep: those of the device and of the browser. */
const keptAway = (state: unknown): string[] =>
  Object.entries(stateEntries(state))
    .filter(([, entry]) => entry.in === 'device' || entry.in === 'browser')
    .map(([name]) => name)

/**
 * A screen that is offered to MCP is shown in a frame of a chat app, which reaches the app through the chat app.
 * Each function it reads or calls is a call of that function's tool, so one that is not offered to MCP is an
 * error. What a frame of another site cannot have is a warning: a member of an agent or `working`, which is
 * no tool and works only where the chat app lets the frame connect; state kept in the device or in the browser;
 * and a script that `unlock` lists. What the code of a view calls is not seen here.
 */
export const rule: Rule = {
  code: 'T7021',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const unlock: unknown = description.project.unlock
    const scripts = isStored(unlock) && Array.isArray(unlock.scripts) ? unlock.scripts.length : 0
    for (const one of writtenIn(source)) {
      const stored = Object.hasOwn(description.screens, one.name) ? description.screens[one.name] : undefined
      if (!isOfferedToMcp(stored)) continue
      const views = viewsOf(description, one.name)
      const warn = (message: string, fix: string): number =>
        found.push(at('T7021', one, undefined, message, fix, 'warning'))
      for (const name of [...namedBy(views)].sort()) {
        if (name.includes('.')) {
          warn(
            `it is offered to MCP and reads or calls \`${name}\`, which is no tool: in a frame of a chat app it works only where the chat app lets the frame connect, and is nothing elsewhere.`,
            'Read a function that is offered to MCP in its place, or keep the screen for the app alone.',
          )
          continue
        }
        const record: unknown = description.functions[name] ?? description.flows[name]
        if (record === undefined || isOfferedToMcp(record)) continue
        found.push(
          at(
            'T7021',
            one,
            undefined,
            `it is offered to MCP and reads or calls \`${name}\`, which is not offered to MCP: in a frame of a chat app it is a call of that function's tool.`,
            `Offer \`${name}\` to MCP too, with \`offer: ['mcp']\`.`,
          ),
        )
      }
      for (const state of [...keptAway(description.project.state), ...keptAway(stored?.state)])
        warn(
          `it is offered to MCP and keeps the state \`${state}\` in the device or in the browser, which a frame of another site cannot: there it starts at its default.`,
          'Keep the state in the page or in the address, or keep the screen for the app alone.',
        )
      if (scripts)
        warn(
          'it is offered to MCP, and a frame of another site loads no script that `unlock` lists.',
          'Keep what the screen needs inside the app, or keep the screen for the app alone.',
        )
    }
    return found
  },
}
