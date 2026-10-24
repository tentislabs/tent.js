import { readdirSync } from 'node:fs'
import { join } from 'node:path'

// What every walk of a project leaves out: the engine's own folder, and the packages that are installed again.
const left = new Set(['.tent', 'node_modules'])

/**
 * Takes a folder of a project. Answers every file under it by its place, in the order of their names, folder by
 * folder: a link is never followed, so nothing outside the folder is reached through one.
 */
export function projectFiles(folder: string, into: string[] = []): string[] {
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (left.has(entry.name) || entry.isSymbolicLink()) continue
    const place = join(folder, entry.name)
    if (entry.isDirectory()) projectFiles(place, into)
    else if (entry.isFile()) into.push(place)
  }
  return into
}
