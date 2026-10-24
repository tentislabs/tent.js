import { posix } from 'node:path'
import type { Description } from './description.ts'
import { TentError } from './errors.ts'
import { isStored } from './record.ts'
import { runDoc } from './source/backend.ts'
import { definitionDoc } from './source/definition.ts'
import type { Doc } from './source/doc.ts'
import { group, layOut, listDoc, recordDoc } from './source/doc.ts'
import { exprDoc } from './source/expr.ts'
import { writeDoc } from './source/plan.ts'
import { keyText, quoted } from './source/texts.ts'
import type { Writing } from './source/writing.ts'
import { noText, ours, writingOf } from './source/writing.ts'

/** The path of a file as another file imports it: from the folder of that file, with a dot in front. */
function pathFrom(from: string, to: string): string {
  const path = posix.relative(posix.dirname(from), to)
  return path.startsWith('.') ? path : `./${path}`
}

/** One import line: the names between curly brackets, and where they come from. */
const importLine = (names: Iterable<string>, from: string): string =>
  layOut(['import ', group('{', [...names], '}', { pad: true }), ` from ${quoted(from)}`])

/**
 * The import lines of a file: one from `tentjs` or from `tentjs/ui` with the words its text uses, in the order
 * they are first used; one for each other file of the project that it names, by its path from this file with no
 * ending; and one for each text file.
 */
function importLines(w: Writing, description: Description, own: Set<string>, o: { path: string }): string[] {
  const lines: string[] = []
  if (w.ours.size) lines.push(importLine(w.ours, 'tentjs'))
  const files = new Map<string, string[]>()
  for (const name of w.named) {
    if (own.has(name)) continue
    const place = Object.hasOwn(description.places, name) ? description.places[name] : undefined
    const file = typeof place?.file === 'string' ? place.file : undefined
    if (file === undefined)
      throw new TentError('T0001', `The description does not say which file holds \`${name}\`, which the text names.`, {
        fix: 'Hand a description that the build made: it holds the place of each definition.',
      })
    if (file !== o.path) files.set(file, [...(files.get(file) ?? []), name])
  }
  for (const [file, names] of files) lines.push(importLine(names, pathFrom(o.path, file.replace(/\.tsx?$/, ''))))
  for (const [as, file] of w.textFiles) lines.push(`import ${as} from ${quoted(pathFrom(o.path, file))}`)
  return lines
}

/** The messages of one language as its file writes them: `export default messages('en', { ... })`, each message under its whole key. */
function messagesFile(description: Description, language: string): string {
  const held = Object.hasOwn(description.messages, language) ? description.messages[language] : {}
  const entries = Object.entries(held).map(
    ([key, message]): Doc => [
      `${keyText(key)}: `,
      exprDoc(writingOf(), isStored(message) ? { object: Object.entries(message) } : message),
    ],
  )
  const body: Doc = [`export default messages(${quoted(language)}, `, recordDoc(entries, true), ')']
  return `${importLine(['messages'], 'tentjs/ui')}\n\n${layOut(body)}\n`
}

/** The starter data as its file writes it: `export default seed(...)`, with a list of writes or the arrow that was read. */
function seedFile(description: Description, o: { path: string }): string {
  const w = writingOf(description.app.name)
  const seed = description.seed ?? {}
  ours(w, 'seed')
  if (!Array.isArray(seed.writes) && !Array.isArray(seed.body)) throw noText('The starter data')
  const data: Doc = Array.isArray(seed.writes)
    ? group(
        '[',
        seed.writes.filter(isStored).map((one) => writeDoc(w, one)),
        ']',
        { broken: true },
      )
    : runDoc(w, seed.body, false)
  const text = layOut(['export default seed(', data, ')'])
  return [...importLines(w, description, new Set(), { path: o.path }), '', ...tops(w), text, ''].join('\n')
}

/** The top-level names that the text of a file reads, each as a `const` with the value that is stored for it. */
function tops(w: Writing): string[] {
  if (w.clashes.size)
    throw new TentError(
      'T0013',
      `Two definitions hold different values under the top-level name \`${[...w.clashes][0]}\`: one build never made both.`,
      { fix: 'Hand the description of one build.' },
    )
  const lines = [...w.tops].map(([name, value]) => layOut([`const ${name} = `, constDoc(value)]))
  return lines.length ? [...lines, ''] : []
}

/** A plain value written in place, as the value of a top-level `const`. */
function constDoc(value: unknown): Doc {
  if (Array.isArray(value)) return listDoc(value.map(constDoc))
  if (isStored(value) && Array.isArray(value.object))
    return recordDoc(
      value.object.map(
        (entry): Doc => (Array.isArray(entry) ? [`${keyText(String(entry[0]))}: `, constDoc(entry[1])] : ''),
      ),
    )
  if (isStored(value))
    return recordDoc(Object.entries(value).map(([key, one]): Doc => [`${keyText(key)}: `, constDoc(one)]))
  return typeof value === 'string' ? quoted(value) : String(value)
}

/**
 * Takes a description, the names of the definitions of one file in their order, and the path of that file from the
 * folder of the project. Answers the whole file: its import lines, each top-level `const` that the definitions
 * read, and each definition, with one empty line between. `['seed']` names the starter data, and
 * `['texts:<language>@<path>']` a language file. Reading the file gives the same records. Throws T0013 for a
 * definition that is code and where two of the definitions hold different values under one top-level name, and
 * T0001 for a name that the description holds no definition or no place of.
 */
export function fileSource(description: Description, names: string[], o: { path: string }): string {
  if (names.length === 1 && names[0] === 'seed') return seedFile(description, o)
  const language = names.length === 1 ? /^texts:([^@]+)@/.exec(names[0])?.[1] : undefined
  if (language !== undefined) return messagesFile(description, language)
  const w = writingOf(description.app.name)
  const definitions = names.map((name) => layOut(definitionDoc(w, description, name)))
  const lines = importLines(w, description, new Set(names), { path: o.path })
  return [...lines, '', ...tops(w), definitions.join('\n\n'), ''].join('\n')
}
