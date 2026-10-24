import { heldIn } from './held.ts'
import type { Finding } from '../core/index.ts'
import type { Description } from '../core/internal.ts'
import { finding } from '../core/internal.ts'
import { rowsText } from './bringUp.ts'
import { tenantTable, inFiles } from './fileLayout.ts'
import type { Files } from './files.ts'
import type { Misfit } from './findMisfits.ts'
import { filledBy, waitsForBackfill } from './fills.ts'
import { findMisfits } from './findMisfits.ts'
import { layoutOf } from './layoutOf.ts'
import { planTableChanges } from './planTableChanges.ts'
import type { Store, TableLayout, TableStep } from './store.ts'
import { underNewNames } from './underNewNames.ts'
import { visitFiles } from './visitFiles.ts'

/** The tables of an app that a store holds: the engine's own are no part of what an app describes. */
const appTables = (store: Store): TableLayout[] => store.layout().filter((table) => !table.name.startsWith('_t_'))

/** The finding of the rows that do not fit a step, with the count, and for a tenant's file with the tenant. */
function misfitFinding(held: TableLayout[], steps: TableStep[], { table, column, rows, file }: Misfit): Finding {
  const where = file ? `, in the data file of ${file.table} ${file.id}` : ''
  const step = steps.find((one) => one.do === 'retype' && one.table === table && one.column === column)
  const before = held.find((one) => one.name === table)?.columns[column]
  if (step?.to?.kind === 'vector') {
    const made = String(heldIn(before, 'made') ?? 'that it stated before')
    return finding(
      'T2001',
      `${rowsText(rows)} of \`${table}\` hold a vector in \`${table}.${column}\` that the model ${made} made, and the column now states the model ${String(Reflect.get(step.to, 'made'))}${where}.`,
      {
        fix: "State `old: 'drop'` on the column to empty it, or `old: 'keep'` where both models make the same vectors.",
      },
    )
  }
  return finding(
    'T2001',
    `${rowsText(rows)} of \`${table}\` ${rows === 1 ? 'does' : 'do'} not fit what \`${table}.${column}\` becomes${where}.`,
    {
      fix: 'Change those rows so that they fit, or add a new column, fill it with a change, then remove the old one.',
    },
  )
}

/**
 * What the table change from what one store holds to the layout it is asked for would be refused for. `held` is
 * what the store holds as the plan is to read it, where that is not what the store itself answers.
 */
function factsIn(
  store: Store,
  asked: TableLayout[],
  removed: string[],
  fills: Set<string>,
  file?: Misfit['file'],
  held = appTables(store),
): Finding[] {
  const { steps, findings } = planTableChanges(held, asked, { removed })
  // A column that a backfill fills is held to its rows once the backfill ran.
  const checked = steps.filter((step) => !waitsForBackfill(step, fills))
  const misfits = findMisfits(store, checked).map((one) => misfitFinding(held, steps, file ? { ...one, file } : one))
  return [...findings, ...misfits]
}

/** Answers the tables of a layout that a store holds, each by its name or by one it had before. */
function heldOf(held: TableLayout[], asked: TableLayout[]): TableLayout[] {
  const names = new Set(held.map((one) => one.name))
  return asked.filter((one) => names.has(one.name) || one.was?.some((name) => names.has(name)))
}

/**
 * Takes a store and a description. Answers what the table change from the one to the other would be refused for:
 * what `planTableChanges` finds in the two layouts (T2001 to T2004), and each column that `findMisfits` counts rows
 * for (T2001, with the count). The check passes these on, and compares nothing itself. A description keeps no file
 * and no line, so a finding names its table and whoever passes it on adds the place. Handed the files of an app, it
 * answers a promise: the shared file is held against the tables that are no tenant tables, and every tenant's file
 * is visited, to read alone, and held against the tables it holds of those that are. A table that stands in the
 * shared file and is a tenant table from now on, and one that stands in the files and no longer is, is held where it
 * stands, so it is found as a table whose rows must be moved and not as one that is gone. A misfit of a tenant's
 * file names the tenant, and what is found in the layouts of several files is said once.
 */
export function factsOf(store: Store, description: Description): { tableFindings: Finding[] }
export function factsOf(files: Files, description: Description): Promise<{ tableFindings: Finding[] }>
export function factsOf(
  on: Store | Files,
  description: Description,
): { tableFindings: Finding[] } | Promise<{ tableFindings: Finding[] }> {
  const stated = description.project.removed
  const removed = Array.isArray(stated) ? stated.map(String) : []
  const layout = layoutOf(description)
  const fills = filledBy(description)
  if (!('shared' in on)) return { tableFindings: factsIn(on, layout, removed, fills) }
  const tenanted = heldOf(
    appTables(on.shared),
    layout.filter((one) => tenantTable(one) !== undefined),
  )
  const shared = factsIn(
    on.shared,
    [...layout.filter((one) => tenantTable(one) === undefined), ...tenanted],
    removed,
    fills,
  )
  const inFile = new Map(inFiles(layout).map((one) => [one.name, one]))
  // Each table as a file would keep it: one that is no tenant table stands in no file, but in one it is moved from.
  const kept = layout.map((one) => inFile.get(one.name) ?? one)
  return visitFiles(on, (store, file) => {
    // A table that the file does not hold yet needs no change: it is made in the new layout with its first row.
    const { held } = underNewNames(appTables(store), layout)
    return factsIn(store, heldOf(held, kept), removed, fills, file, held)
  }).then((found) => {
    const once = new Map([...shared, ...found.flat()].map((one) => [`${one.code} ${one.message}`, one]))
    return { tableFindings: [...once.values()] }
  })
}
