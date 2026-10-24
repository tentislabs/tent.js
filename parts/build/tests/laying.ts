import { readFileSync, writeFileSync } from 'node:fs'
import { posix } from 'node:path'
import { join } from 'node:path'
import type { Description } from '../../core/internal.ts'
import { definitionSource } from '../../core/internal.ts'
import * as core from '../../core/index.ts'
import * as ui from '../../screens/index.ts'
import type { Node, Scan, Source } from '../index.ts'
import { below, describeProject, kid, kids, lineOf, nameOf, scan } from '../index.ts'

/** What a tool that lays a definition into a file answers: that it wrote, with the import lines it added, or why it refused. */
export type Laid = { wrote: true; added: string[] } | { wrote: false; why: string }

/** A place of a text that is counted with one line ending, as the bytes of the file hold it. */
function inFile(raw: string, at: number): number {
  let seen = 0
  for (let k = 0; k < raw.length; k++) {
    if (raw[k] === '\r' && raw[k + 1] === '\n') continue
    if (seen === at) return k
    seen++
  }
  return raw.length
}

/** Each name that a pattern of a declaration gives: a plain name, and every name of an object or a list taken apart. */
function patternNames(pattern: Node | undefined, names: Set<string>): void {
  if (!pattern) return
  const name = nameOf(pattern)
  if (name !== undefined) names.add(name)
  else if (pattern.type === 'ObjectPattern')
    for (const one of kids(pattern, 'properties')) patternNames(kid(one, 'value') ?? kid(one, 'argument'), names)
  else if (pattern.type === 'ArrayPattern') for (const one of kids(pattern, 'elements')) patternNames(one, names)
  else patternNames(kid(pattern, 'argument') ?? kid(pattern, 'left'), names)
}

/** The top-level names that a file declares itself: its constants, those taken apart among them, its functions and its classes. */
function ownNames(tree: Node): Set<string> {
  const names = new Set<string>()
  for (const node of kids(tree, 'body')) {
    const declared = node.type === 'ExportNamedDeclaration' ? kid(node, 'declaration') : node
    if (declared?.type === 'VariableDeclaration')
      for (const one of kids(declared, 'declarations')) patternNames(kid(one, 'id'), names)
    if (declared?.type === 'FunctionDeclaration' || declared?.type === 'ClassDeclaration')
      patternNames(kid(declared, 'id'), names)
  }
  return names
}

/**
 * The names whose value a record cannot give back as a name: those that the file declares itself, and those that
 * it imports from anywhere but our own entries, but for a definition, which a record holds by its name.
 */
function readNames(tree: Node, seen: Scan, definitions: Record<string, unknown>): Map<string, string> {
  const names = new Map([...ownNames(tree)].map((name) => [name, 'of its file']))
  for (const one of seen.imports)
    if (!one.from.startsWith('tentjs') && !(one.name === one.local && Object.hasOwn(definitions, one.local)))
      names.set(one.local, 'that its file imports')
  return names
}

/**
 * What the options of a definition hold that its record cannot give back: a name of the file that is read where
 * a value is written, and a spread. What stands inside an arrow is stored by its name, and is passed over.
 */
function notInRecord(options: Node | undefined, own: Map<string, string>, text: string): string | undefined {
  let found: string | undefined
  const see = (node: Node): void => {
    if (found !== undefined || /^(?:Arrow)?FunctionExpression$/.test(node.type)) return
    if (node.type === 'SpreadElement') found = `a spread on line ${lineOf(text, node.start)}`
    const name = nameOf(node)
    if (name !== undefined && own.has(name))
      found = `the name \`${name}\` ${own.get(name)} on line ${lineOf(text, node.start)}`
    // The key of an entry and the name after a dot are no reads.
    const value = kid(node, 'value')
    const object = kid(node, 'object')
    if (node.type === 'Property' && node.computed !== true && value) see(value)
    else if (node.type === 'MemberExpression' && node.computed !== true && object) see(object)
    else for (const one of below(node)) see(one)
  }
  if (options) see(options)
  return found
}

/** The names that the text of a definition reads and that no arrow of it gives: its tags and its other names. */
function namesRead(statement: Node): Set<string> {
  const read = new Set<string>()
  const given = new Set<string>()
  const see = (node: Node): void => {
    if (/^(?:Arrow)?FunctionExpression$/.test(node.type))
      for (const param of kids(node, 'params'))
        for (const one of [param, ...kids(param, 'properties').map((property) => kid(property, 'value') ?? property)])
          given.add(nameOf(one) ?? '')
    const value = kid(node, 'value')
    const object = kid(node, 'object')
    if (node.type === 'Identifier' || node.type === 'JSXIdentifier') read.add(String(node.name))
    if (node.type === 'Property' && node.computed !== true && value) see(value)
    else if (node.type === 'MemberExpression' && node.computed !== true && object) see(object)
    else if (node.type === 'JSXAttribute') {
      if (value) see(value)
    } else for (const one of below(node)) see(one)
  }
  see(statement)
  for (const name of given) read.delete(name)
  return read
}

/** The path of a file as another file imports it, with no ending. */
const importPath = (from: string, to: string): string => {
  const path = posix.relative(posix.dirname(from), to.replace(/\.tsx?$/, ''))
  return path.startsWith('.') ? path : `./${path}`
}

/**
 * A stand-in of a tool that writes one definition anew, by the rules of laying a definition into a file that
 * stands. Takes the folder of a project, what the build gave of it, the description that is meant, and the name of
 * the definition. It reads the text that stands at the place of the definition first, and refuses where that text
 * holds what the record does not, where two definitions share their statement, and where the definition is code.
 * It writes the text of the definition at its place, with the line end of the file, and adds one import line
 * after the last one for each name that the new text needs and the file does not import. It changes no file
 * where it refuses.
 */
export async function layDefinition(
  folder: string,
  built: { description: Description; source: Source },
  meant: Description,
  name: string,
): Promise<Laid> {
  const place = built.description.places[name]
  const path = String(place.file)
  const lies = join(folder, path)
  const raw = readFileSync(lies, 'utf8')
  const text = raw.replace(/\r\n/g, '\n')
  const tree = built.source[path]?.tree
  if (!tree) return { wrote: false, why: 'its file cannot be read' }
  const shares = Object.entries(built.description.places).some(
    ([other, one]) => other !== name && one.file === place.file && one.from === place.from,
  )
  if (shares) return { wrote: false, why: 'it shares its statement with another definition' }
  const seen = scan(tree)
  const declared = seen.declared.find((one) => one.exportName === name)
  const own = readNames(tree, seen, built.description.places)
  const held = notInRecord(declared?.options, own, text)
  if (held !== undefined) return { wrote: false, why: `its text reads ${held}, which its record holds as a value` }
  let written: string
  try {
    written = definitionSource(meant, name)
  } catch (error) {
    return { wrote: false, why: error instanceof Error ? error.message : String(error) }
  }
  const end = raw.includes('\r\n') ? '\r\n' : raw.includes('\r') && !raw.includes('\n') ? '\r' : '\n'
  const [from, to] = [inFile(raw, Number(place.from)), inFile(raw, Number(place.to))]
  const next = `${raw.slice(0, from)}${written.replaceAll('\n', end)}${raw.slice(to + 1)}`
  writeFileSync(lies, next)

  // What the new text names and the file does not import is found by reading the file as it now stands.
  const after = (await describeProject(folder)).source[path]?.tree
  const now = after ? scan(after) : undefined
  const again = now?.declared.find((one) => one.exportName === name)
  if (!after || !now || !again) {
    writeFileSync(lies, raw)
    return { wrote: false, why: 'the new text does not read' }
  }
  const imported = new Set(now.imports.map((one) => one.local))
  // A word of ours comes from the entry that the file may import: a backend file never gains `tentjs/ui`.
  const entry = now.imports.some((one) => one.from === 'tentjs/ui') || path.endsWith('.tsx') ? 'tentjs/ui' : 'tentjs'
  const words: object = entry === 'tentjs/ui' ? ui : core
  const lines: string[] = []
  for (const read of namesRead(again.statement)) {
    if (imported.has(read) || read === name) continue
    const from = Object.hasOwn(words, read)
      ? entry
      : Object.hasOwn(meant.places, read)
        ? importPath(path, String(meant.places[read].file))
        : undefined
    if (from === undefined) continue
    if (own.has(read)) {
      writeFileSync(lies, raw)
      return { wrote: false, why: `the new text needs \`${read}\`, which means another thing in its file` }
    }
    lines.push(`import { ${read} } from '${from}'`)
  }
  if (lines.length) {
    const last = kids(after, 'body').findLast((node) => node.type === 'ImportDeclaration')
    // The new line comes after the whole line of the last import, a comment behind it among it.
    const ending = last ? next.slice(inFile(next, last.end)).search(/\r\n|\r|\n/) : -1
    const at = last ? (ending < 0 ? next.length : inFile(next, last.end) + ending) : 0
    const added = last ? lines.map((line) => `${end}${line}`).join('') : `${lines.join(end)}${end}`
    writeFileSync(lies, `${next.slice(0, at)}${added}${next.slice(at)}`)
  }
  return { wrote: true, added: lines }
}
