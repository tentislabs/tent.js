// The room runtime: the framework's code that a room which crosses loads into the heap where an app's code runs. It
// imports no module of the runtime and reads none of its globals, so a host loads it into an isolate unchanged.
import { TentError } from '../../../core/index.ts'
import { setRuntime } from '../../../core/internal.ts'
import type { Bounds } from '../callables.ts'
import { intoOf, outOf } from '../callables.ts'
import { pure } from '../pure.ts'
import { chanceIn } from './chance.ts'
import type { Entry, Kind } from '../room.ts'
import { fetchOver } from './fetch.ts'
import type { InsideWays } from './handed.ts'
import { askerIn, forgetCall, keeperIn, keptIn } from './handed.ts'
import type { Carry } from './runtime.ts'
import { runtimeOver } from './runtime.ts'
import { viewsLoader } from './views.ts'

/** A version as the room runtime is told it: its id, each module that holds code with its kinds, and its page code. */
export interface VersionTold {
  id: string
  modules: { path: string; kinds: Kind[] }[]
  page?: string
}

/** What the page code gives the room runtime: its draw. */
interface PageDraw {
  draw(o: object): Promise<unknown>
}

/** What the room runtime is handed by the room that loads it: its ways, how it carries a call, and how it links a module. */
export interface InsideInput {
  ways: InsideWays
  carry: Carry
  // Loads a module of a version into this heap, its definitions made as it loads where `makes`.
  link(version: VersionTold, path: string, makes: boolean): Promise<Record<string, unknown>>
  // The page code of a version, in this heap.
  page(version: VersionTold): Promise<PageDraw>
  // What ends a draw past its time, where the heap has one.
  timeout?(ms: number): unknown
  // How large a value that the code hands the engine may be, where no call says it.
  bounds?: Bounds
}

/** The room runtime's members, which the room that loads it calls with the values as they crossed. */
export interface Inside {
  load(version: VersionTold): Promise<void>
  entry(version: string, entry: Entry): number
  call(entry: number, call: number, handed: unknown, o: { pure: boolean; bounds: Bounds }): unknown
  // `as`: the call that the function is carried out as part of, which may be another than the one it was handed in.
  back(call: number, fn: number, args: unknown, bounds: Bounds, as?: number): unknown
  draw(version: string, call: number, input: unknown, o: { left: number; bounds: Bounds }): unknown
  unload(version: string): void
  forget(call: number): void
}

/** The arrow at the end of a path from what a module exports, or nothing. */
function arrowAt(exports: Record<string, unknown>, path: string[]): unknown {
  let at: unknown = exports
  for (const name of path)
    at = typeof at === 'object' || typeof at === 'function' ? Reflect.get(Object(at), name) : undefined
  return at
}

const notHeld = (what: string): TentError =>
  new TentError('T0011', `The room holds no ${what}.`, {
    fix: 'Build the project again, and run the bundle as the build wrote it.',
  })

/**
 * Takes what the room that loads it hands it. Puts the runtime slot of `core` and the `fetch` of the code in place
 * over `ways`, and answers the members by which the room loads a version, takes an entry, calls it, calls back a
 * function the code handed the engine, and draws a page, each for the call it names, with what it is handed taken
 * into this heap and what it answers as it crosses.
 */
export function insideOf(o: InsideInput): Inside {
  const free: Bounds = o.bounds ?? { depth: 64, size: 1_000_000 }
  const runtime = runtimeOver(o.ways, o.carry, free)
  setRuntime(runtime)
  chanceIn(o.carry, runtime)
  Reflect.set(globalThis, 'fetch', fetchOver(o.ways, o.carry, free))
  const versions = new Map<string, { told: VersionTold; modules: Map<string, Record<string, unknown>> }>()
  const entries: ((...args: unknown[]) => unknown)[] = []
  const draws = new Map<string, (input: Record<string, unknown>, left: number) => Promise<unknown>>()
  const heldOf = (version: string) => {
    const one = versions.get(version)
    if (!one) throw notHeld(`version ${version}`)
    return one
  }
  /** What the code answered, as it crosses: a promise as a promise, for the call it belongs to. */
  const answered = (call: number, value: unknown, bounds: Bounds): unknown => outOf(value, keeperIn(call), bounds)
  return {
    async load(told) {
      const one = versions.get(told.id) ?? { told, modules: new Map() }
      versions.set(told.id, one)
      if (told.page !== undefined) one.told = { ...one.told, page: told.page }
      for (const { path, kinds } of told.modules) {
        if (one.modules.has(path) || kinds.every((kind) => kind === 'view')) continue
        one.modules.set(path, await o.link(told, path, true))
      }
    },
    entry(version, entry) {
      const exports = heldOf(version).modules.get(entry.module)
      if (!exports) throw notHeld(`module ${entry.module}`)
      const arrow = arrowAt(exports, entry.path)
      if (typeof arrow !== 'function') throw notHeld(`arrow at ${[entry.module, ...entry.path].join('.')}`)
      entries.push((...args) => Reflect.apply(arrow, undefined, args))
      return entries.length - 1
    },
    call(entry, call, handed, c) {
      const arrow = entries[entry]
      if (!arrow) throw notHeld(`entry ${entry}`)
      return o.carry.run(call, () => {
        const args = intoOf(handed, askerIn(o.ways, call, c.bounds))
        const list = Array.isArray(args) ? args : []
        return answered(call, c.pure ? pure(() => arrow(...list)) : arrow(...list), c.bounds)
      })
    },
    back(call, fn, args, bounds, as = call) {
      const kept = keptIn(call, fn)
      if (fn < 0) return Promise.resolve(kept()).then((value) => answered(call, value, bounds))
      return o.carry.run(as, () => {
        const handed = intoOf(args, askerIn(o.ways, as, bounds))
        return answered(as, Reflect.apply(kept, undefined, Array.isArray(handed) ? handed : []), bounds)
      })
    },
    draw(version, call, input, c) {
      const one = heldOf(version)
      let draw = draws.get(version)
      if (!draw) {
        const viewsOf = viewsLoader((file) => o.link(one.told, file, false))
        const code = o.page(one.told)
        draw = async (asked, left) => {
          const names = [asked.page, asked.part, asked.preview]
            .map((part) => Reflect.get(Object(part), part === asked.page ? 'screen' : 'component'))
            .filter((name): name is string => typeof name === 'string')
          // The page code is loaded first: a view finds React and `tentjs/ui` in it.
          const page = await code
          const views = await viewsOf(Object(asked.description), names)
          const signal = o.timeout?.(left)
          return page.draw({ ...asked, views, ...(signal === undefined ? {} : { signal }) })
        }
        draws.set(version, draw)
      }
      const made = draw
      return o.carry.run(call, () => {
        const asked = intoOf(input, askerIn(o.ways, call, c.bounds))
        return answered(call, made(Object(asked), c.left), c.bounds)
      })
    },
    unload(version) {
      versions.delete(version)
      draws.delete(version)
    },
    forget: (call) => forgetCall(call),
  }
}
