import type { Description } from '../../core/internal.ts'
import { finding, waitingGone } from '../../core/internal.ts'

/**
 * Takes the description of a version and the step names that runs which wait depend on, flow by flow. Answers a
 * warning (T5003) for each step that is gone or renamed, and for each flow that is gone, by the rule of `core`
 * that the check holds too. It refuses nothing: such a run keeps the version it started with.
 */
export function waitingFindings(
  description: Description,
  waiting: Record<string, string[]>,
): ReturnType<typeof finding>[] {
  return waitingGone(description, waiting).map(({ flow, step }) =>
    step === undefined
      ? finding('T5003', `${flow}: runs of this flow have not ended, and the flow is gone.`, {}, 'warning')
      : finding(
          'T5003',
          `${flow}: runs that have not ended depend on the step \`${step}\`, which is gone or renamed.`,
          {},
          'warning',
        ),
  )
}
