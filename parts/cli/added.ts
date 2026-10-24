import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { Terminal } from '../core/index.ts'
import { ownedHere } from '../connect/index.ts'
import { writeLauncher } from './launcher.ts'

/** What is kept of an address that was added: its address and the name of its launcher. */
interface Added {
  address: string
  name: string
}

// The runner's own rule for the name of a command it writes a launcher of: small letters, digits and hyphens.
const commandName = /^[a-z0-9][a-z0-9-]*$/

/** The scheme, the host and the port of an address, in small letters. */
export const originOf = (address: string): string => new URL(address).origin.toLowerCase()

/** The folder that the runner keeps an app of a server under: `cli/<host>/`, a colon before a port written as a hyphen. */
const keptFolder = (home: string, address: string): string =>
  join(home, 'cli', new URL(address).host.toLowerCase().replace(':', '-'))

/** What was added of an address, or nothing. */
function addedOf(home: string, address: string): Added | undefined {
  try {
    const read: unknown = JSON.parse(readFileSync(join(keptFolder(home, address), 'added.json'), 'utf8'))
    const added: Record<string, unknown> = Object(read)
    return typeof added.address === 'string' && typeof added.name === 'string'
      ? { address: added.address, name: added.name }
      : undefined
  } catch {
    return undefined
  }
}

/** Every address that was added, by the folders the runner keeps. */
function allAdded(home: string): Added[] {
  const folder = join(home, 'cli')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .map((one) => {
      try {
        return JSON.parse(readFileSync(join(folder, one, 'added.json'), 'utf8'))
      } catch {
        return undefined
      }
    })
    .filter((one): one is Added => typeof one?.address === 'string' && typeof one?.name === 'string')
}

/** Whether the terminal of this computer finds a command of that name on the path it searches. */
function found(name: string): boolean {
  // The path that a terminal searches is the one thing of the environment that says what it finds.
  const path = process.env.PATH ?? process.env.Path ?? ''
  const endings = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat', '.com'] : ['']
  return path
    .split(delimiter)
    .filter(Boolean)
    .some((folder) =>
      endings.some((ending) => {
        try {
          return statSync(join(folder, `${name}${ending}`)).isFile()
        } catch {
          return false
        }
      }),
    )
}

/**
 * `tent cli add <address>`: takes the name of the app's command from the server, holds it to the runner's own
 * rule, asks the person for a yes once, and writes the launcher into `bin/` of the runner's folder. Refused for
 * `tent`, a name that is the launcher of another address, and a name the terminal already finds, unless `--name`
 * gives another. Answers how it ends.
 */
export async function add(o: {
  home: string
  address: string
  name?: string
  yes: boolean
  terminal: Terminal
  listed(): Promise<{ name: string } | undefined>
}): Promise<number> {
  const { terminal } = o
  const kept = addedOf(o.home, o.address)
  const listed = o.name === undefined ? await o.listed() : undefined
  const name = o.name ?? listed?.name
  if (!name) {
    terminal.error(`The app at ${o.address} names no command it can be added under. Give one with --name.\n`)
    return 2
  }
  if (!commandName.test(name) || name === 'tent') {
    terminal.error(
      `The command of ${o.address} would be named ${name.slice(0, 40)}, which the runner does not take. Give another with --name.\n`,
    )
    return 2
  }
  if (kept && kept.name !== name) {
    terminal.error(`${o.address} is added already, as ${kept.name}. Remove it first: tent cli remove ${o.address}\n`)
    return 2
  }
  const theirs = launchersOf(o.home, name).find((one) => !ownedHere(one))
  if (theirs) {
    terminal.error(`${theirs} was written by another user of this computer: it is not written over, and not run.\n`)
    return 2
  }
  const other = allAdded(o.home).find((one) => one.name === name && originOf(one.address) !== originOf(o.address))
  if (other) {
    terminal.error(`${name} is the launcher of ${other.address} already. Give another name with --name.\n`)
    return 2
  }
  if (o.name === undefined && !kept && found(name)) {
    terminal.error(`The terminal already finds a command named ${name}. Give another name with --name.\n`)
    return 2
  }
  if (!o.yes) {
    terminal.error(
      `The commands of ${o.address} run code of that server on this computer, with your rights, as the command ${name}.\n`,
    )
    if (!terminal.interactive) {
      terminal.error('No person is here to answer. Type --yes to add it all the same.\n')
      return 2
    }
    terminal.error('Add it? (y/n) ')
    if (!/^(y|yes)$/i.test((await terminal.line())?.trim() ?? '')) return 1
  }
  const folder = keptFolder(o.home, o.address)
  writeLauncher(join(o.home, 'bin'), name, originOf(o.address), o.home)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, 'added.json'), `${JSON.stringify({ address: originOf(o.address), name })}\n`)
  terminal.write(`Added ${name}: ${join(o.home, 'bin')} holds its launcher.\n`)
  return 0
}

/** The files of the launcher of a name in `bin/` that are there. */
const launchersOf = (home: string, name: string): string[] =>
  ['', '.cmd'].map((ending) => join(home, 'bin', `${name}${ending}`)).filter((one) => existsSync(one))

/** `tent cli list`: each address that was added, with the name of its command, and a launcher that another user wrote. */
export function list(home: string, terminal: Terminal): number {
  for (const one of allAdded(home)) {
    terminal.write(`${one.name}  ${one.address}\n`)
    for (const theirs of launchersOf(home, one.name).filter((file) => !ownedHere(file)))
      terminal.error(`${theirs} was written by another user of this computer: do not run it.\n`)
  }
  return 0
}

/** `tent cli remove <address>`: its launcher, its kept record and modules, and its yes. Its key the caller removes. */
export function remove(home: string, address: string): number {
  const added = addedOf(home, address)
  if (added) for (const ending of ['', '.cmd']) rmSync(join(home, 'bin', `${added.name}${ending}`), { force: true })
  rmSync(keptFolder(home, address), { recursive: true, force: true })
  return 0
}
