// The files of a tree that the rigs of clean code hold: one answer for every rig that reads them itself.
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const endings = /\.(?:[cm]?ts|[cm]?js|tsx|jsx)$/

// A pattern holds a path and all that lies under it, as the formatter reads its own settings.
const pattern = (words) =>
  new RegExp(
    `^${words
      .split('**')
      .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '[^/]*'))
      .join('.*')}(?:/.*)?$`,
  )

/**
 * Takes the folder of a tree in the shape of the repository, and answers the code files that the rigs hold in it,
 * each as its path from that folder, written with `/`, in the order of the paths. What is held and what is left out
 * is read from the settings of the formatter at the root of the repository, so it is written in one place.
 * Throws when those settings cannot be read.
 */
export function heldFiles(folder) {
  const { includes } = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8')).files
  const held = includes.filter((words) => !words.startsWith('!')).map(pattern)
  const left = includes.filter((words) => words.startsWith('!')).map((words) => pattern(words.replace(/^!+/, '')))
  const files = []
  const walk = (path) => {
    for (const entry of readdirSync(join(folder, path), { withFileTypes: true })) {
      const below = path ? `${path}/${entry.name}` : entry.name
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || left.some((one) => one.test(below))) continue
      if (entry.isDirectory()) walk(below)
      else if (endings.test(entry.name) && held.some((one) => one.test(below))) files.push(below)
    }
  }
  walk('')
  return files.sort()
}
