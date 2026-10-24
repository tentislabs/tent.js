import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { ownedHere } from './owner.ts'
import { writeOwnerOnly } from '../../core/internal.ts'

/** What `keys.json` keeps of one server: what a person calls the app with, and what `tent login` keeps for publishing. */
interface Server {
  app?: { key?: string; access?: string; refresh?: string; expiresAt?: number }
  publish?: { key: string; name: string }
}

/** `keys.json` of the runner's folder. */
interface Keys {
  format: 'tent.keys/1'
  servers: Record<string, Server>
}

const empty = (): Keys => ({ format: 'tent.keys/1', servers: {} })

/** The scheme, the host and the port of an address, in small letters: what a server is kept by. */
export const serverOf = (address: string): string => new URL(address).origin.toLowerCase()

/**
 * Reads `keys.json` of the runner's folder: only where it is an ordinary file, opened once and read through what
 * was opened, and one that the current user owns. Answers what it holds, or nothing kept where there is no such file.
 */
function readKeys(home: string): Keys {
  const file = join(home, 'keys.json')
  try {
    if (!lstatSync(file).isFile()) return empty()
    const opened = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
    try {
      const about = fstatSync(opened)
      if (!about.isFile()) return empty()
      // Where the system gives a number of the user it is read from what was opened; on Windows by the owner of the file.
      const theirs =
        process.platform === 'win32'
          ? !ownedHere(file)
          : typeof process.getuid === 'function' && about.uid !== process.getuid()
      if (theirs) return empty()
      const read: unknown = JSON.parse(readFileSync(opened, 'utf8'))
      const servers: unknown = Reflect.get(Object(read), 'servers')
      return Reflect.get(Object(read), 'format') === 'tent.keys/1' && typeof servers === 'object' && servers !== null
        ? { format: 'tent.keys/1', servers: { ...servers } }
        : empty()
    } finally {
      closeSync(opened)
    }
  } catch {
    return empty()
  }
}

/** Writes `keys.json` whole beside the old one, readable only by the current user, and renames it over the old one. */
function writeKeys(home: string, keys: Keys): void {
  const file = join(home, 'keys.json')
  const beside = `${file}.${process.pid}.new`
  writeOwnerOnly(beside, `${JSON.stringify(keys, null, 2)}\n`)
  renameSync(beside, file)
}

/** The key that is kept for a server, where one is. */
export const keptKey = (home: string, address: string): string | undefined =>
  readKeys(home).servers[serverOf(address)]?.app?.key

/** What is kept to call a server with: a key, or the two tokens of a `login` in the browser. */
export const keptApp = (home: string, address: string): Server['app'] => readKeys(home).servers[serverOf(address)]?.app

/** Keeps the two tokens of a `login` in the browser for a server, in place of what was kept. */
export function keepTokens(
  home: string,
  address: string,
  tokens: { access: string; refresh: string; expiresAt: number },
): void {
  const keys = readKeys(home)
  const server = serverOf(address)
  keys.servers[server] = { ...keys.servers[server], app: tokens }
  writeKeys(home, keys)
}

/** Keeps a key for a server, in place of the one that was kept. */
export function keepKey(home: string, address: string, key: string): void {
  const keys = readKeys(home)
  const server = serverOf(address)
  keys.servers[server] = { ...keys.servers[server], app: { key } }
  writeKeys(home, keys)
}

/** Keeps the key of publishing to a server under a name, in place of the one that was kept for it. */
export function keepPublishKey(home: string, address: string, key: string, name: string): void {
  mkdirSync(home, { recursive: true })
  const keys = readKeys(home)
  const server = serverOf(address)
  keys.servers[server] = { ...keys.servers[server], publish: { key, name } }
  writeKeys(home, keys)
}

/**
 * The target that a word names: a server whose key of publishing is kept under that name, or the server of that
 * address. Nothing where none is kept.
 */
export function publishTarget(home: string, word: string): { address: string; key: string; name: string } | undefined {
  const { servers } = readKeys(home)
  for (const [address, server] of Object.entries(servers))
    if (server.publish && (server.publish.name === word || address === word.toLowerCase().replace(/\/+$/, '')))
      return { address, key: server.publish.key, name: server.publish.name }
  try {
    const kept = servers[serverOf(word)]?.publish
    return kept ? { address: serverOf(word), key: kept.key, name: kept.name } : undefined
  } catch {
    // A word that is no address names a target by its name alone.
    return undefined
  }
}

/** Takes away what is kept for a server: its key for the app, or all of it. */
export function forgetServer(home: string, address: string, all: boolean): void {
  const keys = readKeys(home)
  const server = serverOf(address)
  if (!keys.servers[server]) return
  if (all) delete keys.servers[server]
  else {
    const { app: _, ...rest } = keys.servers[server]
    if (Object.keys(rest).length) keys.servers[server] = rest
    else delete keys.servers[server]
  }
  writeKeys(home, keys)
}
