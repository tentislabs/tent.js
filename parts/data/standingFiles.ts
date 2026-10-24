import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { FileName } from './fileName.ts'
import { isId } from './ids.ts'

/**
 * Takes the data folder of an app and, for each table of tenants, the folder under `tenants/` that
 * its files stand in. Answers every file of a tenant that stands on the disk there, table by table and in the
 * order of the names: a system answers the names of a folder in an order of its own. What is not named as the file
 * of a tenant is, `<id>.db`, is left out.
 */
export function* standingFiles(folder: string, tables: [table: string, under: string][]): Iterable<FileName> {
  for (const [table, under] of tables) {
    const root = join(folder, 'tenants', under)
    if (!existsSync(root)) continue
    const inOrder = readdirSync(root, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))
    for (const two of inOrder) {
      if (!two.isDirectory()) continue
      for (const name of readdirSync(join(root, two.name)).sort())
        if (name.endsWith('.db') && isId(name.slice(0, -3))) yield { table, id: name.slice(0, -3) }
    }
  }
}
