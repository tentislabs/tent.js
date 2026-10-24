// The thread of the test room: a heap that shares nothing with the engine. It loads the room runtime and the
// modules of each version into its own heap, gives the runtime `AsyncLocalStorage` to carry a call across waits and
// the module hook over `resolveIn` to link a module, and speaks to the engine over the wire alone.
import { AsyncLocalStorage } from 'node:async_hooks'
import { workerData } from 'node:worker_threads'
import type { MessagePort } from 'node:worker_threads'
import { TentError } from '../../../core/index.ts'
import type { Bounds } from '../callables.ts'
import { pageCodeAt } from '../inProgram/draw.ts'
import { loadIn, nextLoading } from '../inProgram/loader.ts'
import type { InsideWays } from '../inside/handed.ts'
import type { Inside, VersionTold } from '../inside/inside.ts'
import { insideOf } from '../inside/inside.ts'
import type { Entry } from '../room.ts'
import { wireOf } from './wire.ts'

const given: unknown = workerData
const port: unknown = Reflect.get(Object(given), 'port')
const flags: unknown = Reflect.get(Object(given), 'flags')
const isPort = (value: unknown): value is MessagePort =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'postMessage') === 'function'
if (!isPort(port) || !(flags instanceof Int32Array))
  throw new TentError('T0009', 'The thread of the test room was started with no wire.')

const calls = new AsyncLocalStorage<number>()
// The place of each version and the mark its modules are loaded under in this heap, by its id.
const places = new Map<string, { place: string; loading: string }>()
let inside: Inside | undefined
// The loadings that are under way, which the engine waits for before a thread made anew answers a call.
const loading = new Set<Promise<void>>()

/** What the engine asks this thread, with the values as they crossed. */
function served(what: string, body: unknown): unknown {
  if (!inside) throw new TentError('T0009', 'The room runtime of the test room is not loaded.')
  const b: Record<string, unknown> = Object(body)
  const bounds: Bounds = Object(b.bounds)
  switch (what) {
    case 'load': {
      const told: VersionTold & { place: string } = Object(b.version)
      if (!places.has(told.id)) places.set(told.id, { place: told.place, loading: nextLoading(told.place) })
      const loaded = inside.load(told)
      loading.add(loaded)
      void loaded.finally(() => loading.delete(loaded)).catch(() => undefined)
      return loaded
    }
    case 'ready':
      // Answers once every version the engine told it to load is loaded, also where one failed to.
      return Promise.allSettled([...loading]).then(() => undefined)
    case 'entry': {
      const entry: Entry = Object(b.entry)
      return inside.entry(String(b.version), entry)
    }
    case 'call':
      return inside.call(Number(b.entry), Number(b.call), b.handed, { pure: b.pure === true, bounds })
    case 'back':
      return inside.back(Number(b.call), Number(b.fn), b.args, bounds, Number(b.as) || Number(b.call))
    case 'draw':
      return inside.draw(String(b.version), Number(b.call), b.input, { left: Number(b.left), bounds })
    case 'unload':
      inside.unload(String(b.version))
      places.delete(String(b.version))
      return undefined
    case 'forget':
      inside.forget(Number(b.call))
      return undefined
  }
  throw new TentError('T0009', `The test room was asked for what it does not do: ${what.slice(0, 40)}.`)
}

const wire = wireOf(port, flags, 1, served)
// A thread that stops by itself tells the engine so, which may be waiting for it at once and take no event.
process.on('exit', () => wire.end())

/** The place of a version of this heap, and the mark of its modules. */
function placeOf(version: VersionTold): { place: string; loading: string } {
  const held = places.get(version.id)
  if (!held) throw new TentError('T0011', `The test room holds no version ${version.id}.`)
  return held
}

// Each way says the call the code is in now, which the engine may be waiting on at once.
const ways: InsideWays = {
  runtime: (call, word, args) => wire.ask('runtime', { call, word, args, as: calls.getStore() }, { sync: true }),
  db: (call, db, member, args) => wire.ask('db', { call, db, member, args, as: calls.getStore() }, { sync: true }),
  back: (call, fn, args) => wire.ask('back', { call, fn, args, as: calls.getStore() }, { sync: true }),
  later: async (call, fn) => wire.ask('back', { call, fn, args: [] }, { sync: false }),
  fetch: async (call, request) => wire.ask('fetch', { call, request }, { sync: false }),
}

inside = insideOf({
  ways,
  carry: {
    run: (call, work) => calls.run(call, work),
    current: () => calls.getStore(),
  },
  link: (version, path, makes) => {
    const { place, loading } = placeOf(version)
    return loadIn(place, path, loading, makes)
  },
  page: (version) => {
    if (version.page === undefined) throw new TentError('T0011', `The version ${version.id} holds no page code.`)
    return pageCodeAt(placeOf(version).place, version.page)
  },
  timeout: (ms) => (Number.isFinite(ms) ? AbortSignal.timeout(Math.max(1, ms)) : undefined),
})
