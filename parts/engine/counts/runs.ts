import type { Caller } from '../../core/index.ts'
import type { Runner, Told } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { gather } from './gather.ts'

const ends = ['done', 'failed', 'stopped']

/**
 * Takes an app, its runner, what the runner told, and what names the caller who caused a run. Counts a run of a flow
 * or of an agent once, under its name, when it ends; and each step that is done or failed, with the time it
 * worked, under the run's name too, by the caller who started the run.
 */
export function runCounted(
  o: Opened,
  runner: Pick<Runner, 'read'>,
  what: Told,
  causer: (run: string) => Caller | undefined,
): void {
  const ended = what.kind === 'run' && ends.includes(what.state)
  const stepped = what.kind === 'step' && (what.state === 'done' || what.state === 'failed')
  if (!ended && !stepped) return
  const run = runner.read(what.run)
  if (!run) return
  const caller = causer(what.run)
  const units: Record<string, number> =
    what.kind === 'step' ? { steps: 1, ...(what.ms === undefined ? {} : { workedMs: what.ms }) } : { runs: 1 }
  gather(o, run.flow, units, { ...(caller ? { caller } : {}), definition: run.flow })
}
