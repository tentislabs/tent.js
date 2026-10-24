import type { Finding } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { tenantColumn, tenantTable, tenantTables } from '../tenant.ts'
import { writtenByName } from '../columns.ts'
import type { Rule } from '../rule.ts'
import { at, inside } from '../rule.ts'
import { isStored } from '../../core/internal.ts'

/**
 * Whether a filter that was stored holds its rows to their tenant: it names the `tenant` column, or reads a tenant table
 * whose tenants are of the same table, which is read in the file that the rule is applied in.
 */
function holdsToTenant(description: Description, filter: unknown, column: string, by: string): boolean {
  if (!isStored(filter)) return false
  for (const group of [filter.any, filter.all])
    if (Array.isArray(group) && group.some((one) => holdsToTenant(description, one, column, by))) return true
  if (filter.col === undefined) return holdsToTenant(description, filter.not, column, by)
  if (filter.col === column) return true
  const plan = filter.in
  return isStored(plan) && typeof plan.from === 'string' && tenantTable(description, plan.from) === by
}

/** Whether the arrow of a rule that was read names a column as a key of the filter it gives, or reads a tenant table whose tenants are of the same table. */
function givesTenant(description: Description, give: unknown, column: string, by: string): boolean {
  let named = false
  inside(give, (record) => {
    if (Array.isArray(record.object) && record.object.some((entry) => Array.isArray(entry) && entry[0] === column))
      named = true
    const table = isStored(record.plan) ? (record.plan.db ?? record.plan.table) : undefined
    if (typeof table === 'string' && tenantTable(description, table) === by) named = true
  })
  return named
}

/** The `read` rule of a tenant table that does not name its `tenant` column: whoever passes the rest of the rule reads every tenant. A note. */
export const rule: Rule = {
  code: 'T2014',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenByName(source)
    for (const table of tenantTables(description)) {
      const place = written.get(table)
      const column = tenantColumn(description, table) ?? ''
      const by = tenantTable(description, table)
      const access = description.tables[table].access
      const read = isStored(access) ? access.read : undefined
      // A table that nobody reads opens no tenant to anybody, and a rule that is code was not read.
      if (!place || by === undefined || !isStored(read) || read.rule === 'nobody') continue
      if (read.rule === 'where') {
        if (read.filter === undefined && read.give === undefined) continue
        if (holdsToTenant(description, read.filter, column, by)) continue
        if (read.give !== undefined && givesTenant(description, read.give, column, by)) continue
      }
      found.push(
        at(
          'T2014',
          place,
          undefined,
          `\`${table}\` names its tenant in \`${column}\`, and its \`read\` rule does not name \`${column}\`: whoever passes the rest of the rule reads the rows of every tenant.`,
          `Hold the rule to the tenants of the caller, as where({ ${column}: { in: members.where({ user: caller('id') }).pick(['${column}']) } }).`,
          'note',
        ),
      )
    }
    return found
  },
}
