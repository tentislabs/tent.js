import type { Finding } from '../../core/index.ts'
import { tenantTable } from '../tenant.ts'
import { columnsOf } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, writtenIn } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/** Where the rows of a table live, in words: the shared file, or the file of each row of a table. */
const fileOf = (by: string | undefined): string =>
  by === undefined ? 'the shared file' : `the file of each row of \`${by}\``

/**
 * A kept `count`, `sum`, `min` or `max` over a table whose rows lie in another data file than the row that holds
 * it: the number moves in the write of a counted row, and one write is one file.
 */
export const rule: Rule = {
  code: 'T2025',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    for (const table of writtenIn(source)) {
      if (table.word !== 'table' || !Object.hasOwn(description.tables, table.name)) continue
      for (const [name, type] of Object.entries(columnsOf(description, table.name))) {
        const keeps = isStored(type.keeps) ? type.keeps : undefined
        if (typeof keeps?.of !== 'string' || !Object.hasOwn(description.tables, keeps.of)) continue
        const [mine, theirs] = [tenantTable(description, table.name), tenantTable(description, keeps.of)]
        if (mine === theirs) continue
        found.push(
          at(
            'T2025',
            table,
            undefined,
            `the kept \`${String(keeps.do)}\` \`${name}\` counts the rows of \`${keeps.of}\`, which lie in ${fileOf(theirs)}, while its own row lies in ${fileOf(mine)}: one write is one file, so the number cannot move with them.`,
            `Keep the number on a table of the same file as \`${keeps.of}\`, or work it out in a query.`,
          ),
        )
      }
    }
    return found
  },
}
