import type { Finding } from '../../core/index.ts'
import { askedOf } from '../asked.ts'
import { columnsOf, reached, writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** The names of the fields that an output states for a row: of an object, and of each entry of a list of them. */
function fieldsOf(output: unknown): string[] {
  if (!isStored(output)) return []
  if (output.kind === 'list') return fieldsOf(output.of)
  return output.kind === 'object' && isStored(output.shape) ? Object.keys(output.shape) : []
}

const fix =
  'Take the column out. A `private` column is handed to code with full access alone, and is removed from every row that leaves the engine.'

/** A `private` column that a query written with `rows` names in `pick`, in a `group`, in a value that a group works out, or in its output. */
export const rule: Rule = {
  code: 'T3006',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!asked.top || !place) continue
      const uses: [string, string[]][] = [
        ['`pick`', asked.picks],
        ['a `group`, as what it groups by', asked.groups],
        ['a `group`, inside a value it works out', asked.worked],
      ]
      for (const [where, names] of uses)
        for (const name of new Set(names)) {
          const column = reached(description, asked.table, name)
          if (column?.type.private === true)
            found.push(
              at(
                'T3006',
                place,
                undefined,
                `the private column \`${column.table}.${column.column}\` is named in ${where}: that field is left out of what the query answers.`,
                fix,
              ),
            )
        }
      const columns = columnsOf(description, asked.table)
      for (const name of fieldsOf(description.functions[asked.definition].output))
        if (Object.hasOwn(columns, name) && columns[name].private === true)
          found.push(
            at(
              'T3006',
              place,
              undefined,
              `the output names \`${name}\`, the private column \`${asked.table}.${name}\`, which no row of the query holds when it leaves.`,
              fix,
            ),
          )
    }
    return found
  },
}
