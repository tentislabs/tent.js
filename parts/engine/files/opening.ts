import { isDeepStrictEqual } from 'node:util'
import { TentError } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import type { Connections, Store, TableLayout, TableStep } from '../../data/index.ts'
import { applySteps, factsOf, layoutOf, NotReady, planTableChanges, setRunningVersion } from '../../data/index.ts'
import type { Opened } from '../opened.ts'
import { sealedAt } from '../values/seal.ts'
import { tenantFilesOf } from './tenantFiles.ts'
import { endStandingCheck } from './checking.ts'
import type { TenantFiles } from './face.ts'
import { removeRow, rowsIn } from './directory.ts'
import { metaOf } from '../held.ts'
import { fileKeyOf } from './held.ts'
import { endMove } from './moving.ts'
import { passOver, sweepAll, sweepUnderWay } from './pass.ts'
import { upkeepFiles } from './upkeep.ts'

/** What the files of an app are opened with. */
export interface TenantFilesOptions {
  make: () => Store
  // The layout of the app with the tables of the engine.
  layout: TableLayout[]
  connections: Connections
  // The app is opened as a reader.
  reads: boolean
  // The store is the one that ships, which a file thread can open by itself.
  threads: boolean
}

/**
 * Takes what the engine holds of an app that keeps a data file for each tenant, and what its files are opened
 * with. Opens the shared file and connects the files: from here on `store` of the app is the shared file.
 */
export function openTenantFiles(o: Opened, w: TenantFilesOptions): TenantFiles {
  const tenantFiles = tenantFilesOf(o, w.make, w.layout, w.connections, { reads: w.reads, threads: w.threads })
  o.tenantFiles = tenantFiles
  o.files = tenantFiles.files
  o.store = tenantFiles.files.shared
  return tenantFiles
}

const isLayouts = (held: unknown): held is TableLayout[] =>
  Array.isArray(held) &&
  held.every((one) => typeof Reflect.get(Object(one), 'name') === 'string' && Reflect.get(Object(one), 'columns'))

/**
 * Takes what the engine holds of an app whose files stand open, and the description it opens with. Where the
 * description asks for another layout of the tenant tables than the shared file names, the pass that brought
 * the files to the layout of the shared file is ended first: every file that is behind that layout is brought up
 * to it. The description may no longer state a `was` or a `removed` that such a file needs.
 */
export async function endPass(o: Opened, tenantFiles: TenantFiles, description: Description): Promise<void> {
  // A move of rows that a stop left in its middle is undone, or ended, before anything else reads the files.
  await endMove(o, tenantFiles)
  const named: unknown = metaOf(o.store, 'tenantLayout')
  const tenantTablesNow = layoutOf(description).filter((one) => one.tenant !== undefined)
  if (!isLayouts(named) || isDeepStrictEqual(named, JSON.parse(JSON.stringify(tenantTablesNow)))) return
  // The count of writes learns what a stop left in the files that were marked open, before a thread is handed a
  // number: such a file may hold a write above every number that the shared file knows of.
  for (const row of rowsIn(tenantFiles.files.shared).filter((one) => one.open && tenantFiles.files.has(one.file))) {
    tenantFiles.applying(() => tenantFiles.files.of(row.file))
    tenantFiles.files.close(row.file)
  }
  await passOver(o, tenantFiles, named)
}

/** The steps that bring the shared file of an app to what a description asks for. */
export interface PlannedShared {
  steps: TableStep[]
  // Whether the shared file held a table of the app before: data that is new holds nothing that a change could lose.
  held: boolean
}

/**
 * Takes what the engine holds of an app whose files stand open, and a description. Checks every file against the
 * description, the shared file and each tenant's, to read alone, and answers the steps that bring the shared
 * file to it. Changes nothing. Where a step would be refused in any file, it throws the finding, T2001 to T2004:
 * a misfit of a tenant's file names the tenant and the count. With `sharedOnly` no file of a tenant is read: a
 * switch holds each of them against its steps by itself.
 */
export async function planTenantFiles(
  o: Opened,
  tenantFiles: TenantFiles,
  description: Description,
  sharedOnly = false,
  moving = false,
): Promise<PlannedShared> {
  // The shared file keeps the layout of the tenant tables as the files were last told it. Where the
  // description asks for the same, no file is checked: a start reads the files that are marked open, and no others.
  const tenantTablesNow = layoutOf(description).filter((one) => one.tenant !== undefined)
  const same = isDeepStrictEqual(metaOf(o.store, 'tenantLayout'), JSON.parse(JSON.stringify(tenantTablesNow)))
  const facts = same || sharedOnly ? factsOf(o.store, description) : await factsOf(tenantFiles.files, description)
  // With a move, the finding that names the move as the way is no refusal: the rows are being moved.
  const [refused] = facts.tableFindings.filter((one) => !(moving && String(one.fix).includes('--move')))
  if (refused) throw new TentError(refused.code, refused.message, refused.fix === undefined ? {} : { fix: refused.fix })
  const held = o.store.layout().filter((table) => !table.name.startsWith('_t_'))
  const names = new Set(held.map((one) => one.name))
  // A tenant table stands in no shared file, but in one that it is not moved out of yet.
  const asked = layoutOf(description).filter(
    (one) => one.tenant === undefined || names.has(one.name) || one.was?.some((name) => names.has(name)),
  )
  const stated = description.project.removed
  const { steps } = planTableChanges(held, asked, { removed: Array.isArray(stated) ? stated.map(String) : [] })
  return { steps, held: held.length > 0 }
}

/**
 * Applies the steps that were planned for the shared file, tells the files the running layout, and names the
 * running version, inside one write of the shared file: all of it, or none.
 */
export function applyTenantFiles(o: Opened, tenantFiles: TenantFiles, planned: PlannedShared, version: string): void {
  const layout = layoutOf(o.description)
  o.store.write(
    (tx) => {
      if (planned.steps.length) applySteps(tx, o.store, planned.steps, sealedAt(o.dataFolder))
      tenantFiles.files.layout(layout)
      if (metaOf(o.store, 'version') !== version) setRunningVersion(tx, version)
    },
    { steps: true },
  )
}

/**
 * Takes what the engine holds of an app whose files stand open, before it takes its first request. Reads the
 * files that the directory marks as open, and no others: a stop left them so, and what the directory says of them
 * is not to be trusted. A reader first puts into them the changes that it had kept and not yet applied. Then it
 * does the upkeep, and keeps it done by the clock of the app.
 */
export async function startTenantFiles(o: Opened, tenantFiles: TenantFiles, reads: boolean): Promise<void> {
  tenantFiles.heldToBound()
  // What a reader alone needs is loaded for a reader alone.
  const owed = reads ? (await import('./following.ts')).applyKept(tenantFiles) : new Set<string>()
  const read: string[] = []
  for (const row of rowsIn(tenantFiles.files.shared).filter((one) => one.open)) {
    // A file that the reader owes a fetch stays marked, and is not read: it is fetched once the link is open.
    if (owed.has(fileKeyOf(row.file))) continue
    if (!tenantFiles.files.has(row.file)) {
      tenantFiles.sharedWrite((tx) => removeRow(tx, row.file))
      continue
    }
    try {
      tenantFiles.files.of(row.file)
    } catch (error) {
      // A file that is behind has told the count of writes what it holds, and is brought up by the pass.
      if (!(error instanceof NotReady))
        tenantFiles.line('error', 'A data file that was marked open could not be read.', {
          ...row.file,
          error: String(error),
        })
    }
    read.push(row.file.id)
  }
  if (read.length)
    tenantFiles.line(
      'warn',
      'The data files that were marked open were read: the engine was stopped while it held them.',
      {
        files: read,
      },
    )
  try {
    upkeepFiles(o, tenantFiles, reads)
  } catch (error) {
    tenantFiles.line('error', 'The upkeep of the data files of tenants failed.', { error: String(error) })
  }
}

/** Starts the pass that brings every file up which is behind the running layout, and lets it run beside the app. */
export function startPass(o: Opened, tenantFiles: TenantFiles): void {
  // A check that stood when the engine stopped is taken away first, with its holds.
  endStandingCheck(o, tenantFiles)
  void passOver(o, tenantFiles).catch((error: unknown) => {
    if (!o.closed)
      tenantFiles.line('error', 'The pass over the data files of tenants ended early.', { error: String(error) })
  })
  // The pass of a removal that a stop left under way is gone on with: a file nobody opens is swept by it alone.
  if (sweepUnderWay(tenantFiles))
    void sweepAll(o, tenantFiles).catch((error: unknown) => {
      if (!o.closed)
        tenantFiles.line('error', 'The sweep of the data files of tenants ended early.', { error: String(error) })
    })
}
