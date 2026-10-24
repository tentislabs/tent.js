import type { Finding } from '../../../core/index.ts'
import { batchMisfits, writesOf } from '../../heavyCode.ts'
import type { Rule } from '../../rule.ts'
import { at, writtenIn } from '../../rule.ts'
import { stepsOf } from '../../stepOptions.ts'
import { isStored } from '../../../core/internal.ts'

const units = ['workSeconds', 'machineSeconds']

/** The units that a record of limits of use names: `perDay` and `perCallerPerDay`, each a record of units. */
const unitsIn = (limits: unknown, of: 'perDay' | 'perCallerPerDay'): string[] =>
  isStored(limits) && isStored(limits[of]) ? Object.keys(limits[of]) : []

/**
 * Where the reserve of a definition is more than a limit of use that holds it: its own `perDay`, and those of its
 * kind. The reserve is its `reserve`, or the time of one try where it states none.
 */
function reserveOver(
  fn: Record<string, unknown>,
  workers: Record<string, unknown>,
): { reserve: number; limit: number; of: string } | undefined {
  const limits = isStored(fn.limits) ? fn.limits : {}
  const ms = [limits.reserve, limits.try, limits.time].find((one) => typeof one === 'number')
  if (typeof ms !== 'number') return undefined
  const kind = typeof fn.worker === 'string' ? fn.worker : fn.background !== undefined ? 'any' : undefined
  const worker = kind === undefined ? undefined : workers[kind]
  const ofKind = isStored(worker) ? worker.limits : undefined
  const held: [string, unknown][] = [
    ['its own `perDay`', isStored(limits.perDay) ? limits.perDay.workSeconds : undefined],
    [
      `\`perDay\` of the kind ${kind}`,
      isStored(ofKind) && isStored(ofKind.perDay) ? ofKind.perDay.workSeconds : undefined,
    ],
    [
      `\`perCallerPerDay\` of the kind ${kind}`,
      isStored(ofKind) && isStored(ofKind.perCallerPerDay) ? ofKind.perCallerPerDay.workSeconds : undefined,
    ],
  ]
  for (const [of, limit] of held)
    if (typeof limit === 'number' && ms / 1000 > limit) return { reserve: ms / 1000, limit, of }
  return undefined
}

/**
 * What a definition states of heavy work that does not hold together: a `remember` on a step that states no
 * `key`; a limit of a kind in a unit other than `workSeconds` and `machineSeconds`, and `machineSeconds` in a
 * limit for each caller or of a definition, an action or a `python`, and a reserve of one over a limit that holds
 * it; an action that states `changes: false` and whose `run`, where it was read, calls a change or starts a run;
 * and a `follow` on an action that is no run.
 */
export const rule: Rule = {
  code: 'T5007',
  needs: ['description', 'source'],
  run: ({ description, source }) => {
    const found: Finding[] = []
    const written = writtenIn(source)
    const project = written.find((one) => one.word === 'project')
    const workers = isStored(description.project.workers) ? description.project.workers : {}
    if (project)
      for (const [kind, stated] of Object.entries(workers)) {
        const limits = isStored(stated) ? stated.limits : undefined
        const bad = [
          ...unitsIn(limits, 'perDay').filter((unit) => !units.includes(unit)),
          ...unitsIn(limits, 'perCallerPerDay').filter((unit) => unit !== 'workSeconds'),
        ]
        if (bad.length)
          found.push(
            at(
              'T5007',
              project,
              undefined,
              `the kind ${kind} of \`workers\` holds a limit in ${bad.map((one) => `\`${one}\``).join(', ')}, which no limit of a kind takes.`,
              'A limit of a kind counts `workSeconds` or `machineSeconds`, and one for each caller `workSeconds` alone.',
            ),
          )
      }
    for (const one of written) {
      const fn = Object.hasOwn(description.functions, one.name) ? description.functions[one.name] : undefined
      // A batch is one pass over many entries: it is no call of many that run side by side in one copy.
      if (fn && fn.batch !== undefined && isStored(fn.python) && fn.python.atOnce !== undefined)
        found.push(
          at(
            'T5007',
            one,
            undefined,
            'it states `batch` beside `atOnce`.',
            'Leave one of them out: a batch is carried out as one call.',
          ),
        )
      // The limits of use of a definition, which an action and a `python` state alike.
      if ((one.word === 'action' || one.word === 'python') && fn) {
        if ([...unitsIn(fn.limits, 'perDay'), ...unitsIn(fn.limits, 'perCallerPerDay')].includes('machineSeconds'))
          found.push(
            at(
              'T5007',
              one,
              undefined,
              'a limit of a definition counts `machineSeconds`, which only a kind has.',
              'Count `workSeconds` in the limit of a definition.',
            ),
          )
        const over = reserveOver(fn, workers)
        if (over)
          found.push(
            at(
              'T5007',
              one,
              undefined,
              `its reserve of ${over.reserve} seconds is more than ${over.limit} \`workSeconds\` of ${over.of}, which holds it: no task of it can go.`,
              'State a shorter `reserve` or `time`, or raise the limit.',
            ),
          )
      }
      if (one.word === 'action' && fn) {
        if (fn.follow !== undefined && fn.worker === undefined && fn.background === undefined)
          found.push(
            at(
              'T5007',
              one,
              undefined,
              'it states `follow`, and is no run: it states neither `worker` nor `background`.',
              'State `worker` or `background`, or leave `follow` out.',
            ),
          )
        const writes = fn.changes === false ? writesOf(description, one, fn.body) : []
        if (writes.length)
          found.push(
            at(
              'T5007',
              one,
              undefined,
              `it states \`changes: false\`, and its \`run\` ${writes.join(', ')}.`,
              'Leave `changes: false` out, or write nothing from the action.',
            ),
          )
        for (const wrong of fn.batch !== undefined ? batchMisfits(one) : [])
          found.push(
            at(
              'T5007',
              one,
              undefined,
              `it states \`batch\`, and ${wrong}.`,
              'Take `entries`, the list of the calls gathered, and answer a list of the same length.',
            ),
          )
      }
      if (one.word !== 'flow') continue
      for (const step of stepsOf(one)) {
        const remember = step.options.remember
        if (remember !== undefined && (!isStored(remember) || remember.key === undefined))
          found.push(
            at(
              'T5007',
              one,
              step.node,
              `the step ${step.name ?? ''} states \`remember\` and no \`key\`: a step has no input to remember its answer by.`,
              'State `remember: { key: [...] }`, the values its answer rests on.',
            ),
          )
      }
    }
    return found
  },
}
