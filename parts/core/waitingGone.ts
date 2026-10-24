import { isStored } from './record.ts'
import type { Description } from './description.ts'

// The steps that the step tools save under a name of their own, where the flow names none.
const ownNames = ['wait', 'now', 'random', 'done']

/**
 * The rule of T5003, in its one home: takes a description and the step names that runs which have not ended
 * depend on, flow by flow. Answers each flow that is gone, with no step, and each step that is gone or renamed.
 * A flow some of whose steps are named in code that the build could not read is passed over, and so is an
 * agent: their names are not known. The steps of a flow's own `onFail` are no step of its `run`.
 */
export function waitingGone(
  description: Description,
  waiting: Record<string, string[]>,
): { flow: string; step?: string }[] {
  return Object.entries(waiting).flatMap(([name, steps]) => {
    const flow = Object.hasOwn(description.flows, name) ? description.flows[name] : undefined
    if (!flow) return [{ flow: name }]
    const listed = Array.isArray(flow.stepNames) ? flow.stepNames.filter(isStored) : []
    if (flow.agent !== undefined || listed.some((one) => one.inCode === true)) return []
    const names = new Set(listed.map((one) => String(one.name)))
    return steps
      .filter((step) => !step.startsWith('onFail.') && !names.has(step) && !ownNames.includes(step))
      .map((step) => ({ flow: name, step }))
  })
}
