import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import { limitOf } from '../limits.ts'
import type { Opened } from '../opened.ts'
import { callModel, modelCallOf } from './call.ts'

// The signal of a call that nothing ends but its time.
const never = new AbortController().signal

/** Whether an answer is the parts of a stream. */
const isStream = (value: unknown): value is AsyncIterable<unknown> =>
  typeof value === 'object' && value !== null && Symbol.asyncIterator in value

/**
 * Takes an app, a name, what was handed, and the caller. Where the name is a model call, `'writer.reply'`, or a
 * model that is a function, carries it out as an action of a program would make it, with the values as a list:
 * for a model that is a function the input alone. Answers a promise of what it answers, and nothing for any other name.
 */
export function appModelCall(o: Opened, name: string, given: unknown, caller: Caller): Promise<unknown> | undefined {
  const work = {
    name,
    kind: 'action' as const,
    depth: 1,
    now: new Date(o.clock.now()),
    ends: performance.now() + limitOf(o.description, 'actionTime'),
  }
  const cx: CallContext = { app: o, version: o.version, caller, made: 0, signal: never, work }
  const asked = modelCallOf(cx, name)
  if (!asked) return undefined
  const args = asked.method === 'call' ? [given] : given
  if (!Array.isArray(args))
    return Promise.reject(
      new TentError('T0002', `A model call ${name} is handed its values as a list.`, {
        fix: `Hand \`app.call\` the values of the call in a list, as \`app.call('${name}', ['...'])\`.`,
      }),
    )
  return within(cx, async () => {
    const answer = callModel(cx, name, args)
    if (asked.method !== 'stream') return answer
    // A stream is read to its end for a program: it answers the parts in their order.
    const parts: unknown[] = []
    if (isStream(answer)) for await (const part of answer) parts.push(part)
    return parts
  })
}
