import { SourceMap } from 'node:module'
import { posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { holdsFile, textAt } from '../files.ts'
import { askedMark, isSteady, moduleMarkOf } from '../moduleMarks.ts'
import type { Opened } from '../opened.ts'
import type { TraceCall } from './stack.ts'

/** Where a call of a chain lies in the source: a file of the project, a file of a package, or the framework's own. */
export type Placed =
  | { of: 'project'; name?: string; file: string; line: number; column: number; text?: string }
  | { of: 'package'; package: string; file: string }
  | { of: 'framework' }

/** A module of a version: the place of the version, and the path of the module in it. */
interface Module {
  place: string
  path: string
}

// The maps that were read, by the place of the version and the path of the module: a version never changes, so a
// map is read once.
const read = new Map<string, SourceMap | undefined>()

/** The source map that lies beside a module, where a development build wrote one. */
function mapOf(module: Module): SourceMap | undefined {
  const key = `${module.place}\n${module.path}`
  if (read.has(key)) return read.get(key)
  let map: SourceMap | undefined
  try {
    map = holdsFile(module.place, `${module.path}.map`)
      ? new SourceMap(JSON.parse(textAt(module.place, `${module.path}.map`)))
      : undefined
  } catch {
    map = undefined
  }
  if (read.size > 500) read.clear()
  read.set(key, map)
  return map
}

/** The folders of the bundles of every version of an app that can be loaded: a page of an older one still fails. */
const bundlesOf = (o: Opened): string[] => [
  o.bundle,
  ...[...(o.versions?.values() ?? [])].map((one) => one.folder).filter((one) => one !== o.bundle),
]

/**
 * Takes an app and the place of a module as a trace names it: a file of the runtime, or the address of a file of the
 * bundle that a browser loaded. Answers the module where it lies in a version of the app, and nothing for any other.
 */
function moduleAt(o: Opened, at: string): Module | undefined {
  if (at.startsWith('file:')) {
    let file: string
    try {
      const plain = new URL(at)
      plain.search = ''
      file = fileURLToPath(plain)
    } catch {
      return undefined
    }
    const place = bundlesOf(o).find((bundle) => isUnder(bundle, file))
    return place === undefined ? undefined : { place, path: relative(resolve(place), file).split(sep).join('/') }
  }
  const asked = /^https?:\/\/[^/]+\/_t\/b\/([^?#]+)(\?[^#]*)?(#.*)?$/.exec(at)
  const path = asked?.[1]
  if (path === undefined || path.split('/').some((one) => one === '..' || one === '')) return undefined
  // A module of development has one address in every version: the mark it was loaded at names its version.
  const mark = askedMark(asked?.[2] ?? '')
  const kept = [o, ...[...(o.versions?.values() ?? [])].map((one) => one.served).filter((one) => one !== o)]
  const marked =
    mark === undefined ? undefined : kept.find((one) => isSteady(one, path) && moduleMarkOf(one, path) === mark)?.bundle
  const place = marked ?? bundlesOf(o).find((bundle) => holdsFile(bundle, `${path}.map`))
  return place === undefined ? undefined : { place, path }
}

/** Whether a place lies inside a folder. */
function isUnder(folder: string, file: string): boolean {
  const path = relative(resolve(folder), resolve(file))
  return path !== '' && !path.startsWith('..') && !path.startsWith(sep) && !/^[a-zA-Z]:/.test(path)
}

// The packages that the framework itself is: its own, and the React that its page code holds.
const ours = ['tentjs', 'react', 'react-dom', 'scheduler']

/**
 * Takes the path of a source as a map of the build names it, from the folder of the project. Answers what it is:
 * a file of the project, a file of a package and its name, or the framework's own, a file made by the build among it.
 */
function sourceOf(source: string): Placed | { of: 'project'; file: string } {
  const path = posix.normalize(source.replaceAll('\\', '/'))
  // A package is a package wherever its folder lies: also in a folder above the project, as in a workspace.
  const kept = /(^|\/)node_modules\/((@[^/]+\/)?[^/]+)\//.exec(path)
  // React is the one the page code holds, which every page loads: its calls are the framework's.
  if (kept) return ours.includes(kept[2]) ? { of: 'framework' } : { of: 'package', package: kept[2], file: path }
  if (path.startsWith('../') || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || /[\0:]/.test(path))
    return { of: 'framework' }
  return { of: 'project', file: path }
}

/**
 * Takes an app and one call of a chain. Answers where it lies in the source, by the source map of its module: a
 * line and a column of a file of the project, counted from 1, with the text of the file where the map holds it.
 */
export function inSource(o: Opened, frame: TraceCall): Placed {
  const module = moduleAt(o, frame.at)
  const map = module === undefined ? undefined : mapOf(module)
  if (!map) return { of: 'framework' }
  const entry = map.findEntry(frame.line - 1, frame.column - 1)
  const source: unknown = Reflect.get(entry, 'originalSource')
  const line: unknown = Reflect.get(entry, 'originalLine')
  const column: unknown = Reflect.get(entry, 'originalColumn')
  if (typeof source !== 'string' || typeof line !== 'number' || typeof column !== 'number') return { of: 'framework' }
  const found = sourceOf(source)
  if (found.of !== 'project') return found
  const sources: unknown = Reflect.get(map.payload, 'sources')
  const texts: unknown = Reflect.get(map.payload, 'sourcesContent')
  const place = Array.isArray(sources) ? sources.indexOf(source) : -1
  const text: unknown = Array.isArray(texts) && place >= 0 ? texts[place] : undefined
  return {
    of: 'project',
    ...(frame.name ? { name: frame.name } : {}),
    file: found.file,
    line: line + 1,
    column: column + 1,
    ...(typeof text === 'string' ? { text } : {}),
  }
}
