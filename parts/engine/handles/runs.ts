import { TentError } from '../../core/index.ts'
import type { Runner } from '../../flows/index.ts'
import type { CallContext } from '../context.ts'
import { underWay } from '../context.ts'
import { readOnly } from '../door/call.ts'
import { readsInFill } from '../fill/refused.ts'
import { bulkOf } from '../flows/bulkOf.ts'
import { holdFlow, manyRuns } from '../flows/onWriter.ts'
import type { Opened } from '../opened.ts'
import { hasFullAccess } from '../full.ts'

/** The error of a run that is named and is not there. */
const noRun = (run: unknown): TentError =>
  new TentError('T0001', `No run ${(JSON.stringify(run) ?? '').slice(0, 80)} is there.`, {
    fix: 'Name a run by the id that `start` or `runs.find` answered.',
  })

/**
 * The working object behind the handle `runs`, for code with full access: `read` and `find` answer runs as
 * whoever reads them sees them, `approve`, `refuse` and `stop` answer a waiting step and end a run, `stopAll` and
 * `replayAll` act on every run that a filter fits, `pause` and `resume` hold a flow and let it go, and `rate` keeps
 * the rating of a run's starter. Each
 * member answers a promise. Each throws T0013 in code that has no full access, and the three that do more than
 * read also inside a call that only reads.
 */
export const handle = (o: Opened): object => {
  /** Holds the use of a member to code with full access, and answers the call it is used in. */
  const held = (member: string, reads: boolean): CallContext => {
    const cx = underWay()
    if (!cx || !hasFullAccess(cx))
      throw new TentError('T0013', `\`runs.${member}\` is full access, and the code that used it has none.`, {
        fix: "State `system: 'why'` on the function that uses it, with the reason it needs full access.",
      })
    if (!reads && cx.reads === true) throw readOnly(`\`runs.${member}\``)
    if (reads && cx.fills) throw readsInFill(`\`runs.${member}\``)
    return cx
  }
  const runner = (member: string, reads: boolean): Runner | undefined => {
    held(member, reads)
    return o.flows?.runner
  }
  /** What answers a member that reads: the runner, and on a reader the runs in its own data. */
  const reading = (member: string): Pick<Runner, 'read' | 'find' | 'paused'> | undefined =>
    runner(member, true) ?? o.runsRead
  /** Answers the runner for a member that names a run. Throws T0001 in an app that holds no run at all. */
  const forRun = (member: string, run: unknown): Runner => {
    const found = runner(member, false)
    if (!found) throw noRun(run)
    return found
  }
  return {
    read: async (run: unknown) => (typeof run === 'string' ? reading('read')?.read(run) : undefined),
    find: async (asked: unknown) => reading('find')?.find(Object(asked)) ?? [],
    approve: async (run: unknown, step: unknown, data?: unknown, how?: unknown) => {
      const found = forRun('approve', run)
      const { answeredFromCode } = await import('../ai/questions.ts')
      answeredFromCode(o, String(run), String(step), data, Reflect.get(Object(how), 'repeat'))
      found.approve(String(run), String(step), data, Object(how))
    },
    refuse: async (run: unknown, step: unknown, data?: unknown, how?: unknown) =>
      forRun('refuse', run).refuse(String(run), String(step), data, Object(how)),
    stop: async (run: unknown) => forRun('stop', run).stop(String(run)),
    // Work on many runs at once is for code with full access, as each member that writes; on a reader the writer's.
    stopAll: async (asked: unknown) => {
      held('stopAll', false)
      const { count, runs } = await manyRuns(o, 'stop', bulkOf(asked), false)
      return { count, runs }
    },
    replayAll: async (asked: unknown) => {
      held('replayAll', false)
      const from: unknown = Reflect.get(Object(asked), 'from')
      return manyRuns(o, 'replay', { ...bulkOf(asked), ...(typeof from === 'string' ? { from } : {}) }, false)
    },
    pause: async (flow: unknown) => {
      held('pause', false)
      await holdFlow(o, 'pause', String(flow))
    },
    resume: async (flow: unknown) => {
      held('resume', false)
      await holdFlow(o, 'resume', String(flow))
    },
    paused: async () => reading('paused')?.paused() ?? [],
    rate: async (run: unknown, given: unknown) => {
      forRun('rate', run)
      const { rateRun } = await import('../ai/scores.ts')
      rateRun(o, String(run), given)
    },
  }
}
