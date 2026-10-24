import type { Finding } from '../../../core/index.ts'
import { tenantColumn, tenantTable } from '../../tenant.ts'
import { columnsOf, writtenByName } from '../../columns.ts'
import type { Rule } from '../../rule.ts'
import { at } from '../../rule.ts'

/** A link that cannot cross two data files as it is stated: into a tenant's file from outside, between the files of two kinds of tenants, and one out of a file that refuses the removal of its row. */
export const rule: Rule = {
  code: 'T2013',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const table of Object.keys(description.tables).sort()) {
      const place = written.get(table)
      if (!place) continue
      const mine = tenantTable(description, table)
      for (const [column, type] of Object.entries(columnsOf(description, table))) {
        // The `tenant` column itself is held by its own case.
        if (type.kind !== 'link' || typeof type.table !== 'string' || column === tenantColumn(description, table))
          continue
        const theirs = tenantTable(description, type.table)
        const say = (message: string, fix: string) => found.push(at('T2013', place, undefined, message, fix))
        if (theirs !== undefined && mine === undefined)
          say(
            `\`${table}.${column}\` links into the data file of a tenant: \`${type.table}\` is a tenant table, and \`${table}\` lives in the shared file. The column alone would not say which file its row stands in.`,
            `Hold the tenant and the id as two columns, or make \`${table}\` a tenant table whose tenants are of \`${theirs}\` too.`,
          )
        else if (theirs !== undefined && theirs !== mine)
          say(
            `\`${table}.${column}\` links \`${table}\`, a tenant table whose tenants are of \`${String(mine)}\`, to \`${type.table}\`, whose tenants are of \`${theirs}\`: no link runs between the data files of two tenants.`,
            'Hold the tenant and the id as two columns.',
          )
        else if (theirs === undefined && mine !== undefined && type.onRemove !== 'remove' && type.onRemove !== 'clear')
          say(
            `\`${table}.${column}\` links from the data file of a tenant into the shared file, and its \`onRemove\` is 'refuse': the files that hold such rows may be closed when the row is removed, so nothing can be refused then.`,
            `State \`onRemove: 'remove'\` or \`onRemove: 'clear'\` on \`${column}\`.`,
          )
      }
    }
    return found
  },
}
