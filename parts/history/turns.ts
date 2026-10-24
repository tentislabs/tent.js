import type { Finding } from '../core/index.ts'
import type { SqliteFile } from '../data/index.ts'
import type { Change } from './compare/change.ts'
import type { Writer } from './point.ts'

/** One turn of an agent that builds, as the history keeps it: where it stands, its points and its snapshots. */
export interface TurnRow {
  id: string
  state: 'working' | 'done' | 'stopped' | 'undone'
  stopped?: 'budget' | 'rounds' | 'refused' | 'person'
  // The point before the turn and the one after it, and the snapshots of the data.
  before: string
  after?: string
  dataBefore?: string
  dataAfter?: string
  // The store's count of changes at the snapshot before the turn, and at the one after it.
  dataCount: number
  dataEnd?: number
  run?: string
  rounds: number
  findings: Finding[]
  by: Writer
  at: number
  used: Record<string, number>
  // What the turn was asked, by which it is taken up after a start of the program: the history keeps it as it is.
  asked?: object
  // Worked out from its two points when it is read, and never kept.
  changes: Change[]
}

const columns =
  'id, state, stopped, before, after, dataBefore, dataAfter, dataCount, dataEnd, run, rounds, findings, by, at, used, asked'

/** Writes a turn as its row, in the place of the one of its id that stands. Its changes are not kept. */
export function keepTurn(file: SqliteFile, row: TurnRow): void {
  const values = [
    row.id,
    row.state,
    row.stopped,
    row.before,
    row.after,
    row.dataBefore,
    row.dataAfter,
    row.dataCount,
    row.dataEnd,
    row.run,
    row.rounds,
    JSON.stringify(row.findings),
    JSON.stringify(row.by),
    row.at,
    JSON.stringify(row.used),
    row.asked === undefined ? undefined : JSON.stringify(row.asked),
  ]
  file.write(() =>
    file.run(`INSERT OR REPLACE INTO turns (${columns}) VALUES (${values.map(() => '?').join(', ')})`, values),
  )
}

/** A text of a row as itself, or nothing for a column that holds none. */
const textOf = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

/** The reason a turn stopped, of the four there are. */
const stoppedOf = (value: unknown): TurnRow['stopped'] =>
  value === 'budget' || value === 'rounds' || value === 'refused' || value === 'person' ? value : undefined

/** The state of a turn, of the four there are. */
const stateOf = (value: unknown): TurnRow['state'] =>
  value === 'done' || value === 'stopped' || value === 'undone' ? value : 'working'

/**
 * The turns of the history, the newest first, the newest `newest` of them where that is given, and those that are
 * still at work with `unfinished`. `changes` makes the changes of a turn from its two points, as compare does.
 */
export function turnsOf(
  file: SqliteFile,
  o: { newest?: number; unfinished?: boolean },
  changes: (before: string, after: string) => Change[],
): TurnRow[] {
  const rows = file.all(
    `SELECT ${columns} FROM turns ${o.unfinished ? "WHERE state = 'working'" : ''} ORDER BY at DESC, id DESC ${o.newest === undefined ? '' : 'LIMIT ?'}`,
    o.newest === undefined ? [] : [o.newest],
  )
  return rows.map((row) => {
    const of = (name: string): unknown => Reflect.get(row, name)
    const before = String(of('before'))
    const after = textOf(of('after'))
    const stopped = stoppedOf(of('stopped'))
    const optional = {
      after,
      dataBefore: textOf(of('dataBefore')),
      dataAfter: textOf(of('dataAfter')),
      run: textOf(of('run')),
      dataEnd: typeof of('dataEnd') === 'number' ? Number(of('dataEnd')) : undefined,
      asked: typeof of('asked') === 'string' ? Object(JSON.parse(String(of('asked')))) : undefined,
    }
    let changed: Change[] = []
    try {
      changed = after === undefined ? [] : changes(before, after)
    } catch {
      // A point that was dropped since gives no changes: the turn is still read.
      changed = []
    }
    return {
      id: String(of('id')),
      state: stateOf(of('state')),
      ...(stopped ? { stopped } : {}),
      before,
      ...Object.fromEntries(Object.entries(optional).filter((one) => one[1] !== undefined)),
      dataCount: Number(of('dataCount') ?? 0),
      rounds: Number(of('rounds') ?? 0),
      findings: JSON.parse(String(of('findings') ?? '[]')),
      by: JSON.parse(String(of('by') ?? '{"kind":"ai"}')),
      at: Number(of('at') ?? 0),
      used: JSON.parse(String(of('used') ?? '{}')),
      changes: changed,
    }
  })
}
