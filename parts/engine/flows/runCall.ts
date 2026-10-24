import type { Caller } from '../../core/index.ts'
import { TentError } from '../../core/index.ts'
import type { By, Runner } from '../../flows/index.ts'
import { logCall } from '../door/failure.ts'
import type { Opened } from '../opened.ts'
import { askWaited } from './askWaits.ts'
import { startedBy } from './words.ts'
import { isWritten } from '../../core/internal.ts'

/** What a call that adds a run names: a flow, an agent or an action. */
type Called = 'flow' | 'agent' | 'action'

/**
 * Takes the runner, what a call of a flow, an agent or an action was given, its name, what it is, and who
 * calls. Answers the run that `{ run }` alone names, to wait for it again; with `{ run, stop: true }` stops that run
 * and answers `stopped`; answers nothing for a call that names no run so. Throws T0001 for a run that is not of
 * that name, or that another caller started.
 */
export function namedRun(
  runner: Runner,
  given: unknown,
  name: string,
  called: Called,
  by: By,
): { run: string } | 'stopped' | undefined {
  const named = isWritten(given) && typeof given.run === 'string' ? given.run : undefined
  if (named === undefined || !isWritten(given) || !Object.keys(given).every((key) => key === 'run' || key === 'stop'))
    return undefined
  const held = runner.read(named)
  if (!held || held.flow !== name || !startedBy(held.startedBy, by))
    throw new TentError(
      'T0001',
      `No run ${(JSON.stringify(named) ?? '').slice(0, 80)} of this ${called} can be reached.`,
      {
        fix: `Name a run that the same caller started with this ${called}.`,
      },
    )
  if (given.stop === true) {
    runner.stop(named)
    return 'stopped'
  }
  return { run: named }
}

/** How long a call waits for its run, and what a call of MCP is told meanwhile. */
export interface RunWaiting {
  name: string
  called: Called
  // The time the call waits, in milliseconds, and the words of the limit it is.
  most: number
  limit: string
  // Who calls, where a call of MCP is told at once that its run waits for a person.
  asks?: Caller
}

/**
 * Takes the app, its runner, a run and how its call waits. Answers what the run answers, within the time of the
 * call: a run that outlasts it goes on, and the call is refused T0008 with the run in `fields.run`, which names how
 * to wait for it again or to stop it. A call of MCP is refused at once where its run waits for a person.
 */
export async function waitedRun(o: Opened, runner: Runner, run: string, w: RunWaiting): Promise<unknown> {
  let timer: NodeJS.Timeout | undefined
  const timeUp = new Promise<never>((_, refuse) => {
    timer = setTimeout(
      () =>
        refuse(
          new TentError('T0008', `The run ${run} of ${w.name} outlasts ${w.limit}, and goes on.`, {
            fields: { run },
            fix: `Call the ${w.called} again with \`{ run }\` alone to wait for its run, or with \`{ run, stop: true }\` to stop it.`,
          }),
        ),
      w.most,
    )
    timer.unref()
  })
  const asks = w.asks ? askWaited(o, runner, run, w.asks) : undefined
  try {
    return await Promise.race([runner.wait(run), timeUp, ...(asks ? [asks.waited] : [])])
  } finally {
    clearTimeout(timer)
    asks?.stop()
  }
}

/**
 * Takes the app, the name of a flow or an agent that is called through the door or by a program, who calls,
 * and the call. Answers what the call answers, with the call written into the log; a call that fails raises
 * `call.failed` too.
 */
export function loggedCall(o: Opened, name: string, caller: Caller, work: () => Promise<unknown>): Promise<unknown> {
  const began = performance.now()
  return work().then(
    (value) => {
      logCall(o, { name, kind: 'flow', caller, began })
      return value
    },
    (error: unknown) => {
      logCall(o, { name, kind: 'flow', caller, began, error })
      o.raise('call.failed', { app: o.app, name, caller, error })
      throw error
    },
  )
}
