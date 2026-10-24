import { inspect } from 'node:util'
import type { Secrets } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { underWay } from '../context.ts'
import { callOf } from '../handleCall.ts'
import type { Opened } from '../opened.ts'
import { readByName } from '../rooms/callables.ts'
import { valuesOf } from '../values/ofApp.ts'

const marked = '[secret]'

/** The error of a member of the handle that is used where it does not work. */
const notHere = (used: string, where: string): TentError =>
  new TentError('T0013', `${used} was used ${where}.`, {
    fix: 'Open a secret in an action, a route, a step of a flow, `onRequest`, `identify` or a maker of `engine.ts`.',
  })

/** Holds a use to code that may wait: an action, a route, a step, `onRequest` and `identify`. Throws T0013 for any other. */
function mayReveal(used: string): CallContext | undefined {
  const cx = underWay()
  const kind = cx?.work.kind
  if (kind === 'query' || kind === 'change' || kind === 'rule') throw notHere(used, `in a ${kind}`)
  return cx
}

/**
 * Takes an app and the name of a secret. Answers the secret as code holds it: wrapped, so that as text it reads
 * `[secret]` wherever it is written out, and opened with `reveal()`, which throws T0019 for a secret that has no
 * value. `inMaker` is the secret that a maker of `engine.ts` is handed, which runs before any call.
 */
function wrapped(o: Opened, name: string, inMaker = false): { reveal(): string } {
  const reveal = (): string => {
    if (!inMaker) mayReveal(`\`secrets.${name}.reveal()\``)
    try {
      return valuesOf(o).secrets.value(name)
    } catch (error) {
      // No secret is copied to a reader: one that has no value there is the writer's to open.
      if (o.machine.reader && error instanceof TentError && error.code === 'T0019')
        o.machine.writes('a secret that has no value on this machine')
      throw error
    }
  }
  return Object.freeze({
    reveal,
    toString: () => marked,
    toJSON: () => marked,
    [Symbol.toPrimitive]: () => marked,
    [inspect.custom]: () => marked,
  })
}

/** Holds `set` and `remove` to code with full access that may wait. Throws T0013 for any other. */
function mayWrite(member: string): void {
  callOf(`\`secrets.${member}\``, {
    waits: true,
    acts: true,
    full: 'sets a secret itself, and carries the rule of who may',
  })
}

/**
 * The working object behind the handle `secrets`: each name answers its secret, wrapped. `set` and `remove` write
 * a secret of the app's own mode, as the admin command does, and answer a promise.
 */
export const handle = (o: Opened): object =>
  new Proxy(
    {},
    {
      get(_, name) {
        if (typeof name !== 'string' || name === 'then') return undefined
        if (name === 'set')
          return async (secret: unknown, value: unknown): Promise<void> => {
            mayWrite('set')
            valuesOf(o).secrets.set(String(secret), String(value))
            valuesOf(o).changed()
          }
        if (name === 'remove')
          return async (secret: unknown): Promise<void> => {
            mayWrite('remove')
            valuesOf(o).secrets.remove(String(secret))
            valuesOf(o).changed()
          }
        return wrapped(o, name)
      },
    },
  )

/**
 * The secrets that a maker of `engine.ts` is handed: each name answers its secret, which opens with `reveal()`
 * though no call is under way. They are read by name in a room that crosses too.
 */
export const makerSecrets = (o: Opened): Secrets =>
  readByName(
    new Proxy<Secrets>(
      {},
      { get: (_, name) => (typeof name === 'string' && name !== 'then' ? wrapped(o, name, true) : undefined) },
    ),
  )
