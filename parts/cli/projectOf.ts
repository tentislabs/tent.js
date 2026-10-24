import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** The folder of the project that a folder lies in: the nearest one, upward, that holds `tent.ts`, or nothing where none does. */
export function projectOf(folder: string): string | undefined {
  for (let at = resolve(folder); ; at = dirname(at)) {
    if (existsSync(join(at, 'tent.ts'))) return at
    if (dirname(at) === at) return undefined
  }
}
