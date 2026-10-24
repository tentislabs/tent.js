import type { Description } from '../core/internal.ts'
import { isStored } from '../core/internal.ts'
import { keptPath, namedFile } from './source.ts'
import type { Work } from './work.ts'

/** Whether a stored definition states that it is offered to MCP. */
export const offered = (stored: unknown): boolean =>
  isStored(stored) && Array.isArray(stored.offer) && stored.offer.includes('mcp')

/** Every view that a screen draws, however deep, with its layout and what that draws: the screen first. */
export function viewsOf(description: Description, name: string): string[] {
  const found: string[] = []
  const waiting = [name]
  for (let one = waiting.shift(); one !== undefined; one = waiting.shift()) {
    if (found.includes(one)) continue
    found.push(one)
    const stored: unknown = description.screens[one] ?? description.components[one]
    if (!isStored(stored)) continue
    if (Array.isArray(stored.uses)) waiting.push(...stored.uses.map(String))
    for (const field of ['layout', 'loading'])
      if (typeof stored[field] === 'string') waiting.push(String(stored[field]))
  }
  return found
}

/** The names that a stored value reads or calls, however deep: a `function`, `query`, `action` or `flow`. */
function namedIn(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) for (const one of value) namedIn(one, found)
  if (!isStored(value)) return
  for (const key of ['function', 'query', 'action', 'flow'])
    if (typeof value[key] === 'string') found.add(String(value[key]))
  for (const one of Object.values(value)) namedIn(one, found)
}

/** The definitions that the file of a view imports from other files of the project, by their names. */
function importedBy(work: Work, file: string | undefined): string[] {
  const source = file === undefined ? undefined : work.files.get(file)
  if (!source?.seen) return []
  return source.seen.imports.flatMap((one) => {
    const target = namedFile(source.file, one.from)
    const path = target ? keptPath(work, target) : undefined
    const declared = path === undefined ? undefined : work.files.get(path)?.seen?.declared
    const named = declared?.find((made) => made.exportName === one.name)?.name
    return named === undefined ? [] : [named]
  })
}

/** What a screen reads or calls: by the data of its views, and by what the code of its views imports. */
function usedBy(work: Work, description: Description, screen: string): Set<string> {
  const found = new Set<string>()
  for (const view of viewsOf(description, screen)) {
    const stored: unknown = description.screens[view] ?? description.components[view]
    if (!isStored(stored)) continue
    namedIn(stored.data, found)
    const place: unknown = Object.hasOwn(description.places, view) ? description.places[view].file : undefined
    for (const name of importedBy(work, typeof place === 'string' ? place : undefined)) found.add(name)
  }
  return found
}

/**
 * The functions that only a screen in a chat uses: offered to MCP, read or called by a screen that is offered to
 * MCP, and by no screen that is not. A chat app is told that the frame alone calls them, so they cost its model
 * nothing. A file that holds more than one view is taken as used by each of them.
 */
export function frameOnly(work: Work, description: Description): string[] {
  const [chat, other] = [new Set<string>(), new Set<string>()]
  for (const screen of Object.keys(description.screens))
    for (const name of usedBy(work, description, screen))
      (offered(description.screens[screen]) ? chat : other).add(name)
  return [...chat].filter((name) => !other.has(name) && offered(description.functions[name])).sort()
}
