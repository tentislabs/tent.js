import { TentError } from '../../core/index.ts'
import type { Opened } from '../opened.ts'
import type { TenantFiles } from './face.ts'
import type { Failed } from './directory.ts'
import { rowsIn, setRow } from './directory.ts'
import { sizeOf, toldCount } from './held.ts'
import { isUnswept, sweepAll } from './pass.ts'
import type { Stray } from './upkeep.ts'
import { upkeepFiles } from './upkeep.ts'

/** One file of a tenant as `tent data files` prints it. */
interface Listed {
  table: string
  id: string
  // The fingerprint of the layout that the file was last brought to.
  layout: string
  tables: string[]
  // The number of its last write.
  writes: number
  size: number
  open: boolean
  // It is not at the running layout yet, or could not be brought to it.
  behind: boolean
  unswept: boolean
  failed?: Failed
  // The earliest moment at which a run in it must wake.
  due?: number
}

/** What `tent data files` answers: the directory, and with a flag what that flag did. */
export interface FilesAnswer {
  files: Listed[]
  stray?: Stray
  swept?: number
  retried?: { id: string; ok: boolean; error?: string }
}

const dueOf = (due: number | undefined): { due?: number } => (due === undefined ? {} : { due })

/** Answers the directory of an app: each file as its row says it, and an open file as it says itself. */
function listedFiles(o: Opened, tenantFiles: TenantFiles): Listed[] {
  const told = toldCount(tenantFiles.files.shared)
  return rowsIn(tenantFiles.files.shared).map((row): Listed => {
    const open = tenantFiles.isOpen(row.file)
    const said = open ? tenantFiles.peek(row.file) : undefined
    const layout = said?.layout ?? row.layout
    const swept = said?.swept ?? row.swept
    return {
      table: row.file.table,
      id: row.file.id,
      layout: layout ?? '',
      tables: said?.tables ?? row.tables,
      writes: said?.writes ?? row.writes,
      size: open ? sizeOf(tenantFiles.files.path(row.file)) : row.size,
      open,
      behind:
        row.failed !== undefined || tenantFiles.isBehind(row.file.table, layout, undefined, said?.writes ?? row.writes),
      unswept: isUnswept(tenantFiles, { file: row.file, ...(swept === undefined ? {} : { swept }) }, told),
      ...(row.failed ? { failed: row.failed } : {}),
      // What is due in an open file the runner says now; of a closed one the directory says what it said when it closed.
      ...dueOf(open ? o.flows?.due(row.file) : row.dueAt),
    }
  })
}

/** Tries a file that could not be brought up once more. A file that is not failed needs nothing. */
async function retried(tenantFiles: TenantFiles, id: string): Promise<{ id: string; ok: boolean; error?: string }> {
  const row = rowsIn(tenantFiles.files.shared).find((one) => one.file.id === id)
  if (!row)
    throw new TentError('T2103', `No data file of a tenant is found under ${JSON.stringify(id).slice(0, 60)}.`, {
      fix: '`tent data files` lists the files, each with the id of its tenant.',
    })
  if (!row.failed) return { id, ok: true }
  tenantFiles.sharedWrite((tx) => setRow(tx, row.file, { failed: null }))
  try {
    await tenantFiles.raise(row.file)
    return { id, ok: true }
  } catch (error) {
    return { id, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * `tent data files`: prints the directory of the files of tenants. `behind`, `unswept` and `due` narrow it.
 * `stray` has the upkeep done at once, and says what it found and did. `sweep` opens and sweeps every file that is
 * unswept. `retry` tries a file again that could not be brought up, by the id of its tenant.
 */
export async function filesCommand(o: Opened, tenantFiles: TenantFiles, args: object): Promise<FilesAnswer> {
  const flag = (name: string): boolean => Reflect.get(args, name) === true
  const answer: Omit<FilesAnswer, 'files'> = {}
  if (flag('stray')) answer.stray = upkeepFiles(o, tenantFiles, o.machine.reader !== undefined)
  if (flag('sweep')) answer.swept = await sweepAll(o, tenantFiles)
  const retry: unknown = Reflect.get(args, 'retry')
  if (typeof retry === 'string') answer.retried = await retried(tenantFiles, retry)
  const files = listedFiles(o, tenantFiles).filter(
    (one) =>
      (!flag('behind') || one.behind) && (!flag('unswept') || one.unswept) && (!flag('due') || one.due !== undefined),
  )
  return { files, ...answer }
}
