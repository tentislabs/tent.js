import { posix } from 'node:path'
import type { Node, Source } from '../build/index.ts'
import { child, nameOf, scan, unwrap } from '../build/index.ts'
import type { Written } from './rule.ts'
import { writtenIn } from './rule.ts'

const endings = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

/**
 * Takes the source of a project, the path of one of its files, and a name as that file writes it. Answers the file
 * of the project that the name is imported from and the name it has there, or nothing for a name the file does not
 * import from a file of the project.
 */
export function importedFrom(source: Source, path: string, name: string): { path: string; name: string } | undefined {
  const tree = source[path]?.tree
  const imported = tree ? scan(tree).imports.find((one) => one.local === name) : undefined
  if (!imported?.from.startsWith('.')) return undefined
  const lies = posix.join(posix.dirname(path), imported.from)
  const file = endings.map((ending) => lies + ending).find((one) => Object.hasOwn(source, one))
  return file === undefined ? undefined : { path: file, name: imported.name }
}

/**
 * Takes the source of a project, the path of one of its files, and a name as that file writes it. Answers the
 * definition that the name stands for: one that the file makes itself, or one that it imports from another file
 * of the project. Nothing for any other name.
 */
export function definitionNamed(source: Source, path: string, name: string): Written | undefined {
  const all = writtenIn(source)
  const own = all.find((one) => one.path === path && one.declared.exportName === name)
  if (own) return own
  const from = importedFrom(source, path, name)
  return from && all.find((one) => one.path === from.path && one.declared.exportName === from.name)
}

/** The definition that a value of a view names, where the value is one name: `call={addOrder}`. */
export function definitionAt(source: Source, path: string, written: Node | undefined): Written | undefined {
  if (!written) return undefined
  const node = unwrap(written.type === 'JSXExpressionContainer' ? child(written, 'expression') : written)
  const name = nameOf(node)
  return name === undefined ? undefined : definitionNamed(source, path, name)
}
