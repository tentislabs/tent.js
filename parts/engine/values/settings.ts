import { statSync } from 'node:fs'
import type { Type } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { checkValue } from '../../core/internal.ts'
import type { ValuesMode } from './files.ts'
import { readValues, valuesFile, writeValues } from './files.ts'

/** One setting as `tent settings list` shows it. */
interface SettingShown {
  name: string
  value?: unknown
  // Whether a value was set for it: where none was, `value` is the default of its type.
  set: boolean
  public: boolean
}

/** The settings of one app, for test data or for live, as an engine or a command holds them. */
export interface SettingValues {
  /** The working object behind the handle: one member for each setting of the project, which answers its value now. */
  values: object
  /** The settings that are marked `public`, each with its value now: what every page is handed. */
  shown(): Record<string, unknown>
  /** Sets a setting, held to its type, and writes the file. `written` is the text of a command: a text as it is, and any other type read as JSON. */
  set(name: string, value: unknown, written?: boolean): unknown
  /** Takes the value of a setting away, so that its default holds again, and writes the file. */
  remove(name: string): void
  list(): SettingShown[]
}

const isType = (stored: unknown): stored is Type =>
  typeof stored === 'object' && stored !== null && typeof Reflect.get(stored, 'kind') === 'string'

/** The value that a setting has before any was set: the default of its type, where that is a value. */
function defaultOf(type: Type | undefined): unknown {
  const stated: unknown = Reflect.get(Object(type), 'default')
  // An object that the author wrote is stored as the list of its entries.
  const entries: unknown = Reflect.get(Object(stated), 'object')
  return Array.isArray(entries) ? Object.fromEntries(entries) : stated
}

/** A value of a file as code is handed it: a moment as a `Date`. */
const handed = (type: Type | undefined, value: unknown): unknown =>
  type?.kind === 'date' && typeof value === 'string' ? new Date(value) : value

/**
 * Takes a data folder, which of its two files, and the description of the running version. Answers the settings
 * of the app. A setting answers what was set for it, or the default of its type, or nothing where its type has
 * none. Nothing is read before the first asking.
 */
export function settingValues(dataFolder: string, held: ValuesMode, description: () => Description): SettingValues {
  const file = valuesFile(dataFolder, 'settings', held)
  let stored: Record<string, unknown> | undefined
  let [looked, written] = [0, -1]
  const read = (): Record<string, unknown> => {
    // A query thread holds settings of its own, which the main thread writes: the file is looked at again every
    // twentieth of a second, and read anew where it was written since.
    const now = performance.now()
    if (stored && now - looked > 50) {
      looked = now
      if ((statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1) !== written) stored = undefined
    }
    if (!stored) {
      stored = readValues(file, 'settings')
      written = statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? -1
      looked = now
    }
    return stored
  }
  const stated = (): Record<string, unknown> => Object(description().project.settings)
  const typeOf = (name: string): Type | undefined => {
    const type: unknown = Object.hasOwn(stated(), name) ? Reflect.get(Object(stated()[name]), 'type') : undefined
    return isType(type) ? type : undefined
  }
  const now = (name: string): unknown =>
    Object.hasOwn(read(), name) ? handed(typeOf(name), read()[name]) : defaultOf(typeOf(name))
  /** Holds a name to a setting of the project. Throws T0002 for any other. */
  const known = (name: unknown): string => {
    if (typeof name === 'string' && Object.hasOwn(stated(), name)) return name
    throw new TentError('T0002', `The project states no setting ${JSON.stringify(name)?.slice(0, 80)}.`, {
      fix: `Name a setting of \`project\`: ${Object.keys(stated()).sort().join(', ') || 'it states none'}.`,
      fields: { name: 'values' },
    })
  }
  // One member for each setting, read where it is asked: a value that was set is the value of the next read.
  const values = {}
  for (const name of Object.keys(stated()))
    Object.defineProperty(values, name, { enumerable: true, get: () => now(name) })
  return {
    values,
    shown: () =>
      Object.fromEntries(
        Object.keys(stated())
          .filter((name) => Reflect.get(Object(stated()[name]), 'public') === true && now(name) !== undefined)
          .map((name) => [name, now(name)]),
      ),
    set(name, value, written = false) {
      const type = typeOf(known(name))
      let given = value
      if (written && type?.kind !== 'text') {
        try {
          given = JSON.parse(String(value))
        } catch {
          throw new TentError(
            'T0002',
            `The setting ${name} is no text, so its value is read as JSON, and this is none.`,
            {
              fix: 'Write the value as JSON: a number as `20`, a switch as `true`, a list as `["a","b"]`.',
              fields: { value: 'type' },
            },
          )
        }
      }
      const found = type ? checkValue(type, given) : []
      if (found.length)
        throw new TentError('T0002', `The value does not fit the setting ${name}: ${found[0].message}`, {
          fix: 'Give the setting a value of the type that the project states for it.',
          fields: { value: Object.values(found[0].fields ?? {})[0] ?? 'type' },
        })
      const kept: unknown = JSON.parse(JSON.stringify(given))
      writeValues(file, 'settings', { ...read(), [name]: kept })
      stored = undefined
      return now(name)
    },
    remove(name) {
      const { [known(name)]: _, ...rest } = read()
      if (Object.keys(rest).length !== Object.keys(read()).length) writeValues(file, 'settings', rest)
      stored = undefined
    },
    list: () =>
      Object.keys(stated())
        .sort()
        .map((name) => ({
          name,
          ...(now(name) === undefined ? {} : { value: now(name) }),
          set: Object.hasOwn(read(), name),
          public: Reflect.get(Object(stated()[name]), 'public') === true,
        })),
  }
}
