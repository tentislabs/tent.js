import type { Finding } from '../../../core/index.ts'
import type { Description } from '../../../core/internal.ts'
import { tenantTable } from '../../tenant.ts'
import { askedOf } from '../../asked.ts'
import { columnsOf, writtenByName } from '../../columns.ts'
import type { Rule } from '../../rule.ts'
import { at } from '../../rule.ts'

/** Whether a name that a plan sorts or groups by runs through a link from a tenant's file into the shared file. */
function leavesFile(description: Description, table: string, name: string): boolean {
  let here = table
  const parts = name.replace(/^-/, '').split('.')
  for (const part of parts.slice(0, -1)) {
    const columns = columnsOf(description, here)
    const type = Object.hasOwn(columns, part) ? columns[part] : undefined
    if (type?.kind !== 'link' || typeof type.table !== 'string') return false
    if (tenantTable(description, here) !== undefined && tenantTable(description, type.table) === undefined) return true
    here = type.table
  }
  return false
}

/** A sort or a group of a tenant table through a link into the shared file: the rows of the two files are not read as one. */
export const rule: Rule = {
  code: 'T2013',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const asked of askedOf(description)) {
      const place = written.get(asked.definition)
      if (!place || tenantTable(description, asked.table) === undefined) continue
      const through = [
        ...asked.sorts.map((name) => ['sort', name]),
        ...asked.groups.map((name) => ['group', name]),
      ].filter(([, name]) => leavesFile(description, asked.table, name))
      for (const [what, name] of through)
        found.push(
          at(
            'T2013',
            place,
            undefined,
            `a ${what} of \`${asked.table}\` goes through \`${name.replace(/^-/, '')}\`, a link from the data file of a tenant into the shared file.`,
            'Keep a copy of the value in the row itself, and sort or group by that column.',
          ),
        )
    }
    return found
  },
}
