import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { Tx, Writing, Wrote } from '../../data/index.ts'
import { removeRow } from '../files/directory.ts'
import type { Opened } from '../opened.ts'
import { visitorNow } from '../visitor.ts'
import { mayDownload, mayPut } from './access.ts'
import type { StoredFile } from './files.ts'
import { fileRow } from './files.ts'
import { dropTenantHolds, filesIn, holdFiles, isTenants, misfit, noFile, storesFiles } from './holds.ts'

/**
 * Takes an app, the name of a function, the fields of its input as the description stores them, the checked
 * input, and the caller. Holds every `file` value of the input to three things, whatever the function states: the
 * file is there, this caller may download it, and it fits the kinds and the most bytes of its field. Throws T2104
 * for the first two, told alike, and T0002 for the third. An id that travels as text, or inside `json`, is not
 * seen.
 */
export function checkFiles(
  o: Opened,
  name: string,
  fields: unknown,
  input: Record<string, unknown>,
  caller: Caller,
): void {
  const shape: Record<string, unknown> = Object(fields)
  for (const [field, type] of Object.entries(shape))
    for (const held of filesIn(type, input[field], field)) {
      const file = fileRow(o, held.id)
      if (!file || !mayDownload(o, caller, file, visitorNow())) throw noFile(held.id)
      const fails = misfit(file, held.type)
      if (fails)
        throw new TentError(
          'T0002',
          `The input of ${name} does not fit: the file of \`${held.field}\` ${fails === 'values' ? `is of the kind ${file.kind}` : `holds ${file.size} bytes`}, which its field does not take.`,
          { fields: { [held.field]: fails }, fix: 'Send a file of a kind and a size that the field takes.' },
        )
    }
}

/**
 * Takes an app, the write that is open, its caller, whether the code has full access, and what carries a piece of
 * work out once the write is committed. Answers what a `db` of that write calls for each row it wrote, so that
 * the row holds its files. In a write of one file the row holds them in that write. Of an app that keeps a data
 * file for each tenant, the removal of a tenant takes its holds and its file with it. The holds stand in the
 * shared file: a hold is written there in a write of its own, which
 * is committed before the write of the row is, and is taken away after the write that takes the file out of the
 * row is committed. So a stop between the two, and a write that is undone, leave a hold with no row, and never a
 * row with no hold.
 */
export function rowHolding(
  o: Opened,
  write: Tx | Writing,
  caller: Caller,
  full: boolean,
  after: (work: () => void) => void,
): (w: Wrote) => void {
  const visitor = visitorNow()
  const how = { o, caller, full, mayPut: (file: StoredFile) => mayPut(o, caller, file, visitor) }
  if (!('files' in write)) return (w) => (storesFiles(o, w.table) ? holdFiles({ ...how, tx: write }, w) : undefined)
  const { shared } = write.files
  return (w) => {
    // The row of a tenant goes: in the write that removes it, the holds of that tenant go too, and its row of the
    // directory; once the write is committed, its file is closed and removed. A stop in between leaves the file,
    // which the upkeep at the next start removes, since its tenant is gone.
    if (w.kind === 'removed' && isTenants(o, w.table)) {
      const tenant = { table: w.table, id: String(w.row.id) }
      dropTenantHolds(o, write.tx(), tenant.id)
      removeRow(write.tx(), tenant)
      after(() => o.tenantFiles?.files.remove(tenant))
    }
    if (!storesFiles(o, w.table)) return
    const { tables } = o.description
    const tenanted = Object.hasOwn(tables, w.table) && typeof tables[w.table].tenant === 'string'
    // A row of the shared file holds its files in the write of that file, as in an app of one file.
    if (!tenanted) return holdFiles({ ...how, tx: write.tx() }, w)
    shared.write((tx) =>
      holdFiles({ ...how, tx, later: (letGo) => after(() => void shared.write((own) => letGo(own))) }, w),
    )
  }
}
