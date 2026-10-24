import type { Finding } from '../../../core/index.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { statedAt } from '../../stated.ts'
import { isStored } from '../../../core/internal.ts'

/** A kind of worker of `project.workers` that states `countBy: 'app'` beside `perCallerPerDay`, which then bounds nothing. */
export const rule: Rule = {
  code: 'T7003',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const project = writtenIn(source).find((one) => one.word === 'project')
    const workers = isStored(description.project.workers) ? description.project.workers : {}
    const found: Finding[] = []
    for (const [kind, worker] of Object.entries(workers)) {
      const limits = isStored(worker) && isStored(worker.limits) ? worker.limits : {}
      if (!project || !isStored(worker) || worker.countBy !== 'app' || !isStored(limits.perCallerPerDay)) continue
      found.push(
        at(
          'T7003',
          project,
          statedAt(project, ['workers', kind, 'countBy']),
          `\`countBy: 'app'\` counts the machine time of the kind \`${kind}\` with no caller, so its \`perCallerPerDay\` bounds nothing.`,
          "Take `countBy: 'app'` away, or the limit for each caller.",
        ),
      )
    }
    return found
  },
}
