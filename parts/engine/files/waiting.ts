import type { FileName } from '../../data/index.ts'
import { isNotReady } from './attempt.ts'

const isObject = (value: unknown): value is object =>
  (typeof value === 'object' && value !== null) || typeof value === 'function'

const isPromise = (value: unknown): value is Promise<unknown> =>
  isObject(value) && typeof Reflect.get(value, 'then') === 'function'

/**
 * Takes the `db` of an action, a route or a step, whose reads and writes answer promises, and what makes a file
 * ready. Answers a `db` that is used as that one is, and whose promises wait for a file that is not ready: where a
 * member finds one, the file is made ready and the member is asked again from the start of its chain. Each link
 * of a chain is made anew from the `db` when it is used, so nothing of a pass that was undone is kept.
 */
export function tenantWaitingDb(db: object, ready: (file: FileName) => Promise<void>): object {
  /** One thing that a chain reached, behind what makes it anew from the `db`. */
  const reached = (make: () => unknown): unknown => {
    const now = make()
    if (!isObject(now) || isPromise(now)) return now
    return new Proxy(now, {
      get(target, name) {
        const member: unknown = Reflect.get(target, name)
        if (typeof member !== 'function')
          return isObject(member) ? reached(() => Reflect.get(Object(make()), name)) : member
        return (...args: unknown[]) =>
          asked(() => Reflect.apply(Object(Reflect.get(Object(make()), name)), make(), args))
      },
    })
  }
  /** Asks a member, and asks it again once the file that it found not ready is. */
  const asked = (ask: () => unknown): unknown => {
    let answer: unknown
    try {
      answer = ask()
    } catch (error) {
      if (!isNotReady(error)) throw error
      return ready(error.file).then(() => asked(ask))
    }
    if (isPromise(answer))
      return answer.catch((error: unknown) => {
        if (!isNotReady(error)) throw error
        return ready(error.file).then(() => asked(ask))
      })
    return isObject(answer) ? reached(ask) : answer
  }
  return Object(reached(() => db))
}
