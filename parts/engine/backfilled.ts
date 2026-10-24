import type { Db } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import type { FileName, TableStep } from '../data/index.ts'
import { applySteps, findMisfits, pagePlan, walkAt, walkedOn } from '../data/index.ts'
import { underWay } from './context.ts'
import { storedLimit } from './limits.ts'
import type { Opened } from './opened.ts'
import { callIn } from './rooms/calls.ts'
import type { Called } from './rooms/room.ts'
import { systemWrite, walkedTx } from './systemWrite.ts'
import { sealedAt } from './values/seal.ts'
import { isStored } from '../core/internal.ts'

type Stored = Record<string, unknown>

// The arrow of each backfill, by its name, kept under the description of the version whose code gives it.
const arrows = new WeakMap<object, Map<string, (row: unknown, handed: object) => unknown>>()

/**
 * Takes what the engine holds of an app, and what its room answered for the `run` of each backfill of its
 * description. Keeps them for the version, each called as code that writes at once.
 */
export function keepBackfills(o: Opened, called: Map<string, Called>): void {
  const kept = new Map<string, (row: unknown, handed: object) => unknown>()
  for (const [name, run] of called)
    kept.set(name, (row, handed) => callIn(underWay(), o.room, run, [row, handed], true, false))
  arrows.set(o.description, kept)
}

/** The table of the tenants of a table, or nothing for a table of the shared file. */
function tenantTableOf(o: Opened, table: string): string | undefined {
  const record = o.description.tables[table]
  const columns = isStored(record?.columns) ? record.columns : {}
  const by = typeof record?.tenant === 'string' ? Reflect.get(Object(columns[record.tenant]), 'table') : undefined
  return typeof by === 'string' ? by : undefined
}

/**
 * Walks one backfill over one data file by the one walk of a switch, its note `walk.<backfill>`: a page to a
 * write, each page with its place written in the same write, and the mark that it is done in the write of its last
 * page. A file where it is done is left as it is.
 */
async function walkFile(
  o: Opened,
  name: string,
  record: Stored,
  file: FileName | undefined,
  inside: <Answer>(work: () => Answer) => Answer = (work) => work(),
): Promise<void> {
  const arrow = arrows.get(o.description)?.get(name)
  if (!arrow) throw new TentError('T0011', `The bundle holds no code for the \`run\` of the backfill ${name}.`)
  const table = String(record.table)
  const page = typeof record.page === 'number' ? record.page : Math.max(1, storedLimit(o.description, 'workPage'))
  for (;;) {
    const done = await systemWrite(
      o,
      `backfill.${name}`,
      (db: Db, cx) =>
        inside(() => {
          const tx = walkedTx(cx, file, 'A backfill')
          const place = walkAt(tx, name)
          if (place === 'done') return true
          const read: unknown = db.read({
            ...pagePlan(table, place?.after ?? '', page),
            ...(file ? { of: file.id } : {}),
          })
          const rows = Array.isArray(read) ? read : []
          const now = new Date(o.clock.now())
          for (const row of rows) arrow(row, { db, now })
          const ended = rows.length < page
          walkedOn(tx, name, ended ? undefined : String(Reflect.get(Object(rows.at(-1)), 'id')), true)
          return ended
        }),
      { full: typeof record.system === 'string' },
    )
    if (done) return
  }
}

/**
 * Takes what the engine holds of an app, on the writer, at the switch to the version that runs now. Carries each
 * backfill of that version over a table of the shared file out once over every row of it, a page at a time. The
 * file keeps where each backfill stands, so a stop goes on from there, and where it is done, so it runs once. A
 * reader runs none: it is handed the rows as changes. One over a tenant table runs in the pass that brings
 * each file up: see `walkTenant`.
 */
export async function runBackfills(o: Opened): Promise<void> {
  for (const [name, record] of Object.entries(o.description.backfills ?? {}))
    if (isStored(record) && tenantTableOf(o, String(record.table)) === undefined)
      await walkFile(o, name, record, undefined)
}

/**
 * Takes what the engine holds of an app, on the writer, the file of a tenant that is brought up, and how a write
 * of that file is let through while nothing else reads it. Carries each backfill of the running version over a
 * table of the file out in it, a page to a write, where it is not done there yet.
 */
export async function walkTenant(
  o: Opened,
  file: FileName,
  inside: <Answer>(work: () => Answer) => Answer,
): Promise<void> {
  for (const [name, record] of Object.entries(o.description.backfills ?? {}))
    if (isStored(record) && tenantTableOf(o, String(record.table)) === file.table)
      await walkFile(o, name, record, file, inside)
}

/**
 * Takes what the engine holds of an app at the switch to the version that runs now, and the steps of its table
 * change that make a column required which a backfill fills. Runs the backfills, and then takes those steps in
 * one write, held against the rows as they stand after the backfills. Throws T2001 where a row does not fit: the
 * column stays optional in the data, and the version's own types still refuse a write that leaves it out.
 */
export async function backfilled(o: Opened, later: TableStep[]): Promise<void> {
  await runBackfills(o)
  if (!later.length) return
  const misfits = findMisfits(o.store, later)
  if (misfits.length) {
    const [first] = misfits
    throw new TentError(
      'T2001',
      `${first.rows} ${first.rows === 1 ? 'row' : 'rows'} of \`${first.table}\` hold nothing in \`${first.column}\` after the backfill that fills it ran.`,
      { fix: 'Mend the backfill so that it fills every row, and switch to its version again.' },
    )
  }
  o.store.write((tx) => applySteps(tx, o.store, later, { ...sealedAt(o.dataFolder), now: () => o.clock.now() }), {
    steps: true,
  })
}
