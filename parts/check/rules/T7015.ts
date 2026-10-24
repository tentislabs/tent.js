import { child, kid, lineOf, unwrap, walk, word } from '../../build/index.ts'
import type { Finding } from '../../core/index.ts'
import { finding } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'

/** Code that calls `reveal()`: each use is listed, so that whoever reads the check sees where a secret is opened. A note. */
export const rule: Rule = {
  code: 'T7015',
  needs: ['source'],
  reads: 'file',
  run: ({ source }) => {
    const found: Finding[] = []
    for (const [path, file] of Object.entries(source).sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (!file.tree) continue
      walk(file.tree, (node) => {
        if (node.type !== 'CallExpression') return
        const callee = unwrap(child(node, 'callee'))
        if (callee.type !== 'MemberExpression' || callee.computed === true) return
        if (word(kid(callee, 'property'), 'name') !== 'reveal') return
        found.push(
          finding(
            'T7015',
            'The code opens a secret with `reveal()`: from here on its value is in the hands of this code.',
            {
              fix: 'Nothing to mend where the code needs the value itself. A value that only travels on an outgoing call is named with `secret(...)` in the definition, and is never opened by code.',
              where: { file: path, line: lineOf(file.text, node.start) },
            },
            'note',
          ),
        )
      })
    }
    return found
  },
}
