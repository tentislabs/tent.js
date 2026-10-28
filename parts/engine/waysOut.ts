import childProcess from 'node:child_process'
import dgram from 'node:dgram'
import dns from 'node:dns'
import { syncBuiltinESMExports } from 'node:module'
import net from 'node:net'
import { basename, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { calledByApp } from './envRead.ts'
import { heldRefusal, outsideHeld } from './outsideHeld.ts'
import { noteOutside, testUnderWay } from './touched.ts'

// The ports and the pipes this program serves on: a connection to one of them on this computer asks this program, and
// leaves nothing.
const served = new Set<number>()
const servedPipes = new Set<string>()
const loopback = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Whether a connection to a host and a port leaves this program: anything but a port it serves on this computer. */
export const leavesProgram = (host: string, port: number): boolean => !(loopback.has(host) && served.has(port))

/** Where a socket connects: a host and a port, or a pipe or a local socket by its path, from what `connect` is handed. */
function targetOf(given: unknown[]): { host: string; port: number } | { pipe: string } | undefined {
  // The runtime hands its own connect the words it read, as one list.
  const words = Array.isArray(given[0]) ? given[0] : given
  const [first, second] = words
  if (typeof first === 'object' && first !== null) {
    const port: unknown = Reflect.get(first, 'port')
    const host: unknown = Reflect.get(first, 'host')
    const path: unknown = Reflect.get(first, 'path')
    // A port names a host: a path beside it is the path an HTTP request asks, and a path alone is a pipe.
    if (port === undefined || port === null) return typeof path === 'string' ? { pipe: path } : undefined
    return { host: typeof host === 'string' ? host : 'localhost', port: Number(port) }
  }
  if (typeof first === 'number' || (typeof first === 'string' && /^\d+$/.test(first)))
    return { host: typeof second === 'string' ? second : 'localhost', port: Number(first) }
  return typeof first === 'string' ? { pipe: first } : undefined
}

/** Whether a target of a socket leaves this program: a port it does not serve here, or a pipe another program serves. */
const leaves = (to: { host: string; port: number } | { pipe: string }): boolean =>
  'pipe' in to ? !servedPipes.has(to.pipe) : leavesProgram(to.host, to.port)

/** Whether a name is one of this computer, which a lookup finds with no server of names: `localhost`, or an address. */
const ofHere = (name: unknown): boolean => typeof name === 'string' && (loopback.has(name) || net.isIP(name) !== 0)

/** Whether a program that is started is a program of this runtime, which can carry the noting. */
const ofRuntime = (command: unknown): boolean =>
  command === process.execPath ||
  (typeof command === 'string' && basename(command, extname(command)).toLowerCase() === 'node')

let made = false

/**
 * Has every way out of this program note, under `tent test`, that the test whose work is under way reached outside,
 * and refuse where the program holds what reaches outside. It is held where every way passes, at the lowest layer the
 * runtime gives: the connect of a socket, under `fetch`, `WebSocket`, `node:http`, `node:http2`, `node:net` and
 * `node:tls` alike, and the send of a datagram. A program that is started reaches outside, but one of this runtime
 * that `carry` hands what makes it note as a part of the test, by the environment it is started with. A thread that
 * carries its notes elsewhere hands `under`, whether its code is a test's work now, and `note`, which takes what.
 */
export function noteWaysOut(
  o: {
    carry?: (test: string, env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv
    under?: () => boolean
    note?: (what: string) => void
  } = {},
): void {
  if (made) return
  made = true
  const { carry } = o
  const under = o.under ?? (() => testUnderWay() !== undefined)
  const note = o.note ?? noteOutside
  const here = import.meta.url
  const project = `${pathToFileURL(process.env.TENT_STARTED_FOLDER ?? process.cwd()).href}/`
  const listen = net.Server.prototype.listen
  Reflect.set(net.Server.prototype, 'listen', function (this: net.Server, ...given: unknown[]): unknown {
    this.once('listening', () => {
      const at = this.address()
      if (typeof at === 'object' && at !== null) served.add(at.port)
      if (typeof at === 'string') servedPipes.add(at)
    })
    return Reflect.apply(listen, this, given)
  })
  const connect = net.Socket.prototype.connect
  Reflect.set(net.Socket.prototype, 'connect', function (this: net.Socket, ...given: unknown[]): unknown {
    const to = targetOf(given)
    if (to && leaves(to)) {
      const named = 'pipe' in to ? `the pipe ${to.pipe}` : `${to.host}:${to.port}`
      if (outsideHeld()) {
        const refused = heldRefusal(`A connection to ${named}`)
        process.nextTick(() => this.destroy(refused))
        return this
      }
      if (under()) note(`connection ${'pipe' in to ? 'pipe' : to.host}`)
    }
    return Reflect.apply(connect, this, given)
  })
  for (const name of ['send', 'connect']) {
    const own: unknown = Reflect.get(dgram.Socket.prototype, name)
    if (typeof own !== 'function') continue
    Reflect.set(dgram.Socket.prototype, name, function (this: dgram.Socket, ...given: unknown[]): unknown {
      if (outsideHeld()) throw heldRefusal('A datagram')
      if (under()) note('datagram')
      return Reflect.apply(own, this, given)
    })
  }
  // A lookup of a name asks a server of names outside this program: the system's, or one the code names. A name of
  // this computer is found with none, and goes through.
  const asking = (owner: object, names: string[], always: boolean): void => {
    for (const name of names) {
      const own: unknown = Reflect.get(owner, name)
      if (typeof own !== 'function') continue
      Reflect.set(owner, name, function (this: unknown, ...given: unknown[]): unknown {
        if (always || !ofHere(given[0])) {
          if (outsideHeld()) {
            const refused = heldRefusal(`A lookup of the name ${String(given[0])}`)
            const done = given.at(-1)
            if (typeof done !== 'function') return Promise.reject(refused)
            process.nextTick(() => Reflect.apply(done, undefined, [refused]))
            return undefined
          }
          if (under()) note(`name ${String(given[0])}`)
        }
        return Reflect.apply(own, this, given)
      })
    }
  }
  const asks = (owner: object): string[] =>
    Object.getOwnPropertyNames(owner).filter((name) => /^(resolve|reverse)/.test(name))
  asking(dns, ['lookup', 'lookupService'], false)
  asking(dns.promises, ['lookup', 'lookupService'], false)
  asking(dns, asks(dns), true)
  asking(dns.promises, asks(dns.promises), true)
  asking(dns.Resolver.prototype, asks(dns.Resolver.prototype), true)
  asking(dns.promises.Resolver.prototype, asks(dns.promises.Resolver.prototype), true)
  // A program started in the work of a test: one of this runtime carries the noting and the hold where it can, and
  // any other reached outside.
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork', 'exec', 'execSync']) {
    const own: unknown = Reflect.get(childProcess, name)
    if (typeof own !== 'function') continue
    const way = (...given: unknown[]): unknown => {
      // A program that the framework starts for its own work, as one that asks the system, is none of the test's.
      if (!under() || !calledByApp(way, [here], project)) return Reflect.apply(own, childProcess, given)
      const test = testUnderWay()
      const command = name === 'fork' ? process.execPath : given[0]
      const shell = name === 'exec' || name === 'execSync'
      const named = `program ${shell ? String(given[0]).split(' ')[0] : basename(String(command))}`
      if (shell || !carry || test === undefined || !ofRuntime(command)) {
        note(named)
        return Reflect.apply(own, childProcess, given)
      }
      // A program that the engine cannot hold is named in the line of its case, and carries the hold all the same.
      if (outsideHeld()) note(named)
      // The options are the first plain object after the command: they are made where none are handed.
      const at = given.findIndex((one, k) => k > 0 && typeof one === 'object' && one !== null && !Array.isArray(one))
      const options: Record<string, unknown> = at < 0 ? {} : { ...Object(given[at]) }
      const env: NodeJS.ProcessEnv = Object(options.env ?? process.env)
      options.env = carry(test, env)
      const handed = [...given]
      if (at < 0) handed.splice(Array.isArray(given[1]) ? 2 : 1, 0, options)
      else handed[at] = options
      return Reflect.apply(own, childProcess, handed)
    }
    Reflect.set(childProcess, name, way)
  }
  syncBuiltinESMExports()
}
