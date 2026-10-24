import type { Finding } from '../../../core/index.ts'
import { tenantColumn, tenantTable, tenantTables } from '../../tenant.ts'
import { columnsOf, writtenByName } from '../../columns.ts'
import type { Rule } from '../../rule.ts'
import { at } from '../../rule.ts'

/** A `tenant` that names no required link to a table of the shared file, and one whose rows do not go with their tenant. */
export const rule: Rule = {
  code: 'T2013',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const table of tenantTables(description)) {
      const place = written.get(table)
      const column = tenantColumn(description, table) ?? ''
      if (!place) continue
      const say = (message: string, fix: string) => found.push(at('T2013', place, undefined, message, fix))
      const columns = columnsOf(description, table)
      const type = Object.hasOwn(columns, column) ? columns[column] : undefined
      const tenants = tenantTable(description, table)
      if (!type)
        say(
          `\`tenant\` names \`${column}\`, and \`${table}\` has no column of that name.`,
          'Name the link column that says whose data file a row lives in.',
        )
      else if (tenants === undefined)
        say(
          `\`${table}.${column}\`, which \`tenant\` names, is no link: a row lives in the data file of the row that the column points to.`,
          `Make \`${column}\` a link to the table of the tenants, as link('teams', { onRemove: 'remove' }).`,
        )
      else if (type.optional === true)
        say(
          `\`${table}.${column}\`, which \`tenant\` names, may hold nothing: every row lives in the data file of one tenant.`,
          `Take \`optional\` away from \`${column}\`.`,
        )
      else if (tenantColumn(description, tenants) !== undefined)
        say(
          `\`tenant\` names \`${column}\`, a link to \`${tenants}\`, which is a tenant table itself: a tenant is a row of a table of the shared file.`,
          `State on \`${table}\` the \`tenant\` that \`${tenants}\` states, and hold that column in \`${table}\` too.`,
        )
      else if (type.onRemove !== 'remove')
        say(
          `\`${table}.${column}\`, which \`tenant\` names, does not state \`onRemove: 'remove'\`: the rows of a tenant go with their tenant.`,
          `State \`onRemove: 'remove'\` on \`${column}\`.`,
        )
    }
    return found
  },
}
