import type { Node } from '../tree.ts'
import { cooked, kid, kids, nameOf, unwrap } from '../tree.ts'
import type { SourceFile, Step, Work } from '../work.ts'
import { found } from '../work.ts'

/** The messages of one language, each under its names joined with dots, with the node that gives it. */
type Joined = Map<string, { message: string | Record<string, string>; file: SourceFile; node: Node }>

// The standard names of the plural forms: a record of them is one message.
const forms = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

/** Something of a language file that is no message written in place. */
class NoMessage extends Error {
  readonly node: Node
  constructor(node: Node) {
    super('no message')
    this.node = node
  }
}

/** A text that is written in place, or nothing for any other node. */
function textOf(node: Node): string | undefined {
  const n = unwrap(node)
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value
  if (n.type === 'TemplateLiteral' && !kids(n, 'expressions').length)
    return kids(n, 'quasis')
      .map((one) => cooked(one) ?? '')
      .join('')
  return undefined
}

/** The name of a property of a record that is written in place: a name or a text. */
function keyOf(property: Node): string | undefined {
  if (property.type !== 'Property' || property.computed === true) return undefined
  const key = kid(property, 'key')
  return key ? (nameOf(key) ?? textOf(key)) : undefined
}

/** Reads the messages of a record into `into`, each under its names joined with dots. Throws `NoMessage` at the first node that is none. */
function messagesOf(record: Node, under: string, into: [string, string | Record<string, string>, Node][]): void {
  for (const property of kids(record, 'properties')) {
    const key = keyOf(property)
    const value = kid(property, 'value')
    if (key === undefined || !value) throw new NoMessage(property)
    const name = under ? `${under}.${key}` : key
    const text = textOf(value)
    if (text !== undefined) {
      into.push([name, text, property])
      continue
    }
    const inner = unwrap(value)
    if (inner.type !== 'ObjectExpression') throw new NoMessage(value)
    const entries = kids(inner, 'properties')
    // A record of the plural forms, each a text, is one message with its forms.
    const plural = entries.length > 0 && entries.every((one) => forms.has(keyOf(one) ?? ''))
    if (plural) {
      const message: Record<string, string> = {}
      for (const one of entries) {
        const form = textOf(kid(one, 'value') ?? one)
        if (form === undefined) throw new NoMessage(one)
        message[keyOf(one) ?? ''] = form
      }
      into.push([name, message, property])
    } else messagesOf(inner, name, into)
  }
}

/** Reads one language file: its language and its messages, or a finding where it holds anything but messages. */
function readFile(
  work: Work,
  file: SourceFile,
): { language: string; messages: [string, string | Record<string, string>, Node][] } | undefined {
  try {
    let read: { language: string; messages: [string, string | Record<string, string>, Node][] } | undefined
    if (!file.tree) return undefined
    for (const statement of kids(file.tree, 'body')) {
      if (statement.type === 'ImportDeclaration') continue
      if (statement.type !== 'ExportDefaultDeclaration') throw new NoMessage(statement)
      const call = unwrap(kid(statement, 'declaration') ?? statement)
      const [language, given] = kids(call, 'arguments')
      const code = language ? textOf(language) : undefined
      if (code === undefined || !given || unwrap(given).type !== 'ObjectExpression') throw new NoMessage(call)
      const into: [string, string | Record<string, string>, Node][] = []
      messagesOf(unwrap(given), '', into)
      read = { language: code, messages: into }
    }
    return read
  } catch (error) {
    if (!(error instanceof NoMessage)) throw error
    found(
      work,
      'T1010',
      file,
      error.node,
      `The language file ${file.path} holds something that is not a message written in place. A language file holds \`export default messages('<code>', { ... })\` with messages only.`,
      'Write each message as a text, a record of plural forms, or a record of more messages.',
    )
    return undefined
  }
}

/**
 * Joins the language files of the project, wherever they lie: every message of a language is stored under its names
 * joined with dots, and a key that two of its files give is T1014. A language file holds messages only (T1010).
 */
export const step: Step = {
  order: 4.5,
  run: async (work) => {
    const description = work.description
    if (!description) return
    const joined = new Map<string, Joined>()
    const files = [...work.files.values()]
      .filter((file) => file.sort === 'messages')
      .sort((a, b) => (a.path < b.path ? -1 : 1))
    for (const file of files) {
      const read = readFile(work, file)
      if (!read) continue
      const held = joined.get(read.language) ?? new Map()
      joined.set(read.language, held)
      for (const [key, message, node] of read.messages) {
        const before = held.get(key)
        if (before) {
          found(
            work,
            'T1014',
            file,
            node,
            `The key ${key} of the language \`${read.language}\` is given twice: in ${before.file.path} and in ${file.path}.`,
            'Give each key once in the files of one language.',
          )
          continue
        }
        held.set(key, { message, file, node })
      }
    }
    const messages: Record<string, Record<string, string | Record<string, string>>> = {}
    for (const [language, held] of [...joined].sort(([a], [b]) => (a < b ? -1 : 1)))
      messages[language] = Object.fromEntries([...held].map(([key, one]) => [key, one.message]))
    description.messages = messages
  },
}
