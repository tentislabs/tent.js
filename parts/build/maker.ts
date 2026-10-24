import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprintOf } from '../core/internal.ts'

let made: string | undefined

/** Every code file of the build where it lies, no test and no list among them, each by its path, in their order. */
function filesUnder(folder: string, path = ''): string[] {
  return readdirSync(join(folder, path), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const below = path ? `${path}/${entry.name}` : entry.name
      if (entry.isDirectory()) return entry.name === 'tests' ? [] : filesUnder(folder, below)
      return /\.(ts|tsx|js)$/.test(entry.name) && entry.name !== 'list.ts' ? [below] : []
    })
}

/**
 * The fingerprint of the code of the build itself, which a module that it keeps is kept under: a module that a
 * build of other code made is made anew, whatever else holds, as its maps may name their sources another way.
 */
export function makerPrint(): string {
  if (made === undefined) {
    const folder = fileURLToPath(new URL('.', import.meta.url))
    const texts = filesUnder(folder).map((path) => `${path}\n${readFileSync(join(folder, path), 'utf8')}`)
    made = fingerprintOf(new TextEncoder().encode(texts.join('\n'))).slice(0, 32)
  }
  return made
}
