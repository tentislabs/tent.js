import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fingerprintOf } from '../core/internal.ts'
import { parse, unreadOf } from './borrowed/vite.ts'
import { lookedFile, lookedPlace, lookedTree } from './lookups.ts'
import { placeOf } from './place.ts'
import type { Node } from './tree.ts'
import { lineOf } from './tree.ts'
import type { SourceFile, Work } from './work.ts'

/** The text of a file, with one line ending, whatever the system wrote. */
export const textOf = (file: string): string => readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')

/** Takes the path of a source file in its project and where it lies. Answers the file, read, with its tree. */
export function sourceFile(path: string, file: string): SourceFile {
  const bytes = readFileSync(file)
  const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes).replace(/\r\n?/g, '\n')
  // The fingerprint of the bytes as they lie, as the history keeps them: a point of a save reads the file no more.
  const made: SourceFile = { path, file: placeOf(file), text, arrows: new Map(), print: fingerprintOf(bytes) }
  try {
    made.tree = lookedTree(file, text, () => parse(text, path.endsWith('.tsx')))
    return made
  } catch (error) {
    const { words, at } = unreadOf(error)
    return { ...made, unread: { line: at === undefined ? 1 : lineOf(text, at), words } }
  }
}

/** The tree of a text of the project, read as a build reads it, or nothing for a text that does not read. */
export function treeOfText(path: string, text: string): Node | undefined {
  try {
    return parse(text, path.endsWith('.tsx'))
  } catch {
    return undefined
  }
}

const isFile = (file: string): boolean => lookedFile(file, (one) => existsSync(one) && statSync(one).isFile())

/** The file that a file names by a path that starts with a dot, by its real place, or nothing where no file is there. */
export function namedFile(from: string, name: string): string | undefined {
  // Asked again and again by the steps of a build: answered once while what is kept of the paths holds.
  const found = lookedPlace('named', `${from}\n${name}`, () => {
    const base = resolve(dirname(from), name)
    for (const tried of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')])
      if (isFile(tried)) return placeOf(tried)
    return ''
  })
  return found === '' ? undefined : found
}

const real = (file: string): string =>
  lookedPlace('real', file, (one) => (existsSync(one) ? realpathSync(one) : resolve(one)))

const under = (folder: string, file: string): boolean => {
  const path = relative(folder, file)
  return path !== '' && !path.startsWith('..') && !/^[a-zA-Z]:|^[\\/]/.test(path)
}

/**
 * Takes a file that the project names, where it lies. Answers the path it is kept under: its path from the folder
 * of the project, or `roots/<the place of its root>/<its path there>`. Answers nothing for a file that lies in
 * neither, also after every link is followed.
 */
export function keptPath(work: Work, file: string): string | undefined {
  const folders = [work.folder, ...work.roots]
  const kept = lookedPlace(`kept\n${folders.join('\n')}`, file, () => {
    const at = real(file)
    for (const [k, folder] of folders.entries()) {
      // Where the file lies after every link is what counts: a link that leads out of every folder is refused.
      if (!under(real(folder), at)) continue
      const path = relative(real(folder), at).replaceAll('\\', '/')
      return k ? `roots/${k - 1}/${path}` : path
    }
    return ''
  })
  return kept === '' ? undefined : kept
}
