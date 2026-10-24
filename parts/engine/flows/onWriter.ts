import type { Bulk } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { callerNamed } from '../program.ts'

const system = callerNamed('system')

/** What work on many runs at once answers: how many runs it acts on, their ids, and the runs that a replay started. */
interface Many {
  count: number
  runs: string[]
  started: string[]
}

const textsOf = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/**
 * Takes an app, `stop` or `replay`, the runs it acts on and whether it only counts. Carries the work out: here, on
 * a writer, and on a reader by its writer, which it is sent to as `tent runs` sends it, so that it answers the
 * writer's count. On live data a reader refuses it, as every write. An app that holds no flow acts on no run.
 */
export async function manyRuns(
  o: Opened,
  what: 'stop' | 'replay',
  filter: Bulk & { from?: string },
  dry: boolean,
): Promise<Many> {
  const { reader } = o.machine
  if (!reader) {
    const runner = o.flows?.runner
    if (!runner) return { count: 0, runs: [], started: [] }
    if (what === 'replay') return runner.replayAll(filter, { dry })
    return { ...(await runner.stopAll(filter, { dry })), started: [] }
  }
  // On a reader `writes` throws the error that names the writer.
  if (o.mode === 'live') o.machine.writes(`\`runs.${what}All\``)
  const answered: Record<string, unknown> = Object(
    await o.machine.sent('runs', [{ what, ...filter, yes: !dry }], system, false, () => undefined),
  )
  return { count: Number(answered.count ?? 0), runs: textsOf(answered.runs), started: textsOf(answered.started) }
}

/** Pauses or resumes a flow: here, on a writer, and on a reader by its writer. */
export async function holdFlow(o: Opened, what: 'pause' | 'resume', flow: string): Promise<void> {
  if (!o.machine.reader) {
    const runner = o.flows?.runner
    if (what === 'pause') runner?.pause(flow)
    else await runner?.resume(flow)
    return
  }
  if (o.mode === 'live') o.machine.writes(`\`runs.${what}\``)
  await o.machine.sent('runs', [{ what, flow }], system, false, () => undefined)
}
