import { countsLayout } from '../../core/internal.ts'
import type { App } from '../app.ts'
import { within } from '../context.ts'
import { countsCallerHeld } from '../counts/readAlone.ts'
import { isPlan } from '../../core/internal.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { asCall, callerNamed, dbFor, notTaken } from '../program.ts'

/**
 * `app.read`: a plan, as a table gives it, carried out under the rules of the caller that `as` names. As the
 * system it answers every row, and only then a `private` column. It is carried out as a call, a query that holds
 * the plan: a rule of a table is handed what it is handed at the door, and what a query may not do is refused.
 */
export const member =
  (o: Opened): App['read'] =>
  async (plan, how) => {
    heldOpen(o)
    const held: unknown = Reflect.get(Object(plan), 'plan')
    const record = isPlan(held) ? held : isPlan(plan) ? plan : undefined
    if (!record) throw notTaken('read', 'a plan')
    const caller = callerNamed(how?.as)
    // The counts of the engine are read as the system alone, straight from the store, and never written.
    if (record.from === countsLayout.name) {
      countsCallerHeld(caller)
      return o.store.read(record, caller).value
    }
    return o.machine.sent('read', [record], caller, true, () => {
      const ends = performance.now() + limitOf(o.description, 'queryTime')
      const once = (): unknown => {
        const cx = asCall(o, caller, 'read', ends)
        return within(cx, () => dbFor(o, cx.caller).read(record))
      }
      // A read that names a file which is not ready is carried out again once the file is, within its one time.
      return o.tenantFiles ? o.tenantFiles.carried(ends, once) : once()
    })
  }
