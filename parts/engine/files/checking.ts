import type { FileName, Misfit, TableStep } from '../../data/index.ts'
import { setCheck } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { metaOf, versionOf } from '../held.ts'
import { markedNext, rowsIn, setRow } from './directory.ts'
import type { TenantFiles } from './face.ts'
import { fileLimit } from './held.ts'

/** The files of the directory that stand on the disk, each under the table of its tenants. */
const standing = (tenantFiles: TenantFiles, tables?: Set<string>): FileName[] =>
  rowsIn(tenantFiles.files.shared)
    .filter((row) => tenantFiles.files.has(row.file) && (!tables || tables.has(row.file.table)))
    .map((row) => row.file)

/**
 * Carries one write of a file thread out on each of some files, `limits.filesAtOnce` at a time. The files that are
 * handed over next are marked open in one write of the shared file, which waits for the disk once. `work` answers
 * false to hand no further file over.
 */
async function overFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  queue: FileName[],
  work: (file: FileName) => Promise<boolean>,
): Promise<void> {
  let marked: FileName[] = []
  let stopped = false
  const mark = (): void => {
    marked = markedNext(tenantFiles.sharedWrite, queue)
  }
  /** Takes the mark of each file back that was marked and handed to no thread. */
  const unmark = (): void => {
    const left = marked.splice(0)
    if (left.length && !o.closed)
      tenantFiles.sharedWrite((tx) => {
        for (const file of left) setRow(tx, file, { open: false })
      })
  }
  const worker = async (): Promise<void> => {
    for (;;) {
      if (o.closed || stopped) return
      if (!marked.length && queue.length) mark()
      const file = queue.shift()
      if (!file) return
      marked.shift()
      if (!(await work(file))) stopped = true
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.max(1, fileLimit(o.description, 'filesAtOnce')) }, worker))
  } finally {
    unmark()
  }
}

/**
 * Takes what the engine holds of an app, its files, the steps of a check, the version they lead to, and the
 * tables of tenants whose files hold a table of those steps. Holds every such file against the
 * steps, each in one write of a file thread: a file that fits is held to them from then on. Answers the first
 * misfit, with its file, and hands no further file over once one was found; nothing where every file fits.
 */
export async function checkAll(
  o: Opened,
  tenantFiles: TenantFiles,
  steps: TableStep[],
  version: string,
  tables: Set<string>,
): Promise<Misfit | undefined> {
  let found: Misfit | undefined
  await overFiles(o, tenantFiles, standing(tenantFiles, tables), async (file) => {
    const [misfit] = await tenantFiles.checked(file, steps, version, true)
    if (misfit) found ??= { ...misfit, file }
    return !misfit
  })
  return found
}

/**
 * Takes what the engine holds of an app, its files and a version. Takes the holds of that version away from every
 * file, as a pass beside the app: the check they were written for was refused, the switch went back, or the engine
 * stopped while the check stood. A file that fails is said in the log, and the pass goes on.
 */
export function unholdAll(o: Opened, tenantFiles: TenantFiles, version: string): Promise<void> {
  return overFiles(o, tenantFiles, standing(tenantFiles), async (file) => {
    try {
      await tenantFiles.unheld(file, version, true)
    } catch (error) {
      if (!o.closed)
        tenantFiles.line('error', 'The holds of a check could not be taken away from a data file.', {
          ...file,
          error: String(error),
        })
    }
    return true
  }).catch((error: unknown) => {
    if (!o.closed)
      tenantFiles.line('error', 'The pass that takes the holds of a check away ended early.', { error: String(error) })
  })
}

/**
 * Takes what the engine holds of an app that opens, and its files. Where the shared file names a check for a
 * version that is not the running one, the engine was stopped while that check stood: the check is taken away,
 * and so are its holds, in every file.
 */
export function endStandingCheck(o: Opened, tenantFiles: TenantFiles): void {
  const check = Object(metaOf(o.store, 'check'))
  if (typeof check.version !== 'string' || check.version === versionOf(o.store)) return
  o.store.write((tx) => setCheck(tx, undefined))
  tenantFiles.line('warn', 'A check of a switch stood when the engine stopped: it is taken away, with its holds.', {
    version: check.version,
  })
  void unholdAll(o, tenantFiles, check.version)
}
