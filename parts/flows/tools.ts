import { TentError } from '../core/index.ts'
import { allOf, firstOf, never, worksOf } from './branches.ts'
import type { StepOptions, StepTools, Working } from './face.ts'
import { asSaved } from './kept.ts'
import type { ManyOptions } from './many.ts'
import { manyTool } from './many.ts'
import type { Pass } from './pass.ts'
import { answered, beganAt, fatal, reach, resultOf, saveStep } from './pass.ts'
import { stepTool } from './stepTool.ts'
import { waitForTool, waitTool } from './waitTools.ts'

/** A value that is drawn once and saved, as a step under the name of its tool, so that a later pass sees the same one. */
function drawn(pass: Pass, name: string, draw: () => string | number): unknown {
  const reached = reach(pass, name)
  // A branch that does not go on is answered a value that nothing keeps: its code stops at its next step.
  if (!reached) return draw()
  const { at, row } = reached
  if (row?.state === 'done') return answered(pass, resultOf(pass, row))
  const value = draw()
  const now = beganAt(pass)
  saveStep(pass, at, { state: 'done', result: value, size: asSaved(value).size, startedAt: now, endedAt: now })
  return answered(pass, value)
}

/**
 * `step.done`: ends the whole run as done, with the value as the flow's answer, from wherever it is called. It is
 * saved as a step named `done`, so that a later pass ends at the same place. Ends the run with T5102 for an
 * answer that is larger than the flow allows.
 */
function doneTool(pass: Pass, value: unknown): Promise<never> {
  const reached = reach(pass, 'done')
  if (!reached) return never()
  const { at, row } = reached
  if (row?.state === 'done') {
    pass.finish({ kind: 'done', value: resultOf(pass, row) })
    return never()
  }
  const saved = asSaved(value)
  if (saved.size > pass.of.limits.result) {
    fatal(
      pass,
      new TentError(
        'T5102',
        `The answer of a run of ${pass.of.run.flow} is ${saved.size} bytes, past \`limits.result\` of ${pass.of.limits.result}.`,
        { fix: 'Put large data into a file and answer its id, or raise `limits.result` of the flow.' },
      ),
    )
    return never()
  }
  const now = beganAt(pass)
  saveStep(pass, at, {
    state: 'done',
    ...(saved.value === undefined ? {} : { result: saved.value }),
    size: saved.size,
    startedAt: now,
    endedAt: now,
  })
  pass.finish({ kind: 'done', value: saved.value })
  return never()
}

/**
 * `step.again`: ends the run as done and, in the write that ends it, starts a new run of the same flow with the
 * input, the same key and starter, which names this run as `from`. It is saved as a step named `again`, with the
 * input as its result, so that a later pass ends at the same place. Ends the run with T0002 for an input that does
 * not fit the flow, and with T5102 for one that is larger than its limit.
 */
function againTool(pass: Pass, input: unknown): Promise<never> {
  const reached = reach(pass, 'again')
  if (!reached) return never()
  const { at, row } = reached
  if (row?.state === 'done') {
    pass.finish({ kind: 'done', value: undefined, again: { input: resultOf(pass, row) } })
    return never()
  }
  const { run, held } = pass.of
  // With no input the run hands its own on.
  const handed = input === undefined ? run.input : input
  let given: { value: unknown; size: number }
  try {
    given = asSaved(held.env.input ? held.env.input(held.live ?? run.version, run.flow, handed) : handed)
  } catch (error) {
    fatal(pass, error instanceof TentError ? error : new TentError('T0002', String(error)))
    return never()
  }
  if (given.size > pass.of.limits.result) {
    fatal(
      pass,
      new TentError(
        'T5102',
        `The input of the run that ${run.flow} goes on as is ${given.size} bytes, past \`limits.result\`.`,
        {
          fix: 'Put large data into a file and hand its id, or raise `limits.result` of the flow.',
        },
      ),
    )
    return never()
  }
  const now = beganAt(pass)
  saveStep(pass, at, {
    state: 'done',
    ...(given.value === undefined ? {} : { result: given.value }),
    size: given.size,
    startedAt: now,
    endedAt: now,
  })
  pass.finish({ kind: 'done', value: undefined, again: { input: given.value } })
  return never()
}

/** Answers the step tools of a pass, as `run` is handed them. */
export function toolsOf(pass: Pass): StepTools {
  const step = (name: string, work: (the: Working) => unknown, o?: StepOptions): Promise<unknown> =>
    stepTool(pass, name, work, o)
  const none = (): Promise<never> =>
    Promise.reject(
      new TentError('T0027', '`step.first` was handed no entry, so none of them can be the first to end.', {
        fix: 'Hand `step.first` a list that holds an entry.',
      }),
    )
  return Object.assign(step, {
    wait: (time: string | Date, o?: { name?: string }) => waitTool(pass, time, o),
    waitFor: (what: string | object, o?: { timeout?: string; show?: unknown; name?: string; where?: object }) =>
      waitForTool(pass, what, o),
    all: (list: unknown[], each?: (entry: never, i: number) => Promise<unknown>) =>
      allOf(pass.root, worksOf(list, each)),
    first: (list: unknown[], each?: (entry: never, i: number) => Promise<unknown>) =>
      list.length ? firstOf(pass.root, worksOf(list, each)) : none(),
    many: (name: string, entries: unknown, flow: unknown, o?: ManyOptions) => manyTool(pass, name, entries, flow, o),
    now: () => new Date(String(drawn(pass, 'now', () => new Date(pass.of.held.env.clock.now()).toISOString()))),
    random: () => Number(drawn(pass, 'random', Math.random)),
    done: (value?: unknown) => doneTool(pass, value),
    again: (input?: unknown) => againTool(pass, input),
  })
}
