import { TentError } from '../core/index.ts'
import type { CallContext } from './context.ts'
import { underWay } from './context.ts'
import { hasFullAccess } from './full.ts'
import { touch } from './counts/cpu.ts'

/** What a member of a handle asks of the call that it is used in. */
export interface HandleAsks {
  // It answers a promise: it works where a call may wait, and not in a query, a change or a rule.
  waits?: boolean
  // It writes, sends, or changes who is calling: not in a call that only reads, a query or a rule.
  acts?: boolean
  // It is full access: the function states `system`. The text says what the reason of `system` is for.
  full?: string
}

/**
 * Takes what a member of a handle is called, as code writes it, and what it asks of its call. Answers the call
 * under way that it was used in. Throws T0013 where no call is under way, and where the call is not one that the
 * member works in: a promise in a query, a change or a rule; what writes, sends or changes who is calling in a
 * call that only reads, as an action that a screen reads as `data` is, and in a query or a rule; and what is full
 * access in code that states no `system`.
 */
export function callOf(used: string, asks: HandleAsks = {}): CallContext {
  // A member of a handle is a call of the engine: a touch point of the piece of work at work.
  touch()
  const cx = underWay()
  if (!cx) throw new TentError('T0013', `${used} was used with no call under way.`)
  const { kind } = cx.work
  if (asks.acts && (cx.reads || kind === 'query' || kind === 'rule'))
    throw new TentError(
      'T0013',
      `${used} does what a read may not, and was used ${cx.reads ? 'in a call that only reads' : `in a ${kind}`}.`,
      {
        fix: 'Use it in a change, an action, a route or a step of a flow that a page calls, and not one that it reads.',
      },
    )
  if (asks.waits && (kind === 'query' || kind === 'change' || kind === 'rule'))
    throw new TentError('T0013', `${used} answers a promise, and was used in a ${kind}, which waits for nothing.`, {
      fix: 'Use it in an action, a route or a step of a flow.',
    })
  if (asks.full !== undefined && !hasFullAccess(cx))
    throw new TentError('T0013', `${cx.work.name} used ${used}, which is full access, and states no \`system\`.`, {
      fix: `State \`system: 'why'\` on the definition, with the reason it ${asks.full}.`,
    })
  return cx
}
