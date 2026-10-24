import type { FileReach } from './arrows.ts'
import { readArrows } from './arrows.ts'
import type { Imported, Known } from './reach.ts'
import { NotPlain, nothingInReach } from './reach.ts'
import { value } from './value.ts'
import { keptPath, namedFile, textOf } from '../source.ts'
import { child, keyOf, kid, kids, nameOf, propertyOf } from '../tree.ts'
import type { SourceFile, Work } from '../work.ts'

/** The files that a file may import as its default, for the text they hold. */
export const textFile = /\.(?:md|txt)$/

/** What is known of each definition that a file makes, by the name of its `const`. */
export function knownOf(file: SourceFile): Map<string, Known> {
  const known = new Map<string, Known>()
  for (const one of file.seen?.declared ?? []) {
    if (one.name === undefined) continue
    const entry: Known = { kind: one.word, definition: one.name }
    if (one.word === 'model' && propertyOf(one.options, 'input') && propertyOf(one.options, 'output'))
      entry.called = true
    if (one.word === 'project') {
      // An option of the project is stored where a body reads it, as the plain value that the project's file writes.
      const read = new Map<string, unknown>()
      for (const property of one.options?.type === 'ObjectExpression' ? kids(one.options, 'properties') : []) {
        const key = property.type === 'Property' ? keyOf(property) : undefined
        if (key === undefined) continue
        try {
          read.set(key, value(child(property, 'value'), nothingInReach()))
        } catch (failure) {
          if (!(failure instanceof NotPlain)) throw failure
          read.set(key, undefined)
        }
      }
      entry.option = (name) => (read.has(name) ? read.get(name) : { nothing: true })
    }
    known.set(one.exportName, entry)
  }
  return known
}

/** What a file gives every arrow that is read in it. */
export function reachOf(work: Work, file: SourceFile, known: Map<string, Map<string, Known>>): FileReach {
  const imports = new Map<string, Imported>()
  for (const one of file.seen?.imports ?? []) {
    const target = one.from.startsWith('.') ? namedFile(file.file, one.from) : undefined
    const path = target ? keptPath(work, target) : undefined
    const app = path !== undefined ? known.get(path)?.get(one.name) : undefined
    if (one.from === 'tentjs' || one.from === 'tentjs/ui') imports.set(one.local, { ours: one.name })
    else if (target && path !== undefined && textFile.test(target) && one.name === 'default')
      imports.set(one.local, { text: textOf(target), textFile: path })
    else imports.set(one.local, app ? { app } : { other: one.from })
  }
  const tops = new Map<string, { value?: unknown }>()
  for (const node of file.tree ? kids(file.tree, 'body') : []) {
    const declaration = node.type === 'ExportNamedDeclaration' ? (kid(node, 'declaration') ?? node) : node
    if (declaration.type === 'FunctionDeclaration' || declaration.type === 'ClassDeclaration')
      tops.set(nameOf(kid(declaration, 'id')) ?? '', {})
    if (declaration.type !== 'VariableDeclaration') continue
    for (const one of kids(declaration, 'declarations')) {
      const name = nameOf(kid(one, 'id'))
      const init = kid(one, 'init')
      if (name === undefined) continue
      try {
        tops.set(name, declaration.kind === 'const' && init ? { value: value(init, nothingInReach()) } : {})
      } catch (failure) {
        if (!(failure instanceof NotPlain)) throw failure
        tops.set(name, {})
      }
    }
  }
  return { imports, own: known.get(file.path) ?? new Map(), tops }
}

/**
 * Takes the work of a build whose files are found and sorted. Reads the arrows of every definition of every
 * backend file, and keeps what was read with the file. Answers what is known of the definitions of each file.
 */
export function readFiles(work: Work): Map<string, Map<string, Known>> {
  const backend = [...work.files.values()].filter((file) => file.sort === 'backend')
  const known = new Map(backend.map((file) => [file.path, knownOf(file)] as const))
  for (const file of backend) {
    const reach = reachOf(work, file, known)
    for (const declared of file.seen?.declared ?? [])
      file.arrows.set(declared.exportName, readArrows(declared, reach, file.text))
  }
  return known
}
