import { builtinModules } from 'node:module'
import { posix } from 'node:path'
import { TentError } from '../../core/index.ts'

/** What a name that a module of a version imports stands for. */
export type Found =
  // An entry of the framework, by the address of its file: both sides hold one framework.
  | { framework: string }
  // A module of the version, by its path inside the version's files.
  | { path: string }
  // One of the six names of the page code, which the page code's own hook answers.
  | { page: string }
  // A module of the runtime itself.
  | { runtime: string }

// The entries of the framework that an app's code may import, by their names.
const framework: Record<string, string> = {
  tentjs: new URL('../../core/index.ts', import.meta.url).href,
  'tentjs/engine': new URL('../index.ts', import.meta.url).href,
  'tentjs/data': new URL('../../data/index.ts', import.meta.url).href,
}

// The names by which a module built against the page code finds it.
const pageNames = new Set([
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  'tentjs/ui',
])

/** The address of the file of an entry of the framework that an app's code may import, by its name, or nothing. */
export const frameworkEntry = (name: string): string | undefined =>
  Object.hasOwn(framework, name) ? framework[name] : undefined

const runtimeNames = new Set(builtinModules)

const outside = (name: string, why: string): TentError =>
  new TentError('T0011', `The module ${name.slice(0, 120)} cannot be loaded: ${why}.`, {
    fix: 'Build the project again, and run the bundle as the build wrote it.',
  })

/**
 * Takes the path of the module that imports, inside its version, or nothing for a module that the description
 * names, and the name it imports. Answers what the name stands for: the framework's entry for `tentjs`, a path
 * inside the version, a name of the page code, or a module of the runtime. Throws T0011 for anything else, and for
 * a path that leaves the version.
 */
export function resolveIn(from: string | undefined, name: string): Found {
  const entry = frameworkEntry(name)
  if (entry !== undefined) return { framework: entry }
  if (from !== undefined && pageNames.has(name)) return { page: name }
  if (from !== undefined && (name.startsWith('node:') || runtimeNames.has(name))) return { runtime: name }
  const relative = name.startsWith('./') || name.startsWith('../')
  if (from !== undefined && !relative) throw outside(name, 'it is no module of the version')
  if (from === undefined && (relative || posix.isAbsolute(name) || /^[a-z]+:/i.test(name) || name.includes('\\')))
    throw outside(name, 'a module that the description names is a path inside the version')
  const path = posix.normalize(from === undefined ? name : posix.join(posix.dirname(from), name))
  if (path === '..' || path.startsWith('../') || posix.isAbsolute(path) || path === '.')
    throw outside(name, 'its path leaves the version')
  return { path }
}
