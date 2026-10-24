import { registerHooks } from 'node:module'
import { relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TentError } from '../../../core/index.ts'
import { describing } from '../../../core/internal.ts'
import { moduleAt } from '../../files.ts'
import { frameworkEntry, resolveIn } from '../resolve.ts'
import type { RoomVersion } from '../room.ts'

// The mark in the address of a module that says which loading of which version loaded it.
const mark = 'tent-app'

// The place of each loading, by its mark: the folder of a bundle, or the place a list of development stands beside.
const places = new Map<string, string>()

// The place of each version the engine made, by the version: the room of the program loads its modules from there.
const versionPlaces = new WeakMap<RoomVersion, string>()

/** Takes a version the engine made and the place it is run from. Answers the version, whose modules are loaded from there. */
export function placedVersion(version: RoomVersion, place: string): RoomVersion {
  versionPlaces.set(version, place)
  return version
}

/** The place a version is run from, where the engine made it. Throws T0011 for one it did not make. */
export function placeOfVersion(version: RoomVersion): string {
  const place = versionPlaces.get(version)
  if (place === undefined)
    throw new TentError(
      'T0011',
      `The version ${version.id} was not made by this engine, and the room of the program cannot load it.`,
    )
  return place
}

/** The path inside its version of a module that a marked address names. */
function pathIn(place: string, url: URL): string {
  const plain = new URL(url.href)
  plain.search = ''
  return relative(place, fileURLToPath(plain)).split(sep).join('/')
}

// A module that a marked module imports is found by the one rule of a version, and a module of the version carries
// the same mark: so nothing a module keeps at its top passes from one loading to another. A module of this program
// that names an entry of the framework, `tentjs` or `tentjs/engine`, is answered with the very file this engine
// uses, marked or not, so that both hold one framework: a version of development is loaded by addresses of its own.
registerHooks({
  resolve(name, context, next) {
    const entry = frameworkEntry(name)
    if (entry !== undefined) return { url: entry, shortCircuit: true }
    const parent = context.parentURL === undefined ? undefined : new URL(context.parentURL)
    const from = parent?.searchParams.get(mark) ?? null
    const place = from === null ? undefined : places.get(from)
    if (parent === undefined || from === null || place === undefined) return next(name, context)
    const found = resolveIn(pathIn(place, parent), name)
    if (!('path' in found)) return next(name, context)
    const url = moduleAt(place, found.path)
    const resolved = next(url.href, context)
    const marked = new URL(resolved.url)
    marked.searchParams.set(mark, from)
    return { ...resolved, url: marked.href }
  },
})

let loadings = 0

/** Answers a mark for one loading of a version, under which its modules are loaded for that loading alone. */
export function nextLoading(place: string): string {
  const made = String(++loadings)
  places.set(made, place)
  return made
}

/**
 * Takes the place of a version, the path of one of its modules as the description names it, the mark of the
 * loading, and whether its definitions are made as it loads. Loads the module for that loading alone, where it
 * makes definitions with every word that asks the engine answering its record while it loads, and answers what the
 * module exports. Throws T0011 for a module that cannot be loaded.
 */
export async function loadIn(
  place: string,
  path: string,
  loading: string,
  makes = true,
): Promise<Record<string, unknown>> {
  const found = resolveIn(undefined, path)
  const url = moduleAt(place, 'path' in found ? found.path : path)
  url.searchParams.set(mark, loading)
  try {
    const given: unknown = await (makes ? describing(() => import(url.href)) : import(url.href))
    if (typeof given === 'object' && given !== null) return Object(given)
  } catch (error) {
    const failed = new TentError('T0011', `The module ${path} of the bundle cannot be loaded: ${String(error)}`, {
      fix: 'Build the project again, and run the bundle as the build wrote it.',
    })
    failed.cause = error
    throw failed
  }
  throw new TentError('T0011', `The module ${path} of the bundle gives nothing.`)
}
