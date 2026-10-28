import { finding, untestedOf } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { writtenIn } from '../rule.ts'

/**
 * A warning: a function, a flow, a screen, a table or a route that no test touched in its last run, as the record of
 * the tests says it, by the one rule of `core` that the impact reads too. A project whose tests never ran has no
 * record, and nothing is known of what its tests touch.
 */
export const rule: Rule = {
  code: 'T9004',
  needs: ['description', 'source', 'facts'],
  run: ({ description, source, facts }) => {
    if (!facts?.touched) return []
    const written = writtenIn(source)
    return untestedOf(description, facts.touched).map(({ name, kind }) => {
      const at = written.find((one) => one.name === name)
      return finding(
        'T9004',
        `${name}: no test touched this ${kind} in its last run.`,
        {
          fix: `Write a test under tests/ that reaches \`${name}\`, and run \`tent test\`.`,
          ...(at ? { where: { file: at.path, line: at.line, definition: name } } : {}),
        },
        'warning',
      )
    })
  },
}
