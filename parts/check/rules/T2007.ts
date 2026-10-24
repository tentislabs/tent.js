import { columnsOf } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** An `owner` column that is no `link('users')`, and the rule 'owner' on a table that states no `owner`. */
export const rule: Rule = {
  code: 'T2007',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'table' && Object.hasOwn(description.tables, one.name))
      .flatMap((table) => {
        const stored = description.tables[table.name]
        if (typeof stored.owner === 'string') {
          const columns = columnsOf(description, table.name)
          const type = Object.hasOwn(columns, stored.owner) ? columns[stored.owner] : undefined
          if (type?.kind === 'link' && type.table === 'users') return []
          return [
            at(
              'T2007',
              table,
              undefined,
              `\`owner\` names the column \`${stored.owner}\`, which is no \`link('users')\`. The owner of a row is a user.`,
              "Name a column that is a `link('users')` as `owner`.",
            ),
          ]
        }
        // On `users` the rule means the caller's own row, and on a table that shows one of the engine's the rows of the caller's own use.
        if (table.name === 'users' || stored.shows !== undefined) return []
        const rules = isStored(stored.access) ? Object.entries(stored.access) : []
        const owned = rules.filter(([, one]) => isStored(one) && one.rule === 'owner').map(([what]) => what)
        if (!owned.length) return []
        return [
          at(
            'T2007',
            table,
            undefined,
            `the rule 'owner' stands on \`${owned.join('`, `')}\`, and the table states no \`owner\`, so no row has one.`,
            "State `owner` with the name of a column that is a `link('users')`, or write another rule.",
          ),
        ]
      }),
}
