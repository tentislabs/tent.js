import { TentError } from '../../core/index.ts'
import { rowIds } from '../../data/index.ts'
import type { CallContext } from '../context.ts'
import { callService } from '../services/call.ts'
import { mayPlace } from '../flows/workPlace.ts'
import { madeAlready } from './callPlace.ts'

/**
 * A service call that the work on a worker makes itself, with the secrets of its own machine: a `may` before it,
 * which the writer counts against the limits of the service, holds to the person's yes where the leave of the run
 * needs one, and answers once the call may start, and a `did` after it, which frees the place it took, writes the
 * row of `outgoing` in the writer's log, and keeps the answer of an agreed call. Answers what the call answered, or
 * what was kept of an agreed call that was made already, or throws what it failed with.
 */
export function calledOnWorker(cx: CallContext, definition: string, args: unknown[]): Promise<unknown> {
  const dot = definition.indexOf('.')
  const told = { service: definition.slice(0, dot), call: definition.slice(dot + 1) }
  return callService(cx, definition, args, {
    onWorker: async (held, input, call) => {
      const remote = held.remote
      if (!remote) throw new TentError('T0009', 'A call of a worker is made in the work of a task.')
      const { key, nth, agreed } = mayPlace(held, definition, input)
      const may = rowIds.next()
      const said = await remote.ask({ what: 'may', may, ...told, key, nth })
      if (madeAlready(said)) return said.answer
      const began = performance.now()
      let status: number | undefined
      let ok = false
      let answer: unknown
      try {
        const value = await call(key)
        ok = true
        status = 200
        if (agreed && value !== undefined) answer = JSON.parse(JSON.stringify(value))
        return value
      } catch (error) {
        const service: unknown = Reflect.get(Object(error), 'service')
        const stated: unknown = Reflect.get(Object(service), 'status')
        if (typeof stated === 'number') status = stated
        throw error
      } finally {
        // The `did` is told whatever the call answered: the writer frees its place and writes its row.
        void remote
          .ask({
            what: 'did',
            may,
            ...told,
            key,
            nth,
            ok,
            ...(status === undefined ? {} : { status }),
            ms: Math.round(performance.now() - began),
            ...(answer === undefined ? {} : { answer }),
          })
          .catch(() => undefined)
      }
    },
  })
}
