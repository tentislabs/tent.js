import { columnsOf, searchOf } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'

/** A column that a table names in `search` and that is no text: a vector column among them. */
export const rule: Rule = {
  code: 'T2006',
  needs: ['description', 'source'],
  run: ({ description, source }) =>
    writtenIn(source)
      .filter((one) => one.word === 'table' && Object.hasOwn(description.tables, one.name))
      .flatMap((table) => {
        const columns = columnsOf(description, table.name)
        return searchOf(description.tables[table.name])
          .filter((name) => Object.hasOwn(columns, name) && columns[name].kind !== 'text')
          .map((name) =>
            at(
              'T2006',
              table,
              undefined,
              `\`search\` names the column \`${name}\`, which is a \`${String(columns[name].kind)}\`. The text search covers the text columns of a table.`,
              'Name text columns in `search`, or keep the words of this column in a text column beside it.',
            ),
          )
      }),
}
