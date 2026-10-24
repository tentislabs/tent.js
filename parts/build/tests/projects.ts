import { cpSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../../core/index.ts'

/** The root of the repository. */
const root = join(import.meta.dirname, '..', '..', '..')

/** The packages that each project of the tests imports, by its name, as they lie under `packaged/`. */
const packaged: Record<string, string[]> = { screens: ['@acme/ui'] }

/** The folder of a project of the tests, as it lies beside them. */
export const lying = (name: string): string => join(import.meta.dirname, name)

/**
 * Takes the name of a project of the tests, which may lie inside a folder of several, and a name for the copy.
 * Copies the folder it lies in to a folder of its own under `results/`, where a build may write, and answers the
 * place of the project there.
 */
export function copyOf(name: string, as: string): string {
  const [top] = name.split('/')
  const copy = join(root, 'results', 'build', as)
  rmSync(copy, { recursive: true, force: true })
  cpSync(lying(top), join(copy, top), { recursive: true })
  // A package that a project imports is installed into the copy: what is installed is never kept in the repository.
  for (const one of packaged[top] ?? [])
    cpSync(lying(join('packaged', one)), join(copy, top, 'node_modules', one), { recursive: true })
  return join(copy, name)
}

/** Each finding of a code, as the file and the line it names. */
export const placesOf = (findings: Finding[], code: string): string[] =>
  findings.filter((one) => one.code === code).map((one) => `${one.where?.file}:${one.where?.line}`)

/** The errors among what was found, each as its code and its words, for a test that expects none. */
export const errorsOf = (findings: Finding[]): string[] =>
  findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`)

/** Every file under a folder, by its path from the folder, written with `/`, with its bytes as hex. */
export function filesOf(folder: string, path = ''): Record<string, string> {
  const found: Record<string, string> = {}
  for (const name of readdirSync(join(folder, path)).sort()) {
    const below = path ? `${path}/${name}` : name
    if (statSync(join(folder, below)).isDirectory()) Object.assign(found, filesOf(folder, below))
    else found[below] = readFileSync(join(folder, below)).toString('hex')
  }
  return found
}

/** The line of a text that holds a piece of it, counted from 1, or 0 where none does. */
export const lineWith = (text: string, piece: string): number =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .findIndex((line) => line.includes(piece)) + 1
