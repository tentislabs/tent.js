import type { WireError } from '../../core/index.ts'
import { useStore } from '../page/context.ts'
import { calledBy } from '../page/press.ts'
import type { AnswerOf, InputOf, Stub } from '../travelled.ts'

/** What `useQuery` gives: the answer, whether it is on its way, what it failed with, and a way to ask once more. */
export interface Queried<Answer> {
  value: Answer | undefined
  busy: boolean
  error?: WireError
  again(): void
}

/**
 * Takes a query or an action as a screen file imported it, its input, and `hold`, which holds the asking back.
 * Answers what it was answered. It is for code that needs data in the middle of a view: `data` is the declared
 * way. On the server it is answered at once, and in the browser it first takes the answer the page came with.
 */
export function useQuery<const What extends Stub>(
  query: What,
  input?: InputOf<What>,
  o?: { hold?: boolean },
): Queried<AnswerOf<What>>
export function useQuery(query: Stub, input: unknown = {}, o: { hold?: boolean } = {}): Queried<unknown> {
  const store = useStore()
  const name = calledBy(query)
  const held = o.hold === true || name === undefined
  // A query that is live is watched while its view shows it: the engine sends what changes.
  const live = query.kind === 'query' && Reflect.get(query, 'live') === true
  const how = { kind: query.kind, ...(live ? { live: true } : {}) }
  const answer = held ? undefined : store.ask(name, input, how)
  return {
    value: answer?.value,
    busy: !held && (answer === undefined || answer.later === true || answer.left !== undefined),
    ...(answer?.error ? { error: answer.error } : {}),
    again: () => {
      if (name !== undefined) store.ask(name, input, how, true)
    },
  }
}
