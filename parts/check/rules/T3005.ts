import type { Node } from '../../build/index.ts'
import { kid, kids, nameOf, walk, word } from '../../build/index.ts'
import type { Rule, Written } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** Whether a piece of code names a table: by the name its file gives it, or as a member of `db` and of `db.system`. */
function names(code: Node, table: Written): boolean {
  let found = false
  walk(code, (node) => {
    if (nameOf(node) === table.declared.exportName) found = true
    if (node.type === 'MemberExpression' && word(kid(node, 'property'), 'name') === table.name) {
      const from = kid(node, 'object')
      const inner = from?.type === 'MemberExpression' ? word(kid(from, 'property'), 'name') : nameOf(from)
      if (inner === 'db' || inner === 'system') found = true
    }
  })
  return found
}

/** A table that no rule lets anyone read, and that nothing of the project uses. A warning. */
export const rule: Rule = {
  code: 'T3005',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'table' && Object.hasOwn(description.tables, one.name))
      .flatMap((table) => {
        const stored = description.tables[table.name]
        const read = isStored(stored.access) ? stored.access.read : undefined
        // The engine itself reads `users`, and a table that shows one of the engine's holds no rows of its own.
        if (table.name === 'users' || stored.shows !== undefined) return []
        if (isStored(read) && read.rule !== 'nobody') return []
        // What a file names beside its imports and the statement of the table itself counts as a use.
        const used = Object.values(source).some((file) =>
          (file.tree ? kids(file.tree, 'body') : []).some(
            (statement) =>
              statement.type !== 'ImportDeclaration' &&
              statement !== table.declared.statement &&
              names(statement, table),
          ),
        )
        if (used) return []
        return [
          at(
            'T3005',
            table,
            undefined,
            'no rule lets anyone read the table, and nothing of the project reads or writes it.',
            'State a `read` rule, use the table in a function, or take it out and name it in `removed` of the project.',
            'warning',
          ),
        ]
      }),
}
