import { finding, waitingGone } from '../../core/internal.ts'
import type { Rule } from '../rule.ts'
import { writtenIn } from '../rule.ts'

/**
 * A warning: a step name that runs which have not ended depend on is gone or renamed. The names come from the facts of the
 * running app, and are held against the step names that the build listed of each flow, by the rule of `core`
 * that the server of a publish holds too. A flow some of whose steps are named in code that the build could not
 * read is passed over: its names are not known.
 */
export const rule: Rule = {
  code: 'T5003',
  needs: ['description', 'source', 'facts'],
  run: ({ description, source, facts }) => {
    const written = writtenIn(source)
    const project = written.find((one) => one.word === 'project')
    return waitingGone(description, facts?.waitingStepNames ?? {}).map(({ flow, step }) => {
      const at = written.find((one) => one.name === flow) ?? project
      const where = at ? { where: { file: at.path, line: at.line, definition: at.name } } : {}
      return step === undefined
        ? finding(
            'T5003',
            `${flow}: runs of this flow have not ended, and the flow is gone.`,
            { fix: 'Keep the flow until its runs have ended, or stop them with `tent runs stop`.', ...where },
            'warning',
          )
        : finding(
            'T5003',
            `${flow}: runs that have not ended depend on the step \`${step}\`, which is gone or renamed.`,
            {
              fix: 'Keep the name of the step, or let the runs end on their own version: they are moved only with `tent runs move`.',
              ...where,
            },
            'warning',
          )
    })
  },
}
