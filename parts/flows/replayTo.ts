import type { Db, User } from '../core/index.ts'
import { TentError } from '../core/index.ts'
import { allOf, branchNow, firstOf, never, newBranch, noteEnded, worksOf } from './branches.ts'
import type { FlowBody, StepAt, StepEnded, StepOptions, StepTools, Working } from './face.ts'

function progress(): unknown
function progress(value: unknown): Promise<void>
function progress(...given: unknown[]): unknown {
  return given.length ? Promise.resolve() : undefined
}

/** What the work of a step is handed where the pass is carried out again beside its runner. */
const working: Working = {
  rows: {},
  progress,
  stopping: () => false,
  back: () => {
    throw new TentError('T0013', 'Work that runs on a thread of its app has no machine to hand itself back from.', {
      fix: 'Call `back` in work that states `worker`.',
    })
  },
  say: () => undefined,
}

/**
 * Takes the body of a flow and what a pass of its run is handed, with the step whose work is wanted and what
 * answers the saved result of an earlier step. Runs the body with step tools that answer every saved step from
 * what was saved, carries out the work of the named step, and answers its result. It saves nothing. A step that
 * is neither saved nor the named one is not carried out: its promise stays open. Throws what the work of the named
 * step throws, and T0009 where the body ends before it comes to that step.
 */
export function replayTo(
  body: FlowBody,
  o: {
    event: unknown
    input: unknown
    user?: User
    db: Db
    step: StepAt
    // A step that is done answers its result, and one that failed for good its error, as on the main pass.
    saved(name: string, repeat: number): { result: unknown } | { error: TentError } | undefined
    // When each saved step ended: of a `step.first`, the entry whose last step ended earliest wins, as it won there.
    ended?: StepEnded[]
    // What the work of the named step is handed, where it is carried out on a machine that it may hand itself back from.
    working?: Working
  },
): Promise<unknown> {
  const counts = new Map<string, number>()
  const next = (name: string): number => {
    const repeat = (counts.get(name) ?? 0) + 1
    counts.set(name, repeat)
    return repeat
  }
  const root = newBranch()
  /** The saved answer of a step, noted as ended in the branch that asked for it. */
  const savedOf = (name: string, repeat: number): ReturnType<typeof o.saved> => {
    const saved = o.saved(name, repeat)
    const end = o.ended?.find((one) => one.name === name && one.repeat === repeat)
    if (saved) noteEnded(branchNow(root), end?.at)
    return saved
  }
  return new Promise<unknown>((resolve, reject) => {
    /** What a saved step answers: its result, or its error, or what `onFail: 'goOn'` reads in place of it. */
    const fromSaved = (saved: ReturnType<typeof o.saved>, goOn = false): Promise<unknown> => {
      if (!saved) return never()
      if ('result' in saved) return Promise.resolve(saved.result)
      const { code, message } = saved.error
      return goOn ? Promise.resolve({ failed: true, code, message }) : Promise.reject(saved.error)
    }
    const answer = <T>(name: string): Promise<T> => {
      const saved = savedOf(name, next(name))
      if (saved && 'error' in saved) return Promise.reject(saved.error)
      return saved ? Promise.resolve(Object(saved).result) : never()
    }
    const step = (name: string, work: (the: Working) => unknown, stated?: StepOptions): Promise<unknown> => {
      const repeat = next(name)
      if (name === o.step.name && repeat === o.step.repeat) {
        new Promise((made) => made(work(o.working ?? working))).then(resolve, reject)
        return never()
      }
      return fromSaved(savedOf(name, repeat), stated?.onFail === 'goOn')
    }
    const drawn = <T>(name: string, fresh: () => T, read: (saved: unknown) => T | undefined): T => {
      const saved = savedOf(name, next(name))
      return (saved && 'result' in saved ? read(saved.result) : undefined) ?? fresh()
    }
    const tools: StepTools = Object.assign(step, {
      wait: (_time: string | Date, w?: { name?: string }) => answer<void>(w?.name ?? 'wait'),
      waitFor: (what: string | object, w?: { name?: string }) =>
        answer<{ approved?: boolean; data?: unknown; shown?: unknown; timedOut?: true }>(
          typeof what === 'string' ? what : (w?.name ?? String(Reflect.get(what, 'event'))),
        ),
      all: (list: unknown[], each?: (entry: never, i: number) => Promise<unknown>) => allOf(root, worksOf(list, each)),
      first: (list: unknown[], each?: (entry: never, i: number) => Promise<unknown>) =>
        firstOf(root, worksOf(list, each)),
      many: (name: string) => answer<{ entries: number; done: number; failed: number }>(name),
      now: () =>
        drawn(
          'now',
          () => new Date(),
          (saved) => (typeof saved === 'string' ? new Date(saved) : undefined),
        ),
      random: () => drawn('random', Math.random, (saved) => (typeof saved === 'number' ? saved : undefined)),
      done: (_value?: unknown) => never<never>(),
      again: (_input?: unknown) => never<never>(),
    })
    const { event, input, user, db } = o
    new Promise((made) => made(body({ event, input, ...(user ? { user } : {}), step: tools, db }))).then(
      () =>
        reject(
          new TentError(
            'T0009',
            `The flow ended before it came to the step ${JSON.stringify(o.step.name)}, pass ${o.step.repeat}, whose work was wanted.`,
          ),
        ),
      // What the body throws after the named step began is not the step's own: the step answers for itself.
      (error: unknown) => reject(error),
    )
  })
}
