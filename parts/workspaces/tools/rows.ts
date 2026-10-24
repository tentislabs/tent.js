import { number, TentError, text } from '../../core/index.ts'
import { runWorkspace } from '../opening.ts'
import type { ProjectTool } from './face.ts'

// How many rows a read answers where it names no `limit`.
const most = 100

/** `rows`: rows of a table of the test data, as the system reads them but for the `private` columns. */
export const rowsTool: ProjectTool = {
  name: 'rows',
  about: 'Rows of a table of the test data of the app, the newest first, without the columns that are private.',
  input: { table: text({ min: 1 }), limit: number({ min: 1, max: 1000, optional: true }) },
  writes: false,
  async run(at, input) {
    const app = await runWorkspace(at.held, at.one.workspace.id)
    const name = String(input.table)
    const tables: Record<string, unknown> = Object(app.description.tables)
    if (!Object.hasOwn(tables, name))
      throw new TentError('T0001', `No table ${JSON.stringify(name).slice(0, 80)} is in the app.`)
    const columns: Record<string, unknown> = Object(Reflect.get(Object(tables[name]), 'columns'))
    const hidden = Object.entries(columns)
      .filter(([, type]) => Reflect.get(Object(type), 'private') === true)
      .map(([column]) => column)
    const read: unknown = await app.read(
      { from: name, sort: [{ by: 'createdAt', down: true }], limit: Number(input.limit ?? most) },
      { as: 'system' },
    )
    const rows = (Array.isArray(read) ? read : []).map((row: unknown) =>
      Object.fromEntries(Object.entries(Object(row)).filter(([column]) => !hidden.includes(column))),
    )
    return { rows }
  },
}
