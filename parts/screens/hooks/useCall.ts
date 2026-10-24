import type { WireError } from '../../core/index.ts'
import { useState } from '../borrowed/react.ts'
import { useStore } from '../page/context.ts'
import { calledBy, seenOf } from '../page/press.ts'
import type { AnswerOf, InputOf, Stub } from '../travelled.ts'

/**
 * What `useCall` gives: the call itself, whether one is under way, whether the page holds it for want of a
 * connection, what the last one failed with, and what the last one answered.
 */
export interface Called<Input, Answer> {
  call(input: Input): Promise<Answer>
  busy: boolean
  held: boolean
  error?: WireError
  value?: Answer
}

/**
 * How `useCall` is asked. `optimistic` shows the result of a call at once: `to` is handed what `query` answers now and
 * the input of the call, and answers what it will answer once the call has worked.
 */
export interface CallOptions<Input, Query extends Stub> {
  // `false` shows nothing ahead, also of a change whose body the page could work out.
  optimistic?: { query: Query; to(value: AnswerOf<Query>, input: Input): AnswerOf<Query> } | false
}

/**
 * Takes a change or an action as a screen file imported it. Answers `call`, which sends a call through the door
 * and answers a promise of the answer. A failure refuses the promise with the error, which is in `error` too.
 * With `optimistic` its result is shown the moment `call` is made, for every use of that query on the page. It is
 * dropped when a result of that query arrives after the call was answered, or two seconds after the answer,
 * whichever comes first, and at once when the call fails.
 */
export function useCall<const What extends Stub, const Query extends Stub = Stub>(
  fn: What,
  o?: CallOptions<InputOf<What>, Query>,
): Called<InputOf<What>, AnswerOf<What>>
export function useCall(fn: Stub, o: CallOptions<unknown, Stub> = {}): Called<unknown, unknown> {
  const store = useStore()
  const [state, setState] = useState<{ busy: boolean; held: boolean; error?: WireError; value?: unknown }>({
    busy: false,
    held: false,
  })
  const name = calledBy(fn)
  const changes = o.optimistic ? calledBy(o.optimistic.query) : undefined
  const to = o.optimistic ? o.optimistic.to : undefined
  return {
    ...state,
    call: async (input) => {
      if (name === undefined) throw new Error('`useCall` is handed a change or an action that the screen file imports.')
      setState({ busy: true, held: false })
      // A held call is busy too: it is under way until the connection is back and it has been answered.
      const held = (on: boolean): void => setState((was) => ({ ...was, busy: true, held: on }))
      try {
        const shown =
          o.optimistic === false
            ? { optimistic: false as const }
            : changes !== undefined && to
              ? { optimistic: { what: changes, to } }
              : {}
        const value = await store.call(name, input ?? {}, { ...shown, held })
        setState({ busy: false, held: false, value })
        return value
      } catch (thrown) {
        const error = seenOf(thrown)
        setState({ busy: false, held: false, error })
        throw error
      }
    },
  }
}
