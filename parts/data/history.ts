import { matches } from '../core/internal.ts'
import { callerText } from './callerText.ts'
import type { DbContext } from './context.ts'
import { boundOf } from './context.ts'
import { plansAnswered } from './fileReads.ts'
import { hand } from './handed.ts'
import { rowIds } from './ids.ts'
import type { TableModel } from './model.ts'
import { typeIn } from './model.ts'
import { withMoments } from './moments.ts'
import { handedList, handedRow, shown } from './present.ts'
import { rowUnder } from './rowUnder.ts'
import type { Row } from './store.ts'
import { historyTable } from './tables.ts'
import type { Filter } from './worked.ts'

/** One earlier version of a row: when it was replaced, who did it, and the row as it was. */
interface Entry {
  at: Date
  by: string
  value: Row
}

/**
 * Keeps the earlier version of a row of a table that keeps its history, inside the write that changes or removes
 * it: the row as the store held it, a sealed value sealed, with the caller and the moment.
 */
export function keepVersion(cx: DbContext, model: TableModel, before: Row): void {
  if (!model.keepHistory || !cx.write) return
  // The earlier versions of a row are kept in the file the row lives in.
  cx.write(cx.at).add(
    historyTable.name,
    {
      id: rowIds.next(),
      tableName: model.name,
      rowId: before.id,
      at: new Date(cx.now()),
      by: callerText(cx.caller),
      value: before,
    },
    cx.caller,
  )
}

/**
 * A kept row as code holds it again, each column under the name it has today: JSON text keeps a moment as text.
 * `under` holds, by the name of today, the name a column was kept under.
 */
function rowAgain(model: TableModel, kept: unknown): { row: Row; under: Map<string, string> } {
  const row: Row = {}
  const under = new Map<string, string>()
  if (typeof kept !== 'object' || kept === null) return { row, under }
  for (const [name, value] of Object.entries(kept)) {
    const now = Object.hasOwn(model.columns, name) ? name : (model.formerly[name] ?? name)
    // A row that holds a name of today beside a former one of the same column is read by the name of today.
    if (now !== name && Object.hasOwn(kept, now)) continue
    const type = typeIn(model, now)
    row[now] = type ? withMoments(type, value) : value
    under.set(now, name)
  }
  return { row, under }
}

/**
 * Takes a table and the id of a row. Answers the earlier versions that were kept of the row, the oldest first,
 * each with its moment, who changed it and the row as it was. A rename writes nothing of them anew: those kept
 * under a former name of the table are read too, each column is handed under the name it has today, and a sealed
 * value is opened by the names it was kept under. It is opened by `reach`, what the `read` rule of today lets the
 * caller reach, tested against the row as it is now, or against its last kept version when the row was removed.
 */
export function readHistory(cx: DbContext, model: TableModel, id: string, reach: Filter | 'all' | 'none'): Entry[] {
  const kept = cx.read({
    from: historyTable.name,
    where: {
      all: [
        { col: 'tableName', in: [model.name, ...model.was] },
        { col: 'rowId', is: id },
      ],
    },
    sort: [{ by: 'at' }, { by: 'id' }],
  })
  const versions: Row[] = Array.isArray(kept) ? kept : []
  if (!cx.full) {
    const last = versions.at(-1)
    const now = rowUnder(cx, model, id, 'all')
    const mayRead = now
      ? rowUnder(cx, model, id, reach) !== undefined
      : // A row in memory is held against lists: a plan inside the rule is answered first.
        last !== undefined &&
        reach !== 'none' &&
        (reach === 'all' || matches(plansAnswered(cx, reach), rowAgain(model, last.value).row))
    if (!mayRead) return handedList(cx, [])
  }
  const entries = versions.map((version): Entry => {
    const { row, under } = rowAgain(model, version.value)
    const bound = (column: string) => boundOf(String(version.tableName), under.get(column) ?? column, id)
    const value = handedRow(cx, model, shown(cx, model, row, id, bound))
    const entry = { at: new Date(Number(version.at)), by: String(version.by), value }
    return cx.freeze ? hand(entry, { kind: 'entry' }) : entry
  })
  return handedList(cx, entries)
}
