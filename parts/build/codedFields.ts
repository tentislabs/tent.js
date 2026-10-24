// The text of each field of a screen or a component that the description holds as code, `{ code: true }`, with what
// it reaches of its file: the record of such a field is its code, and a save that changes the code changes it. What
// a field reaches of another file is held by that file's own sorting.
import { isStored } from '../core/internal.ts'
import type { Node } from './tree.ts'
import { kid, kids, nameOf, propertyOf, unwrap, walk, word } from './tree.ts'
import type { SourceFile, Work } from './work.ts'

// The fields of a definition that may be written as code, by where they stand in its options.
const fields = [['data'], ['title'], ['seo', 'description'], ['seo', 'image'], ['seo', 'data']]

/** The text that each name declared at the top of a file is bound by: a declaration, or what an import names. */
function bindingsOf(file: SourceFile, tree: Node): Map<string, { text: string; node?: Node }> {
  const found = new Map<string, { text: string; node?: Node }>()
  for (const statement of kids(tree, 'body')) {
    const declared =
      statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration'
        ? kid(statement, 'declaration')
        : statement
    if (!declared) continue
    if (declared.type === 'ImportDeclaration') {
      const from = word(kid(declared, 'source'), 'value')
      for (const one of kids(declared, 'specifiers')) {
        const local = nameOf(kid(one, 'local'))
        const imported = nameOf(kid(one, 'imported')) ?? (one.type === 'ImportNamespaceSpecifier' ? '*' : 'default')
        if (local) found.set(local, { text: `import ${imported} as ${local} from ${from}` })
      }
    } else if (declared.type === 'VariableDeclaration')
      for (const one of kids(declared, 'declarations')) {
        const id = kid(one, 'id')
        const text = file.text.slice(one.start, one.end)
        if (id)
          walk(id, (node) => {
            const name = nameOf(node)
            if (name) found.set(name, { text, node: one })
          })
      }
    else if (declared.type === 'FunctionDeclaration' || declared.type === 'ClassDeclaration') {
      const name = nameOf(kid(declared, 'id'))
      if (name) found.set(name, { text: file.text.slice(declared.start, declared.end), node: declared })
    }
  }
  return found
}

/** The text of a piece of code and of every declaration of its file that it names, each once, however deep. */
function reachedText(file: SourceFile, bindings: Map<string, { text: string; node?: Node }>, from: Node): string {
  const texts = [file.text.slice(from.start, from.end)]
  const seen = new Set<string>()
  const left = [from]
  for (let node = left.pop(); node !== undefined; node = left.pop())
    walk(node, (one) => {
      const name = word(one, 'name')
      if ((one.type !== 'Identifier' && one.type !== 'JSXIdentifier') || name === undefined || seen.has(name)) return
      seen.add(name)
      const bound = bindings.get(name)
      if (!bound) return
      texts.push(bound.text)
      if (bound.node) left.push(bound.node)
    })
  return texts.join('\n')
}

/**
 * Takes the work of a build. Answers one text of the code of every field of a screen or a component that its
 * description holds as code: the field's own text and what it reaches of its file. Where a field's text is not found,
 * as for options that are not written in place, the text of its whole file stands for it.
 */
export function codedFieldsText(work: Work): string {
  const texts: string[] = []
  for (const file of [...work.files.values()].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    const tree = file.tree
    if (file.sort !== 'screen' || !tree) continue
    let bindings: Map<string, { text: string; node?: Node }> | undefined
    for (const one of file.seen?.declared ?? []) {
      const name = one.name ?? one.exportName
      const stored: unknown =
        one.word === 'screen' ? work.description?.screens[name] : work.description?.components[name]
      for (const at of fields) {
        const value = at.reduce<unknown>((held, key) => (isStored(held) ? held[key] : undefined), stored)
        if (!isStored(value) || value.code !== true) continue
        const written = at.reduce<Node | undefined>(
          (held, key) => kid(propertyOf(held && unwrap(held), key), 'value'),
          one.options,
        )
        bindings ??= bindingsOf(file, tree)
        texts.push(`${file.path} ${name}.${at.join('.')}`, written ? reachedText(file, bindings, written) : file.text)
      }
    }
  }
  return texts.join('\n')
}
