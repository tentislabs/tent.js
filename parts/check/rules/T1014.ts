import type { Node } from '../../build/index.ts'
import { below, child, kid, kids, lineOf, nameOf, scan, unwrap, word } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'

const asks = new Set(['now', 'random', 'token'])
const references = new Set(['input', 'caller', 'col'])

/** At the top of a file, outside the options of a definition: a word that asks the engine, a setting, and a reference word. */
export const rule: Rule = {
  code: 'T1014',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) => {
    const found: Finding[] = []
    for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!file.tree) continue
      const seen = scan(file.tree)
      const ours = new Map(seen.imports.filter((one) => one.from === 'tentjs').map((one) => [one.local, one.name]))
      const definitions = new Set(seen.declared.map((one) => one.node))
      const say = (node: Node, what: string) =>
        found.push(
          finding(
            'T1014',
            `${what} stands at the top of ${path}, outside the options of a definition. There it is a record, where the type says a value: no call is under way while a file is loaded.`,
            {
              fix: 'Write it inside the definition that uses it, where it is worked out when the definition is carried out.',
              where: { file: path, line: lineOf(file.text, node.start) },
            },
          ),
        )
      const see = (node: Node): void => {
        // What a function holds is carried out in a call, and what a definition holds is worked out with it.
        if (/Function/.test(node.type) || definitions.has(node)) return
        const callee = node.type === 'CallExpression' ? unwrap(child(node, 'callee')) : undefined
        const called = ours.get(nameOf(callee) ?? '')
        if (called !== undefined && (asks.has(called) || (called === 'dayOf' && kids(node, 'arguments').length < 2)))
          say(node, `\`${called}()\`, a word that asks the engine,`)
        else if (called !== undefined && references.has(called)) say(node, `\`${called}(...)\`, a reference word,`)
        else if (
          node.type === 'MemberExpression' &&
          ours.get(nameOf(unwrap(child(node, 'object'))) ?? '') === 'settings'
        )
          say(node, `The setting \`${word(kid(node, 'property'), 'name')}\``)
        for (const one of below(node)) see(one)
      }
      for (const statement of kids(file.tree, 'body')) if (statement.type !== 'ImportDeclaration') see(statement)
    }
    return found
  },
}
