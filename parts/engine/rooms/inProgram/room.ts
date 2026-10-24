import { TentError } from '../../../core/index.ts'
import { pure } from '../pure.ts'
import type { Called, Draw, Room, RoomInput } from '../room.ts'
import { drawOf } from './draw.ts'
import { loadIn, nextLoading, placeOfVersion } from './loader.ts'
import { startedProgram } from './program.ts'

/** What the room holds of one loaded version: where it is run from, its loadings, and what each module exports. */
interface Held {
  place: string
  loading: string
  modules: Map<string, Record<string, unknown>>
  page?: string
  draw?: Draw
}

const notLoaded = (version: string, what: string): TentError =>
  new TentError('T0011', `The version ${version} holds no ${what} that its room loaded.`, {
    fix: 'Build the project again, and run the bundle as the build wrote it.',
  })

/** The arrow at the end of a path from what a module exports, or nothing: a definition is read, and never trusted to be one. */
function arrowAt(exports: Record<string, unknown>, path: string[]): unknown {
  let at: unknown = exports
  for (const name of path)
    at = typeof at === 'object' || typeof at === 'function' ? Reflect.get(Object(at), name) : undefined
  return at
}

/**
 * The room of the program, the default: the app's code runs in the engine's own program, by the runtime's own
 * loading, and an entry is the arrow itself, handed the very objects the engine hands it, with the swap of a pure
 * call around it where the call asks for one. Nothing crosses and no call is numbered, so it asks no `ways`.
 */
export function inProgramRoom(o: RoomInput): Room {
  const held = new Map<string, Held>()
  const heldOf = (version: string): Held => {
    const one = held.get(version)
    if (!one) throw notLoaded(version, 'code')
    return one
  }
  return {
    crosses: false,
    async load(version) {
      const place = placeOfVersion(version)
      const one: Held = held.get(version.id) ?? { place, loading: nextLoading(place), modules: new Map() }
      held.set(version.id, one)
      // A version may be loaded in more than one go, as its makers from where it was handed before its other code
      // from its own copy: each module loads once, and what is loaded later is loaded from where it is run.
      if (one.place !== place) Object.assign(one, { place, loading: nextLoading(place) })
      if (version.page !== undefined) one.page = version.page
      for (const { path, kinds } of version.modules) {
        // A view is loaded when a page first draws it, and not before.
        if (one.modules.has(path) || kinds.every((kind) => kind === 'view')) continue
        one.modules.set(path, await loadIn(place, path, one.loading))
      }
    },
    entry(version, entry) {
      const exports = heldOf(version).modules.get(entry.module)
      if (!exports) throw notLoaded(version, `module ${entry.module}`)
      const arrow = arrowAt(exports, entry.path)
      if (typeof arrow !== 'function') throw notLoaded(version, `arrow at ${[entry.module, ...entry.path].join('.')}`)
      const called: Called = (handed, c) =>
        c.pure ? pure(() => Reflect.apply(arrow, undefined, handed)) : Reflect.apply(arrow, undefined, handed)
      return called
    },
    draw(version) {
      const one = heldOf(version)
      const { page } = one
      if (page === undefined) throw notLoaded(version, 'page code')
      one.draw ??= drawOf(one.place, page, one.loading, o.mode)
      return one.draw
    },
    back() {
      throw new TentError('T0013', 'The room of the program hands the engine no function by its number.')
    },
    program: (start) => startedProgram(start),
    unload(version) {
      held.delete(version)
    },
    close() {
      held.clear()
    },
  }
}
