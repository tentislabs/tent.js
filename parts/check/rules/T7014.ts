import { child, kid, lineOf, scan, unwrap, walk, word } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'

// The modules of the runtime that open a connection of their own, which the wrap of `fetch` does not see.
const network = ['http', 'https', 'http2', 'net', 'tls', 'dgram', 'dns']

/** Whether an import names one of the network modules of the runtime, with or without `node:` in front. */
const isNetwork = (from: string): boolean => network.includes(from.replace(/^node:/, '').split('/')[0])

/**
 * Backend code that calls `fetch` itself, and a backend file that imports a network module of the runtime: each is
 * noted, so that whoever reads the check sees where the app reaches out other than through a service. A note.
 */
export const rule: Rule = {
  code: 'T7014',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) => {
    const found: Finding[] = []
    for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!file.tree) continue
      const imports = scan(file.tree).imports
      // A backend file is one that imports `tentjs`: a screen and a command reach no network but through the door.
      if (!imports.some((one) => one.from === 'tentjs')) continue
      const note = (at: number, words: string, fix: string): void =>
        void found.push(finding('T7014', words, { fix, where: { file: path, line: lineOf(file.text, at) } }, 'note'))
      walk(file.tree, (node) => {
        if (node.type === 'ImportDeclaration') {
          const from = word(kid(node, 'source'), 'value')
          if (typeof from === 'string' && isNetwork(from))
            note(
              node.start,
              `The file imports ${from}, which opens connections that no rule of the engine sees.`,
              'Reach a server through a `service`, or through `fetch`, which the engine holds to its address rule.',
            )
          return
        }
        if (node.type !== 'CallExpression') return
        const callee = unwrap(child(node, 'callee'))
        const plain = callee.type === 'Identifier' && word(callee, 'name') === 'fetch'
        const member =
          callee.type === 'MemberExpression' &&
          callee.computed !== true &&
          word(kid(callee, 'property'), 'name') === 'fetch' &&
          word(kid(callee, 'object'), 'name') === 'globalThis'
        if (plain || member)
          note(
            node.start,
            'The code calls `fetch` itself: the call is logged and held to the address rule, but has no limits, no tries and no fakes in tests.',
            'Write the server as a `service`, where its calls are worth limits, tries and a fake in tests.',
          )
      })
    }
    return found
  },
}
