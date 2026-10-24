import type { Seal } from '../../data/index.ts'
import type { RunView } from '../../flows/index.ts'
import type { Opened } from '../opened.ts'
import { noKeyAtHand } from '../values/key.ts'
import { sealedAt } from '../values/seal.ts'

/** What a sealed step result is bound to: its run, its step and its repeat, so that it opens for that step alone. */
export const stepBound = (at: { run: string; name: string; repeat: number }): string =>
  `_t_steps.result.${at.run}.${at.name}.${at.repeat}`

/** The seal of the key of the data folder of an app. Throws T0019 where no key is at hand. */
export function stepSeal(o: Pick<Opened, 'dataFolder'>): Seal {
  const { seal } = sealedAt(o.dataFolder)
  if (!seal) throw noKeyAtHand('A sealed step result')
  return seal
}

/**
 * Takes an app and a run as whoever reads it sees it. Answers the run with each sealed step result opened, as the
 * export of the person who started it shows it. Where no key is at hand, it stays sealed.
 */
export async function openedSteps(o: Pick<Opened, 'dataFolder'>, run: RunView): Promise<RunView> {
  const { seal } = sealedAt(o.dataFolder)
  if (!seal) return run
  // The flows are loaded where a run is: an app that holds none loads nothing of them.
  const { sealedTextOf } = await import('../../flows/index.ts')
  const steps = run.steps.map((step) => {
    const sealed = sealedTextOf(step.result)
    if (sealed === undefined) return step
    try {
      return { ...step, result: seal.open(sealed, stepBound({ run: run.id, name: step.name, repeat: step.repeat })) }
    } catch {
      // A sealed text that does not open for this step, as one moved there from another run, stays as it is.
      return step
    }
  })
  return { ...run, steps }
}
