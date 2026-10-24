import { TentError } from '../../core/index.ts'
import type { FileName } from '../../data/index.ts'
import { NotReady } from '../../data/index.ts'
import type { RunsAsked, Runner, RunView } from '../../flows/index.ts'
import type { App } from '../app.ts'
import { answeredFromCode } from '../ai/questions.ts'
import type { Opened } from '../opened.ts'
import { heldOpen } from '../opened.ts'
import { holdFlow, manyRuns } from '../flows/onWriter.ts'
import { callerNamed } from '../program.ts'

const system = callerNamed('system')

/** The error of a run that is named and is not there. */
const noRun = (run: string): TentError => new TentError('T0001', `No run ${JSON.stringify(run).slice(0, 80)} is there.`)

/**
 * Waits on a reader for a run that its writer carries out: it reads how the run ended after each change that it
 * applied. A reader that took over meanwhile has a runner, which is asked from then on.
 */
async function waitedOnReader(o: Opened, run: string): Promise<unknown> {
  for (;;) {
    heldOpen(o)
    if (o.flows) return o.flows.runner.wait(run)
    const end = o.runsRead?.ended(run)
    if (end === false || !o.runsRead) throw noRun(run)
    if (end) {
      if ('answer' in end) return end.answer
      throw end.error
    }
    const { reader } = o.machine
    if (!reader) throw noRun(run)
    await reader.untilApplied(reader.applied() + 1, 1000)
  }
}

/**
 * `app.runs`: the runner's `read`, `wait`, `find`, `approve`, `refuse` and `stop`, for a program that holds the
 * app. An app that holds no flow has no run: `read` answers nothing and `find` none, and each other member throws
 * T0001 for the run it names. On a reader the three that read are answered from its own data, and the three that
 * write are the writer's, as every write is.
 */
export const member = (o: Opened): App['runs'] => {
  const runner = (run: string): Runner => {
    if (!o.flows) throw noRun(run)
    return o.flows.runner
  }
  /**
   * Carries out a member that writes. On a reader it is the writer's: refused on live data, and sent to the writer
   * on test data. The member answers nothing, so what the writer refuses there is written to the log.
   */
  const written = (member: string, words: { what: string } & Record<string, unknown>, work: () => void): void => {
    heldOpen(o)
    const { reader } = o.machine
    if (!reader) {
      work()
      return
    }
    // On a reader `writes` throws the error that names the writer.
    if (o.mode === 'live') o.machine.writes(`\`app.runs.${member}\``)
    o.machine.sent('runs', [words], system, false, work).catch((error: unknown) =>
      o.log.write('lines', {
        at: o.clock.now(),
        level: 'error',
        message: `The writer refused \`app.runs.${member}\` that this reader sent it.`,
        data: JSON.stringify({ ...words, error: String(error) }),
      }),
    )
  }
  function find(asked: RunsAsked & { of?: FileName }): RunView[]
  function find(asked: RunsAsked & { of: 'all' }): Promise<RunView[]>
  function find(asked: RunsAsked & { of?: FileName | 'all' }): RunView[] | Promise<RunView[]> {
    heldOpen(o)
    const from = o.flows?.runner ?? o.runsRead
    const { of, ...rest } = asked
    if (of === 'all') return from?.find({ ...rest, of }) ?? Promise.resolve([])
    return from?.find(of ? { ...rest, of } : rest) ?? []
  }
  return {
    read: (run) => {
      heldOpen(o)
      return (o.flows?.runner ?? o.runsRead)?.read(run)
    },
    find,
    wait: async (run) => {
      heldOpen(o)
      if (o.machine.reader) return waitedOnReader(o, run)
      // The file of a run that is being brought up is waited for, and the run is asked again then.
      for (;;)
        try {
          return await runner(run).wait(run)
        } catch (error) {
          if (!(error instanceof NotReady) || !o.tenantFiles) throw error
          await o.tenantFiles.ready(error.file)
        }
    },
    approve: (run, step, data, how) =>
      written('approve', { what: 'approve', id: run, step, data, how }, () => {
        answeredFromCode(o, run, step, data, Reflect.get(Object(how), 'repeat'))
        runner(run).approve(run, step, data, how)
      }),
    refuse: (run, step, data, how) =>
      written('refuse', { what: 'refuse', id: run, step, data, how }, () => runner(run).refuse(run, step, data, how)),
    stop: (run) => written('stop', { what: 'stop', id: run }, () => runner(run).stop(run)),
    // On a reader work on many runs at once is the writer's, which answers its count.
    stopAll: async (filter, how) => {
      heldOpen(o)
      const { count, runs } = await manyRuns(o, 'stop', filter, how?.dry === true)
      return { count, runs }
    },
    replayAll: async (filter, how) => {
      heldOpen(o)
      return manyRuns(o, 'replay', filter, how?.dry === true)
    },
    pause: (flow) => written('pause', { what: 'pause', flow }, () => runner(flow).pause(flow)),
    resume: async (flow) => {
      heldOpen(o)
      await holdFlow(o, 'resume', flow)
    },
    paused: () => {
      heldOpen(o)
      return (o.flows?.runner ?? o.runsRead)?.paused() ?? []
    },
  }
}
