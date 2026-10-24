import type { Tx, Writing } from '../../data/index.ts'
import type { App } from '../app.ts'
import type { Written } from '../context.ts'
import { within } from '../context.ts'
import { isWrite } from '../door/carry.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { asCall, callerNamed, dbFor, notTaken } from '../program.ts'
import { rowHolding } from '../stored/given.ts'
import { byOf } from '../byWhom.ts'

/**
 * `app.write`: a list of writes, as a table gives them, carried out as one write under the rules of the caller
 * that `as` names. It answers the row of each, in their order. Each row is told to whoever listens once the write
 * is committed, and no change is, since none was called. It is carried out as a call, a change that holds the
 * writes: a rule of a table is handed what it is handed at the door, the whole of it is one moment, and a row it
 * writes sets off the table triggers of the flows in that write, as a row of a change does.
 */
export const member =
  (o: Opened): App['write'] =>
  async (writes, how) => {
    heldOpen(o)
    if (!Array.isArray(writes) || !writes.every(isWrite)) throw notTaken('write', 'a list of writes')
    const caller = callerNamed(how?.as)
    return o.machine.sent('write', [writes], caller, false, async () => {
      const rows: Written['rows'] = []
      const wrote: NonNullable<Parameters<typeof dbFor>[3]>['wrote'] = (w) =>
        void rows.push({ table: w.table, id: String(w.row.id), kind: w.kind })
      const ends = performance.now() + limitOf(o.description, 'changeTime')
      // What the write does once it is committed, and never where it is undone.
      const later: (() => void)[] = []
      /** One pass of the write: where it names a file that is not ready, it is undone and carried out again. */
      const once = (): unknown => {
        rows.length = 0
        later.length = 0
        const cx = asCall(o, caller, 'write', ends)
        o.machine.writes('app.write')
        const carried = (write: Tx | Writing): unknown => {
          const inWrite = { ...cx, ...('files' in write ? { writing: write } : { tx: write }) }
          const holds = rowHolding(o, write, cx.caller, cx.caller.kind === 'system', (work) => void later.push(work))
          const held: typeof wrote = (w) => {
            holds(w)
            wrote?.(w)
            o.flows?.wrote(inWrite, w)
          }
          const db = dbFor(o, cx.caller, write, { wrote: held, guarded: { users: ['roles'] } })
          const answer = within(inWrite, () => db.write(writes))
          o.machine.writes('app.write')
          return answer
        }
        return (o.files ? o.files.write(carried, byOf(cx)) : o.store.write(carried, byOf(cx))).value
      }
      const value = await (o.tenantFiles ? o.tenantFiles.carried(ends, once) : once())
      for (const work of later) work()
      for (const row of rows) o.raise('row.changed', { app: o.app, ...row })
      return value
    })
  }
