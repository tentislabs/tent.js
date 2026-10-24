// A thread of its own that writes the rows file of a call of a `python`: one table for each name, with its columns
// and its rows, so that the main thread carries no write of a file that may be large.
import { DatabaseSync } from 'node:sqlite'
import { workerData } from 'node:worker_threads'

const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`
const { path, tables } = Object(workerData)
const file = new DatabaseSync(String(path))
try {
  file.exec('BEGIN')
  for (const [name, table] of Object.entries(Object(tables))) {
    const columns: string[] = Array.isArray(Reflect.get(Object(table), 'columns'))
      ? Reflect.get(Object(table), 'columns')
      : []
    const rows: unknown = Reflect.get(Object(table), 'rows')
    file.exec(`CREATE TABLE ${quoted(name)} (${columns.map(quoted).join(', ')})`)
    if (!columns.length) continue
    const insert = file.prepare(
      `INSERT INTO ${quoted(name)} (${columns.map(quoted).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    for (const row of Array.isArray(rows) ? rows : []) {
      const values = columns.map((column) => {
        const value: unknown = Reflect.get(Object(row), column)
        return typeof value === 'number' || typeof value === 'string' ? value : null
      })
      insert.run(...values)
    }
  }
  file.exec('COMMIT')
} finally {
  file.close()
}
