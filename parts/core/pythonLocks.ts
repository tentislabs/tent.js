import type { Description } from './description.ts'

// The form of the name of a package of Python, as the standard writes it.
const packageName = '[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?'

/** Whether a text is the name of a lock: letters, digits and hyphens alone, so that its file lies beside the project's. */
export const isLockName = (lock: unknown): lock is string =>
  typeof lock === 'string' && /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(lock)

/** The file of a lock by its name: the lock of the project, `''`, or a lock that a definition names. */
export const lockFile = (lock: string): string => (lock === '' ? 'python.lock' : `python.${lock}.lock`)

/** The name of a package as the standard compares it: small letters, with each run of `-`, `_` and `.` one `-`. */
export const normalName = (written: string): string =>
  (written.match(new RegExp(`^\\s*(${packageName})`))?.[1] ?? written).toLowerCase().replace(/[-_.]+/g, '-')

/** One lock of a description. */
export interface Locked {
  // Its name, `''` for the project's own, and its file.
  lock: string
  file: string
  // The definitions locked into it, by their names, and their entries of `packages` in that order.
  definitions: string[]
  entries: string[]
  // The entries of each definition, as it wrote them.
  of: Record<string, string[]>
}

/**
 * Takes a description. Answers each lock that its `python` definitions are locked into, the project's own first as
 * `''` and then by name, with the definitions of each by their names and their entries of `packages` in that
 * order. A definition whose `lock` is no name is locked into none: the build refuses it.
 */
export function locksOf(description: Description): Locked[] {
  const found = new Map<string, Locked>()
  for (const [definition, record] of Object.entries(description.functions).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const python: unknown = record.python
    if (typeof python !== 'object' || python === null) continue
    const lock: unknown = Reflect.get(python, 'lock')
    if (lock !== undefined && !isLockName(lock)) continue
    const named = lock ?? ''
    const written: unknown = Reflect.get(python, 'packages')
    const entries = Array.isArray(written) ? written.filter((one): one is string => typeof one === 'string') : []
    const held = found.get(named) ?? { lock: named, file: lockFile(named), definitions: [], entries: [], of: {} }
    held.definitions.push(definition)
    held.entries.push(...entries)
    held.of[definition] = entries
    found.set(named, held)
  }
  return [...found.values()].sort((a, b) => (a.lock < b.lock ? -1 : 1))
}

/** The Python that a lock is made for, where the project names one: `version` of the named lock, or of the project. */
export function pythonOfLock(description: Description, lock: string): string | undefined {
  const python = Object(description.project.python)
  const own: unknown = lock === '' ? undefined : Reflect.get(Object(Reflect.get(Object(python.locks), lock)), 'version')
  const version: unknown = typeof own === 'string' ? own : python.version
  return typeof version === 'string' ? version : undefined
}
