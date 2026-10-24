// The held program of a version: the actions of a held app and the packages they import run here, under the
// runtime's permission model with read of the version's built code alone. Before any code of the app loads it shuts
// what the model leaves open, and then loads the room runtime with `ways` over the channel: the one way out of the
// program is the engine.
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomBytes, randomInt } from 'node:crypto'
import { registerHooks, syncBuiltinESMExports } from 'node:module'
import v8 from 'node:v8'
import { TentError } from '../../../core/index.ts'
import type { Bounds } from '../callables.ts'
import { loadIn, nextLoading } from '../inProgram/loader.ts'
import type { InsideWays } from '../inside/handed.ts'
import type { Inside, VersionTold } from '../inside/inside.ts'
import { insideOf } from '../inside/inside.ts'
import type { Entry } from '../room.ts'
import type { Message } from './channel.ts'
import { channelOf } from './channel.ts'
import { refusalOf } from './refused.ts'

const refused = (what: string): Error =>
  Object.assign(new Error(`${what} is not handed to the code of a held app.`), { code: 'ERR_ACCESS_DENIED' })

// The runtime's own SQLite module reads and writes a database file past every file grant, which the permission
// model does not hold, so the program shuts it before the app's code loads. The same for the process and V8 entries
// that no scope of the model gates: a signal to another process (the engine is the program's parent), the debug
// entries, and the setting of a V8 flag.
const shut = new Set(['node:sqlite', 'sqlite'])
registerHooks({
  resolve(name, context, next) {
    if (shut.has(name)) throw refused(name)
    return next(name, context)
  },
})
const builtin = process.getBuiltinModule.bind(process)
process.getBuiltinModule = (id: string) => {
  if (shut.has(id)) throw refused(id)
  return builtin(id)
}
delete (process as { _debugProcess?: unknown })._debugProcess
delete (process as { _debugEnd?: unknown })._debugEnd
process.kill = () => {
  throw refused('`process.kill`')
}
v8.setFlagsFromString = () => {
  throw refused('v8.setFlagsFromString')
}
syncBuiltinESMExports()

// The folder of the version's code, which the engine names as the one argument the program is started with.
const code = process.argv[2] ?? ''
const loading = nextLoading(code)

/** What a call knows of itself, so the words that draw a value answer at once without asking the engine. */
interface Drawn {
  now: number
  zone: string
  valueSize: number
}
const calls = new AsyncLocalStorage<number>()
const drawnOf = new Map<number, Drawn>()

/** Whether a thing is shut: calling it throws, as the program shut it before any app code loaded. */
function probe(fn: () => unknown): boolean {
  try {
    fn()
    return false
  } catch {
    return true
  }
}

let inside: Inside | undefined

/** What the engine asks this program, with the values as they crossed. */
function served(what: string, body: unknown): unknown {
  const b: Record<string, unknown> = Object(body)
  if (what === 'status')
    return {
      execArgv: [...process.execArgv],
      shut: {
        sqlite: probe(() => process.getBuiltinModule('node:sqlite')),
        debugProcess: (process as { _debugProcess?: unknown })._debugProcess === undefined,
        v8Flags: probe(() => v8.setFlagsFromString('')),
        kill: probe(() => process.kill(process.ppid, 0)),
      },
    }
  if (!inside) throw new TentError('T0009', 'The room runtime of the held program is not loaded.')
  const bounds: Bounds = Object(b.bounds)
  switch (what) {
    case 'load': {
      const told: VersionTold = Object(b.version)
      return inside.load(told)
    }
    case 'entry': {
      const entry: Entry = Object(b.entry)
      return inside.entry(String(b.version), entry)
    }
    case 'call': {
      const call = Number(b.call)
      drawnOf.set(call, Object(b.drawn))
      return inside.call(Number(b.entry), call, b.handed, { pure: false, bounds })
    }
    case 'back': {
      const call = Number(b.call)
      const as = Number(b.as) || call
      // A function is called as part of the call the engine is in now, which knows what its own call knows.
      const of = drawnOf.get(call)
      if (of && as !== call) drawnOf.set(as, of)
      const answer = inside.back(call, Number(b.fn), b.args, bounds, as)
      if (as === call) return answer
      return Promise.resolve(answer).finally(() => drawnOf.delete(as))
    }
    case 'clock': {
      // The clock of the engine as it answered the call last: `now()` reaches it, a test clock among it.
      const of = drawnOf.get(Number(b.call))
      if (of) of.now = Number(b.now)
      return undefined
    }
    case 'forget':
      drawnOf.delete(Number(b.call))
      inside.forget(Number(b.call))
      return undefined
  }
  throw new TentError('T0009', `The held program was asked for what it does not do: ${what.slice(0, 40)}.`)
}

/** What the engine asks, with a refusal of the permission model told as T0035, which crosses whole. */
function told(what: string, body: unknown): unknown {
  try {
    const answer = served(what, body)
    return answer instanceof Promise ? answer.catch((error: unknown) => Promise.reject(refusalOf(error))) : answer
  } catch (error) {
    throw refusalOf(error)
  }
}

const channel = channelOf((message: Message) => void process.send?.(message), told)
process.on('message', (message) => channel.take(message))

/** A value that a word draws, from what the call knows of itself. */
function drawn(call: number, word: unknown, args: unknown[]): { value: unknown } | undefined {
  const of = drawnOf.get(call)
  if (!of) return undefined
  if (word === 'now') return { value: new Date(of.now) }
  if (word === 'zone') return { value: of.zone }
  if (word === 'valueSize') return { value: of.valueSize }
  if (word === 'mayWait') return { value: true }
  if (word === 'random') return { value: randomInt(0, 2 ** 48) / 2 ** 48 }
  if (word === 'token') {
    const digits: unknown = Reflect.get(Object(args[0]), 'digits')
    return {
      value:
        typeof digits === 'number'
          ? Array.from({ length: digits }, () => randomInt(10)).join('')
          : randomBytes(32).toString('base64url'),
    }
  }
  return undefined
}

// Every way crosses the channel and is answered later, but a value that a word draws, which the call knows.
const ways: InsideWays = {
  sync: false,
  runtime: (call, word, args) =>
    word === 'draw'
      ? drawn(call, args[0], Array.isArray(args[1]) ? args[1] : [])
      : channel.ask('runtime', { call, word, args }),
  db: (call, db, member, args) => channel.ask('db', { call, db, member, args }),
  back: (call, fn, args) => channel.ask('back', { call, fn, args }),
  later: (call, fn) => channel.ask('back', { call, fn, args: [] }),
  fetch: (call, request) => channel.ask('fetch', { call, request }),
}

inside = insideOf({
  ways,
  carry: { run: (call, work) => calls.run(call, work), current: () => calls.getStore() },
  link: (_, path, makes) => loadIn(code, path, loading, makes),
  page: () => {
    throw new TentError('T0011', 'The held program draws no page.')
  },
})
process.send?.({ k: 'ready' })
