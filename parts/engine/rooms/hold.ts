import { basename } from 'node:path'
import type { Description } from '../../core/internal.ts'
import type { CallContext } from '../context.ts'
import { notAllowedOut, packagesReaching } from './held/refused.ts'
import type { Hold, ProgramStart } from './room.ts'

/** `hold` of a project as it is stored, or nothing where it states none. */
export function holdOf(description: Description): Hold | undefined {
  const hold: unknown = description.project.hold
  if (hold === true) return true
  if (typeof hold !== 'object' || hold === null) return undefined
  const names = (key: string): readonly string[] => {
    const listed: unknown = Reflect.get(hold, key)
    return Array.isArray(listed) ? listed.map(String) : []
  }
  return { net: names('net'), programs: names('programs'), native: names('native') }
}

/** What one list of a hold names: none for `hold: true`. */
const namedIn = (hold: Hold, key: 'net' | 'programs' | 'native'): readonly string[] =>
  hold === true ? [] : (hold[key] ?? [])

/**
 * Takes the call that is under way and what it fetches. Holds an action of an app that states `hold` to the hosts
 * that its `net` names, in every room: answers nothing where no hold applies, and otherwise a promise refused with
 * T0035, naming the packages that reach the network, for any other host. `connect` is loaded for a held app alone.
 */
export function heldNet(cx: CallContext, asked: Parameters<typeof fetch>): Promise<void> | undefined {
  if (cx.work.kind !== 'action') return undefined
  const hold = holdOf(cx.app.description)
  if (hold === undefined) return undefined
  const [input] = asked
  const url = new URL(input instanceof Request ? input.url : input instanceof URL ? input.href : String(input))
  // An address of data is no way out.
  if (url.protocol === 'data:') return undefined
  const host = url.hostname.replace(/\.$/, '')
  const port = url.port ? Number(url.port) : undefined
  return import('../../connect/index.ts').then(({ listedIn }) => {
    if (listedIn(namedIn(hold, 'net'), { host, ...(port === undefined ? {} : { port }) })) return
    throw notAllowedOut(cx.work.name, packagesReaching(cx.app.description, 'net'), `a fetch to ${host}`)
  })
}

/**
 * Takes the description of a version a room loads. Holds the packages of an app that states `hold` which load a
 * native module, by the map, to those its `native` names, in every room: T0035, naming the others.
 */
export function heldNative(description: Description): void {
  const hold = holdOf(description)
  if (hold === undefined) return
  const named = namedIn(hold, 'native')
  const others = packagesReaching(description, 'native').filter((name) => !named.includes(name))
  if (others.length) throw notAllowedOut(`The app ${description.app.name}`, others, 'a native module')
}

/**
 * Takes the description of an app and a program it starts. Holds the program of an outside MCP server of an app
 * that states `hold` to those its `programs` names, in every room: T0035 for any other. The program of a `python`
 * and its installing are the framework's own, and pass.
 */
export function heldProgram(description: Description, start: ProgramStart): void {
  if (start.for !== 'mcp') return
  const hold = holdOf(description)
  if (hold === undefined) return
  const name = basename(start.command).replace(/\.(exe|cmd|bat)$/i, '')
  if (namedIn(hold, 'programs').includes(name)) return
  throw notAllowedOut(
    `The app ${description.app.name}`,
    packagesReaching(description, 'programs'),
    `the program ${name}`,
  )
}
