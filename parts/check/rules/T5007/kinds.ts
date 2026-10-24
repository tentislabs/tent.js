import type { Finding } from '../../../core/index.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { stepsOf } from '../../stepOptions.ts'
import { isStored } from '../../../core/internal.ts'

const causes = ['lost', 'wait', 'memory']

/** The kinds of worker that a project states, each with what it states. */
const kindsOf = (workers: unknown): Record<string, Record<string, unknown>> =>
  isStored(workers)
    ? Object.fromEntries(Object.entries(workers).map(([name, one]) => [name, isStored(one) ? one : {}]))
    : {}

/** What is wrong with the `next` of a kind, or nothing: it names no kind, its own kind, a ring of kinds, or no cause, or `'wait'` on a kind that states `orHere`. */
function nextWrong(kinds: Record<string, Record<string, unknown>>, name: string): string | undefined {
  const next = isStored(kinds[name].next) ? kinds[name].next : undefined
  if (!next) return undefined
  const to = typeof next.kind === 'string' ? next.kind : ''
  const after = Array.isArray(next.after) ? next.after.map(String) : []
  if (!Object.hasOwn(kinds, to)) return `its \`next\` names ${JSON.stringify(to)}, which is no kind of \`workers\``
  if (to === name) return 'its `next` names its own kind'
  if (!after.length || after.some((one) => !causes.includes(one)))
    return "its `next` names no cause, or one that is none of `'lost'`, `'wait'` and `'memory'`"
  if (after.includes('wait') && kinds[name].orHere !== undefined && kinds[name].orHere !== false)
    return "its `next` names `'wait'` on a kind that states `orHere`, which never waits"
  const seen = new Set([name])
  for (let kind: string | undefined = to; kind !== undefined; ) {
    if (seen.has(kind)) return `its \`next\` runs in a ring through ${[...seen].join(', ')}`
    seen.add(kind)
    const further: unknown = kinds[kind]?.next
    kind = isStored(further) && typeof further.kind === 'string' ? further.kind : undefined
  }
  return undefined
}

/**
 * The kinds of worker as a project uses them: a `worker` that names no kind of `project.workers` and is not
 * `'any'`, or that stands beside `background`, on an action or on a step; a `next` that is wrong; and on a kind
 * that states `systemWork: false`, work that runs as the system and code that states no `uses`.
 */
export const rule: Rule = {
  code: 'T5007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const kinds = kindsOf(description.project.workers)
    const written = writtenIn(source)
    const project = written.find((one) => one.word === 'project')
    if (project)
      for (const name of Object.keys(kinds)) {
        const wrong = nextWrong(kinds, name)
        if (wrong)
          found.push(
            at(
              'T5007',
              project,
              undefined,
              `the kind ${name} of \`workers\`: ${wrong}.`,
              'Name another kind in `next`, with the causes after which a task goes there.',
            ),
          )
      }
    /** What is wrong with where a definition or a step says its work runs, for whom it runs, and what it uses. */
    const misused = (where: Record<string, unknown>, system: boolean, code: boolean): string | undefined => {
      const kind = where.worker
      if (kind === undefined) return undefined
      if (typeof kind !== 'string') return '`worker` names no kind'
      if (where.background !== undefined) return '`worker` stands beside `background`, of which it is the long form'
      if (kind !== 'any' && !Object.hasOwn(kinds, kind))
        return `\`worker\` names ${JSON.stringify(kind)}, which is no kind of \`project.workers\``
      if (kinds[kind]?.systemWork === false) {
        if (system) return `the kind ${kind} states \`systemWork: false\`, and the work runs as the system`
        if (code && where.uses === undefined)
          return `the kind ${kind} states \`systemWork: false\`, and the code states no \`uses\``
      }
      return undefined
    }
    for (const one of written) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      if (one.word === 'action' && fn) {
        const wrong = misused(fn, typeof fn.system === 'string', fn.form === 'code')
        if (wrong)
          found.push(
            at(
              'T5007',
              one,
              undefined,
              `${wrong}.`,
              'Name a kind that `project.workers` states, or `background: true` for any.',
            ),
          )
      }
      const flow = Object.hasOwn(description.flows, one.name) ? description.flows[one.name] : undefined
      if (one.word !== 'flow' || !flow) continue
      for (const step of stepsOf(one)) {
        const wrong = misused(step.options, flow.as !== 'starter', flow.form === 'code')
        if (wrong)
          found.push(
            at(
              'T5007',
              one,
              step.node,
              `the step ${step.name ?? ''}: ${wrong}.`,
              'Name a kind that `project.workers` states, or `background: true` for any.',
            ),
          )
      }
    }
    return found
  },
}
