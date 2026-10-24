import { storedLimit } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { environmentFor, loaded } from './call.ts'
import { poolOf, programsOf } from './programs.ts'
import { placedFolder } from '../placedFolders.ts'

const isPython = (record: unknown): record is Record<string, unknown> & { python: object } =>
  typeof record === 'object' && record !== null && typeof Reflect.get(record, 'python') === 'object'

// The loadings under way of each app, by the file: tasks that come at one time wait for the one loading.
const loading = new WeakMap<object, Map<string, Promise<void>>>()

/** The file of a `python` of a version, by its name, where it is one. */
function fileOf(o: Opened, name: string): string | undefined {
  const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  return isPython(record) ? String(Reflect.get(record.python, 'file')) : undefined
}

/** Loads the file of a `python` into a Python program of the version, held to its `limits.load`. */
async function loadOnce(o: Opened, name: string, record: Record<string, unknown> & { python: object }): Promise<void> {
  const file = String(Reflect.get(record.python, 'file'))
  const lock = await environmentFor(o, record)
  // `atOnce` stands in `python` of the record, as a call reads it, so the loading asks for the place a call asks for.
  const atOnce: unknown = Reflect.get(record.python, 'atOnce')
  const place = await poolOf(o).place({
    kind: { version: o.version, lock, gpu: Reflect.get(record.python, 'gpu') === true },
    file,
    atOnce: typeof atOnce === 'number' ? atOnce : 1,
    inside: false,
    until: Number.POSITIVE_INFINITY,
    name,
  })
  try {
    if (!place.program.loaded.has(file)) {
      const stated: unknown = Reflect.get(Object(record.limits), 'load')
      const time = typeof stated === 'number' ? stated : storedLimit(o.description, 'pythonLoad')
      await loaded(place.program, name, file, placedFolder(o.bundle, 'python'), time)
    }
  } finally {
    place.release()
  }
}

/**
 * Takes the code of a version on a worker and the name of a `python`. Makes its environment where it is not there,
 * and loads its file into a Python program of the version, so that the work of a task of it begins with its
 * definition loaded and its loading counts on no try. A definition that is no `python`, or that a program holds
 * loaded already, is nothing to load. Throws T0016, T7020, T7119 and T0008.
 */
export async function loadAhead(o: Opened, name: string): Promise<void> {
  const record = Object.hasOwn(o.description.functions, name) ? o.description.functions[name] : undefined
  if (!isPython(record)) return
  const file = String(Reflect.get(record.python, 'file'))
  if (programsOf(o).pool.loaded(o.version).has(file)) return
  const under = loading.get(o.handles) ?? new Map<string, Promise<void>>()
  loading.set(o.handles, under)
  const there = under.get(file)
  if (there) return there
  const made = loadOnce(o, name, record).finally(() => under.delete(file))
  under.set(file, made)
  return made
}

/** The `python` definitions of a version whose file a Python program of the app holds loaded now. */
export function loadedNames(o: Opened): string[] {
  const files = programsOf(o).pool.loaded(o.version)
  return Object.keys(o.description.functions)
    .filter((name) => {
      const file = fileOf(o, name)
      return file !== undefined && files.has(file)
    })
    .sort()
}

/**
 * Takes the code of a version on a worker, the kinds of the worker, and the definitions it was started to load.
 * Makes the environment of each `python` that states a kind of this worker or `background`, and loads each named
 * one, whose program no idle time ends while the worker is joined. Answers the definitions it holds loaded then.
 */
export async function readyOn(o: Opened, kinds: string[], load: string[]): Promise<string[]> {
  for (const [name, record] of Object.entries(o.description.functions)) {
    if (!isPython(record)) continue
    const worker = record.worker
    const here = (typeof worker === 'string' && kinds.includes(worker)) || record.background !== undefined
    if (!here && !load.includes(name)) continue
    await environmentFor(o, record)
    if (!load.includes(name)) continue
    programsOf(o).kept.add(String(Reflect.get(record.python, 'file')))
    await loadAhead(o, name)
  }
  return loadedNames(o)
}
