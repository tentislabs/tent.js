import type { Description } from '../../core/internal.ts'
import type { App } from '../../engine/index.ts'
import { changesOf } from '../../history/index.ts'
import type { ImpactFacts } from './face.ts'
import type { Stored } from './read.ts'
import { recordsOf } from './read.ts'

/** What `lasts` of a table says, as the description keeps it: how long, from which moment, and of which rows. */
interface Lasts {
  for: number
  by: string
  where?: Stored
}

const lastsOf = (record: Stored | undefined): Lasts | undefined => {
  const lasts: unknown = record?.lasts
  if (typeof lasts !== 'object' || lasts === null) return undefined
  const [length, by, where]: unknown[] = [
    Reflect.get(lasts, 'for'),
    Reflect.get(lasts, 'by'),
    Reflect.get(lasts, 'where'),
  ]
  if (typeof length !== 'number' || typeof by !== 'string') return undefined
  return { for: length, by, ...(typeof where === 'object' && where !== null ? { where: { ...where } } : {}) }
}

/**
 * The filter of the rows that the first pass of a `lasts` removes: those past their age that its `where` names,
 * but each that a link which refuses its removal holds, as the upkeep leaves it.
 */
function agedWhere(description: Description, table: string, lasts: Lasts, now: number): Stored {
  const refusing = Object.entries(recordsOf(description, 'tables')).flatMap(([name, record]) =>
    Object.entries(Object(record.columns)).flatMap(([column, type]) => {
      const link: Stored = Object(type)
      return link.kind === 'link' && link.table === table && (link.onRemove ?? 'refuse') === 'refuse'
        ? [{ not: { col: 'id', in: { from: name, pick: [column] } } }]
        : []
    }),
  )
  const before = new Date(now - lasts.for).toISOString()
  return { all: [{ col: lasts.by, before }, ...(lasts.where ? [lasts.where] : []), ...refusing] }
}

/** What the facts of an impact are asked of: a running app, in this program or over its admin channel. */
export interface Asker {
  // The callers of each function of the log in the last 30 days, each counted once.
  callers(): Promise<Record<string, number>>
  // How many rows a table holds, as the system reads them, of those a filter names where one is handed.
  count(table: string, where?: Stored): Promise<number>
  // The runs that wait, each with its flow and the step it stands at.
  waiting(): Promise<{ flow: string; step: string }[]>
}

/** What an app in this program is asked the facts of an impact by: its own members. */
export function askerOfApp(app: App): Asker {
  return {
    async callers() {
      const told = await app.logs({ callers: true, since: '30 days' })
      return Object(told.callers)
    },
    async count(table, where) {
      return Number(await app.read({ from: table, ...(where ? { where } : {}), count: true }, { as: 'system' }))
    },
    async waiting() {
      return app.runs.find({ states: ['waiting'], newest: 10_000 }).flatMap((run) => {
        const step = run.steps.findLast((one) => one.state === 'waiting' || one.state === 'started')
        return step ? [{ flow: run.flow, step: step.name }] : []
      })
    },
  }
}

/**
 * Takes what a running app is asked through, the description it runs, and the one that would follow it. Answers
 * the facts of the impact of the change that the app alone knows: the callers of the last 30 days, the rows of
 * each table that the change touches, and the runs that stand at each step of a flow that it changes.
 */
export async function factsOf(asker: Asker, live: Description, next: Description): Promise<ImpactFacts> {
  const changes = changesOf(live, next)
  const tables = new Set<string>()
  for (const change of changes)
    if (change.what === 'column' || change.what === 'table') tables.add(change.name.split('.')[0])
  for (const record of Object.values(recordsOf(next, 'backfills'))) tables.add(String(record.table))
  const there = recordsOf(live, 'tables')
  const rows: Record<string, number> = {}
  for (const table of tables) {
    if (!Object.hasOwn(there, table)) continue
    // A tenant table is counted in no one file: its rows go untold, and the impact names its change alone.
    const count = await asker.count(table).catch(() => undefined)
    if (count !== undefined) rows[table] = count
  }
  const flows = new Set(changes.filter((one) => one.what === 'step').map((one) => one.name.split('.')[0]))
  const counted = new Map<string, { flow: string; step: string; count: number }>()
  if (flows.size)
    for (const run of await asker.waiting()) {
      if (!flows.has(run.flow)) continue
      const key = `${run.flow}\n${run.step}`
      const held = counted.get(key) ?? { ...run, count: 0 }
      held.count++
      counted.set(key, held)
    }
  // What the first pass of each `lasts` that is new or changed removes, counted on the data as it stands.
  const kept: Record<string, number> = {}
  for (const [table, record] of Object.entries(recordsOf(next, 'tables'))) {
    const lasts = lastsOf(record)
    if (!lasts || !Object.hasOwn(there, table) || JSON.stringify(lasts) === JSON.stringify(lastsOf(there[table])))
      continue
    // A tenant table is counted in no one file: what its first pass removes goes untold.
    const count = await asker.count(table, agedWhere(next, table, lasts, Date.now())).catch(() => undefined)
    if (count !== undefined) kept[table] = count
  }
  return { callers: await asker.callers(), rows, kept, runs: [...counted.values()] }
}
