import { TentError } from '../../../core/index.ts'
import type { Admin } from '../../admin.ts'
import { badWord, wordOf } from '../../admin.ts'

/**
 * `tent data rows <table>`: every row of a table, with full access. Of a tenant table, `of` names the
 * tenant whose rows are read, by its id alone: T0002 where it names none, and for a word that names no table.
 */
export const admin: Admin = {
  name: 'data rows',
  run: async (o, args) => {
    const from = wordOf(args, 'table', 'the name of a table')
    const of: unknown = Reflect.get(args, 'of')
    const tables = Object.keys(o.description.tables).sort()
    // A word that names no table is a word that was typed wrong: it is told with the tables there are.
    if (!tables.includes(from))
      throw new TentError(
        'T0002',
        `The app has no table ${JSON.stringify(from).slice(0, 60)}. Its tables are: ${tables.join(', ')}.`,
        { fields: { table: 'missing' }, fix: 'Name one of the tables of the app.' },
      )
    const tenanted = o.description.tables[from].tenant !== undefined
    if (tenanted && typeof of !== 'string')
      throw badWord('of', 'the id of a tenant, for a table that keeps a data file for each: `--of <tenant id>`')
    return o.app.read({ from, ...(typeof of === 'string' ? { of } : {}) }, { as: 'system' })
  },
}
