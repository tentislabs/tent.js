import { TentError } from '../core/index.ts'
import type { CallContext } from './context.ts'
import { readOnly } from './door/call.ts'
import { onlyReads } from './flows/outside.ts'
import { hasFullAccess } from './full.ts'

/**
 * Takes the working object of a handle that a part above the engine gave, the name of the handle, and the call it
 * is used in. Answers the handle as that code meets it: each member is handed `{ caller }` of the call first, and
 * then what the code hands it. A handle that a part gives is full access, so each member throws T0013 in code that
 * has none, and one that does more than read also inside a call that only reads.
 */
export function givenHandle(working: object, name: string, cx: CallContext): object {
  const members: Record<string, unknown> = {}
  for (const member of Object.keys(working)) {
    const made: unknown = Reflect.get(working, member)
    if (typeof made !== 'function') continue
    members[member] = (...args: unknown[]) => {
      if (!hasFullAccess(cx))
        throw new TentError('T0013', `\`${name}.${member}\` is full access, and the code that used it has none.`, {
          fix: "State `system: 'why'` on the function that uses it, with the reason it needs full access.",
        })
      if (cx.reads === true && !onlyReads(`${name}.${member}`)) throw readOnly(`\`${name}.${member}\``)
      return Reflect.apply(made, working, [{ caller: cx.caller }, ...args])
    }
  }
  return members
}
