import type { Caller } from '../core/index.ts'
import type { By } from '../data/index.ts'
import { callerText } from '../data/index.ts'
import type { CallContext } from './context.ts'

/**
 * Takes a caller, and the run a write is part of, where it is one. Answers by whom the write is made, as the
 * record of its change keeps it: the caller as one column keeps it, the system too, and the run.
 */
export const byWhom = (caller: Caller, run?: string): By => ({
  caller: callerText(caller),
  ...(run === undefined ? {} : { run }),
})

/** By whom a write of a call is made: its caller, in the run it stands in. */
export const byOf = (cx: CallContext): { by: By } => ({ by: byWhom(cx.caller, cx.run?.id) })
