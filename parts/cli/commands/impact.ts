import { describeProject } from '../../build/index.ts'
import { TentError, text } from '../../core/index.ts'
import type { Description } from '../../core/internal.ts'
import { finding } from '../../core/internal.ts'
import { openHistory } from '../../history/index.ts'
import type { Asker, ImpactFacts } from '../../publish/index.ts'
import { describedAt, factsOf, impactOf, touchedIn } from '../../publish/index.ts'
import type { Command } from '../command.ts'
import { impactShown } from '../impactShown.ts'
import { withText } from '../print.ts'
import { askedOfRunning, dataFolderOf } from '../reach.ts'

type Where = { folder: string; data?: unknown }

/** What an engine that runs on the data folder is asked the facts of an impact by: its admin channel. */
function askerOf(o: Where): Asker {
  const value = async (command: string, args: object): Promise<unknown> =>
    (await askedOfRunning(o, command, args))?.value
  return {
    callers: async () =>
      Object(Reflect.get(Object(await value('logs', { callers: true, since: '30 days' })), 'callers')),
    count: async (table, where) =>
      Number(await value('read', { plan: { from: table, ...(where ? { where } : {}), count: true } })),
    waiting: async () => {
      const runs: unknown = Reflect.get(Object(await value('runs', { what: 'list' })), 'runs')
      return (Array.isArray(runs) ? runs : []).flatMap((run) =>
        run.state === 'waiting' && typeof run.step === 'string' ? [{ flow: String(run.flow), step: run.step }] : [],
      )
    },
  }
}

/**
 * Says what a change will reach before it lands: the project as it stands against the version that runs, or
 * against a point or a branch that it names, and against the newest point where no engine runs. It reads the
 * descriptions alone, with what the running engine tells of its callers, its rows and its runs, and what each
 * test touched. With `--json` it prints the impact as JSON.
 */
export const command: Command = {
  name: 'impact',
  args: { point: text({ optional: true }), data: text({ optional: true }) },
  needs: 'project',
  run: async ({ args, folder }) => {
    const where: Where = { folder, data: args.data }
    const data = dataFolderOf(where)
    const { description: next } = await describeProject(folder)
    const running = typeof args.point === 'string' ? undefined : await askedOfRunning(where, 'described', {})
    let live: Description
    let against = 'running'
    if (running?.value) live = Object(running.value)
    else {
      against = typeof args.point === 'string' ? args.point : 'now'
      const history = openHistory(data)
      try {
        live = await describedAt(history, data, against)
      } catch (error) {
        // A point that is none is an error of what was asked, as a finding.
        if (!(error instanceof TentError)) throw error
        return { findings: [finding(error.code, error.message, error.fix === undefined ? {} : { fix: error.fix })] }
      } finally {
        history.close()
      }
    }
    const facts: ImpactFacts = running?.value ? await factsOf(askerOf(where), live, next) : {}
    const touched = touchedIn(data)
    const impact = impactOf({ against, live, next, facts: { ...facts, ...(touched ? { touched } : {}) } })
    return { value: withText(impact, await impactShown(impact)) }
  },
}
