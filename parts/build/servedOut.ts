import { posix } from 'node:path'
import type { Description } from '../core/internal.ts'
import { isStyle, parted } from './asked.ts'
import { reachPrint } from './reach.ts'
import { namedFile } from './source.ts'
import type { Node } from './tree.ts'
import { below, kid, kids, unwrap, word } from './tree.ts'
import type { SourceFile, Work } from './work.ts'

/** One thing that is written into a text: where, and what, with no line ending in it. */
type Insert = { at: number; text: string }

/** A stretch of a text, from its first character to the one after its last. */
type Span = { start: number; end: number }

/**
 * What a browser is handed of a screen file that holds a component drawn on the server alone: the text of the file
 * with that component, what the file holds for it alone and what only it imports put out, each character of them a
 * space and each line ending kept, so every place of the file keeps its line and column; what is written into that
 * text; the stretches that were put out; and the files and packages that the text still imports.
 */
export interface ServedOut {
  text: string
  inserts: Insert[]
  gone: Span[]
  named: string[]
}

/**
 * The record that a browser holds of a component that is drawn on the server alone: what a use gives it, and its
 * own `data` where that is stored, which a page watches to draw it again. Its view stays on the server.
 */
function servedOptions(stored: Record<string, unknown>): Record<string, unknown> {
  const isCode = (one: unknown): boolean => typeof one === 'object' && one !== null && Reflect.get(one, 'code') === true
  return {
    browser: false,
    ...Object.fromEntries(
      ['props', 'data'].flatMap((field) =>
        stored[field] !== undefined && !isCode(stored[field]) ? [[field, stored[field]]] : [],
      ),
    ),
  }
}

/** The names that a pattern of a declaration binds. */
function boundBy(pattern: Node | undefined): string[] {
  if (!pattern) return []
  if (pattern.type === 'Identifier') return [word(pattern, 'name') ?? '']
  if (pattern.type === 'ObjectPattern')
    return kids(pattern, 'properties').flatMap((one) =>
      boundBy(one.type === 'RestElement' ? kid(one, 'argument') : kid(one, 'value')),
    )
  if (pattern.type === 'ArrayPattern') return kids(pattern, 'elements').flatMap(boundBy)
  if (pattern.type === 'AssignmentPattern') return boundBy(kid(pattern, 'left'))
  if (pattern.type === 'RestElement') return boundBy(kid(pattern, 'argument'))
  return []
}

/** The kinds of statement that only declare names, which a file may hold for one component alone. */
const declaring = new Set([
  'VariableDeclaration',
  'FunctionDeclaration',
  'ClassDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'TSEnumDeclaration',
])

/** The names that a statement which only declares binds. */
const declaredBy = (statement: Node): string[] =>
  statement.type === 'VariableDeclaration'
    ? kids(statement, 'declarations').flatMap((one) => boundBy(kid(one, 'id')))
    : [word(kid(statement, 'id'), 'name') ?? '']

/** Whether a node of the tree names nothing where it stands: a key, a property after a dot, a name of an attribute. */
function namesNothing(parent: Node, node: Node): boolean {
  const own = (member: string): boolean => kid(parent, member) === node
  if (parent.type === 'MemberExpression' || parent.type === 'JSXMemberExpression')
    return own('property') && parent.computed !== true
  if (['Property', 'PropertyDefinition', 'MethodDefinition', 'AccessorProperty'].includes(parent.type))
    return own('key') && parent.computed !== true && parent.shorthand !== true
  if (parent.type === 'JSXAttribute') return own('name')
  if (parent.type === 'ExportSpecifier') return own('exported') && kid(parent, 'local') !== node
  return false
}

/**
 * Every name that a node reads, outside the stretches that are put out. A name that only stands for another thing
 * there, a local name among them, is counted too: so what is kept may hold more, and never less, than it needs.
 */
function readBy(node: Node, gone: Span[], found = new Set<string>()): Set<string> {
  if (gone.some((one) => one.start <= node.start && node.end <= one.end)) return found
  if (node.type === 'Identifier' || node.type === 'JSXIdentifier') found.add(word(node, 'name') ?? '')
  for (const one of below(node)) if (!namesNothing(node, one)) readBy(one, gone, found)
  return found
}

/**
 * Takes a text and a place in it. Answers the place where the comments that stand right before it start, with
 * only room between them: what is written above a statement is a part of it.
 */
function commentsBefore(text: string, at: number): number {
  let start = at
  for (;;) {
    const end = text.slice(0, start).trimEnd().length
    const line = text.lastIndexOf('\n', end - 1) + 1
    if (text.slice(line, end).trimStart().startsWith('//')) start = line + text.slice(line, end).search(/\S/)
    else if (text.slice(0, end).endsWith('*/')) {
      const open = text.lastIndexOf('/*', end - 2)
      if (open < 0 || text.slice(text.lastIndexOf('\n', open - 1) + 1, open).trim() !== '') return start
      start = open
    } else return start
  }
}

/** Whether an import names a style file as its looks, and not as its text, its address or its bytes. */
const isLooks = (from: string): boolean => isStyle(from) && parted(from)[1] === ''

/**
 * Takes the files of the project by where each lies, the style files that the code of each package brings, by its
 * name, the screen file, and what one of its imports names. Answers each style file that the import reaches: the
 * one it names, each that the code of the package it names brings, or each that the file of the project it names
 * imports, itself, through a package or through the files it imports, however deep. Each is written as the screen
 * file names it: one that an import names by a package's name by that name, and any other by its path from the
 * screen file. An `import type` is gone when the file runs, and is not followed.
 */
function looksReached(
  byPlace: Map<string, SourceFile>,
  packages: Record<string, string[]>,
  file: SourceFile,
  asked: string,
): string[] {
  if (isLooks(asked)) return [asked]
  const pathTo = (lies: string): string => {
    const path = posix.relative(posix.dirname(file.file), lies)
    return path.startsWith('.') ? path : `./${path}`
  }
  const brought = (from: string): string[] => (Object.hasOwn(packages, from) ? packages[from].map(pathTo) : [])
  if (!asked.startsWith('.')) return brought(asked)
  const found: string[] = []
  const seen = new Set<string>()
  const first = byPlace.get(namedFile(file.file, asked) ?? '')
  const left = first ? [first] : []
  for (let one = left.pop(); one !== undefined; one = left.pop()) {
    if (seen.has(one.file)) continue
    seen.add(one.file)
    for (const { from, node } of one.seen?.named ?? []) {
      if (node.importKind === 'type' || node.exportKind === 'type') continue
      if (isLooks(from) && !from.startsWith('.')) found.push(from)
      else if (isLooks(from)) found.push(pathTo(posix.join(posix.dirname(one.file), from)))
      else if (from.startsWith('.')) {
        const target = byPlace.get(namedFile(one.file, from) ?? '')
        if (target) left.push(target)
      } else found.push(...brought(from))
    }
  }
  return [...new Set(found)]
}

/** The text of an import that keeps some of the names it takes. */
function importOf(text: string, statement: Node, kept: Node[]): string {
  const named = kept.filter((one) => one.type === 'ImportSpecifier')
  const piece = (one: Node): string => text.slice(one.start, one.end).replace(/\s+/g, ' ')
  const taken = [
    ...kept.filter((one) => one.type !== 'ImportSpecifier').map(piece),
    ...(named.length ? [`{ ${named.map(piece).join(', ')} }`] : []),
  ]
  const source = kid(statement, 'source') ?? statement
  const head = statement.importKind === 'type' ? 'import type' : 'import'
  return `${head} ${taken.join(', ')} from ${text.slice(source.start, statement.end).replace(/\s+/g, ' ')}`
}

// What was worked out of a file for a description, by the text of the file with all it reaches and by the style
// files of the packages: a build asks for it of each file several times.
const outs = new WeakMap<Description, WeakMap<SourceFile, { reach: string; out: ServedOut | undefined }>>()

/** The components of a screen file that are drawn on the server alone. */
const servedIn = (description: Description, file: SourceFile) =>
  (file.seen?.declared ?? []).filter(
    (one) => one.word === 'component' && Object(description.components[one.name ?? one.exportName]).browser === false,
  )

/**
 * Takes the work of a build, its description and a screen file. Answers what a browser is handed of the file where
 * it holds a component that is drawn on the server alone, whatever else it holds, and nothing for any other file.
 * Each such component is its record and no view. A statement of the file that only declares, and a name that it
 * imports, is put out where nothing that is kept reads it, so no byte of such a component, nor of what only it reads
 * or imports, reaches a browser. An import that names nothing, and every other statement, are kept, and an import
 * that is put out leaves the style files it reaches as imports that name nothing, those that the code of a package
 * brings among them, as the server's side of the build followed it: the page that draws such a component loads its
 * looks as those of any other.
 */
export function servedOut(work: Work, description: Description, file: SourceFile): ServedOut | undefined {
  if (file.sort !== 'screen' || !file.tree || !servedIn(description, file).length) return undefined
  const packages = work.packageLooks ?? {}
  const reach = `${reachPrint(work, file)}\n${JSON.stringify(packages)}`
  const held = outs.get(description)?.get(file)
  if (held?.reach === reach) return held.out
  const byPlace = new Map([...work.files.values()].map((one) => [one.file, one] as const))
  const out = madeOut(description, file, byPlace, packages)
  outs.set(description, (outs.get(description) ?? new WeakMap()).set(file, { reach, out }))
  return out
}

/** Works out what `servedOut` answers. */
function madeOut(
  description: Description,
  file: SourceFile,
  byPlace: Map<string, SourceFile>,
  packages: Record<string, string[]>,
): ServedOut | undefined {
  const served = servedIn(description, file)
  if (!file.tree) return undefined
  const text = file.text
  const gone: Span[] = []
  const inserts: Insert[] = []
  // The word that the file makes each such component with stays: its record is made with it.
  const needed = new Set<string>()
  for (const one of served) {
    const init = kid(one.node, 'init')
    const call = init ? unwrap(init) : undefined
    const callee = word(kid(call, 'callee'), 'name')
    if (!init || callee === undefined) continue
    const name = one.name ?? one.exportName
    const options = servedOptions(Object(description.components[name]))
    gone.push(init, { start: commentsBefore(text, one.statement.start), end: one.statement.start })
    inserts.push({
      at: init.start,
      text: `${callee}(${JSON.stringify(name)}, { ...${JSON.stringify(options)}, view: () => null })`,
    })
    needed.add(callee)
  }
  // Each statement that only declares, and each name that an import takes, is kept where a kept one reads it.
  const units: { names: string[]; node: Node; reads: Set<string> }[] = []
  for (const statement of kids(file.tree, 'body')) {
    if (statement.type === 'ImportDeclaration')
      for (const one of kids(statement, 'specifiers'))
        units.push({ names: [word(kid(one, 'local'), 'name') ?? ''], node: one, reads: new Set() })
    else if (declaring.has(statement.type)) {
      const names = declaredBy(statement)
      const reads = readBy(statement, gone)
      for (const name of names) reads.delete(name)
      units.push({ names, node: statement, reads })
    } else for (const name of readBy(statement, gone)) needed.add(name)
  }
  const kept = new Set<Node>()
  const waiting = [...needed]
  for (let name = waiting.pop(); name !== undefined; name = waiting.pop())
    for (const unit of units)
      if (!kept.has(unit.node) && unit.names.includes(name)) {
        kept.add(unit.node)
        waiting.push(...unit.reads)
      }
  const named: string[] = []
  for (const statement of kids(file.tree, 'body')) {
    const from = word(kid(statement, 'source'), 'value')
    if (statement.type === 'ImportDeclaration') {
      const all = kids(statement, 'specifiers')
      const taken = all.filter((one) => kept.has(one))
      if (all.length && !taken.length) {
        gone.push(statement)
        const looks =
          statement.importKind === 'type' || from === undefined ? [] : looksReached(byPlace, packages, file, from)
        if (looks.length)
          inserts.push({ at: statement.start, text: looks.map((one) => `import ${JSON.stringify(one)};`).join(' ') })
        named.push(...looks)
      } else if (taken.length < all.length) {
        gone.push(statement)
        inserts.push({ at: statement.start, text: importOf(text, statement, taken) })
      }
      if ((!all.length || taken.length) && from !== undefined) named.push(from)
    } else if (declaring.has(statement.type) && !kept.has(statement))
      gone.push({ start: commentsBefore(text, statement.start), end: statement.end })
    else if (from !== undefined) named.push(from)
  }
  let out = text
  for (const one of gone)
    out = `${out.slice(0, one.start)}${out.slice(one.start, one.end).replace(/[^\n]/g, ' ')}${out.slice(one.end)}`
  return { text: out, inserts, gone, named }
}
