import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { CallContext } from '../context.ts'
import { within } from '../context.ts'
import type { Opened } from '../opened.ts'
import { callIn } from '../rooms/calls.ts'
import { wireError } from '../wire.ts'
import type { TaskMachine } from './carryTask.ts'
import { HandBack } from './carryTask.ts'
import type { Remote } from './remote.ts'
import { remoteDb } from './remoteDb.ts'

/** The answer of one entry of a batch, as it crosses to the writer. */
export type EntryAnswer = { ok: true; value: unknown } | { ok: false; error: object }

const isCaller = (value: unknown): value is Caller =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'kind') === 'string'

const wrongLength = (): TentError => new TentError('T0009', 'A batch answered no list of the length it was handed.')

/**
 * Takes the code of a version, a batch as the writer handed it, what reaches the writer under each entry, the
 * signal that ends the work, and what the work may do with its machine. Hands the action's `run` the entries, each
 * with its own caller, its own `db` and its own rows, and answers an answer for each: an entry of the answer that is
 * an error fails its own caller, and an answer that is no list of the length it was handed is T0009 for each. A
 * batch that throws fails each entry, but where the definition states `split`: it is then cut in two, and each half
 * carried out as a batch of its own, until the entry that throws stands alone.
 */
export async function carryBatch(
  served: Opened,
  task: Record<string, unknown>,
  remoteOf: (entry: number) => Remote,
  signal: AbortSignal,
  machine: TaskMachine,
): Promise<EntryAnswer[]> {
  const name = String(task.definition)
  const record = Object.hasOwn(served.description.functions, name) ? served.description.functions[name] : undefined
  const run = served.runs.get(name)
  if (!record || !run) throw new TentError('T0011', `The version ${served.version} holds no \`run\` of ${name}.`)
  const split = Reflect.get(Object(record.batch), 'split') === true
  const all: Record<string, unknown>[] = Array.isArray(task.entries) ? task.entries.map((one) => Object(one)) : []
  const cx: CallContext = {
    app: served,
    version: served.version,
    caller: { kind: 'system' },
    made: 0,
    signal,
    work: { name, kind: 'action', depth: 1, now: new Date(served.clock.now()), ends: Number.POSITIVE_INFINITY },
    // A call that names no entry is refused by the writer: a batch has no caller.
    remote: remoteOf(-1),
  }
  const handed = (index: number) => {
    const entry = all[index]
    const caller: Caller = isCaller(entry.as) ? entry.as : { kind: 'system' }
    const remote = remoteOf(index)
    return {
      input: entry.input,
      user: caller.kind === 'system' ? undefined : caller.user,
      db: remoteDb(served.description, (plan) => remote.read(plan)),
      rows: Object(entry.rows),
      about: undefined,
    }
  }
  const back = (): never => {
    throw new HandBack()
  }
  /** Carries some of the entries out as one batch, and cuts it in two where it throws and the definition states `split`. */
  const carry = async (indexes: number[]): Promise<EntryAnswer[]> => {
    try {
      const answered: unknown = await within(cx, () =>
        callIn(
          cx,
          served.room,
          run,
          [{ entries: indexes.map(handed), stopping: machine.stopping, back }],
          false,
          false,
        ),
      )
      if (!Array.isArray(answered) || answered.length !== indexes.length)
        return indexes.map(() => ({ ok: false, error: wireError(wrongLength(), true).error }))
      return answered.map((one) =>
        one instanceof Error ? { ok: false, error: wireError(one, true).error } : { ok: true, value: one },
      )
    } catch (error) {
      if (error instanceof HandBack) throw error
      if (!split || indexes.length === 1) return indexes.map(() => ({ ok: false, error: wireError(error, true).error }))
      const half = Math.ceil(indexes.length / 2)
      return [...(await carry(indexes.slice(0, half))), ...(await carry(indexes.slice(half)))]
    }
  }
  return carry(all.map((_, index) => index))
}
