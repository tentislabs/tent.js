import type { Node, Source } from '../build/index.ts'
import { kid, kids, lineOf, nameOf, scan, unwrap, walk } from '../build/index.ts'

/** A language file: its path, its language, and the line of its default export. */
export interface LanguageFile {
  path: string
  language: string
  line: number
}

/** A `message(...)` that a file writes with a key written in place: its file, its line, and its key. */
export interface MessageWritten {
  path: string
  line: number
  key: string
}

/** A text written in place, or nothing for any other node. */
function textOf(node: Node | undefined): string | undefined {
  const n = node ? unwrap(node) : undefined
  return n?.type === 'Literal' && typeof n.value === 'string' ? n.value : undefined
}

/** Every language file of a project: a file that exports `messages(...)` of `tentjs/ui` as its default. */
export function languageFilesIn(source: Source): LanguageFile[] {
  const found: LanguageFile[] = []
  for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!file.tree) continue
    const seen = scan(file.tree)
    const call = seen.byDefault ? unwrap(seen.byDefault) : undefined
    const callee = call?.type === 'CallExpression' ? nameOf(kid(call, 'callee')) : undefined
    const isMessages = seen.imports.some(
      (one) => one.from === 'tentjs/ui' && one.name === 'messages' && one.local === callee,
    )
    const language = isMessages && call ? textOf(kids(call, 'arguments')[0]) : undefined
    if (language !== undefined && call) found.push({ path, language, line: lineOf(file.text, call.start) })
  }
  return found
}

/**
 * Every `message(...)` of `tentjs` or `tentjs/ui` that the files of a project write with a key that is written in
 * place: a text, or a list whose parts are all texts. A key that is built from a value is held by the messages of
 * the choice it is built from.
 */
export function messagesWrittenIn(source: Source): MessageWritten[] {
  const found: MessageWritten[] = []
  for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!file.tree) continue
    const named = new Set(
      scan(file.tree)
        .imports.filter((one) => (one.from === 'tentjs' || one.from === 'tentjs/ui') && one.name === 'message')
        .map((one) => one.local),
    )
    if (!named.size) continue
    walk(file.tree, (node) => {
      if (node.type !== 'CallExpression' || !named.has(nameOf(kid(node, 'callee')) ?? '')) return
      const key = kids(node, 'arguments')[0]
      const inner = key ? unwrap(key) : undefined
      const parts = inner?.type === 'ArrayExpression' ? kids(inner, 'elements').map(textOf) : [textOf(inner)]
      if (parts.every((one) => one !== undefined))
        found.push({ path, line: lineOf(file.text, node.start), key: parts.join('.') })
    })
  }
  return found
}
